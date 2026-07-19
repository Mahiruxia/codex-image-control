import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  emptyChecklist,
  emptyVideoChecklist,
  type AspectRatio,
  type CanvasState,
  type GenerationContext,
  type GenerationKind,
  type GenerationRequest,
  type GenerationStatus,
  type OpenAIFileInput,
  type ProjectRecord,
  type ProjectStage,
  type ProjectSummary,
  type ReferenceSlot,
  type ShotRecord,
  type StoredAsset,
  type TemplateId,
  type VideoManualChecklist,
  type VideoProviderProfile,
  type VideoRequest,
  type VideoRequestStatus,
} from "./types.js";
import { redactSensitiveText, videoProviderRequiresExternalConfirmation, VideoProviderStore } from "./video-providers.js";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_DOWNLOAD_REDIRECTS = 3;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 60_000;
const MEDIA_SIGNATURE_TTL_MS = 60 * 60 * 1000;
const MEDIA_SIGNATURE_REFRESH_MS = 5 * 60 * 1000;
const PROJECT_FILE = "project.json";
const ALLOWED_TEMPLATES = new Set<TemplateId>(["blank", "image-editor"]);
const ALLOWED_RATIOS = new Set<AspectRatio>(["9:16", "3:4", "1:1", "16:9"]);
const ALLOWED_STAGES = new Set<ProjectStage>(["direction", "storyboard", "production", "complete"]);
const REFERENCE_SLOTS = new Set<ReferenceSlot>([
  "face",
  "body",
  "outfit",
  "environment",
  "identitySupport",
]);
const FILE_REPLACE_RETRY_DELAYS_MS = [20, 40, 80, 160, 320, 640, 1_000];
const PROJECT_LOCK_TIMEOUT_MS = 120_000;
const PROJECT_LOCK_STALE_MS = 5 * 60_000;
const GENERATION_LEASE_MS = 15 * 60_000;
// Every blocking video-worker operation is bounded to at most ten minutes.
// Keep the request lease comfortably above that bound so a healthy worker is
// not expired in the middle of an upload/download while still allowing a dead
// worker to be recovered without manual state edits.
const VIDEO_REQUEST_LEASE_MS = 20 * 60_000;
const VIDEO_WORKER_LOCK_FILE = "video-worker.lock";
const MATERIAL_INPUT_DIR = "00_输入素材";
const MATERIAL_IMAGE_DIR = "01_分镜图";
const MATERIAL_VIDEO_DIR = "02_分镜视频";
const MATERIAL_PLAN_FILE = "今日方案.md";
const MATERIAL_EXPORT_MANIFEST = path.join("storyboard", "material-export-manifest.json");
const MATERIAL_EXPORT_ERROR = path.join("storyboard", "material-export-error.log");
const MATERIAL_PLAN_MARKER = "<!-- image-control-managed: 请在图片生成中控内修改项目与分镜文字 -->";
const MATERIAL_EXPORT_AUDIT_INTERVAL_MS = 30_000;
const ACTIVE_GENERATION_STATUSES = new Set<GenerationStatus>(["queued", "generating", "saving"]);
const ACTIVE_VIDEO_STATUSES = new Set<VideoRequestStatus>(["queued", "waiting_remote", "uploading", "submitting", "running", "downloading"]);
const VIDEO_STATUS_TRANSITIONS: Record<VideoRequestStatus, ReadonlySet<VideoRequestStatus>> = {
  queued: new Set(["queued", "waiting_remote", "uploading", "running", "failed"]),
  waiting_remote: new Set(["waiting_remote", "uploading", "running", "failed"]),
  uploading: new Set(["uploading", "submitting", "waiting_remote", "failed"]),
  submitting: new Set(["submitting", "waiting_remote", "running", "downloading", "failed"]),
  running: new Set(["running", "waiting_remote", "uploading", "downloading", "failed"]),
  downloading: new Set(["downloading", "uploading", "running", "waiting_remote", "failed"]),
  completed: new Set(["completed"]),
  failed: new Set(["failed"]),
  cancelled: new Set(["cancelled"]),
};
type VideoSubmissionState = NonNullable<VideoRequest["submissionState"]>;
const VIDEO_SUBMISSION_TRANSITIONS: Record<VideoSubmissionState, ReadonlySet<VideoSubmissionState>> = {
  "not-submitted": new Set(["not-submitted", "submitting", "accepted"]),
  submitting: new Set(["submitting", "accepted", "unknown", "rejected"]),
  unknown: new Set(["unknown", "submitting", "accepted"]),
  accepted: new Set(["accepted", "submitting"]),
  rejected: new Set(["rejected", "not-submitted"]),
};

function defaultStateDirectory(): string {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA?.trim() || os.homedir(), "CodexImageControl");
  }
  return process.env.XDG_STATE_HOME?.trim()
    ? path.join(process.env.XDG_STATE_HOME.trim(), "codex-image-control")
    : path.join(os.homedir(), ".codex-image-control");
}

function storagePathKey(value: string): string {
  let normalized = path.resolve(value).replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
  const root = path.parse(normalized).root;
  while (normalized.length > root.length && /[\\/]$/.test(normalized)) normalized = normalized.slice(0, -1);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function sameStoragePath(left: string, right: string): boolean {
  return storagePathKey(left) === storagePathKey(right);
}

function storagePathContains(parentPath: string, childPath: string): boolean {
  const parent = storagePathKey(parentPath);
  const child = storagePathKey(childPath);
  if (parent === child) return true;
  const relative = path.relative(parent, child);
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function storagePathsOverlap(left: string, right: string): boolean {
  return storagePathContains(left, right) || storagePathContains(right, left);
}

function protectedPluginCacheRoots(): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".codex", "plugins"),
    path.join(home, ".agents", "plugins"),
  ];
}

function assertNotBroadStorageRoot(targetPath: string, label: string): void {
  const resolved = path.resolve(targetPath);
  if (sameStoragePath(resolved, path.parse(resolved).root)) throw new Error(`${label}不得使用盘符、UNC 共享或文件系统根目录`);
  if (sameStoragePath(resolved, os.homedir())) throw new Error(`${label}不得直接使用用户主目录`);
}

function assertStorageBoundaryPolicy(
  stateDir: string,
  projectsDir: string,
  sourceRoot: string,
  protectedRoots = protectedPluginCacheRoots(),
): void {
  assertNotBroadStorageRoot(stateDir, "状态目录");
  assertNotBroadStorageRoot(projectsDir, "项目目录");

  for (const [label, target] of [["状态目录", stateDir], ["项目目录", projectsDir]] as const) {
    if (storagePathsOverlap(target, sourceRoot)) {
      throw new Error(`${label}不得与插件源码目录重叠`);
    }
    for (const protectedRoot of protectedRoots) {
      if (storagePathsOverlap(target, protectedRoot)) {
        throw new Error(`${label}不得位于 Codex 插件安装或缓存目录内，也不得包含该目录`);
      }
    }
  }

  const exactDefaultProjectsDir = path.resolve(stateDir, "data", "projects");
  const usesExactDefaultNesting = sameStoragePath(projectsDir, exactDefaultProjectsDir);
  if (storagePathsOverlap(stateDir, projectsDir) && !usesExactDefaultNesting) {
    throw new Error("状态目录和项目目录不得重叠；仅允许默认的 <state>/data/projects 布局");
  }
}

async function lstatIfPresent(targetPath: string): Promise<Awaited<ReturnType<typeof fs.lstat>> | undefined> {
  try {
    return await fs.lstat(targetPath);
  } catch (error) {
    if (isFsError(error, ["ENOENT"])) return undefined;
    throw error;
  }
}

async function realpathIfPresent(targetPath: string): Promise<string | undefined> {
  try {
    return await fs.realpath(targetPath);
  } catch (error) {
    if (isFsError(error, ["ENOENT"])) return undefined;
    throw error;
  }
}

async function assertNoLinkedPathComponents(targetPath: string, label: string): Promise<void> {
  const resolved = path.resolve(targetPath);
  const parsed = path.parse(resolved);
  const segments = resolved.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const stats = await lstatIfPresent(current);
    if (!stats) break;
    if (stats.isSymbolicLink()) throw new Error(`${label}路径包含符号链接、目录联接或重解析点：${current}`);
    if (!stats.isDirectory()) throw new Error(`${label}路径组件不是目录：${current}`);
    const canonical = await fs.realpath(current);
    if (!sameStoragePath(canonical, current)) throw new Error(`${label}路径包含可见的目录联接或重解析跳转：${current}`);
  }
}

async function ensureSafeDirectory(targetPath: string, label: string): Promise<string> {
  const resolved = path.resolve(targetPath);
  const parsed = path.parse(resolved);
  const segments = resolved.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stats = await lstatIfPresent(current);
    if (!stats) {
      try {
        await fs.mkdir(current);
      } catch (error) {
        if (!isFsError(error, ["EEXIST"])) throw error;
      }
      stats = await fs.lstat(current);
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`${label}路径不是真实本机目录：${current}`);
    const canonical = await fs.realpath(current);
    if (!sameStoragePath(canonical, current)) throw new Error(`${label}路径组件发生了链接或重解析跳转：${current}`);
  }
  const canonical = await fs.realpath(resolved);
  if (!sameStoragePath(canonical, resolved)) throw new Error(`${label}创建后的真实路径与配置不一致`);
  return canonical;
}

async function assertSafeDeletionRoot(deletingRoot: string, expectedParent: string, label: string): Promise<string> {
  await assertNoLinkedPathComponents(expectedParent, `${label}父目录`);
  await assertNoLinkedPathComponents(deletingRoot, label);
  const [rootStats, parentStats] = await Promise.all([
    lstatIfPresent(deletingRoot),
    lstatIfPresent(expectedParent),
  ]);
  if (!parentStats?.isDirectory() || parentStats.isSymbolicLink()) throw new Error(`${label}父目录不是安全的真实目录`);
  if (!rootStats?.isDirectory() || rootStats.isSymbolicLink()) throw new Error(`${label}不是安全的真实目录`);
  const [canonicalRoot, canonicalParent] = await Promise.all([
    fs.realpath(deletingRoot),
    fs.realpath(expectedParent),
  ]);
  if (!sameStoragePath(canonicalRoot, deletingRoot) || !sameStoragePath(canonicalParent, expectedParent)) {
    throw new Error(`${label}的真实路径与受控目录不一致`);
  }
  if (sameStoragePath(canonicalRoot, canonicalParent) || !storagePathContains(canonicalParent, canonicalRoot)) {
    throw new Error(`${label}必须是受控父目录的严格子目录`);
  }
  return canonicalRoot;
}

async function assertSafeDeletionEntry(deletingRoot: string, canonicalRoot: string, entryPath: string, label: string): Promise<void> {
  const stats = await lstatIfPresent(entryPath);
  if (!stats) throw new Error(`${label}在清理前消失，已停止受控删除`);
  if (stats.isSymbolicLink()) throw new Error(`${label}是符号链接、目录联接或重解析点，已拒绝删除`);
  const canonicalEntry = await fs.realpath(entryPath);
  if (!sameStoragePath(canonicalEntry, entryPath)) {
    throw new Error(`${label}发生了链接或重解析跳转，已拒绝删除`);
  }
  if (sameStoragePath(canonicalEntry, canonicalRoot) || !storagePathContains(canonicalRoot, canonicalEntry)) {
    throw new Error(`${label}的真实路径越出了受控删除目录`);
  }
  const lexicalRoot = path.resolve(deletingRoot);
  if (sameStoragePath(entryPath, lexicalRoot) || !storagePathContains(lexicalRoot, entryPath)) {
    throw new Error(`${label}的配置路径越出了受控删除目录`);
  }
}

interface MaterialExportManifest {
  version: 1;
  signature: string;
  files: string[];
}

function isContactSheetKind(kind: GenerationKind): boolean {
  return kind === "contact_sheet" || kind === "contact_sheet_edit";
}

function contactSheetGridFor(shotCount: number): { columns: number; rows: number } {
  if (shotCount <= 1) return { columns: 1, rows: 1 };
  if (shotCount <= 3) return { columns: shotCount, rows: 1 };
  if (shotCount <= 4) return { columns: 2, rows: 2 };
  if (shotCount <= 6) return { columns: 3, rows: 2 };
  if (shotCount <= 8) return { columns: 4, rows: 2 };
  if (shotCount === 9) return { columns: 3, rows: 3 };
  if (shotCount <= 10) return { columns: 5, rows: 2 };
  if (shotCount <= 12) return { columns: 4, rows: 3 };
  if (shotCount <= 15) return { columns: 5, rows: 3 };
  if (shotCount === 16) return { columns: 4, rows: 4 };
  if (shotCount <= 18) return { columns: 6, rows: 3 };
  if (shotCount <= 20) return { columns: 5, rows: 4 };
  if (shotCount === 21) return { columns: 7, rows: 3 };
  return { columns: 8, rows: 3 };
}

function closestAspectRatio(width: number, height: number): AspectRatio {
  const value = width / height;
  const ratios: Array<[AspectRatio, number]> = [["9:16", 9 / 16], ["3:4", 3 / 4], ["1:1", 1], ["16:9", 16 / 9]];
  return ratios.sort((a, b) => Math.abs(Math.log(value / a[1])) - Math.abs(Math.log(value / b[1])))[0][0];
}

export type MediaVariant = "thumbnail" | "preview" | "source";

interface CreateProjectInput {
  name: string;
  templateId?: TemplateId;
  aspectRatio?: AspectRatio;
  shotCount?: number;
}

interface UpdateProjectInput {
  name?: string;
  brief?: string;
  aspectRatio?: AspectRatio;
  stage?: ProjectStage;
}

interface UpdateShotInput {
  title?: string;
  cast?: string;
  scene?: string;
  action?: string;
  composition?: string;
  instruction?: string;
}

interface EnqueueInput {
  projectId: string;
  kind: GenerationKind;
  shotIds: string[];
  instruction?: string;
  selectionMaskDataUrl?: string;
  annotatedPreviewDataUrl?: string;
}

interface CommitInput {
  projectId: string;
  requestId: string;
  claimToken: string;
  imageDataUrl?: string;
  imageFile?: OpenAIFileInput;
}

interface SaveCanvasInput {
  viewport?: CanvasState["viewport"];
  contactSheetPosition?: CanvasState["contactSheetPosition"];
  notes?: CanvasState["notes"];
  shotPositions?: Record<string, { x: number; y: number }>;
}

interface ResizeShotsInput {
  targetCount: number;
  confirmRemoval?: boolean;
}

interface UpdateVideoPlanInput {
  projectId: string;
  shotId: string;
  prompt: string;
  negativePrompt?: string;
  frameRate?: number;
  frameCount?: number;
  source?: "codex" | "user";
}

interface EnqueueVideoInput {
  projectId: string;
  shotIds: string[];
  providerId?: string;
  allowUnreviewed?: boolean;
  allowStalePrompt?: boolean;
  confirmExternalCost?: boolean;
}

export interface VideoJobContext {
  request: VideoRequest;
  project: Pick<ProjectRecord, "id" | "name" | "aspectRatio">;
  shot: ShotRecord;
  sourceImagePath: string;
  outputDirectory: string;
  runtimeDirectory: string;
  provider: VideoProviderProfile;
}

export interface VideoWorkerLease {
  release: () => Promise<void>;
}

function now(): string {
  return new Date().toISOString();
}

function dateStamp(): string {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("");
}

function compactId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function slugify(value: string): string {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "未命名项目";
}

function safeFileLabel(value: string, fallback = "分镜"): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 48) || fallback;
}

function materialShotStem(shot: ShotRecord, index: number): string {
  const number = String(index + 1).padStart(2, "0");
  return `scene_${number}_${safeFileLabel(shot.title, `分镜_${number}`)}`;
}

function manifestPath(...segments: string[]): string {
  return segments.join("/");
}

function isManagedMaterialPath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments.length === 2
    && [MATERIAL_INPUT_DIR, MATERIAL_IMAGE_DIR, MATERIAL_VIDEO_DIR].includes(segments[0])
    && Boolean(segments[1])
    && ![".", ".."].includes(segments[1]);
}

function markdownCell(value: string): string {
  return value.trim().replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|") || "—";
}

function assertProjectId(projectId: string): void {
  if (!/^[\p{L}\p{N}_-]+$/u.test(projectId)) {
    throw new Error("项目 ID 不合法");
  }
}

function referenceLabel(slot: ReferenceSlot): string {
  return ({ face: "主体身份", body: "主体全貌", outfit: "造型或商品", environment: "场景", identitySupport: "角色关系或补充参考" })[slot];
}

function resolveInside(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...segments);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("路径越界已被拒绝");
  }
  return resolved;
}

const blockedImageDownloadAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blockedImageDownloadAddresses.addSubnet(network, prefix, "ipv4");

const globalImageDownloadIpv6Addresses = new BlockList();
globalImageDownloadIpv6Addresses.addSubnet("2000::", 3, "ipv6");

function unbracketHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/** Public for focused security regression tests; production callers use the pinned downloader below. */
export function isPublicImageDownloadAddress(address: string): boolean {
  const normalized = unbracketHostname(address.trim());
  const family = isIP(normalized);
  if (family === 4) return !blockedImageDownloadAddresses.check(normalized, "ipv4");
  if (family === 6) {
    // Fail closed to today's globally routable unicast allocation. This also
    // rejects loopback, link-local, ULA, multicast and IPv4-mapped addresses.
    return globalImageDownloadIpv6Addresses.check(normalized, "ipv6");
  }
  return false;
}

/** Parse without making a network request, so malformed and local targets fail early. */
export function validateImageDownloadUrl(rawUrl: string): URL {
  if (!rawUrl || rawUrl.length > 4096) throw new Error("生成图片下载地址无效");
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("生成图片下载地址无效");
  }
  if (url.protocol !== "https:") throw new Error("生成图片下载地址必须使用公网 HTTPS");
  if (url.username || url.password) throw new Error("生成图片下载地址不得包含用户名或密码");
  const hostname = unbracketHostname(url.hostname).toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || /(?:^|\.)(?:localhost|local|internal|home|lan)$/.test(hostname)) {
    throw new Error("生成图片下载地址不得指向本机或内部网络");
  }
  if (isIP(hostname) && !isPublicImageDownloadAddress(hostname)) {
    throw new Error("生成图片下载地址不得指向私网、链路本地或保留地址");
  }
  url.hash = "";
  return url;
}

async function resolvePublicImageDownloadAddress(url: URL): Promise<{ address: string; family: 4 | 6 }> {
  const hostname = unbracketHostname(url.hostname);
  const directFamily = isIP(hostname);
  if (directFamily) {
    if (!isPublicImageDownloadAddress(hostname)) throw new Error("生成图片下载地址不得指向私网、链路本地或保留地址");
    return { address: hostname, family: directFamily as 4 | 6 };
  }
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("无法解析生成图片下载地址");
  }
  if (!addresses.length || addresses.some((entry) => !isPublicImageDownloadAddress(entry.address))) {
    throw new Error("生成图片下载地址解析到了私网、链路本地或保留地址");
  }
  const selected = addresses[0];
  return { address: selected.address, family: selected.family as 4 | 6 };
}

interface PinnedImageDownloadResponse {
  buffer?: Buffer;
  redirect?: string;
}

function requestPinnedImage(
  url: URL,
  pinned: { address: string; family: 4 | 6 },
  timeoutMs: number,
): Promise<PinnedImageDownloadResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, result?: PinnedImageDownloadResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(overallTimer);
      if (error) reject(error);
      else resolve(result ?? {});
    };
    const lookup: LookupFunction = (_hostname, _options, callback) => {
      callback(null, pinned.address, pinned.family);
    };
    const request = https.request(url, {
      method: "GET",
      headers: { Accept: "image/png,image/jpeg,image/webp,application/octet-stream;q=0.5" },
      lookup,
    }, (response) => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.resume();
        if (!location) return finish(new Error("生成图片下载重定向缺少目标地址"));
        return finish(undefined, { redirect: location });
      }
      if (status < 200 || status >= 300) {
        response.resume();
        return finish(new Error(`下载生成图片失败：HTTP ${status}`));
      }
      const encoding = String(response.headers["content-encoding"] ?? "identity").toLowerCase();
      if (encoding !== "identity") {
        response.resume();
        return finish(new Error("生成图片下载响应使用了不受支持的内容编码"));
      }
      const declaredLength = String(response.headers["content-length"] ?? "");
      if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_IMAGE_BYTES)) {
        response.resume();
        return finish(new Error("生成图片超过 25MB 限制"));
      }
      const chunks: Buffer[] = [];
      let received = 0;
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_IMAGE_BYTES) {
          response.destroy();
          finish(new Error("生成图片超过 25MB 限制"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (!settled) finish(undefined, { buffer: Buffer.concat(chunks, received) });
      });
      response.on("aborted", () => finish(new Error("生成图片下载被远端中断")));
      response.on("error", () => finish(new Error("生成图片下载连接失败")));
    });
    request.setTimeout(Math.min(timeoutMs, 30_000), () => request.destroy(new Error("生成图片下载超时")));
    request.on("error", (error) => finish(error instanceof Error ? error : new Error("生成图片下载失败")));
    const overallTimer = setTimeout(() => request.destroy(new Error("生成图片下载超时")), timeoutMs);
    request.end();
  });
}

async function downloadPublicImage(rawUrl: string): Promise<Buffer> {
  const deadline = Date.now() + IMAGE_DOWNLOAD_TIMEOUT_MS;
  let current = validateImageDownloadUrl(rawUrl);
  for (let redirects = 0; redirects <= MAX_IMAGE_DOWNLOAD_REDIRECTS; redirects += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("生成图片下载超时");
    const pinned = await resolvePublicImageDownloadAddress(current);
    const response = await requestPinnedImage(current, pinned, remaining);
    if (response.buffer) return response.buffer;
    if (!response.redirect || redirects === MAX_IMAGE_DOWNLOAD_REDIRECTS) {
      throw new Error("生成图片下载重定向次数过多");
    }
    current = validateImageDownloadUrl(new URL(response.redirect, current).toString());
  }
  throw new Error("生成图片下载失败");
}

function withoutClaimToken(request: GenerationRequest): GenerationRequest {
  const { claimToken: _claimToken, ...safeRequest } = request;
  return safeRequest;
}

function withoutVideoClaimToken(request: VideoRequest): VideoRequest {
  const { claimToken: _claimToken, ...safeRequest } = request;
  return safeRequest;
}

function normalizeMediaRelativePath(relativePath: string): string {
  if (!relativePath || relativePath.length > 500 || relativePath.includes("\0")) throw new Error("媒体路径无效");
  const slashed = relativePath.replace(/\\/g, "/");
  if (slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed)) throw new Error("媒体路径无效");
  const normalized = path.posix.normalize(slashed);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) throw new Error("媒体路径越界已被拒绝");
  return normalized;
}

function mediaSignaturePayload(projectId: string, relativePath: string, expiresAt: number): string {
  return `${projectId}\0${normalizeMediaRelativePath(relativePath)}\0${expiresAt}`;
}

function parseImageDataUrl(dataUrl: string): Buffer {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) throw new Error("只接受 PNG、JPEG 或 WebP 图片");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("图片为空或超过 25MB 限制");
  }
  return buffer;
}

async function normalizePng(buffer: Buffer): Promise<Buffer> {
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("图片超过 25MB 限制");
  try {
    const image = sharp(buffer, { failOn: "error" }).rotate();
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) throw new Error("无法识别图片尺寸");
    if (metadata.width * metadata.height > 80_000_000) throw new Error("图片像素尺寸过大");
    return await image.png({ compressionLevel: 9 }).toBuffer();
  } catch (error) {
    throw new Error(`图片解码失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isFsError(error: unknown, codes: readonly string[]): error is NodeJS.ErrnoException {
  return error instanceof Error && codes.includes((error as NodeJS.ErrnoException).code ?? "");
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function renameReplaceWithRetry(sourcePath: string, destinationPath: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      // Node uses replace-existing semantics for rename on Windows. Renaming the
      // prepared file directly avoids the visible gap and backup-name races caused
      // by first moving the current file out of the way.
      await fs.rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      const retryable = isFsError(error, ["EPERM", "EACCES", "EBUSY", "EEXIST", "ENOTEMPTY"]);
      if (!retryable || attempt >= FILE_REPLACE_RETRY_DELAYS_MS.length) throw error;
      await wait(FILE_REPLACE_RETRY_DELAYS_MS[attempt]);
    }
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await renameReplaceWithRetry(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function writeTextAtomic(filePath: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, value, "utf8");
  try {
    await renameReplaceWithRetry(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function filesShareIdentity(sourcePath: string, destinationPath: string): Promise<boolean> {
  try {
    const [source, destination] = await Promise.all([fs.stat(sourcePath), fs.stat(destinationPath)]);
    return source.ino !== 0
      && source.dev === destination.dev
      && source.ino === destination.ino
      && source.size === destination.size;
  } catch {
    return false;
  }
}

async function linkOrCopyAtomic(sourcePath: string, destinationPath: string): Promise<void> {
  if (await filesShareIdentity(sourcePath, destinationPath)) return;
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  const tempPath = `${destinationPath}.${randomUUID()}.tmp`;
  try {
    try {
      // The project-facing folders live on the same volume as the authoritative
      // files, so a hard link avoids storing a second full copy.  Copying remains
      // a safe fallback for unusual filesystems that do not support hard links.
      await fs.link(sourcePath, tempPath);
    } catch (error) {
      if (!isFsError(error, ["EXDEV", "EPERM", "EACCES", "ENOSYS", "ENOTSUP", "EINVAL"])) throw error;
      await fs.copyFile(sourcePath, tempPath);
    }
    await renameReplaceWithRetry(tempPath, destinationPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function replaceFileAtomic(filePath: string, buffer: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, buffer);
  try {
    await renameReplaceWithRetry(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function inferShotCast(
  shot: Pick<ShotRecord, "title" | "scene" | "action" | "composition" | "instruction">,
  projectBrief = "",
): string {
  const text = [shot.title, shot.scene, shot.action, shot.composition, shot.instruction].join("\n");
  const projectDefinesMixedLeads = /男主|男生|男性|男孩|少年/.test(projectBrief)
    && /女主|女生|女性|女孩|少女/.test(projectBrief);
  const mentionsPair = /两人|二人|男女主|男女同框|一男一女|男主和女主|男生和女生/.test(text);
  const hasMaleLead = /男主|男生|男性|男孩|少年|\bM\d*\b/.test(text) || /(?:^|[^她])他(?:[^们]|$)/.test(text);
  const hasFemaleLead = /女主|女生|女性|女孩|少女|\bF\d*\b/.test(text) || /她/.test(text);
  const hasMale = hasMaleLead || (mentionsPair && projectDefinesMixedLeads);
  const hasFemale = hasFemaleLead || (mentionsPair && projectDefinesMixedLeads);
  if (hasMale && hasFemale) return "男主 1 人 + 女主 1 人；主要人物总数严格为 2 人；两者身份、性别与外形不可互换或复制";
  if (hasMale) return "男主 1 人；主要人物总数严格为 1 人；保持同一男主身份";
  if (hasFemale) return "女主 1 人；主要人物总数严格为 1 人；保持同一女主身份";
  if (/空镜|无人画面|无人物|纯场景/.test(text)) return "无主要人物；只呈现场景与明确道具";
  return "";
}

function createShot(index: number, storageNumber = index + 1, columns = 3): ShotRecord {
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    id: `shot_${String(index + 1).padStart(2, "0")}_${randomUUID().slice(0, 6)}`,
    index,
    storageKey: String(storageNumber).padStart(2, "0"),
    title: `分镜 ${String(index + 1).padStart(2, "0")}`,
    cast: "",
    scene: "",
    action: "",
    composition: "",
    instruction: "",
    status: "empty",
    imageStale: false,
    // Reserve the complete footprint of the unified image/video card.
    position: { x: 40 + column * 300, y: 40 + row * 700 },
    hasUndo: false,
    manualChecklist: emptyChecklist(),
    videoStatus: "missing_prompt",
    videoChecklist: emptyVideoChecklist(),
  };
}

export class ProjectStore {
  readonly rootDir: string;
  readonly stateDir: string;
  readonly projectsDir: string;
  readonly projectDeletingDir: string;
  readonly runtimeDir: string;
  readonly templatesDir: string;
  readonly mediaOrigin: string;
  readonly videoProviders: VideoProviderStore;
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly materialExportAuditAt = new Map<string, number>();
  private mediaSigningSecret?: Buffer;
  private readonly signedMediaUrls = new Map<string, { expiresAt: number; signature: string }>();

  constructor(rootDir: string, mediaOrigin = "http://127.0.0.1:4317", projectsRoot?: string, stateRoot?: string) {
    this.rootDir = path.resolve(rootDir);
    this.stateDir = path.resolve(stateRoot ?? defaultStateDirectory());
    this.projectsDir = path.resolve(projectsRoot ?? resolveInside(this.stateDir, "data", "projects"));
    this.projectDeletingDir = resolveInside(this.projectsDir, ".image-control-deleting");
    this.runtimeDir = resolveInside(this.stateDir, ".runtime");
    this.templatesDir = resolveInside(this.rootDir, "templates");
    this.mediaOrigin = mediaOrigin.replace(/\/$/, "");
    this.videoProviders = new VideoProviderStore(this.stateDir);
  }

  private controlledDirectoryChain(): Array<{ path: string; label: string }> {
    return [
      { path: this.stateDir, label: "状态目录" },
      { path: this.projectsDir, label: "项目目录" },
      { path: this.projectDeletingDir, label: "项目受控删除目录" },
      { path: this.runtimeDir, label: "运行时目录" },
      { path: resolveInside(this.runtimeDir, "requests"), label: "图片请求运行时目录" },
      { path: resolveInside(this.runtimeDir, "video-requests"), label: "视频请求运行时目录" },
      { path: resolveInside(this.runtimeDir, "project-locks"), label: "项目锁目录" },
      { path: resolveInside(this.runtimeDir, "video-provider-locks"), label: "视频接口变更锁目录" },
      { path: resolveInside(this.runtimeDir, "deleting"), label: "兼容受控删除目录" },
    ];
  }

  private async validateStorageBoundaries(pathsToInspect = this.controlledDirectoryChain()): Promise<void> {
    assertStorageBoundaryPolicy(this.stateDir, this.projectsDir, this.rootDir);
    for (const entry of pathsToInspect) await assertNoLinkedPathComponents(entry.path, entry.label);

    const configuredProtectedRoots = protectedPluginCacheRoots();
    const [canonicalSource, canonicalState, canonicalProjects, ...canonicalProtectedRoots] = await Promise.all([
      realpathIfPresent(this.rootDir),
      realpathIfPresent(this.stateDir),
      realpathIfPresent(this.projectsDir),
      ...configuredProtectedRoots.map((root) => realpathIfPresent(root)),
    ]);
    assertStorageBoundaryPolicy(
      canonicalState ?? this.stateDir,
      canonicalProjects ?? this.projectsDir,
      canonicalSource ?? this.rootDir,
      [...configuredProtectedRoots, ...canonicalProtectedRoots.filter((root): root is string => Boolean(root))],
    );
  }

  private async cleanControlledDeletionRoot(deletingRoot: string, expectedParent: string, label: string): Promise<void> {
    await assertSafeDeletionRoot(deletingRoot, expectedParent, label);
    const entries = await fs.readdir(deletingRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw new Error(`${label}中的 ${entry.name} 是符号链接、目录联接或重解析点，已拒绝删除`);
      }
      const entryPath = resolveInside(deletingRoot, entry.name);
      const canonicalRoot = await assertSafeDeletionRoot(deletingRoot, expectedParent, label);
      await assertSafeDeletionEntry(deletingRoot, canonicalRoot, entryPath, `${label}中的 ${entry.name}`);
      await fs.rm(entryPath, { recursive: true, force: true });
    }
  }

  private async removeControlledEntryIfPresent(
    controlledRoot: string,
    expectedParent: string,
    entryPath: string,
    label: string,
  ): Promise<void> {
    if (!await lstatIfPresent(entryPath)) return;
    const canonicalRoot = await assertSafeDeletionRoot(controlledRoot, expectedParent, `${label}所属目录`);
    await assertSafeDeletionEntry(controlledRoot, canonicalRoot, entryPath, label);
    await fs.rm(entryPath, { recursive: true, force: true });
  }

  setMediaSigningSecret(secret: string): void {
    const normalized = secret.trim();
    if (normalized.length < 32) throw new Error("媒体签名密钥无效");
    this.mediaSigningSecret = Buffer.from(normalized, "utf8");
    this.signedMediaUrls.clear();
  }

  verifyMediaSignature(projectId: string, relativePath: string, expiresAtValue: unknown, signatureValue: unknown): boolean {
    if (!this.mediaSigningSecret || typeof signatureValue !== "string") return false;
    const expiresAt = Number(expiresAtValue);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + MEDIA_SIGNATURE_TTL_MS + MEDIA_SIGNATURE_REFRESH_MS) {
      return false;
    }
    let expected: Buffer;
    let received: Buffer;
    try {
      expected = Buffer.from(createHmac("sha256", this.mediaSigningSecret)
        .update(mediaSignaturePayload(projectId, relativePath, expiresAt))
        .digest("base64url"), "utf8");
      received = Buffer.from(signatureValue, "utf8");
    } catch {
      return false;
    }
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  async init(): Promise<void> {
    const legacyDeletingRoot = resolveInside(this.runtimeDir, "deleting");
    const controlledDirectories = this.controlledDirectoryChain();

    // Every boundary and every already-existing ancestor is checked before the
    // first mkdir. This prevents a configured state path from turning plugin
    // source, a plugin cache, a drive root, or a linked external directory into
    // a recursive-cleanup target.
    await this.validateStorageBoundaries(controlledDirectories);
    for (const entry of controlledDirectories) await ensureSafeDirectory(entry.path, entry.label);
    // Re-read all real paths after creation so a junction/reparse replacement
    // cannot silently change the canonical storage layout.
    await this.validateStorageBoundaries(controlledDirectories);
    for (const entry of controlledDirectories) {
      const canonical = await fs.realpath(entry.path);
      if (!sameStoragePath(canonical, entry.path)) throw new Error(`${entry.label}创建后的真实路径与配置不一致`);
    }

    await this.videoProviders.init();
    await this.cleanControlledDeletionRoot(this.projectDeletingDir, this.projectsDir, "项目受控删除目录");
    await this.cleanControlledDeletionRoot(legacyDeletingRoot, this.runtimeDir, "兼容受控删除目录");
  }

  private projectDir(projectId: string): string {
    assertProjectId(projectId);
    return resolveInside(this.projectsDir, projectId);
  }

  private projectFile(projectId: string): string {
    return resolveInside(this.projectDir(projectId), PROJECT_FILE);
  }

  private projectLockFile(projectId: string): string {
    assertProjectId(projectId);
    return resolveInside(this.runtimeDir, "project-locks", `${projectId}.lock`);
  }

  private videoWorkerLockFile(): string {
    return resolveInside(this.runtimeDir, VIDEO_WORKER_LOCK_FILE);
  }

  private processIsAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return isFsError(error, ["EPERM"]);
    }
  }

  private async clearAbandonedProjectLock(lockPath: string): Promise<boolean> {
    try {
      const [raw, stats] = await Promise.all([fs.readFile(lockPath, "utf8"), fs.stat(lockPath)]);
      let owner: { pid?: number } | undefined;
      try { owner = JSON.parse(raw) as { pid?: number }; } catch { owner = undefined; }
      const abandoned = owner?.pid ? !this.processIsAlive(owner.pid) : Date.now() - stats.mtimeMs > PROJECT_LOCK_STALE_MS;
      if (!abandoned) return false;
      await fs.rm(lockPath, { force: true });
      return true;
    } catch (error) {
      if (isFsError(error, ["ENOENT"])) return true;
      return false;
    }
  }

  private async acquireProjectFileLock(projectId: string): Promise<() => Promise<void>> {
    const lockPath = this.projectLockFile(projectId);
    const lockRoot = path.dirname(lockPath);
    const lockChain = this.controlledDirectoryChain();
    await this.validateStorageBoundaries(lockChain);
    await ensureSafeDirectory(lockRoot, "项目锁目录");
    await this.validateStorageBoundaries(lockChain);
    const token = randomUUID();
    const startedAt = Date.now();
    for (;;) {
      try {
        const handle = await fs.open(lockPath, "wx");
        try {
          await handle.writeFile(JSON.stringify({ token, pid: process.pid, createdAt: now() }), "utf8");
        } catch (error) {
          await handle.close().catch(() => undefined);
          await fs.rm(lockPath, { force: true }).catch(() => undefined);
          throw error;
        }
        return async () => {
          await handle.close().catch(() => undefined);
          try {
            const owner = JSON.parse(await fs.readFile(lockPath, "utf8")) as { token?: string };
            if (owner.token === token) await fs.rm(lockPath, { force: true });
          } catch (error) {
            if (!isFsError(error, ["ENOENT"])) throw error;
          }
        };
      } catch (error) {
        if (!isFsError(error, ["EEXIST"])) throw error;
        if (await this.clearAbandonedProjectLock(lockPath)) continue;
        if (Date.now() - startedAt >= PROJECT_LOCK_TIMEOUT_MS) {
          throw new Error("项目正由另一个图片生成中控进程保存，请稍后重试");
        }
        await wait(30 + Math.floor(Math.random() * 40));
      }
    }
  }

  async tryAcquireVideoWorkerLease(): Promise<VideoWorkerLease | undefined> {
    const lockPath = this.videoWorkerLockFile();
    const runtimeChain = this.controlledDirectoryChain();
    await this.validateStorageBoundaries(runtimeChain);
    await ensureSafeDirectory(this.runtimeDir, "运行时目录");
    await this.validateStorageBoundaries(runtimeChain);
    const token = randomUUID();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await fs.open(lockPath, "wx");
        try {
          await handle.writeFile(JSON.stringify({ token, pid: process.pid, createdAt: now() }), "utf8");
        } catch (error) {
          await handle.close().catch(() => undefined);
          await fs.rm(lockPath, { force: true }).catch(() => undefined);
          throw error;
        }
        await handle.close();
        return {
          release: async () => {
            try {
              const owner = JSON.parse(await fs.readFile(lockPath, "utf8")) as { token?: string };
              if (owner.token === token) await fs.rm(lockPath, { force: true });
            } catch (error) {
              if (!isFsError(error, ["ENOENT"])) throw error;
            }
          },
        };
      } catch (error) {
        if (!isFsError(error, ["EEXIST"])) throw error;
        if (attempt === 0 && await this.clearAbandonedProjectLock(lockPath)) continue;
        return undefined;
      }
    }
    return undefined;
  }

  private async withLock<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(projectId) ?? Promise.resolve();
    const run = async () => {
      const release = await this.acquireProjectFileLock(projectId);
      try {
        return await operation();
      } finally {
        await release();
      }
    };
    const current = previous.then(run, run);
    const settled = current.then(() => undefined, () => undefined);
    this.locks.set(projectId, settled);
    try {
      return await current;
    } finally {
      if (this.locks.get(projectId) === settled) this.locks.delete(projectId);
    }
  }

  private async appendActivity(projectId: string, event: string, detail: Record<string, unknown> = {}): Promise<void> {
    const logPath = resolveInside(this.projectDir(projectId), "activity.jsonl");
    await fs.appendFile(logPath, `${JSON.stringify({ at: now(), event, ...detail })}\n`, "utf8");
  }

  private materialExportSignature(project: ProjectRecord): string {
    const state = {
      version: 1,
      name: project.name,
      aspectRatio: project.aspectRatio,
      stage: project.stage,
      brief: project.brief,
      references: Array.from(REFERENCE_SLOTS).map((slot) => {
        const asset = project.references[slot];
        return asset ? [slot, asset.path, asset.fileName, asset.createdAt] : [slot];
      }),
      shots: project.shots.map((shot, index) => ({
        index,
        id: shot.id,
        title: shot.title,
        cast: shot.cast,
        scene: shot.scene,
        action: shot.action,
        composition: shot.composition,
        instruction: shot.instruction,
        imagePath: shot.imagePath,
        imageSha256: shot.imageSha256,
        videoStatus: shot.videoStatus,
        videoPlan: shot.videoPlan ? {
          frameRate: shot.videoPlan.frameRate,
          frameCount: shot.videoPlan.frameCount,
          durationSeconds: shot.videoPlan.durationSeconds,
          stale: shot.videoPlan.stale,
        } : undefined,
        videoArtifact: shot.videoArtifact ? {
          path: shot.videoArtifact.path,
          requestId: shot.videoArtifact.requestId,
          createdAt: shot.videoArtifact.createdAt,
          frameRate: shot.videoArtifact.frameRate,
          durationSeconds: shot.videoArtifact.durationSeconds,
          stale: shot.videoArtifact.stale,
        } : undefined,
      })),
    };
    return createHash("sha256").update(JSON.stringify(state)).digest("hex");
  }

  private materialPlanMarkdown(project: ProjectRecord): string {
    const rows = project.shots.map((shot, index) => {
      const number = String(index + 1).padStart(2, "0");
      const currentVideo = shot.videoArtifact && !shot.videoArtifact.stale ? shot.videoArtifact : undefined;
      const duration = currentVideo
        ? `${currentVideo.durationSeconds.toFixed(2)} 秒 / ${currentVideo.frameRate}fps`
        : shot.videoArtifact?.stale
          ? "旧视频已移出，待重做"
          : shot.videoPlan
            ? `${shot.videoPlan.durationSeconds.toFixed(2)} 秒 / 待生成`
            : "待生成";
      const videoFile = currentVideo ? `${materialShotStem(shot, index)}.mp4` : "—";
      return `| ${number} | ${markdownCell(shot.title)} | ${markdownCell(shot.cast)} | ${markdownCell(shot.scene)} | ${markdownCell(shot.action || shot.instruction)} | ${duration} | ${videoFile} |`;
    });
    const updatedAt = new Date(project.updatedAt).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    });
    return [
      MATERIAL_PLAN_MARKER,
      `# ${project.name}`,
      "",
      "> 本文件由图片生成中控自动同步。项目与分镜文字请在工作台内修改。",
      "",
      `- 项目 ID：${project.id}`,
      `- 画面比例：${project.aspectRatio}`,
      `- 最近更新：${updatedAt}`,
      `- 剪映导入：打开 \`${MATERIAL_VIDEO_DIR}\`，全选 MP4 后导入；文件名顺序即分镜顺序。`,
      "",
      "## 项目方向",
      "",
      project.brief.trim() || "待补充。",
      "",
      "## 分镜清单",
      "",
      "| 镜号 | 标题 | 出场主体 | 场景 | 动作 | 视频时长 | 导出文件 |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      ...rows,
      "",
    ].join("\n");
  }

  private async writeManagedMaterialPlan(project: ProjectRecord): Promise<void> {
    const planPath = resolveInside(this.projectDir(project.id), MATERIAL_PLAN_FILE);
    if (await pathExists(planPath)) {
      const current = await fs.readFile(planPath, "utf8");
      if (!current.replace(/^\uFEFF/, "").trimStart().startsWith(MATERIAL_PLAN_MARKER)) return;
    }
    await writeTextAtomic(planPath, this.materialPlanMarkdown(project));
  }

  private async readMaterialExportManifest(projectId: string): Promise<MaterialExportManifest | undefined> {
    try {
      const parsed = JSON.parse(await fs.readFile(resolveInside(this.projectDir(projectId), MATERIAL_EXPORT_MANIFEST), "utf8")) as Partial<MaterialExportManifest>;
      if (parsed.version !== 1 || typeof parsed.signature !== "string" || !Array.isArray(parsed.files)) return undefined;
      return {
        version: 1,
        signature: parsed.signature,
        files: parsed.files.filter((item): item is string => typeof item === "string" && isManagedMaterialPath(item)),
      };
    } catch (error) {
      if (isFsError(error, ["ENOENT"])) return undefined;
      return undefined;
    }
  }

  private async syncProjectFacingLayout(project: ProjectRecord): Promise<void> {
    const projectPath = this.projectDir(project.id);
    const signature = this.materialExportSignature(project);
    const previous = await this.readMaterialExportManifest(project.id);
    const requiredStructure = [
      resolveInside(projectPath, MATERIAL_INPUT_DIR),
      resolveInside(projectPath, MATERIAL_IMAGE_DIR),
      resolveInside(projectPath, MATERIAL_VIDEO_DIR),
      resolveInside(projectPath, MATERIAL_PLAN_FILE),
    ];
    if (previous?.signature === signature) {
      const lastAudit = this.materialExportAuditAt.get(project.id) ?? 0;
      if (Date.now() - lastAudit < MATERIAL_EXPORT_AUDIT_INTERVAL_MS) return;
      this.materialExportAuditAt.set(project.id, Date.now());
      const managedFiles = previous.files.map((relativePath) => resolveInside(projectPath, ...relativePath.split("/")));
      const allPresent = (await Promise.all([...requiredStructure, ...managedFiles].map(pathExists))).every(Boolean);
      if (allPresent) {
        await fs.rm(resolveInside(projectPath, MATERIAL_EXPORT_ERROR), { force: true });
        return;
      }
    }

    await Promise.all(requiredStructure.slice(0, 3).map((directory) => fs.mkdir(directory, { recursive: true })));
    const exports: Array<{ sourcePath: string; relativePath: string }> = [];
    for (const slot of REFERENCE_SLOTS) {
      const asset = project.references[slot];
      if (!asset) continue;
      const sourcePath = resolveInside(projectPath, asset.path);
      if (!await pathExists(sourcePath)) continue;
      const originalName = safeFileLabel(path.basename(asset.fileName, path.extname(asset.fileName)), slot);
      exports.push({
        sourcePath,
        relativePath: manifestPath(MATERIAL_INPUT_DIR, `${referenceLabel(slot)}_${originalName}.png`),
      });
    }
    for (const [index, shot] of project.shots.entries()) {
      const stem = materialShotStem(shot, index);
      if (shot.imagePath) {
        const sourcePath = resolveInside(projectPath, shot.imagePath);
        if (await pathExists(sourcePath)) {
          exports.push({ sourcePath, relativePath: manifestPath(MATERIAL_IMAGE_DIR, `${stem}.png`) });
        }
      }
      if (shot.videoArtifact && !shot.videoArtifact.stale) {
        const sourcePath = resolveInside(projectPath, shot.videoArtifact.path);
        if (await pathExists(sourcePath)) {
          exports.push({ sourcePath, relativePath: manifestPath(MATERIAL_VIDEO_DIR, `${stem}.mp4`) });
        }
      }
    }

    await Promise.all(exports.map(({ sourcePath, relativePath }) => (
      linkOrCopyAtomic(sourcePath, resolveInside(projectPath, ...relativePath.split("/")))
    )));
    await this.writeManagedMaterialPlan(project);

    const expectedFiles = new Set(exports.map((item) => item.relativePath));
    await Promise.all((previous?.files ?? [])
      .filter((relativePath) => !expectedFiles.has(relativePath) && isManagedMaterialPath(relativePath))
      .map((relativePath) => fs.rm(resolveInside(projectPath, ...relativePath.split("/")), { force: true })));

    const manifest: MaterialExportManifest = {
      version: 1,
      signature,
      files: [...expectedFiles].sort((a, b) => a.localeCompare(b, "zh-CN")),
    };
    await writeJsonAtomic(resolveInside(projectPath, MATERIAL_EXPORT_MANIFEST), manifest);
    this.materialExportAuditAt.set(project.id, Date.now());
    await fs.rm(resolveInside(projectPath, MATERIAL_EXPORT_ERROR), { force: true });
  }

  private async syncProjectFacingLayoutSafely(project: ProjectRecord): Promise<void> {
    try {
      await this.syncProjectFacingLayout(project);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeTextAtomic(
        resolveInside(this.projectDir(project.id), MATERIAL_EXPORT_ERROR),
        `${now()} 素材包同步失败：${message}\n`,
      ).catch(() => undefined);
    }
  }

  private async saveProject(project: ProjectRecord): Promise<ProjectRecord> {
    project.updatedAt = now();
    await writeJsonAtomic(this.projectFile(project.id), project);
    await this.syncProjectFacingLayoutSafely(project);
    return project;
  }

  private contactSheetHome(project: ProjectRecord): CanvasState["contactSheetPosition"] {
    const maxShotX = Math.max(40, ...project.shots.map((shot) => shot.position.x));
    const minShotY = Math.min(40, ...project.shots.map((shot) => shot.position.y));
    return { x: maxShotX + 364, y: minShotY };
  }

  private invalidateContactSheet(project: ProjectRecord): void {
    project.contactSheetApprovedAt = undefined;
    if (!project.contactSheetPath) return;
    project.contactSheetStale = true;
    if (project.stage === "production" || project.stage === "complete") project.stage = "storyboard";
  }

  private invalidateImages(project: ProjectRecord, affectedShotIds?: string[]): void {
    const targets = affectedShotIds ? new Set(affectedShotIds) : undefined;
    let invalidated = false;
    project.shots.forEach((shot) => {
      if (shot.imagePath && (!targets || targets.has(shot.id))) {
        shot.imageStale = true;
        this.invalidateVideo(shot);
        invalidated = true;
      }
    });
    if (invalidated && (project.stage === "production" || project.stage === "complete")) project.stage = "storyboard";
  }

  private invalidateVideo(shot: ShotRecord): void {
    if (shot.videoPlan) shot.videoPlan.stale = true;
    if (shot.videoArtifact) shot.videoArtifact.stale = true;
    shot.videoStatus = "missing_prompt";
    shot.videoChecklist = emptyVideoChecklist();
  }

  private assertNoActiveVideoRequests(project: ProjectRecord, shotIds: string[], nextAction: string): void {
    const targets = new Set(shotIds);
    const blocked = project.shots.filter((shot) => targets.has(shot.id) && project.videoRequests.some((request) => (
      request.shotId === shot.id && ACTIVE_VIDEO_STATUSES.has(request.status)
    )));
    if (blocked.length) {
      throw new Error(`分镜 ${blocked.map((shot) => String(shot.index + 1).padStart(2, "0")).join("、")} 正在生成视频，${nextAction}`);
    }
  }

  private assertNoActiveImageRequests(project: ProjectRecord, shotIds: string[], nextAction: string): void {
    const targets = new Set(shotIds);
    const blocked = project.shots.filter((shot) => targets.has(shot.id) && project.generationRequests.some((request) => (
      !isContactSheetKind(request.kind) && ACTIVE_GENERATION_STATUSES.has(request.status) && request.shotIds.includes(shot.id)
    )));
    if (blocked.length) {
      throw new Error(`分镜 ${blocked.map((shot) => String(shot.index + 1).padStart(2, "0")).join("、")} 正在处理图片，${nextAction}`);
    }
  }

  private async ensureImageHash(projectId: string, shot: ShotRecord): Promise<string> {
    if (!shot.imagePath) throw new Error("分镜尚无正式图片");
    const imagePath = resolveInside(this.projectDir(projectId), shot.imagePath);
    const hash = createHash("sha256").update(await fs.readFile(imagePath)).digest("hex");
    shot.imageSha256 = hash;
    return hash;
  }

  private assertContactSheetApproved(project: ProjectRecord): void {
    if (!project.contactSheetPath) throw new Error("请先生成宫格总览并完成人工确认");
    if (project.contactSheetStale) throw new Error("宫格总览已过期，请按当前分镜重新生成并确认");
    if (!project.contactSheetApprovedAt) throw new Error("请先人工确认宫格总览");
  }

  private assertContactSheetReady(project: ProjectRecord): void {
    if (!project.brief.trim()) throw new Error("请先完成方向分析并保存项目摘要");
    const incomplete = project.shots.filter((shot) => !shot.scene.trim() && !shot.action.trim() && !shot.instruction.trim());
    if (incomplete.length) {
      throw new Error(`请先补充分镜内容：${incomplete.map((shot) => String(shot.index + 1).padStart(2, "0")).join("、")}`);
    }
    const missingCast = project.shots.filter((shot) => !shot.cast.trim());
    if (missingCast.length) {
      throw new Error(`请先明确每镜的出场主体锁定：${missingCast.map((shot) => String(shot.index + 1).padStart(2, "0")).join("、")}`);
    }
  }

  private async loadProject(projectId: string): Promise<{ project: ProjectRecord; changed: boolean }> {
    const raw = await fs.readFile(this.projectFile(projectId), "utf8");
    const parsed = JSON.parse(raw) as { schemaVersion?: number; id?: string };
    if (![1, 2].includes(Number(parsed.schemaVersion)) || parsed.id !== projectId) throw new Error("项目文件版本或标识不正确");
    if (parsed.schemaVersion === 1) {
      const backupDir = resolveInside(this.stateDir, "data", "local", "backups", "project-migrations", projectId);
      const backupPath = resolveInside(backupDir, `schema-1-${createHash("sha256").update(raw).digest("hex").slice(0, 16)}.json`);
      if (!await pathExists(backupPath)) {
        await fs.mkdir(backupDir, { recursive: true });
        await writeTextAtomic(backupPath, raw.endsWith("\n") ? raw : `${raw}\n`);
      }
    }
    let changed = parsed.schemaVersion === 1;
    const project = parsed as unknown as ProjectRecord;
    project.schemaVersion = 2;
    if (!Array.isArray(project.shots)
      || !Array.isArray(project.generationRequests)
      || !project.canvas
      || !Array.isArray(project.canvas.notes)
      || !project.references
      || typeof project.references !== "object") {
      throw new Error("项目文件结构不完整，已拒绝自动覆盖；请从备份恢复后重试");
    }
    const storedTemplateId = (project as unknown as { templateId?: string }).templateId ?? "";
    if (storedTemplateId === "womens-ecommerce") {
      project.templateId = "blank";
      changed = true;
    } else if (!ALLOWED_TEMPLATES.has(storedTemplateId as TemplateId)) {
      throw new Error(`项目模板不受支持：${storedTemplateId || "空值"}`);
    }
    if (!project.referenceConstraints) { project.referenceConstraints = {}; changed = true; }
    if (!project.videoRequests) { project.videoRequests = []; changed = true; }
    if (!Array.isArray(project.videoRequests)) throw new Error("项目视频队列结构不正确");
    for (const request of project.videoRequests) {
      if (!request.id || !request.projectId || !request.shotId || !request.providerId || !request.snapshot) {
        throw new Error("项目视频队列包含不完整记录，已拒绝自动覆盖");
      }
      if (!request.idempotencyKey) {
        request.idempotencyKey = request.id;
        changed = true;
      }
      if (!request.submissionState) {
        if (request.remoteJobId) {
          request.submissionState = ["running", "downloading", "completed"].includes(request.status) ? "accepted" : "unknown";
        } else if (["running", "downloading", "completed"].includes(request.status)) {
          request.submissionState = "accepted";
        } else if (["submitting", "waiting_remote", "failed"].includes(request.status)) {
          request.submissionState = "unknown";
        } else {
          request.submissionState = "not-submitted";
        }
        changed = true;
      }
      if (["completed", "failed", "cancelled"].includes(request.status) && request.claimToken) {
        request.claimToken = undefined;
        request.leaseExpiresAt = undefined;
        changed = true;
      }
    }
    if (project.contactSheetPath && !project.contactSheetGrid) {
      project.contactSheetGrid = contactSheetGridFor(project.shots.length);
      changed = true;
    }
    if (project.contactSheetPath
      && project.canvas.contactSheetPosition.x === 80
      && project.canvas.contactSheetPosition.y === 120) {
      project.canvas.contactSheetPosition = this.contactSheetHome(project);
      changed = true;
    }
    project.canvas.notes.forEach((note, index) => {
      if (note.position.x === 110 && note.position.y === 620 + index * 150) {
        note.position = { x: project.canvas.contactSheetPosition.x + 380, y: 40 + index * 160 };
        changed = true;
      }
    });
    for (const [index, shot] of project.shots.entries()) {
      if (typeof shot.cast !== "string") {
        shot.cast = inferShotCast(shot, project.brief);
        changed = true;
      }
      if (!shot.storageKey) {
        const fromPath = shot.imagePath?.match(/shots[\\/]([^\\/]+)/)?.[1];
        shot.storageKey = fromPath ?? String(index + 1).padStart(2, "0");
        changed = true;
      }
      if (!shot.videoStatus) {
        shot.videoStatus = shot.videoArtifact ? (shot.videoArtifact.stale ? "missing_prompt" : "review") : shot.videoPlan && !shot.videoPlan.stale ? "ready" : "missing_prompt";
        changed = true;
      }
      if (!shot.videoChecklist) {
        shot.videoChecklist = emptyVideoChecklist();
        changed = true;
      }
      if (typeof shot.imageStale !== "boolean") {
        shot.imageStale = false;
        changed = true;
      }
      // The unified canvas no longer has a separate approval gate. Existing reviewed
      // media remains intact and becomes immediately usable in its original shot.
      if (shot.imagePath && shot.status === "review") {
        shot.status = "accepted";
        changed = true;
      }
      if (shot.videoArtifact && shot.videoStatus === "review") {
        shot.videoStatus = "accepted";
        changed = true;
      }
      const artifactRequest = shot.videoArtifact
        ? project.videoRequests.find((request) => request.id === shot.videoArtifact?.requestId)
        : undefined;
      const artifactStateInconsistent = Boolean(shot.videoArtifact && artifactRequest && (
        artifactRequest.status !== "completed"
        || artifactRequest.progress !== 100
        || artifactRequest.error
        || shot.videoStatus === "failed"
        || ["queued", "uploading", "running", "downloading"].includes(shot.videoStatus)
      ));
      if (artifactStateInconsistent && shot.videoArtifact && artifactRequest) {
        const artifactPath = resolveInside(this.projectDir(projectId), shot.videoArtifact.path);
        if (await pathExists(artifactPath)) {
          artifactRequest.status = "completed";
          artifactRequest.progress = 100;
          artifactRequest.error = undefined;
          artifactRequest.updatedAt = shot.videoArtifact.createdAt;
          shot.videoStatus = shot.videoArtifact.stale ? "missing_prompt" : "accepted";
          changed = true;
        }
      }
    }
    return { project, changed };
  }

  private async getProjectUnlocked(projectId: string): Promise<ProjectRecord> {
    return (await this.loadProject(projectId)).project;
  }

  async getProject(projectId: string): Promise<ProjectRecord> {
    return this.withLock(projectId, async () => {
      const { project, changed } = await this.loadProject(projectId);
      if (changed) await this.saveProject(project);
      else await this.syncProjectFacingLayoutSafely(project);
      return project;
    });
  }

  private mediaUrl(projectId: string, relativePath?: string, version?: string): string | undefined {
    if (!relativePath) return undefined;
    const normalizedPath = normalizeMediaRelativePath(relativePath);
    const encoded = normalizedPath.split("/").map(encodeURIComponent).join("/");
    // Media URLs are rendered into native image/video elements.  Do not use a
    // timestamp here: the workbench polls active jobs every second, and a new
    // URL makes a completed video reload forever before it can expose metadata.
    const cacheVersion = encodeURIComponent(version ?? relativePath);
    let mediaUrl = `${this.mediaOrigin}/media/${encodeURIComponent(projectId)}/${encoded}?v=${cacheVersion}`;
    if (this.mediaSigningSecret) {
      const key = `${projectId}\0${normalizedPath}\0${version ?? relativePath}`;
      let signed = this.signedMediaUrls.get(key);
      if (!signed || signed.expiresAt <= Date.now() + MEDIA_SIGNATURE_REFRESH_MS) {
        const expiresAt = Date.now() + MEDIA_SIGNATURE_TTL_MS;
        signed = {
          expiresAt,
          signature: createHmac("sha256", this.mediaSigningSecret)
            .update(mediaSignaturePayload(projectId, normalizedPath, expiresAt))
            .digest("base64url"),
        };
        this.signedMediaUrls.set(key, signed);
      }
      mediaUrl += `&exp=${signed.expiresAt}&sig=${encodeURIComponent(signed.signature)}`;
    }
    return mediaUrl;
  }

  toClientProject(project: ProjectRecord): ProjectRecord {
    const latestCompletedContactSheetRequest = project.generationRequests
      .filter((request) => isContactSheetKind(request.kind) && request.status === "completed")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const contactSheetVersion = latestCompletedContactSheetRequest?.updatedAt
      ?? project.contactSheetApprovedAt
      ?? project.contactSheetPath;
    return {
      ...project,
      generationRequests: project.generationRequests.map(withoutClaimToken),
      videoRequests: project.videoRequests.map(withoutVideoClaimToken),
      references: Object.fromEntries(
        Object.entries(project.references).map(([slot, asset]) => [
          slot,
          asset ? { ...asset, mediaUrl: this.mediaUrl(project.id, asset.path, asset.createdAt) } : asset,
        ]),
      ),
      shots: project.shots.map((shot) => ({
        ...shot,
        imageUrl: this.mediaUrl(project.id, shot.imagePath, shot.imageSha256 ?? shot.imagePath),
        videoArtifact: shot.videoArtifact ? {
          ...shot.videoArtifact,
          mediaUrl: this.mediaUrl(project.id, shot.videoArtifact.path, `${shot.videoArtifact.requestId}-${shot.videoArtifact.createdAt}`),
        } : undefined,
      })),
      // A video's progress updates project.updatedAt repeatedly.  The contact
      // sheet URL must only change when the sheet bitmap itself changes, or the
      // Codex host will reload the full sheet and clear an in-progress cell
      // selection on every status poll.
      contactSheetUrl: this.mediaUrl(project.id, project.contactSheetPath, contactSheetVersion),
    };
  }

  async listProjects(): Promise<ProjectSummary[]> {
    await this.init();
    const entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
    const projects: ProjectSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const project = await this.getProject(entry.name);
        const previewPath = project.contactSheetPath ?? project.shots.find((shot) => shot.imagePath)?.imagePath;
        projects.push({
          id: project.id,
          name: project.name,
          templateId: project.templateId,
          aspectRatio: project.aspectRatio,
          stage: project.stage,
          updatedAt: project.updatedAt,
          shotCount: project.shots.length,
          acceptedCount: project.shots.filter((shot) => Boolean(shot.imagePath)).length,
          previewPath,
          previewUrl: this.mediaUrl(project.id, previewPath, project.shots.find((shot) => shot.imagePath === previewPath)?.imageSha256 ?? project.updatedAt),
        });
      } catch {
        // A broken project must not hide healthy projects from the launcher.
      }
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    await this.init();
    const name = input.name.trim();
    if (!name) throw new Error("项目名称不能为空");
    const templateId = input.templateId ?? "blank";
    if (!ALLOWED_TEMPLATES.has(templateId)) throw new Error("项目类型不受支持，请使用单图无限编辑或通用分镜");
    const aspectRatio = input.aspectRatio ?? "9:16";
    if (!ALLOWED_RATIOS.has(aspectRatio)) throw new Error("画面比例不受支持");
    const shotCount = templateId === "image-editor" ? 1 : Math.max(1, Math.min(24, Math.round(input.shotCount ?? 6)));
    const canvasColumns = shotCount <= 4 ? 2 : shotCount <= 9 ? 3 : 4;
    const projectId = `${dateStamp()}-${slugify(name)}-${randomUUID().slice(0, 4)}`;
    const timestamp = now();
    const project: ProjectRecord = {
      schemaVersion: 2,
      id: projectId,
      name,
      templateId,
      aspectRatio,
      stage: templateId === "image-editor" ? "production" : "direction",
      brief: "",
      createdAt: timestamp,
      updatedAt: timestamp,
      references: {},
      referenceConstraints: {},
      shots: Array.from({ length: shotCount }, (_, index) => createShot(index, index + 1, canvasColumns)),
      canvas: {
        viewport: { x: 10, y: 20, zoom: 0.63 },
        contactSheetPosition: { x: 104 + canvasColumns * 300, y: 40 },
        notes: [],
      },
      generationRequests: [],
      videoRequests: [],
    };
    if (templateId === "image-editor") {
      project.shots[0].title = "当前图片";
      project.shots[0].scene = "单图编辑画布";
      project.shots[0].composition = "保持当前画面比例与主体关系";
      project.shots[0].position = { x: 80, y: 60 };
      project.canvas.viewport = { x: 0, y: 0, zoom: 1 };
    }
    const projectPath = this.projectDir(projectId);
    await Promise.all([
      fs.mkdir(resolveInside(projectPath, "references"), { recursive: true }),
      fs.mkdir(resolveInside(projectPath, "storyboard"), { recursive: true }),
      fs.mkdir(resolveInside(projectPath, "shots"), { recursive: true }),
    ]);
    await this.saveProject(project);
    await this.appendActivity(projectId, "project.created", { templateId, shotCount });
    return this.toClientProject(project);
  }

  async deleteProject(projectId: string): Promise<{ deletedProjectId: string }> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const projectPath = this.projectDir(projectId);
      // Stage the project on the same volume as its configured project root.
      // Windows cannot atomically rename a project from an external C: project
      // root into the plugin's D: runtime directory.
      const deletingRoot = this.projectDeletingDir;
      const stagedPath = resolveInside(deletingRoot, `${projectId}-${randomUUID()}`);

      const deletionChain = this.controlledDirectoryChain();
      await this.validateStorageBoundaries(deletionChain);
      await ensureSafeDirectory(deletingRoot, "项目受控删除目录");
      await this.validateStorageBoundaries(deletionChain);
      const canonicalProjectsRoot = await fs.realpath(this.projectsDir);
      await assertSafeDeletionEntry(this.projectsDir, canonicalProjectsRoot, projectPath, `项目 ${projectId}`);
      await assertSafeDeletionRoot(deletingRoot, this.projectsDir, "项目受控删除目录");
      await fs.rename(projectPath, stagedPath);

      try {
        const imageRequestsRoot = resolveInside(this.runtimeDir, "requests");
        const videoRequestsRoot = resolveInside(this.runtimeDir, "video-requests");
        for (const request of project.generationRequests) {
          await this.removeControlledEntryIfPresent(
            imageRequestsRoot,
            this.runtimeDir,
            resolveInside(imageRequestsRoot, request.id),
            `图片请求目录 ${request.id}`,
          );
        }
        for (const request of project.videoRequests) {
          await this.removeControlledEntryIfPresent(
            videoRequestsRoot,
            this.runtimeDir,
            resolveInside(videoRequestsRoot, request.id),
            `视频请求目录 ${request.id}`,
          );
        }
        await this.removeControlledEntryIfPresent(deletingRoot, this.projectsDir, stagedPath, `待删除项目 ${projectId}`);
      } catch (error) {
        throw new Error(`项目已移出列表，但清理文件失败：${error instanceof Error ? error.message : String(error)}`);
      }

      return { deletedProjectId: projectId };
    });
  }

  async updateProject(projectId: string, patch: UpdateProjectInput): Promise<ProjectRecord> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      if (patch.aspectRatio !== undefined && patch.aspectRatio !== project.aspectRatio && (
        project.generationRequests.some((request) => ACTIVE_GENERATION_STATUSES.has(request.status))
        || project.videoRequests.some((request) => ACTIVE_VIDEO_STATUSES.has(request.status))
      )) throw new Error("项目仍有生成任务，请完成后再修改画面比例");
      let storyboardChanged = false;
      if (patch.name !== undefined) {
        if (!patch.name.trim()) throw new Error("项目名称不能为空");
        project.name = patch.name.trim().slice(0, 120);
      }
      if (patch.brief !== undefined) {
        const brief = patch.brief.trim().slice(0, 8000);
        storyboardChanged ||= brief !== project.brief;
        project.brief = brief;
      }
      if (patch.aspectRatio !== undefined) {
        if (!ALLOWED_RATIOS.has(patch.aspectRatio)) throw new Error("画面比例不受支持");
        storyboardChanged ||= patch.aspectRatio !== project.aspectRatio;
        project.aspectRatio = patch.aspectRatio;
      }
      if (storyboardChanged) {
        this.invalidateContactSheet(project);
        this.invalidateImages(project);
      }
      if (patch.stage !== undefined) {
        if (!ALLOWED_STAGES.has(patch.stage)) throw new Error("项目阶段不受支持");
        if (patch.stage === "production") this.assertContactSheetApproved(project);
        if (patch.stage === "complete" && !project.shots.every((shot) => shot.status === "accepted")) {
          throw new Error("全部分镜生成正式图片后才能完成项目");
        }
        project.stage = patch.stage;
      }
      await this.saveProject(project);
      await this.appendActivity(projectId, "project.updated", { fields: Object.keys(patch) });
      return this.toClientProject(project);
    });
  }

  async updateShot(projectId: string, shotId: string, patch: UpdateShotInput): Promise<ProjectRecord> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const shot = project.shots.find((item) => item.id === shotId);
      if (!shot) throw new Error("分镜不存在");
      const changesVideoMeaning = ["cast", "scene", "action", "composition", "instruction"].some((key) => patch[key as keyof UpdateShotInput] !== undefined);
      if (Object.keys(patch).length) this.assertNoActiveImageRequests(project, [shotId], "请等待完成后再修改分镜内容");
      if (changesVideoMeaning) this.assertNoActiveVideoRequests(project, [shotId], "请等待完成后再修改动作或画面要求");
      let changed = false;
      let visualChanged = false;
      for (const key of ["title", "cast", "scene", "action", "composition", "instruction"] as const) {
        if (patch[key] !== undefined) {
          const value = patch[key]!.trim().slice(0, key === "instruction" ? 4000 : key === "cast" ? 1000 : 1200);
          const fieldChanged = value !== shot[key];
          changed ||= fieldChanged;
          visualChanged ||= fieldChanged && key !== "title";
          shot[key] = value;
        }
      }
      if (changed) {
        if (visualChanged) {
          this.invalidateContactSheet(project);
          this.invalidateImages(project, [shotId]);
        }
      }
      await this.saveProject(project);
      await this.appendActivity(projectId, "shot.updated", { shotId, fields: Object.keys(patch) });
      return this.toClientProject(project);
    });
  }

  async addShot(projectId: string): Promise<ProjectRecord> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      if (project.shots.length >= 24) throw new Error("每个项目最多 24 个分镜");
      const nextStorageNumber = Math.max(0, ...project.shots.map((shot) => Number.parseInt(shot.storageKey, 10) || 0)) + 1;
      const shot = createShot(project.shots.length, nextStorageNumber);
      shot.position = {
        x: 40 + (project.shots.length % 3) * 300,
        y: Math.max(40, ...project.shots.map((item) => item.position.y)) + 480,
      };
      project.shots.push(shot);
      this.invalidateContactSheet(project);
      await this.saveProject(project);
      await this.appendActivity(projectId, "shot.added", { shotId: project.shots.at(-1)!.id });
      return this.toClientProject(project);
    });
  }

  async resizeShotCount(projectId: string, input: ResizeShotsInput): Promise<ProjectRecord> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const targetCount = Math.max(1, Math.min(24, Math.round(Number(input.targetCount))));
      const currentCount = project.shots.length;
      if (targetCount === currentCount) return this.toClientProject(project);
      if (project.generationRequests.some((request) => ACTIVE_GENERATION_STATUSES.has(request.status)) || project.videoRequests.some((request) => ACTIVE_VIDEO_STATUSES.has(request.status))) {
        throw new Error("项目仍有生成任务，请完成后再调整分镜数量");
      }

      if (targetCount < currentCount) {
        if (!input.confirmRemoval) throw new Error("减少分镜会永久删除末尾镜头及其图片，请先确认");
        const removed = project.shots.slice(targetCount);
        const activeStatuses = new Set<GenerationStatus>(["queued", "generating", "saving"]);
        if (project.generationRequests.some((request) => (
          activeStatuses.has(request.status) && request.shotIds.some((shotId) => removed.some((shot) => shot.id === shotId))
        ))) throw new Error("末尾分镜仍有生成任务，请先取消或等待任务结束");
        const activeVideoStatuses = new Set<VideoRequestStatus>(["queued", "waiting_remote", "uploading", "submitting", "running", "downloading"]);
        if (project.videoRequests.some((request) => activeVideoStatuses.has(request.status) && removed.some((shot) => shot.id === request.shotId))) {
          throw new Error("末尾分镜仍有视频任务，请先取消或等待任务结束");
        }
        project.shots.splice(targetCount);
        await Promise.all(removed.map((shot) => fs.rm(this.shotDirectory(projectId, shot), { recursive: true, force: true })));
      } else {
        const nextStorageNumber = Math.max(0, ...project.shots.map((shot) => Number.parseInt(shot.storageKey, 10) || 0));
        const baseY = Math.max(40, ...project.shots.map((shot) => shot.position.y)) + 480;
        const columns = targetCount <= 4 ? 2 : targetCount <= 9 ? 3 : 4;
        const additions = targetCount - currentCount;
        for (let offset = 0; offset < additions; offset += 1) {
          const shot = createShot(currentCount + offset, nextStorageNumber + offset + 1, columns);
          shot.position = {
            x: 40 + (offset % columns) * 300,
            y: baseY + Math.floor(offset / columns) * 480,
          };
          project.shots.push(shot);
        }
      }

      project.shots.forEach((shot, index) => { shot.index = index; });
      this.invalidateContactSheet(project);
      await this.saveProject(project);
      await this.appendActivity(projectId, "shot.count_resized", { from: currentCount, to: targetCount });
      return this.toClientProject(project);
    });
  }

  async deleteShot(projectId: string, shotId: string): Promise<ProjectRecord> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      if (project.shots.length <= 1) throw new Error("项目至少保留一个分镜");
      const index = project.shots.findIndex((item) => item.id === shotId);
      if (index < 0) throw new Error("分镜不存在");
      this.assertNoActiveImageRequests(project, [shotId], "请等待完成后再删除分镜");
      if (project.videoRequests.some((request) => request.shotId === shotId && ["queued", "waiting_remote", "uploading", "submitting", "running", "downloading"].includes(request.status))) {
        throw new Error("该分镜仍有视频任务，请先取消或等待任务结束");
      }
      const [removed] = project.shots.splice(index, 1);
      project.shots.forEach((shot, shotIndex) => { shot.index = shotIndex; });
      this.invalidateContactSheet(project);
      const shotFolder = resolveInside(this.projectDir(projectId), "shots", removed.storageKey);
      await fs.rm(shotFolder, { recursive: true, force: true });
      await this.saveProject(project);
      await this.appendActivity(projectId, "shot.deleted", { shotId });
      return this.toClientProject(project);
    });
  }

  async moveShot(projectId: string, shotId: string, direction: -1 | 1): Promise<ProjectRecord> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const index = project.shots.findIndex((item) => item.id === shotId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= project.shots.length) return this.toClientProject(project);
      const involvedShotIds = [project.shots[index].id, project.shots[target].id];
      this.assertNoActiveImageRequests(project, involvedShotIds, "请等待完成后再调整顺序");
      this.assertNoActiveVideoRequests(project, involvedShotIds, "请等待完成后再调整顺序");
      [project.shots[index], project.shots[target]] = [project.shots[target], project.shots[index]];
      project.shots.forEach((shot, shotIndex) => { shot.index = shotIndex; });
      this.invalidateContactSheet(project);
      await this.saveProject(project);
      await this.appendActivity(projectId, "shot.reordered", { shotId, direction });
      return this.toClientProject(project);
    });
  }

  async importReference(projectId: string, slot: ReferenceSlot, dataUrl: string, fileName = `${slot}.png`): Promise<ProjectRecord> {
    if (!REFERENCE_SLOTS.has(slot)) throw new Error("参考图类型不受支持");
    const normalized = await normalizePng(parseImageDataUrl(dataUrl));
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const relativePath = path.join("references", `${slot}.png`);
      const destination = resolveInside(this.projectDir(projectId), relativePath);
      await replaceFileAtomic(destination, normalized);
      const asset: StoredAsset = {
        slot,
        fileName: path.basename(fileName).slice(0, 180),
        path: relativePath,
        mimeType: "image/png",
        createdAt: now(),
      };
      project.references[slot] = asset;
      this.invalidateContactSheet(project);
      this.invalidateImages(project);
      await this.saveProject(project);
      await this.appendActivity(projectId, "reference.imported", { slot, fileName: asset.fileName });
      return this.toClientProject(project);
    });
  }

  async importEditorImage(projectId: string, dataUrl: string, fileName = "source.png"): Promise<ProjectRecord> {
    const normalized = await normalizePng(parseImageDataUrl(dataUrl));
    const metadata = await sharp(normalized).metadata();
    if (!metadata.width || !metadata.height) throw new Error("无法识别上传图片的尺寸");
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      if (project.templateId !== "image-editor") throw new Error("只有单图编辑项目可以直接导入画布原图");
      const shot = project.shots[0];
      if (!shot) throw new Error("单图编辑项目缺少编辑画布");
      this.assertNoActiveImageRequests(project, [shot.id], "请等待当前修改完成后再替换原图");
      this.assertNoActiveVideoRequests(project, [shot.id], "请等待当前视频任务完成后再替换原图");
      await this.writeShotWithUndo(project.id, shot, normalized);
      shot.imageSha256 = createHash("sha256").update(normalized).digest("hex");
      shot.imageStale = false;
      shot.status = "accepted";
      shot.title = path.basename(fileName, path.extname(fileName)).slice(0, 80) || "当前图片";
      shot.instruction = "";
      shot.manualChecklist = emptyChecklist();
      this.invalidateVideo(shot);
      project.aspectRatio = closestAspectRatio(metadata.width, metadata.height);
      project.stage = "production";
      await this.saveProject(project);
      await this.appendActivity(projectId, "editor.image_imported", { shotId: shot.id, width: metadata.width, height: metadata.height, fileName: path.basename(fileName).slice(0, 180) });
      return this.toClientProject(project);
    });
  }

  async removeReference(projectId: string, slot: ReferenceSlot): Promise<ProjectRecord> {
    if (!REFERENCE_SLOTS.has(slot)) throw new Error("参考类型不受支持");
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const asset = project.references[slot];
      if (asset) {
        await fs.rm(resolveInside(this.projectDir(projectId), asset.path), { force: true });
        delete project.references[slot];
        this.invalidateContactSheet(project);
        this.invalidateImages(project);
      }
      await this.saveProject(project);
      await this.appendActivity(projectId, "reference.removed", { slot });
      return this.toClientProject(project);
    });
  }

  async updateReferenceConstraint(projectId: string, slot: ReferenceSlot, constraint: string): Promise<ProjectRecord> {
    if (!REFERENCE_SLOTS.has(slot)) throw new Error("参考类型不受支持");
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const normalized = constraint.trim().slice(0, 8000);
      const changed = normalized !== (project.referenceConstraints[slot] ?? "");
      if (normalized) project.referenceConstraints[slot] = normalized;
      else delete project.referenceConstraints[slot];
      if (changed) {
        this.invalidateContactSheet(project);
        this.invalidateImages(project);
      }
      await this.saveProject(project);
      await this.appendActivity(projectId, "reference.constraint_updated", { slot, cleared: !normalized });
      return this.toClientProject(project);
    });
  }

  async saveCanvas(projectId: string, input: SaveCanvasInput): Promise<ProjectRecord> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      if (input.viewport) {
        project.canvas.viewport = {
          x: Number(input.viewport.x) || 0,
          y: Number(input.viewport.y) || 0,
          zoom: Math.max(0.3, Math.min(2, Number(input.viewport.zoom) || 1)),
        };
      }
      if (input.contactSheetPosition) project.canvas.contactSheetPosition = input.contactSheetPosition;
      if (input.notes) project.canvas.notes = input.notes.slice(0, 80);
      if (input.shotPositions) {
        for (const shot of project.shots) {
          const position = input.shotPositions[shot.id];
          if (position) shot.position = { x: Number(position.x) || 0, y: Number(position.y) || 0 };
        }
      }
      await this.saveProject(project);
      return this.toClientProject(project);
    });
  }

  private async saveRuntimeImage(requestId: string, fileName: string, buffer: Buffer): Promise<string> {
    const requestRoot = resolveInside(this.runtimeDir, "requests", requestId);
    await fs.mkdir(requestRoot, { recursive: true });
    const target = resolveInside(requestRoot, fileName);
    await replaceFileAtomic(target, buffer);
    return path.relative(this.stateDir, target);
  }

  private async validateSelectionImages(
    selectionMaskDataUrl: string,
    annotatedPreviewDataUrl: string,
    expectedImagePath: string,
  ): Promise<{ mask: Buffer; preview: Buffer }> {
    const expectedMetadata = await sharp(await fs.readFile(expectedImagePath), { failOn: "error" }).metadata();
    if (!expectedMetadata.width || !expectedMetadata.height) throw new Error("无法识别待编辑图片尺寸");

    const rawMask = parseImageDataUrl(selectionMaskDataUrl);
    const rawPreview = parseImageDataUrl(annotatedPreviewDataUrl);
    const maskImage = sharp(rawMask, { failOn: "error" }).rotate();
    const previewImage = sharp(rawPreview, { failOn: "error" }).rotate();
    const [maskMetadata, previewMetadata] = await Promise.all([maskImage.metadata(), previewImage.metadata()]);

    if (!maskMetadata.hasAlpha) throw new Error("选区蒙版必须包含透明通道");
    if (maskMetadata.width !== expectedMetadata.width || maskMetadata.height !== expectedMetadata.height) {
      throw new Error(`选区蒙版尺寸必须与原图一致（${expectedMetadata.width}×${expectedMetadata.height}）`);
    }
    if (previewMetadata.width !== expectedMetadata.width || previewMetadata.height !== expectedMetadata.height) {
      throw new Error(`标记预览尺寸必须与原图一致（${expectedMetadata.width}×${expectedMetadata.height}）`);
    }

    const maskStats = await sharp(rawMask, { failOn: "error" }).rotate().ensureAlpha().stats();
    const alpha = maskStats.channels[3];
    if (!alpha || alpha.max === 0 || alpha.sum === 0) throw new Error("选区为空，请先标记需要修改的区域");

    const [mask, preview] = await Promise.all([
      maskImage.png({ compressionLevel: 9 }).toBuffer(),
      previewImage.png({ compressionLevel: 9 }).toBuffer(),
    ]);
    return { mask, preview };
  }

  private generationInputRevision(project: ProjectRecord, kind: GenerationKind, shotIds: string[]): string {
    const shots = shotIds.map((shotId) => project.shots.find((shot) => shot.id === shotId)).filter(Boolean) as ShotRecord[];
    const payload = {
      kind,
      aspectRatio: project.aspectRatio,
      brief: project.brief,
      references: Object.fromEntries(Object.entries(project.references).sort(([a], [b]) => a.localeCompare(b)).map(([slot, asset]) => [slot, asset ? { path: asset.path, createdAt: asset.createdAt } : null])),
      referenceConstraints: Object.fromEntries(Object.entries(project.referenceConstraints).sort(([a], [b]) => a.localeCompare(b))),
      contactSheet: { path: project.contactSheetPath, stale: project.contactSheetStale, approvedAt: project.contactSheetApprovedAt, grid: project.contactSheetGrid },
      shots: shots.map((shot) => ({
        id: shot.id,
        index: shot.index,
        title: shot.title,
        cast: shot.cast,
        scene: shot.scene,
        action: shot.action,
        composition: shot.composition,
        instruction: shot.instruction,
        imageSha256: kind === "image_edit" || kind === "region_edit" ? shot.imageSha256 : undefined,
      })),
    };
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }

  async enqueueGeneration(input: EnqueueInput): Promise<GenerationRequest[]> {
    return this.withLock(input.projectId, async () => {
      const project = await this.getProjectUnlocked(input.projectId);
      const requestedShotIds = [...new Set(input.shotIds)];
      const requestedShots = requestedShotIds.map((shotId) => project.shots.find((shot) => shot.id === shotId)).filter(Boolean) as ShotRecord[];
      if (requestedShots.length !== requestedShotIds.length) throw new Error("请求包含不存在的分镜");
      let shotIds = requestedShotIds;
      if (input.kind === "contact_sheet") {
        const requested = new Set(requestedShotIds);
        if (requested.size !== project.shots.length || project.shots.some((shot) => !requested.has(shot.id))) {
          throw new Error("宫格总览必须一次覆盖当前全部分镜");
        }
        shotIds = project.shots.map((shot) => shot.id);
      } else if (input.kind === "contact_sheet_edit") {
        const requested = new Set(requestedShotIds);
        shotIds = project.shots.filter((shot) => requested.has(shot.id)).map((shot) => shot.id);
      }
      const shots = shotIds.map((shotId) => project.shots.find((shot) => shot.id === shotId)).filter(Boolean) as ShotRecord[];
      if (input.kind !== "contact_sheet" && shots.length === 0) throw new Error("请选择至少一个分镜");
      if (input.kind === "contact_sheet_edit") {
        if (!project.contactSheetPath || project.contactSheetStale) throw new Error("请先生成当前版本的宫格总览");
        if (!input.selectionMaskDataUrl || !input.annotatedPreviewDataUrl) throw new Error("宫格选区重做缺少选区蒙版");
      }
      if (isContactSheetKind(input.kind)) this.assertContactSheetReady(project);
      if (input.kind === "final") {
        if (project.generationRequests.some((request) => isContactSheetKind(request.kind) && ACTIVE_GENERATION_STATUSES.has(request.status))) {
          throw new Error("宫格正在更新，请完成后再生成正式图");
        }
        this.assertContactSheetApproved(project);
      }
      if (input.kind === "image_edit") {
        if (project.templateId !== "image-editor") throw new Error("整图编辑仅用于单图编辑项目");
        if (shots.length !== 1 || !shots[0].imagePath) throw new Error("整图编辑需要先上传一张图片");
      }
      if (input.kind === "region_edit") {
        if (shots.length !== 1 || !shots[0].imagePath) throw new Error("局部修改需要选择一张已有正式图");
        if (!input.selectionMaskDataUrl || !input.annotatedPreviewDataUrl) throw new Error("局部修改缺少选区蒙版");
      }
      if (input.kind === "final" || input.kind === "image_edit" || input.kind === "region_edit") {
        this.assertNoActiveVideoRequests(project, shotIds, "请等待完成后再重做图片");
      }

      const duplicate = project.generationRequests.find((request) => {
        if (!ACTIVE_GENERATION_STATUSES.has(request.status)) return false;
        if (isContactSheetKind(input.kind)) return isContactSheetKind(request.kind);
        return !isContactSheetKind(request.kind) && request.shotIds.some((shotId) => shotIds.includes(shotId));
      });
      if (duplicate) throw new Error(`分镜已有待处理请求：${duplicate.id}`);

      let selectionImages: { mask: Buffer; preview: Buffer } | undefined;
      if (input.kind === "region_edit" || input.kind === "contact_sheet_edit") {
        const expectedImagePath = input.kind === "contact_sheet_edit"
          ? resolveInside(this.projectDir(project.id), project.contactSheetPath!)
          : resolveInside(this.projectDir(project.id), shots[0].imagePath!);
        selectionImages = await this.validateSelectionImages(
          input.selectionMaskDataUrl!,
          input.annotatedPreviewDataUrl!,
          expectedImagePath,
        );
      }

      const groups = input.kind === "final" ? shots.map((shot) => [shot.id]) : [shotIds.length ? shotIds : project.shots.map((shot) => shot.id)];
      const requests: GenerationRequest[] = [];
      for (const group of groups) {
        const requestId = compactId("req");
        const timestamp = now();
        const request: GenerationRequest = {
          id: requestId,
          projectId: project.id,
          kind: input.kind,
          shotIds: group,
          instruction: (input.instruction ?? "").trim().slice(0, 5000),
          inputRevision: this.generationInputRevision(project, input.kind, group),
          status: "queued",
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        if (selectionImages) {
          try {
            request.maskPath = await this.saveRuntimeImage(requestId, "selection-mask.png", selectionImages.mask);
            request.annotatedPreviewPath = await this.saveRuntimeImage(requestId, "annotated-preview.png", selectionImages.preview);
          } catch (error) {
            await this.cleanupRequest(requestId).catch(() => undefined);
            throw error;
          }
        }
        project.generationRequests.push(request);
        requests.push(request);
        if (!isContactSheetKind(input.kind)) {
          for (const shotId of group) {
            const shot = project.shots.find((item) => item.id === shotId);
            if (shot) shot.status = "queued";
          }
        }
      }
      project.generationRequests = project.generationRequests.slice(-200);
      if (isContactSheetKind(input.kind)) project.stage = "storyboard";
      if (input.kind === "final" || input.kind === "image_edit" || input.kind === "region_edit") project.stage = "production";
      await this.saveProject(project);
      await this.appendActivity(project.id, "generation.enqueued", { kind: input.kind, requestIds: requests.map((item) => item.id) });
      return requests;
    });
  }

  async getGenerationRequests(projectId: string): Promise<GenerationRequest[]> {
    const project = await this.getProject(projectId);
    return project.generationRequests.map(withoutClaimToken).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getGenerationContext(projectId: string, requestId: string): Promise<GenerationContext> {
    const project = await this.getProject(projectId);
    const request = project.generationRequests.find((item) => item.id === requestId);
    if (!request) throw new Error("生成请求不存在");
    const referencePaths = Object.fromEntries(
      Object.entries(project.references).map(([slot, asset]) => [slot, resolveInside(this.projectDir(projectId), asset!.path)]),
    ) as GenerationContext["referencePaths"];
    const shots = request.shotIds.map((shotId) => project.shots.find((shot) => shot.id === shotId)).filter(Boolean) as ShotRecord[];
    const currentImagePath = (request.kind === "region_edit" || request.kind === "image_edit") && shots[0]?.imagePath
      ? resolveInside(this.projectDir(projectId), shots[0].imagePath)
      : request.kind === "contact_sheet_edit" && project.contactSheetPath
        ? resolveInside(this.projectDir(projectId), project.contactSheetPath)
        : undefined;
    const templatePrompt = resolveInside(this.templatesDir, "通用生成基线", "prompt-baseline.md");
    const contactSheet = resolveInside(this.projectDir(projectId), "storyboard", "contact-sheet.png");
    return {
      request: withoutClaimToken(request),
      project: {
        id: project.id,
        name: project.name,
        templateId: project.templateId,
        aspectRatio: project.aspectRatio,
        brief: project.brief,
      },
      shots,
      referencePaths,
      referenceConstraints: project.referenceConstraints,
      templatePromptPath: await pathExists(templatePrompt) ? templatePrompt : undefined,
      contactSheetPath: await pathExists(contactSheet) ? contactSheet : undefined,
      contactSheetGrid: project.contactSheetGrid ?? contactSheetGridFor(project.shots.length),
      currentImagePath,
      maskPath: request.maskPath ? resolveInside(this.stateDir, request.maskPath) : undefined,
      annotatedPreviewPath: request.annotatedPreviewPath ? resolveInside(this.stateDir, request.annotatedPreviewPath) : undefined,
    };
  }

  private assertGenerationClaim(request: GenerationRequest, claimToken?: string): void {
    if (!claimToken?.trim()) throw new Error(`请求 ${request.id} 缺少认领令牌；请先将 queued 状态更新为 generating`);
    if (!request.claimToken || request.claimToken !== claimToken) {
      throw new Error(`请求 ${request.id} 的认领令牌无效或已经失效；迟到结果不会覆盖当前任务`);
    }
    const leaseDeadline = request.leaseExpiresAt ? Date.parse(request.leaseExpiresAt) : Number.NaN;
    if (!Number.isFinite(leaseDeadline) || leaseDeadline <= Date.now()) {
      throw new Error(`请求 ${request.id} 的执行租约已过期；旧结果不会写回，请先作废超时任务并重新登记`);
    }
  }

  private clearGenerationClaim(request: GenerationRequest): void {
    request.claimToken = undefined;
  }

  async setGenerationStatus(
    projectId: string,
    requestId: string,
    status: GenerationStatus,
    error?: string,
    claimToken?: string,
  ): Promise<GenerationRequest> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const request = project.generationRequests.find((item) => item.id === requestId);
      if (!request) throw new Error("生成请求不存在");
      const allowed: Partial<Record<GenerationStatus, GenerationStatus[]>> = {
        queued: ["generating"],
        generating: ["saving", "failed"],
        saving: ["failed"],
      };
      if (!(allowed[request.status] ?? []).includes(status)) {
        throw new Error(`请求 ${request.id} 无法从 ${request.status} 变为 ${status}；它可能已被其他任务认领或已经结束`);
      }
      const timestamp = now();
      const isNewClaim = request.status === "queued" && status === "generating";
      if (isNewClaim) {
        request.claimToken = `claim_${randomUUID()}`;
        request.claimedAt = timestamp;
        request.leaseExpiresAt = new Date(Date.now() + GENERATION_LEASE_MS).toISOString();
        request.attempt = (request.attempt ?? 0) + 1;
      } else {
        this.assertGenerationClaim(request, claimToken);
        if (status === "saving") request.leaseExpiresAt = new Date(Date.now() + GENERATION_LEASE_MS).toISOString();
      }
      request.status = status;
      request.updatedAt = timestamp;
      request.error = error?.slice(0, 1200);
      if (status === "failed") this.clearGenerationClaim(request);
      const shotStatus = status === "generating" ? "generating" : status === "saving" ? "saving" : status === "failed" ? "failed" : undefined;
      if (shotStatus && !isContactSheetKind(request.kind)) {
        project.shots.filter((shot) => request.shotIds.includes(shot.id)).forEach((shot) => {
          shot.status = shotStatus === "failed" && shot.imagePath ? "accepted" : shotStatus;
        });
      }
      await this.saveProject(project);
      if (status === "failed") await this.cleanupRequest(request.id);
      await this.appendActivity(projectId, "generation.status", {
        requestId,
        status,
        attempt: request.attempt,
        leaseExpiresAt: request.leaseExpiresAt,
        error: request.error,
      });
      // The opaque lease credential is revealed exactly once: in the successful
      // queued -> generating transition. All ordinary reads and later updates
      // receive a redacted DTO.
      return isNewClaim ? { ...request } : withoutClaimToken(request);
    });
  }

  async recoverGenerationRequest(projectId: string, requestId: string, reason?: string): Promise<GenerationRequest> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const request = project.generationRequests.find((item) => item.id === requestId);
      if (!request) throw new Error("生成请求不存在");
      if (request.status !== "generating" && request.status !== "saving") {
        throw new Error(`请求 ${request.id} 当前为 ${request.status}，只有超时的 generating 或 saving 请求可以恢复`);
      }
      const leaseDeadline = request.leaseExpiresAt ? Date.parse(request.leaseExpiresAt) : Number.NaN;
      if (Number.isFinite(leaseDeadline) && leaseDeadline > Date.now()) {
        throw new Error(`请求 ${request.id} 的执行租约仍有效，暂不能作废；租约到期时间 ${request.leaseExpiresAt}`);
      }
      request.status = "failed";
      request.updatedAt = now();
      request.error = (reason?.trim() || "执行租约已超时，旧任务已作废；请重新登记该图片请求").slice(0, 1200);
      this.clearGenerationClaim(request);
      if (!isContactSheetKind(request.kind)) {
        project.shots.filter((shot) => request.shotIds.includes(shot.id)).forEach((shot) => {
          shot.status = shot.imagePath ? "accepted" : "failed";
        });
      }
      await this.saveProject(project);
      await this.cleanupRequest(request.id);
      await this.appendActivity(projectId, "generation.recovered", {
        requestId,
        attempt: request.attempt,
        reason: request.error,
      });
      return request;
    });
  }

  private async loadImageInput(input: CommitInput): Promise<Buffer> {
    if (input.imageDataUrl) return normalizePng(parseImageDataUrl(input.imageDataUrl));
    if (!input.imageFile?.download_url) throw new Error("缺少可保存的生成图片");
    return normalizePng(await downloadPublicImage(input.imageFile.download_url));
  }

  private shotDirectory(projectId: string, shot: ShotRecord): string {
    return resolveInside(this.projectDir(projectId), "shots", shot.storageKey);
  }

  private async writeShotWithUndo(projectId: string, shot: ShotRecord, buffer: Buffer): Promise<void> {
    const shotDir = this.shotDirectory(projectId, shot);
    const undoDir = resolveInside(shotDir, ".undo");
    const currentPath = resolveInside(shotDir, "current.png");
    const previousPath = resolveInside(undoDir, "previous.png");
    const tempPath = resolveInside(shotDir, `.incoming-${randomUUID()}.png`);
    await fs.mkdir(undoDir, { recursive: true });
    await fs.writeFile(tempPath, buffer);
    await fs.rm(previousPath, { force: true });
    const hadCurrent = await pathExists(currentPath);
    try {
      if (hadCurrent) await fs.rename(currentPath, previousPath);
      await fs.rename(tempPath, currentPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      if (hadCurrent && await pathExists(previousPath) && !await pathExists(currentPath)) {
        await fs.rename(previousPath, currentPath).catch(() => undefined);
      }
      throw error;
    }
    shot.imagePath = path.join("shots", shot.storageKey, "current.png");
    shot.hasUndo = hadCurrent;
  }

  private async mergeMaskedEdit(originalPath: string, maskPath: string, generated: Buffer, label: string): Promise<Buffer> {
    const original = await fs.readFile(originalPath);
    const mask = await fs.readFile(maskPath);
    const [originalMetadata, generatedMetadata, maskMetadata] = await Promise.all([
      sharp(original, { failOn: "error" }).metadata(),
      sharp(generated, { failOn: "error" }).metadata(),
      sharp(mask, { failOn: "error" }).metadata(),
    ]);
    if (!originalMetadata.width || !originalMetadata.height) throw new Error(`无法识别原${label}尺寸`);
    if (!generatedMetadata.width || !generatedMetadata.height) throw new Error(`无法识别生成${label}尺寸`);
    const width = originalMetadata.width;
    const height = originalMetadata.height;
    if (maskMetadata.width !== width || maskMetadata.height !== height || !maskMetadata.hasAlpha) {
      throw new Error(`${label}选区蒙版与原图不一致，结果已拒绝写回`);
    }
    const sourceRatio = generatedMetadata.width / generatedMetadata.height;
    const targetRatio = width / height;
    if (Math.abs(Math.log(sourceRatio / targetRatio)) > 0.01) {
      throw new Error(`生成${label}比例与原图不一致，结果已拒绝写回`);
    }
    const normalizedMask = await sharp(mask, { failOn: "error" })
      .ensureAlpha()
      .png()
      .toBuffer();
    const maskedGenerated = await sharp(generated)
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .composite([{ input: normalizedMask, blend: "dest-in" }])
      .png()
      .toBuffer();
    return sharp(original)
      .composite([{ input: maskedGenerated, blend: "over" }])
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  private async mergeContactSheetEdit(project: ProjectRecord, request: GenerationRequest, generated: Buffer): Promise<Buffer> {
    if (!project.contactSheetPath || !request.maskPath) throw new Error("宫格选区重做缺少原宫格或选区蒙版");
    return this.mergeMaskedEdit(
      resolveInside(this.projectDir(project.id), project.contactSheetPath),
      resolveInside(this.stateDir, request.maskPath),
      generated,
      "宫格",
    );
  }

  private async mergeRegionEdit(project: ProjectRecord, shot: ShotRecord, request: GenerationRequest, generated: Buffer): Promise<Buffer> {
    if (!shot.imagePath || !request.maskPath) throw new Error("局部修改缺少原图或选区蒙版");
    return this.mergeMaskedEdit(
      resolveInside(this.projectDir(project.id), shot.imagePath),
      resolveInside(this.stateDir, request.maskPath),
      generated,
      "图片",
    );
  }

  async commitGenerationResult(input: CommitInput): Promise<ProjectRecord> {
    await this.withLock(input.projectId, async () => {
      const project = await this.getProjectUnlocked(input.projectId);
      const request = project.generationRequests.find((item) => item.id === input.requestId);
      if (!request) throw new Error("生成请求不存在");
      if (!new Set<GenerationStatus>(["generating", "saving"]).has(request.status)) {
        throw new Error(`请求已${request.status === "cancelled" ? "取消" : request.status === "failed" ? "失败" : request.status === "queued" ? "尚未认领" : "结束"}，不会接收迟到结果`);
      }
      this.assertGenerationClaim(request, input.claimToken);
    });
    let normalized: Buffer;
    try {
      normalized = await this.loadImageInput(input);
    } catch (error) {
      try { await this.setGenerationStatus(input.projectId, input.requestId, "failed", error instanceof Error ? error.message : String(error), input.claimToken); } catch { /* another owner or terminal request remains unchanged */ }
      throw error;
    }
    try {
      return await this.withLock(input.projectId, async () => {
      const project = await this.getProjectUnlocked(input.projectId);
      const request = project.generationRequests.find((item) => item.id === input.requestId);
      if (!request) throw new Error("生成请求不存在");
      if (!new Set<GenerationStatus>(["generating", "saving"]).has(request.status)) throw new Error(`请求已${request.status === "cancelled" ? "取消" : request.status === "failed" ? "失败" : request.status === "queued" ? "尚未认领" : "结束"}，不会接收迟到结果`);
      this.assertGenerationClaim(request, input.claimToken);
      if (request.inputRevision && request.inputRevision !== this.generationInputRevision(project, request.kind, request.shotIds)) {
        throw new Error("生成期间方向、参考或分镜内容已经变化；旧结果不会覆盖当前方案，请重新提交");
      }
      request.status = "saving";
      request.updatedAt = now();
      request.leaseExpiresAt = new Date(Date.now() + GENERATION_LEASE_MS).toISOString();
      let committedBuffer = normalized;
      if (isContactSheetKind(request.kind)) {
        const contactSheetBuffer = request.kind === "contact_sheet_edit"
          ? await this.mergeContactSheetEdit(project, request, normalized)
          : normalized;
        committedBuffer = contactSheetBuffer;
        const relativePath = path.join("storyboard", "contact-sheet.png");
        await replaceFileAtomic(resolveInside(this.projectDir(project.id), relativePath), contactSheetBuffer);
        project.contactSheetPath = relativePath;
        project.contactSheetGrid = request.kind === "contact_sheet"
          ? contactSheetGridFor(project.shots.length)
          : project.contactSheetGrid ?? contactSheetGridFor(project.shots.length);
        project.contactSheetStale = false;
        project.contactSheetApprovedAt = undefined;
        project.stage = "storyboard";
        if (project.canvas.contactSheetPosition.x === 80 && project.canvas.contactSheetPosition.y === 120) {
          project.canvas.contactSheetPosition = this.contactSheetHome(project);
        }
        request.status = "completed";
      } else {
        const shot = project.shots.find((item) => item.id === request.shotIds[0]);
        if (!shot) throw new Error("请求关联的分镜不存在");
        if (request.kind === "region_edit") committedBuffer = await this.mergeRegionEdit(project, shot, request, normalized);
        await this.writeShotWithUndo(project.id, shot, committedBuffer);
        shot.imageSha256 = createHash("sha256").update(committedBuffer).digest("hex");
        shot.imageStale = false;
        this.invalidateVideo(shot);
        shot.status = "accepted";
        shot.manualChecklist = emptyChecklist();
        request.status = "completed";
      }
      request.updatedAt = now();
      request.error = undefined;
      this.clearGenerationClaim(request);
      await this.saveProject(project);
      await this.cleanupRequest(request.id);
      await this.appendActivity(project.id, "generation.committed", {
        requestId: request.id,
        kind: request.kind,
        sha256: createHash("sha256").update(committedBuffer).digest("hex"),
      });
        return this.toClientProject(project);
      });
    } catch (error) {
      try { await this.setGenerationStatus(input.projectId, input.requestId, "failed", error instanceof Error ? error.message : String(error), input.claimToken); } catch { /* another owner or terminal request remains unchanged */ }
      throw error;
    }
  }

  private async cleanupRequest(requestId: string): Promise<void> {
    const requestDir = resolveInside(this.runtimeDir, "requests", requestId);
    await fs.rm(requestDir, { recursive: true, force: true });
  }

  async cancelQueuedRequest(projectId: string, requestId: string): Promise<GenerationRequest> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const request = project.generationRequests.find((item) => item.id === requestId);
      if (!request) throw new Error("生成请求不存在");
      if (request.status !== "queued") throw new Error("只能取消尚未开始的请求");
      request.status = "cancelled";
      request.updatedAt = now();
      project.shots.filter((shot) => request.shotIds.includes(shot.id)).forEach((shot) => {
        if (shot.status === "queued") shot.status = shot.imagePath ? "accepted" : "empty";
      });
      await this.saveProject(project);
      await this.cleanupRequest(request.id);
      await this.appendActivity(projectId, "generation.cancelled", { requestId });
      return request;
    });
  }

  async undoLastOverwrite(projectId: string, shotId: string): Promise<ProjectRecord> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const shot = project.shots.find((item) => item.id === shotId);
      if (!shot) throw new Error("分镜不存在");
      this.assertNoActiveImageRequests(project, [shotId], "请等待完成后再撤销图片");
      this.assertNoActiveVideoRequests(project, [shotId], "请等待完成后再撤销图片");
      const shotDir = this.shotDirectory(projectId, shot);
      const currentPath = resolveInside(shotDir, "current.png");
      const previousPath = resolveInside(shotDir, ".undo", "previous.png");
      if (!await pathExists(previousPath)) throw new Error("没有可撤销的上一张图片");
      const discardPath = resolveInside(shotDir, `.discard-${randomUUID()}.png`);
      if (await pathExists(currentPath)) await fs.rename(currentPath, discardPath);
      try {
        await fs.rename(previousPath, currentPath);
        await fs.rm(discardPath, { force: true });
      } catch (error) {
        if (await pathExists(discardPath) && !await pathExists(currentPath)) await fs.rename(discardPath, currentPath).catch(() => undefined);
        throw error;
      }
      shot.hasUndo = false;
      shot.status = "accepted";
      shot.imageStale = false;
      shot.manualChecklist = emptyChecklist();
      shot.imageSha256 = await this.ensureImageHash(projectId, shot);
      this.invalidateVideo(shot);
      await this.saveProject(project);
      await this.appendActivity(projectId, "shot.undo", { shotId });
      return this.toClientProject(project);
    });
  }

  async markContactSheetReview(projectId: string, approved: boolean): Promise<ProjectRecord> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      if (approved) {
        if (!project.contactSheetPath) throw new Error("请先生成宫格总览");
        if (project.contactSheetStale) throw new Error("宫格总览已过期，请重新生成后再确认");
        const hasActiveRequest = project.generationRequests.some((request) => (
          isContactSheetKind(request.kind) && ["queued", "generating", "saving"].includes(request.status)
        ));
        if (hasActiveRequest) throw new Error("宫格总览仍在处理中，请完成后再确认");
        project.contactSheetApprovedAt = now();
        project.contactSheetStale = false;
        project.stage = "production";
      } else {
        project.contactSheetApprovedAt = undefined;
        if (project.contactSheetPath) project.stage = "storyboard";
      }
      await this.saveProject(project);
      await this.appendActivity(projectId, "contact_sheet.reviewed", { approved });
      return this.toClientProject(project);
    });
  }

  async markShotReview(projectId: string, shotId: string, checklist: ShotRecord["manualChecklist"], accepted: boolean): Promise<ProjectRecord> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const shot = project.shots.find((item) => item.id === shotId);
      if (!shot) throw new Error("分镜不存在");
      shot.manualChecklist = { ...emptyChecklist(), ...checklist };
      if (accepted && !shot.imagePath) throw new Error("分镜尚无正式图片，不能标记通过");
      if (accepted && !Object.values(shot.manualChecklist).every(Boolean)) throw new Error("请完成六项人工检查后再标记通过");
      shot.status = accepted ? "accepted" : shot.imagePath ? "review" : "empty";
      if (accepted) {
        project.generationRequests
          .filter((request) => request.shotIds.includes(shotId) && request.status === "review")
          .forEach((request) => { request.status = "completed"; request.updatedAt = now(); });
      }
      if (project.shots.every((item) => item.status === "accepted")) project.stage = "complete";
      await this.saveProject(project);
      await this.appendActivity(projectId, "shot.reviewed", { shotId, accepted, checklist: shot.manualChecklist });
      return this.toClientProject(project);
    });
  }

  async getVideoPromptContext(projectId: string, shotIds: string[]): Promise<Record<string, unknown>> {
    const project = await this.getProject(projectId);
    const selected = shotIds.length ? shotIds : project.shots.filter((shot) => shot.imagePath && !shot.imageStale && (!shot.videoPlan || shot.videoPlan.stale)).map((shot) => shot.id);
    this.assertNoActiveImageRequests(project, selected, "请等待完成后再准备视频提示词");
    type PromptShotContext = ShotRecord & { imagePath?: string; imageAvailable: boolean };
    const describedShots = new Map<string, Promise<PromptShotContext>>();
    const describeShot = (candidate?: ShotRecord): Promise<PromptShotContext | undefined> => {
      if (!candidate) return Promise.resolve(undefined);
      const cached = describedShots.get(candidate.id);
      if (cached) return cached;
      const description = (async (): Promise<PromptShotContext> => {
        const imagePath = candidate.imagePath ? resolveInside(this.projectDir(projectId), candidate.imagePath) : undefined;
        const imageExists = imagePath ? await pathExists(imagePath) : false;
        const imageSha256 = imageExists && !candidate.imageSha256
          ? createHash("sha256").update(await fs.readFile(imagePath!)).digest("hex")
          : candidate.imageSha256;
        return {
          ...candidate,
          imagePath,
          imageSha256,
          imageStale: candidate.imageStale,
          imageAvailable: Boolean(imageExists && !candidate.imageStale),
        };
      })();
      describedShots.set(candidate.id, description);
      return description;
    };
    const shots = await Promise.all(selected.map(async (shotId) => {
      const index = project.shots.findIndex((shot) => shot.id === shotId);
      if (index < 0) throw new Error(`分镜不存在：${shotId}`);
      const shot = project.shots[index];
      if (!shot.imagePath) throw new Error(`分镜 ${String(shot.index + 1).padStart(2, "0")} 尚无正式图片`);
      if (shot.imageStale) throw new Error(`分镜 ${String(shot.index + 1).padStart(2, "0")} 的图片来自旧方向，请先重做正式图片`);
      const current = (await describeShot(shot))!;
      if (!current.imageAvailable) throw new Error(`分镜 ${String(shot.index + 1).padStart(2, "0")} 的正式图片文件不存在，请先重新生成`);
      return {
        ...current,
        // Keep the historical top-level shot fields while also exposing a
        // symmetric current/previous/next continuity envelope.
        current,
        previous: await describeShot(index > 0 ? project.shots[index - 1] : undefined),
        next: await describeShot(index < project.shots.length - 1 ? project.shots[index + 1] : undefined),
      };
    }));
    return {
      project: { id: project.id, name: project.name, aspectRatio: project.aspectRatio, brief: project.brief },
      rules: {
        positive: "只写肯定式：初始状态、唯一主动作、物理过程、结束状态、镜头表现。",
        frameCounts: "16fps 下按动作复杂度选择 49、65、81、97 或 113 帧，分别约 3.06、4.06、5.06、6.06、7.06 秒；以 81 帧为基准，同组平均控制在约 5 秒。",
        negative: "质量限制写入独立负面提示词，不混入正向提示词。",
      },
      shots,
    };
  }

  async updateVideoPlan(input: UpdateVideoPlanInput): Promise<ProjectRecord> {
    return this.withLock(input.projectId, async () => {
      const project = await this.getProjectUnlocked(input.projectId);
      const shot = project.shots.find((item) => item.id === input.shotId);
      if (!shot) throw new Error("分镜不存在");
      if (shot.imageStale) throw new Error("当前图片来自旧方向，请先重做正式图片再保存视频提示词");
      this.assertNoActiveImageRequests(project, [shot.id], "请等待完成后再保存视频提示词");
      this.assertNoActiveVideoRequests(project, [shot.id], "请等待完成后再修改视频提示词");
      const prompt = input.prompt.trim().slice(0, 12000);
      if (!prompt) throw new Error("视频正向提示词不能为空");
      const negativePhrase = prompt.match(/禁止|不要|不得|避免|不能|不出现/);
      if (negativePhrase) throw new Error(`正向提示词包含否定式“${negativePhrase[0]}”，请改成肯定状态，并把质量限制写入独立负面提示词`);
      const frameRate = Math.round(input.frameRate ?? 16);
      if (frameRate !== 16) throw new Error("当前视频工作流固定使用 16fps");
      const frameCount = Math.round(input.frameCount ?? 81);
      if (![49, 65, 81, 97, 113].includes(frameCount)) throw new Error("帧数只能选择 49、65、81、97 或 113 帧");
      const negativePrompt = (input.negativePrompt ?? "").trim().slice(0, 8000);
      const sourceImageSha256 = await this.ensureImageHash(project.id, shot);
      const previousPlan = shot.videoPlan;
      const planChanged = !previousPlan
        || previousPlan.prompt !== prompt
        || previousPlan.negativePrompt !== negativePrompt
        || previousPlan.frameRate !== frameRate
        || previousPlan.frameCount !== frameCount
        || previousPlan.sourceImageSha256 !== sourceImageSha256;
      shot.videoPlan = {
        prompt,
        negativePrompt,
        frameRate,
        frameCount,
        durationSeconds: frameCount / frameRate,
        sourceImageSha256,
        source: input.source ?? "user",
        stale: false,
        updatedAt: now(),
      };
      if (planChanged && shot.videoArtifact) shot.videoArtifact.stale = true;
      shot.videoStatus = shot.videoArtifact && !shot.videoArtifact.stale ? "accepted" : "ready";
      if (planChanged) {
        shot.videoChecklist = emptyVideoChecklist();
        if (project.stage === "complete") project.stage = "production";
      }
      await this.saveProject(project);
      await this.appendActivity(project.id, "video.plan_updated", { shotId: shot.id, frameRate, frameCount, source: shot.videoPlan.source, planChanged, artifactStale: shot.videoArtifact?.stale ?? false });
      return this.toClientProject(project);
    });
  }

  async enqueueVideoGeneration(input: EnqueueVideoInput): Promise<VideoRequest[]> {
    return this.withLock(input.projectId, async () => {
      const project = await this.getProjectUnlocked(input.projectId);
      const providerId = input.providerId || project.defaultVideoProviderId || await this.videoProviders.getDefaultProfileId();
      if (!providerId) throw new Error("请先在“视频接口”中配置并选择一个接口");
      const provider = await this.videoProviders.getProfile(providerId);
      if (!provider.enabled) throw new Error("所选视频接口已停用");
      const shotIds = [...new Set(input.shotIds)];
      if (!shotIds.length) throw new Error("请选择至少一个分镜");
      this.assertNoActiveImageRequests(project, shotIds, "请等待完成后再生成视频");
      const preparedShots: Array<{
        shot: ShotRecord;
        currentHash: string;
        plan: NonNullable<ShotRecord["videoPlan"]>;
      }> = [];
      for (const shotId of shotIds) {
        const shot = project.shots.find((item) => item.id === shotId);
        if (!shot || !shot.imagePath) throw new Error("所选分镜中包含尚无正式图片的镜头");
        if (shot.imageStale) throw new Error(`分镜 ${String(shot.index + 1).padStart(2, "0")} 的图片来自旧方向，请先重做图片`);
        const plan = shot.videoPlan;
        if (!plan) throw new Error(`分镜 ${String(shot.index + 1).padStart(2, "0")} 缺少视频提示词`);
        const currentHash = await this.ensureImageHash(project.id, shot);
        const stale = plan.stale || plan.sourceImageSha256 !== currentHash;
        if (stale && !input.allowStalePrompt) throw new Error(`分镜 ${String(shot.index + 1).padStart(2, "0")} 的视频提示词已过期`);
        if (project.videoRequests.some((request) => request.shotId === shot.id && ACTIVE_VIDEO_STATUSES.has(request.status))) {
          throw new Error(`分镜 ${String(shot.index + 1).padStart(2, "0")} 已有视频任务在处理中`);
        }
        preparedShots.push({ shot, currentHash, plan });
      }
      const requiresExternalConfirmation = videoProviderRequiresExternalConfirmation(provider);
      if (requiresExternalConfirmation && input.confirmExternalCost !== true) {
        throw new Error("所选视频接口会访问外部服务并可能产生费用，请在工作台确认后再提交");
      }
      const providerExecutionFingerprint = await this.videoProviders.getExecutionFingerprint(provider);
      const requests: VideoRequest[] = [];
      for (const { shot, currentHash, plan } of preparedShots) {
        const timestamp = now();
        const requestId = compactId("vreq");
        const request: VideoRequest = {
          id: requestId, projectId: project.id, shotId: shot.id, providerId,
          snapshot: {
            prompt: plan.prompt,
            negativePrompt: plan.negativePrompt,
            frameRate: plan.frameRate,
            frameCount: plan.frameCount,
            durationSeconds: plan.durationSeconds,
            width: provider.defaults.width,
            height: provider.defaults.height,
            sourceImageSha256: currentHash,
          },
          providerExecutionFingerprint,
          idempotencyKey: requestId,
          submissionState: "not-submitted",
          status: "queued", createdAt: timestamp, updatedAt: timestamp,
        };
        project.videoRequests.push(request);
        requests.push(request);
        shot.videoStatus = "queued";
      }
      project.defaultVideoProviderId = providerId;
      project.videoRequests = project.videoRequests.slice(-500);
      await this.saveProject(project);
      await this.appendActivity(project.id, "video.enqueued", { providerId, requestIds: requests.map((request) => request.id) });
      return requests;
    });
  }

  async getVideoRequests(projectId: string): Promise<VideoRequest[]> {
    const project = await this.getProject(projectId);
    return project.videoRequests.map(withoutVideoClaimToken).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private assertVideoClaim(request: VideoRequest, claimToken?: string): void {
    if (!claimToken?.trim() || !request.claimToken || request.claimToken !== claimToken) {
      throw new Error("视频任务认领已失效，后台不会继续提交或写回结果");
    }
    const leaseDeadline = request.leaseExpiresAt ? Date.parse(request.leaseExpiresAt) : Number.NaN;
    if (!Number.isFinite(leaseDeadline) || leaseDeadline <= Date.now()) {
      throw new Error("视频任务执行租约已过期，旧后台不会继续提交或写回结果");
    }
  }

  private clearVideoClaim(request: VideoRequest): void {
    request.claimToken = undefined;
    request.leaseExpiresAt = undefined;
  }

  private failVideoRequest(project: ProjectRecord, request: VideoRequest, message: string): void {
    request.status = "failed";
    request.error = redactSensitiveText(message, 1_600).trim() || "视频任务已安全停止";
    request.updatedAt = now();
    this.clearVideoClaim(request);
    const shot = project.shots.find((item) => item.id === request.shotId);
    if (shot) shot.videoStatus = "failed";
  }

  async findPendingVideoRequest(): Promise<VideoRequest | undefined> {
    const projects = await this.listProjects();
    const statuses = new Set<VideoRequestStatus>(["uploading", "submitting", "running", "downloading", "waiting_remote", "queued"]);
    const pending: VideoRequest[] = [];
    for (const summary of projects) {
      const project = await this.getProject(summary.id);
      pending.push(...project.videoRequests.filter((request) => statuses.has(request.status)));
    }
    const request = pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    return request ? withoutVideoClaimToken(request) : undefined;
  }

  async claimPendingVideoRequest(): Promise<VideoRequest | undefined> {
    const projects = await this.listProjects();
    const statuses = new Set<VideoRequestStatus>(["uploading", "submitting", "running", "downloading", "waiting_remote", "queued"]);
    const candidates: Array<{ projectId: string; requestId: string; createdAt: string }> = [];
    for (const summary of projects) {
      const project = await this.getProject(summary.id);
      candidates.push(...project.videoRequests
        .filter((request) => statuses.has(request.status))
        .map((request) => ({ projectId: project.id, requestId: request.id, createdAt: request.createdAt })));
    }
    candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const candidate of candidates) {
      const claimed = await this.withLock(candidate.projectId, async () => {
        const project = await this.getProjectUnlocked(candidate.projectId);
        const request = project.videoRequests.find((item) => item.id === candidate.requestId);
        if (!request || !statuses.has(request.status)) return undefined;
        const leaseDeadline = request.leaseExpiresAt ? Date.parse(request.leaseExpiresAt) : Number.NaN;
        if (request.claimToken && Number.isFinite(leaseDeadline) && leaseDeadline > Date.now()) return undefined;
        if (!request.providerExecutionFingerprint) {
          this.failVideoRequest(project, request, "旧视频任务缺少已确认的接口配置指纹；任务已停止，请重新确认并提交");
          await this.saveProject(project);
          return undefined;
        }
        let currentFingerprint: string;
        try {
          currentFingerprint = await this.videoProviders.getExecutionFingerprint(request.providerId);
        } catch (error) {
          this.failVideoRequest(project, request, `视频接口当前不可用：${error instanceof Error ? error.message : String(error)}`);
          await this.saveProject(project);
          return undefined;
        }
        if (request.providerExecutionFingerprint !== currentFingerprint) {
          this.failVideoRequest(project, request, "视频接口配置已在排队后发生变化；旧任务已停止，请重新确认并提交");
          await this.saveProject(project);
          return undefined;
        }
        request.idempotencyKey ||= request.id;
        request.submissionState ||= "not-submitted";
        request.claimToken = `vclaim_${randomUUID()}`;
        request.claimedAt = now();
        request.leaseExpiresAt = new Date(Date.now() + VIDEO_REQUEST_LEASE_MS).toISOString();
        request.attempt = (request.attempt ?? 0) + 1;
        request.updatedAt = now();
        await this.saveProject(project);
        return request;
      });
      if (claimed) return claimed;
    }
    return undefined;
  }

  async releaseVideoRequestClaim(projectId: string, requestId: string, claimToken?: string): Promise<VideoRequest> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const request = project.videoRequests.find((item) => item.id === requestId);
      if (!request) throw new Error("视频请求不存在");
      this.assertVideoClaim(request, claimToken);
      if (!ACTIVE_VIDEO_STATUSES.has(request.status)) throw new Error("视频请求已经结束");
      this.clearVideoClaim(request);
      request.updatedAt = now();
      await this.saveProject(project);
      return withoutVideoClaimToken(request);
    });
  }

  async prepareComfyVideoResubmission(projectId: string, requestId: string, claimToken?: string): Promise<VideoRequest> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const request = project.videoRequests.find((item) => item.id === requestId);
      if (!request) throw new Error("视频请求不存在");
      this.assertVideoClaim(request, claimToken);
      if (request.status !== "queued") throw new Error("只有用户明确重试后的 ComfyUI 任务才能重置提交状态");
      const provider = await this.videoProviders.getProfile(request.providerId);
      if (provider.kind !== "comfyui-workflow") throw new Error("只有 ComfyUI 任务支持远端 absent 确认后重置");
      if (!["submitting", "unknown", "accepted"].includes(request.submissionState ?? "not-submitted")) {
        throw new Error("当前 ComfyUI 任务不需要重置远端提交状态");
      }
      request.remoteJobId = undefined;
      request.submissionState = "not-submitted";
      request.leaseExpiresAt = new Date(Date.now() + VIDEO_REQUEST_LEASE_MS).toISOString();
      request.updatedAt = now();
      await this.saveProject(project);
      return withoutVideoClaimToken(request);
    });
  }

  async updateVideoRequestStatus(
    projectId: string,
    requestId: string,
    status: VideoRequestStatus,
    patch: Partial<Pick<VideoRequest, "progress" | "error" | "remoteJobId" | "remoteOutput" | "submissionState" | "idempotencyKey">> = {},
    claimToken?: string,
  ): Promise<VideoRequest> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const request = project.videoRequests.find((item) => item.id === requestId);
      if (!request) throw new Error("视频请求不存在");
      const terminalStatuses = new Set<VideoRequestStatus>(["completed", "failed", "cancelled"]);
      if (terminalStatuses.has(request.status)) {
        if (request.status === status && !Object.keys(patch).length) return request;
        throw new Error("视频任务已经结束，不会接受迟到的后台更新");
      }
      // User-driven cancel/retry operations have separate methods. Every
      // mutable background update must prove ownership with a live lease.
      this.assertVideoClaim(request, claimToken);
      if (!VIDEO_STATUS_TRANSITIONS[request.status].has(status)) {
        throw new Error(`视频任务 ${request.id} 无法从 ${request.status} 变为 ${status}`);
      }
      const previousSubmissionState = request.submissionState ?? "not-submitted";
      const nextSubmissionState = patch.submissionState ?? previousSubmissionState;
      if (!VIDEO_SUBMISSION_TRANSITIONS[previousSubmissionState].has(nextSubmissionState)) {
        throw new Error(`视频任务提交状态无法从 ${previousSubmissionState} 变为 ${nextSubmissionState}`);
      }
      if (status === "submitting") {
        this.assertVideoClaim(request, claimToken);
        if (nextSubmissionState !== "submitting") throw new Error("进入远端提交阶段时必须先持久化 submitting 状态");
        const nextIdempotencyKey = patch.idempotencyKey ?? request.idempotencyKey;
        if (!nextIdempotencyKey?.trim()) throw new Error("远端提交缺少稳定的幂等键");
        if (!request.providerExecutionFingerprint) {
          this.failVideoRequest(project, request, "旧视频任务缺少已确认的接口配置指纹；未提交远端");
          await this.saveProject(project);
          throw new Error("视频任务缺少接口配置指纹，旧任务未提交远端");
        }
        const provider = await this.videoProviders.getProfile(request.providerId);
        const currentFingerprint = await this.videoProviders.getExecutionFingerprint(provider);
        if (request.providerExecutionFingerprint !== currentFingerprint) {
          this.failVideoRequest(project, request, "视频接口配置已在提交前发生变化；任务已停止，请重新确认并提交");
          await this.saveProject(project);
          throw new Error("视频接口配置已经变化，旧任务未提交远端");
        }
        if (["submitting", "unknown", "accepted"].includes(previousSubmissionState)) {
          const genericCanReplay = provider.kind === "generic-http" && Boolean(provider.http?.idempotencyHeader);
          if (!genericCanReplay) {
            throw new Error("上次远端提交结果不能安全自动重放；已停止再次计费提交");
          }
        }
        request.providerExecutionFingerprint = currentFingerprint;
      }
      if (["running", "downloading", "completed"].includes(status) && nextSubmissionState !== "accepted") {
        throw new Error(`视频任务进入 ${status} 前必须确认远端已接受提交`);
      }
      request.status = status;
      request.updatedAt = now();
      if (patch.progress !== undefined) request.progress = Math.max(0, Math.min(100, patch.progress));
      if (patch.error !== undefined) request.error = redactSensitiveText(patch.error, 1_600).trim();
      if (patch.remoteJobId !== undefined) request.remoteJobId = redactSensitiveText(patch.remoteJobId, 512).trim();
      if (patch.remoteOutput !== undefined) request.remoteOutput = redactSensitiveText(patch.remoteOutput, 800).trim();
      if (patch.submissionState !== undefined) request.submissionState = patch.submissionState;
      if (patch.idempotencyKey !== undefined) request.idempotencyKey = patch.idempotencyKey.slice(0, 256);
      if (terminalStatuses.has(status)) this.clearVideoClaim(request);
      else if (claimToken) request.leaseExpiresAt = new Date(Date.now() + VIDEO_REQUEST_LEASE_MS).toISOString();
      const shot = project.shots.find((item) => item.id === request.shotId);
      if (shot) {
        const mapping: Partial<Record<VideoRequestStatus, ShotRecord["videoStatus"]>> = {
          queued: "queued", waiting_remote: "queued", uploading: "uploading", submitting: "uploading",
          running: "running", downloading: "downloading", failed: "failed",
        };
        if (mapping[status]) shot.videoStatus = mapping[status]!;
        if (status === "cancelled") shot.videoStatus = shot.videoPlan && !shot.videoPlan.stale ? "ready" : "missing_prompt";
      }
      await this.saveProject(project);
      return request;
    });
  }

  async getVideoJobContext(projectId: string, requestId: string, claimToken?: string): Promise<VideoJobContext> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const request = project.videoRequests.find((item) => item.id === requestId);
      if (!request) throw new Error("视频请求不存在");
      this.assertVideoClaim(request, claimToken);
      if (!ACTIVE_VIDEO_STATUSES.has(request.status)) throw new Error("视频请求已经结束");
      const shot = project.shots.find((item) => item.id === request.shotId);
      if (!shot?.imagePath) throw new Error("视频请求的首帧不存在");
      const currentHash = await this.ensureImageHash(projectId, shot);
      if (currentHash !== request.snapshot.sourceImageSha256) {
        this.failVideoRequest(project, request, "视频排队后首帧已变化；旧任务已停止，请按当前图片重新提交");
        await this.saveProject(project);
        throw new Error("视频排队后首帧已经变化");
      }
      const provider = await this.videoProviders.getProfile(request.providerId);
      const currentFingerprint = await this.videoProviders.getExecutionFingerprint(provider);
      if (!request.providerExecutionFingerprint) {
        this.failVideoRequest(project, request, "旧视频任务缺少已确认的接口配置指纹；请重新确认并提交");
        await this.saveProject(project);
        throw new Error("视频任务缺少接口配置指纹");
      }
      if (!provider.enabled || request.providerExecutionFingerprint !== currentFingerprint) {
        this.failVideoRequest(project, request, "视频接口已停用或配置发生变化；旧任务已停止，请重新确认并提交");
        await this.saveProject(project);
        throw new Error("视频接口已停用或配置发生变化");
      }
      request.leaseExpiresAt = new Date(Date.now() + VIDEO_REQUEST_LEASE_MS).toISOString();
      await this.saveProject(project);
      return {
        request, project: { id: project.id, name: project.name, aspectRatio: project.aspectRatio }, shot,
        sourceImagePath: resolveInside(this.projectDir(projectId), shot.imagePath),
        outputDirectory: resolveInside(this.shotDirectory(projectId, shot), "video"),
        runtimeDirectory: resolveInside(this.runtimeDir, "video-requests", request.id),
        provider,
      };
    });
  }

  async commitVideoResult(projectId: string, requestId: string, sourcePath: string, metadata: { width: number; height: number; frameRate: number; durationSeconds: number }, claimToken?: string): Promise<ProjectRecord> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const request = project.videoRequests.find((item) => item.id === requestId);
      if (!request) throw new Error("视频请求不存在");
      const shot = project.shots.find((item) => item.id === request.shotId);
      if (!shot) throw new Error("视频请求关联的分镜不存在");
      if (request.status === "completed" && shot.videoArtifact?.requestId === request.id) {
        const existingArtifact = resolveInside(this.projectDir(projectId), shot.videoArtifact.path);
        if (await pathExists(existingArtifact)) return this.toClientProject(project);
      }
      if (["failed", "cancelled"].includes(request.status)) {
        throw new Error(`视频请求已${request.status === "cancelled" ? "取消" : "失败"}，不会接收迟到结果`);
      }
      this.assertVideoClaim(request, claimToken);
      if (request.status !== "downloading" || request.submissionState !== "accepted") {
        throw new Error("视频结果只能在任务处于 downloading 且远端提交已 accepted 后写入");
      }
      const currentHash = await this.ensureImageHash(projectId, shot);
      if (currentHash !== request.snapshot.sourceImageSha256) throw new Error("视频生成期间首帧已变化，结果未覆盖当前视频");
      const outputDir = resolveInside(this.shotDirectory(projectId, shot), "video");
      const currentPath = resolveInside(outputDir, "current.mp4");
      const incomingPath = resolveInside(outputDir, `.incoming-${randomUUID()}.mp4`);
      await fs.mkdir(outputDir, { recursive: true });
      await fs.copyFile(sourcePath, incomingPath);
      try {
        await renameReplaceWithRetry(incomingPath, currentPath);
      } catch (error) {
        await fs.rm(incomingPath, { force: true }).catch(() => undefined);
        throw error;
      }
      shot.videoArtifact = {
        path: path.join("shots", shot.storageKey, "video", "current.mp4"), mimeType: "video/mp4",
        providerId: request.providerId, requestId: request.id, createdAt: now(),
        width: metadata.width, height: metadata.height, frameRate: metadata.frameRate,
        durationSeconds: metadata.durationSeconds, sourceImageSha256: currentHash,
        promptSha256: createHash("sha256").update(`${request.snapshot.prompt}\n${request.snapshot.negativePrompt}`).digest("hex"), stale: false,
      };
      shot.videoStatus = "accepted";
      shot.videoChecklist = emptyVideoChecklist();
      request.status = "completed";
      request.progress = 100;
      request.updatedAt = now();
      request.error = undefined;
      request.submissionState = "accepted";
      this.clearVideoClaim(request);
      const imageShots = project.shots.filter((item) => item.imagePath);
      if (imageShots.length === project.shots.length && imageShots.every((item) => item.videoArtifact && !item.videoArtifact.stale)) project.stage = "complete";
      await this.saveProject(project);
      await this.appendActivity(project.id, "video.committed", { requestId, shotId: shot.id, providerId: request.providerId });
      return this.toClientProject(project);
    });
  }

  async cancelVideoRequest(projectId: string, requestId: string): Promise<VideoRequest> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const request = project.videoRequests.find((item) => item.id === requestId);
      if (!request) throw new Error("视频请求不存在");
      const cancellableStatus = ["queued", "waiting_remote", "uploading"].includes(request.status);
      if (!cancellableStatus || (request.submissionState ?? "not-submitted") !== "not-submitted") {
        throw new Error("远端提交可能已经开始，不能把它标记为已取消；请继续核对远端状态");
      }
      request.status = "cancelled";
      request.updatedAt = now();
      request.error = undefined;
      this.clearVideoClaim(request);
      const shot = project.shots.find((item) => item.id === request.shotId);
      if (shot) shot.videoStatus = shot.videoPlan && !shot.videoPlan.stale ? "ready" : "missing_prompt";
      await this.saveProject(project);
      return withoutVideoClaimToken(request);
    });
  }

  async retryVideoRequest(projectId: string, requestId: string): Promise<VideoRequest> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const request = project.videoRequests.find((item) => item.id === requestId);
      if (!request || !["failed", "cancelled"].includes(request.status)) throw new Error("只有失败或已取消的视频请求可以重试");
      const shot = project.shots.find((item) => item.id === request.shotId);
      if (!shot) throw new Error("视频请求关联的分镜不存在");
      this.assertNoActiveVideoRequests(project, [shot.id], "请等待当前视频任务完成后再重试历史任务");
      this.assertNoActiveImageRequests(project, [shot.id], "请等待完成后再重试视频");
      const currentHash = await this.ensureImageHash(project.id, shot);
      if (currentHash !== request.snapshot.sourceImageSha256) throw new Error("当前首帧已变化，请重新生成视频而不是重试旧任务");
      const currentPlan = shot.videoPlan;
      if (!currentPlan
        || currentPlan.stale
        || currentPlan.prompt !== request.snapshot.prompt
        || currentPlan.negativePrompt !== request.snapshot.negativePrompt
        || currentPlan.frameRate !== request.snapshot.frameRate
        || currentPlan.frameCount !== request.snapshot.frameCount
        || currentPlan.durationSeconds !== request.snapshot.durationSeconds) {
        throw new Error("当前视频提示词或时长计划已变化，请按新计划创建任务，不会重试旧快照");
      }
      const provider = await this.videoProviders.getProfile(request.providerId);
      const currentFingerprint = await this.videoProviders.getExecutionFingerprint(provider);
      if (!request.providerExecutionFingerprint) {
        throw new Error("旧视频任务缺少已确认的接口配置指纹，请新建任务而不是重试旧任务");
      }
      if (!provider.enabled || request.providerExecutionFingerprint !== currentFingerprint) {
        throw new Error("视频接口配置已变化，请重新确认并创建新任务，不会用旧任务重试");
      }
      const uncertainSubmission = ["submitting", "unknown"].includes(request.submissionState ?? "not-submitted");
      if ((uncertainSubmission || request.submissionState === "accepted")
        && !request.remoteJobId
        && provider.kind === "generic-http"
        && !provider.http?.idempotencyHeader) {
        throw new Error("上次远端提交结果无法确认，且接口没有幂等键；请先在服务商后台核对，系统不会冒险重复提交");
      }
      request.providerExecutionFingerprint = currentFingerprint;
      request.status = "queued";
      request.progress = 0;
      request.error = undefined;
      request.remoteOutput = undefined;
      if (!uncertainSubmission && request.submissionState !== "accepted") {
        request.remoteJobId = undefined;
        request.submissionState = "not-submitted";
      } else if (request.submissionState === "submitting") {
        request.submissionState = "unknown";
      }
      request.idempotencyKey ||= request.id;
      this.clearVideoClaim(request);
      request.updatedAt = now();
      shot.videoStatus = "queued";
      await this.saveProject(project);
      return withoutVideoClaimToken(request);
    });
  }

  async markVideoReview(projectId: string, shotId: string, checklist: VideoManualChecklist, accepted: boolean): Promise<ProjectRecord> {
    return this.withLock(projectId, async () => {
      const project = await this.getProjectUnlocked(projectId);
      const shot = project.shots.find((item) => item.id === shotId);
      if (!shot?.videoArtifact) throw new Error("分镜尚无视频");
      shot.videoChecklist = { ...emptyVideoChecklist(), ...checklist };
      if (accepted && !Object.values(shot.videoChecklist).every(Boolean)) throw new Error("请完成六项视频检查后再标记通过");
      shot.videoStatus = accepted ? "accepted" : "review";
      await this.saveProject(project);
      await this.appendActivity(project.id, "video.reviewed", { shotId, accepted, checklist: shot.videoChecklist });
      return this.toClientProject(project);
    });
  }

  async resolveMediaPath(projectId: string, relativePath: string): Promise<string> {
    assertProjectId(projectId);
    const normalizedPath = normalizeMediaRelativePath(relativePath);
    const projectRoot = this.projectDir(projectId);
    const rootStats = await fs.lstat(projectRoot);
    if (rootStats.isSymbolicLink()) throw new Error("项目媒体目录不得使用符号链接或联接点");
    const project = await this.getProject(projectId);
    const registeredPaths = new Set<string>();
    for (const asset of Object.values(project.references)) {
      if (asset?.path) registeredPaths.add(normalizeMediaRelativePath(asset.path));
    }
    if (project.contactSheetPath) registeredPaths.add(normalizeMediaRelativePath(project.contactSheetPath));
    for (const shot of project.shots) {
      if (shot.imagePath) registeredPaths.add(normalizeMediaRelativePath(shot.imagePath));
      if (shot.videoArtifact?.path) registeredPaths.add(normalizeMediaRelativePath(shot.videoArtifact.path));
    }
    if (!registeredPaths.has(normalizedPath)) throw new Error("媒体文件未登记到当前项目");

    const extension = path.extname(normalizedPath).toLowerCase();
    if (extension !== ".png" && extension !== ".mp4") throw new Error("媒体类型不受支持");
    const target = resolveInside(projectRoot, ...normalizedPath.split("/"));
    if (!await pathExists(target)) throw new Error("媒体文件不存在");

    // Reject links and junctions at every managed component, then confirm the
    // operating system's canonical target remains inside the canonical project.
    let cursor = projectRoot;
    for (const segment of normalizedPath.split("/")) {
      cursor = path.join(cursor, segment);
      const component = await fs.lstat(cursor);
      if (component.isSymbolicLink()) throw new Error("项目媒体不得通过符号链接或联接点读取");
    }
    const realProjectRoot = await fs.realpath(projectRoot);
    const realTarget = await fs.realpath(target);
    resolveInside(realProjectRoot, path.relative(realProjectRoot, realTarget));

    const stats = await fs.stat(realTarget);
    if (!stats.isFile()) throw new Error("媒体地址不是文件");
    const handle = await fs.open(realTarget, "r");
    try {
      const header = Buffer.alloc(12);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      const validPng = extension === ".png"
        && bytesRead >= 8
        && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const validMp4 = extension === ".mp4" && bytesRead >= 8 && header.subarray(4, 8).toString("ascii") === "ftyp";
      if (!validPng && !validMp4) throw new Error("媒体文件内容与声明类型不一致");
    } finally {
      await handle.close();
    }
    return realTarget;
  }

  async getMediaData(projectId: string, relativePath: string, variant: MediaVariant = "preview"): Promise<{
    dataUrl: string;
    mimeType: "image/png" | "image/webp" | "video/mp4";
    width: number;
    height: number;
  }> {
    const filePath = await this.resolveMediaPath(projectId, relativePath);
    const stats = await fs.stat(filePath);
    if (stats.size > MAX_IMAGE_BYTES) throw new Error("媒体文件超过 25MB，无法载入工作台");
    const source = await fs.readFile(filePath);

    // Codex widgets run in a sandbox that can read image data through the MCP
    // bridge, but may reject a direct loopback HTTP video stream. Keep video
    // previews on the same bridge. We intentionally return the original MP4:
    // re-encoding it here would be slow and can break browser compatibility.
    if (path.extname(filePath).toLowerCase() === ".mp4") {
      if (variant !== "source") throw new Error("视频预览只支持原始媒体格式");
      return {
        dataUrl: `data:video/mp4;base64,${source.toString("base64")}`,
        mimeType: "video/mp4",
        width: 0,
        height: 0,
      };
    }

    const image = sharp(source, { failOn: "error" }).rotate();
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.format !== "png") {
      throw new Error("媒体文件不是有效的 PNG 图片");
    }

    if (variant === "source") {
      return {
        dataUrl: `data:image/png;base64,${source.toString("base64")}`,
        mimeType: "image/png",
        width: metadata.width,
        height: metadata.height,
      };
    }

    const maxDimension = variant === "thumbnail" ? 360 : 1280;
    const quality = variant === "thumbnail" ? 78 : 88;
    const { data, info } = await image
      .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return {
      dataUrl: `data:image/webp;base64,${data.toString("base64")}`,
      mimeType: "image/webp",
      width: info.width,
      height: info.height,
    };
  }
}
