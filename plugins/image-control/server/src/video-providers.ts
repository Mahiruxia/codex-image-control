import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {
  AspectRatio,
  ComfyUiBinding,
  ComfyUiBindingRole,
  ComfyUiWorkflowFormat,
  GenericHttpProviderConfig,
  VideoProviderCapabilities,
  VideoProviderProfile,
  VideoProviderSetupContext,
  VideoProviderSetupRequest,
  VideoProviderSetupStatus,
  VideoProviderWorkflowNodeSummary,
} from "./types.js";

type JsonRecord = Record<string, unknown>;

const PROFILE_ID = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const SETUP_ID = /^setup_[a-z0-9_-]{8,80}$/;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,80}$/;
const PATH_VALUE = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const SERVICE_NAME = "image-control-video-provider";
const WORKFLOW_FILE = "workflow.json";
const MAX_WORKFLOW_BYTES = 25 * 1024 * 1024;
const MAX_TEMPLATE_BYTES = 1024 * 1024;
const PROVIDER_MUTATION_LOCK_TIMEOUT_MS = 120_000;
const PROVIDER_MUTATION_LOCK_STALE_MS = 5 * 60_000;
const UNSAFE_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const BINDING_ROLES: ComfyUiBindingRole[] = [
  "image", "prompt", "negativePrompt", "width", "height", "frameCount", "frameRate", "seed", "filenamePrefix",
];
const TEMPLATE_VARIABLES = [
  "image_base64", "prompt", "negative_prompt", "duration_seconds", "fps", "frame_count", "width", "height",
  "project_id", "shot_id", "request_id", "job_id",
];
const SENSITIVE_KEY = /(?:authorization|api.?key|access.?token|refresh.?token|client.?secret|secret|password|credential|cookie|jwt|private.?key|signature)/i;
const SENSITIVE_QUERY = /^(?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|token|secret|password|credential|cookie|jwt|signature|sig|x-amz-signature|x-goog-signature)$/i;
const PLACEHOLDER = /^\s*(?:\{\{[^{}]+\}\}|\$\{[^{}]+\}|<[^<>]+>|\[[A-Z _-]+\])\s*$/;
const TEMPLATE_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
const EXECUTABLE_NODE = /(?:^|[^a-z])(?:shell|powershell|cmd|command|code|script|exec(?:ute)?|python(?:script)?|javascript|nodejs|subprocess|terminal|system.?call|eval)(?:[^a-z]|$)/i;
const NETWORK_NODE = /(?:^|[^a-z])(?:https?(?:.?request|.?client)?|websocket|socket|web.?request|download|upload|remote|api.?request|url(?:.?fetch)?|endpoint)(?:[^a-z]|$)/i;

interface ParsedWorkflow {
  format: ComfyUiWorkflowFormat;
  workflow: JsonRecord;
  nodes: VideoProviderWorkflowNodeSummary[];
  sha256: string;
  riskFlags: string[];
}

export interface VideoProviderCredentialBackend {
  getPassword(account: string): Promise<string | undefined>;
  setPassword(account: string, secret: string): Promise<void>;
  deletePassword(account: string): Promise<void>;
  listAccounts?(): Promise<string[]>;
}

interface CreateSetupInput {
  description: string;
  docsUrl?: string;
  baseUrl?: string;
  exampleRequest?: string;
  exampleResponse?: string;
  workflowJson?: string;
}

function withSetupAliases(request: VideoProviderSetupRequest): VideoProviderSetupRequest {
  return {
    ...request,
    sampleRequest: request.sampleRequest ?? request.exampleRequest,
    sampleResponse: request.sampleResponse ?? request.exampleResponse,
    workflowFileName: request.workflowFileName ?? request.workflowFile,
    providerId: request.providerId ?? request.committedProviderId,
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function exists(filePath: string): Promise<boolean> {
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

function sameFilesystemPath(left: string, right: string): boolean {
  const normalize = (value: string) => {
    let resolved = path.resolve(value).replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
    const root = path.parse(resolved).root;
    while (resolved.length > root.length && /[\\\/]$/.test(resolved)) resolved = resolved.slice(0, -1);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

async function ensureSafeLocalDirectory(targetPath: string, label: string): Promise<void> {
  const resolved = path.resolve(targetPath);
  const parsed = path.parse(resolved);
  const segments = resolved.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stats: Awaited<ReturnType<typeof fs.lstat>>;
    try {
      stats = await fs.lstat(current);
    } catch (error) {
      if (!isFsError(error, ["ENOENT"])) throw error;
      try { await fs.mkdir(current); } catch (mkdirError) {
        if (!isFsError(mkdirError, ["EEXIST"])) throw mkdirError;
      }
      stats = await fs.lstat(current);
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`${label}路径不是真实本机目录：${current}`);
    const canonical = await fs.realpath(current);
    if (!sameFilesystemPath(canonical, current)) throw new Error(`${label}路径发生了链接或重解析跳转：${current}`);
  }
  const canonical = await fs.realpath(resolved);
  if (!sameFilesystemPath(canonical, resolved)) throw new Error(`${label}创建后的真实路径与配置不一致`);
}

async function assertSafeChildDirectoryIfPresent(parentPath: string, childPath: string, label: string): Promise<boolean> {
  await ensureSafeLocalDirectory(parentPath, `${label}父目录`);
  let stats: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stats = await fs.lstat(childPath);
  } catch (error) {
    if (isFsError(error, ["ENOENT"])) return false;
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`${label}不是安全的真实目录`);
  const [canonicalParent, canonicalChild] = await Promise.all([fs.realpath(parentPath), fs.realpath(childPath)]);
  const relative = path.relative(canonicalParent, canonicalChild);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label}越出了视频接口配置目录`);
  }
  if (!sameFilesystemPath(canonicalChild, childPath)) throw new Error(`${label}发生了链接或重解析跳转`);
  return true;
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  const backupPath = `${filePath}.${randomUUID()}.bak`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  const hadCurrent = await exists(filePath);
  try {
    if (hadCurrent) await fs.rename(filePath, backupPath);
    await fs.rename(tempPath, filePath);
    if (hadCurrent) await fs.rm(backupPath, { force: true });
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    if (hadCurrent && await exists(backupPath) && !await exists(filePath)) await fs.rename(backupPath, filePath).catch(() => undefined);
    throw error;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) => value[key] === undefined ? [] : [[key, canonicalize(value[key])]]));
  }
  return value;
}

function canonicalHash(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

function hasSensitiveQuery(raw: string): boolean {
  for (const match of raw.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    try {
      const url = new URL(match[0].replace(/[),.;]+$/, ""));
      if (url.username || url.password) return true;
      for (const [key, value] of url.searchParams) {
        if (SENSITIVE_QUERY.test(key) && value && !PLACEHOLDER.test(value)) return true;
      }
    } catch { /* Non-URL text is checked by the remaining rules. */ }
  }
  return false;
}

function containsSensitiveText(value: string): boolean {
  return /\b(?:sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{16,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})\b/i.test(value)
    || /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(value)
    || /(?:^|[\r\n])\s*(?:cookie|set-cookie)\s*:\s*\S+/i.test(value)
    || /(?:authorization|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|secret|password|credential|signature)\s*[:=]\s*["']?(?:bearer\s+)?[^\s,"'}]{8,}/i.test(value)
    || /\bbearer\s+[A-Za-z0-9._~+\/-]{12,}\b/i.test(value)
    || hasSensitiveQuery(value);
}

export function redactSensitiveText(value: unknown, maxLength = 4_000): string {
  return String(value ?? "").replace(/\0/g, "")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{16,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})\b/gi, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_JWT]")
    .replace(/((?:authorization|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|secret|password|credential|signature)\s*[:=]\s*["']?(?:bearer\s+)?)([^\s,"'}]{8,})/gi, "$1[REDACTED]")
    .replace(/((?:^|[\r\n])\s*(?:cookie|set-cookie)\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(bearer\s+)([A-Za-z0-9._~+\/-]{12,})/gi, "$1[REDACTED]")
    .replace(/([?&](?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|token|secret|password|credential|cookie|jwt|signature|sig|x-amz-signature|x-goog-signature)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .slice(0, maxLength);
}

function assertNoSensitiveText(value: string, label: string): void {
  if (containsSensitiveText(value)) throw new Error(`${label}疑似包含凭据、Cookie、JWT 或签名 URL；请删除真实值后重试`);
}

function cleanText(value: unknown, maxLength: number): string {
  return redactSensitiveText(value, maxLength).trim();
}

function cleanPersistedText(value: unknown, maxLength: number, label: string): string {
  const text = String(value ?? "").replace(/\0/g, "").trim();
  assertNoSensitiveText(text, label);
  if (/[\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error(`${label}包含不安全控制字符`);
  return text.slice(0, maxLength);
}

function assertSafeJsonIdentifier(value: string, label: string): void {
  if (UNSAFE_JSON_KEYS.has(value)) throw new Error(`${label}使用了不安全的保留名称`);
}

function cleanExample(value: unknown): string | undefined {
  const text = String(value ?? "").replace(/\0/g, "").trim();
  if (!text) return undefined;
  assertNoSensitiveText(text, "接口示例");
  try {
    return JSON.stringify(scrubJsonSecrets(JSON.parse(text), "", 0, true), null, 2).slice(0, 100_000);
  } catch (error) {
    if (error instanceof SyntaxError) return text.slice(0, 100_000) || undefined;
    throw error;
  }
}

function scrubJsonSecrets(value: unknown, key = "", depth = 0, rejectSecrets = false): unknown {
  if (depth > 40) throw new Error("JSON 嵌套层级过深");
  if (SENSITIVE_KEY.test(key)) {
    if (typeof value === "string" && PLACEHOLDER.test(value)) return value;
    if (rejectSecrets) throw new Error(`字段 ${key || "(unknown)"} 疑似携带凭据；请使用独立凭据配置`);
    return "[REDACTED]";
  }
  if (typeof value === "string") {
    if (rejectSecrets) {
      assertNoSensitiveText(value, key ? `字段 ${key}` : "文本");
      if (/[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(`${key ? `字段 ${key}` : "文本"}包含不安全控制字符`);
      return value;
    }
    return redactSensitiveText(value, value.length + 1);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JSON 中包含无效数字");
    return value;
  }
  if (value === null || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (value.length > 20_000) throw new Error("JSON 数组过大");
    return value.map((item) => scrubJsonSecrets(item, key, depth + 1, rejectSecrets));
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > 20_000) throw new Error("JSON 对象过大");
    const result: JsonRecord = {};
    for (const [childKey, childValue] of entries) {
      if (UNSAFE_JSON_KEYS.has(childKey)) throw new Error(`JSON 包含不安全字段：${childKey}`);
      result[childKey] = scrubJsonSecrets(childValue, childKey, depth + 1, rejectSecrets);
    }
    return result;
  }
  throw new Error("配置只允许 JSON 字符串、数字、布尔值、数组和对象");
}

function normalizeTemplate(value: unknown, field: string): unknown {
  const normalized = scrubJsonSecrets(value, "", 0, true);
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > MAX_TEMPLATE_BYTES) throw new Error(`${field}超过 1MB 安全限制`);
  const checkSensitiveFields = (item: unknown, depth = 0): void => {
    if (depth > 40) throw new Error(`${field} 嵌套层级过深`);
    if (Array.isArray(item)) item.forEach((child) => checkSensitiveFields(child, depth + 1));
    else if (isRecord(item)) {
      for (const [key, child] of Object.entries(item)) {
        if (SENSITIVE_KEY.test(key)) throw new Error(`${field} 不得携带密钥字段；请使用独立凭据配置`);
        checkSensitiveFields(child, depth + 1);
      }
    }
  };
  checkSensitiveFields(value);
  return normalized;
}

interface CleanUrlResult { value: string; origin: string }

function cleanHttpUrlDetails(value: string, label: string, allowTemplate = false): CleanUrlResult {
  const trimmed = String(value ?? "").replace(/\0/g, "").trim();
  assertNoSensitiveText(trimmed, label);
  const variables = [...trimmed.matchAll(new RegExp(TEMPLATE_PATTERN.source, TEMPLATE_PATTERN.flags))];
  if (!allowTemplate && variables.length) throw new Error(`${label}不允许模板变量`);
  for (const match of variables) {
    if (!TEMPLATE_VARIABLES.includes(match[1])) throw new Error(`${label}包含未知模板变量 ${match[1]}`);
  }
  if (allowTemplate && variables.length) {
    const schemeIndex = trimmed.indexOf("://");
    if (schemeIndex < 1) throw new Error(`${label}不是有效网址`);
    const authorityStart = schemeIndex + 3;
    const firstDelimiter = [trimmed.indexOf("/", authorityStart), trimmed.indexOf("?", authorityStart), trimmed.indexOf("#", authorityStart)]
      .filter((item) => item >= 0).sort((a, b) => a - b)[0] ?? trimmed.length;
    if (variables.some((match) => (match.index ?? 0) < firstDelimiter)) throw new Error(`${label}的协议、主机或端口不能使用模板变量`);
    const queryStart = trimmed.indexOf("?", authorityStart);
    if (queryStart >= 0) {
      for (const pair of trimmed.slice(queryStart + 1).split("&")) {
        const [name] = pair.split("=", 1);
        if (TEMPLATE_PATTERN.test(name)) throw new Error(`${label}的查询参数名不能使用模板变量`);
        TEMPLATE_PATTERN.lastIndex = 0;
      }
    }
  }
  const validationValue = allowTemplate ? trimmed.replace(new RegExp(TEMPLATE_PATTERN.source, TEMPLATE_PATTERN.flags), "placeholder") : trimmed;
  let url: URL;
  try { url = new URL(validationValue); } catch { throw new Error(`${label}不是有效网址`); }
  if (!/^https?:$/.test(url.protocol)) throw new Error(`${label}只支持 HTTP 或 HTTPS`);
  if (url.username || url.password) throw new Error(`${label}不得包含账号或密钥`);
  if (url.hash) throw new Error(`${label}不得包含 URL 片段`);
  for (const key of url.searchParams.keys()) if (SENSITIVE_QUERY.test(key)) throw new Error(`${label}不得在查询参数中携带凭据或签名`);
  if (url.protocol !== "https:" && !isPrivateNetworkUrl(validationValue)) throw new Error(`${label}的公网地址必须使用 HTTPS`);
  return { value: trimmed.replace(/\/$/, ""), origin: url.origin };
}

function cleanHttpUrl(value: string, label: string, allowTemplate = false): string {
  return cleanHttpUrlDetails(value, label, allowTemplate).value;
}

function cleanBaseUrl(value: string): string {
  const cleaned = cleanHttpUrl(value.replace(/\/#.*$/, ""), "视频接口地址");
  const parsed = new URL(cleaned);
  if (parsed.search) throw new Error("视频接口地址不得包含查询参数");
  return cleaned;
}

function cleanDocsUrl(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const cleaned = cleanHttpUrl(value, "接口文档地址");
  return new URL(cleaned).toString();
}

function cleanOrigin(value: string): string {
  return cleanHttpUrlDetails(value, "下载来源").origin;
}

function templateOrigin(value?: string): string | undefined {
  return value ? cleanHttpUrlDetails(value, "模板地址", true).origin : undefined;
}

export function renderVideoProviderUrlTemplate(template: string, variables: Record<string, string | number>): string {
  const expectedOrigin = cleanHttpUrlDetails(template, "视频接口模板地址", true).origin;
  const rendered = template.replace(new RegExp(TEMPLATE_PATTERN.source, TEMPLATE_PATTERN.flags), (_match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) throw new Error(`视频接口模板缺少变量 ${key}`);
    const value = String(variables[key]);
    if (/^[.]{1,2}$/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`视频接口模板变量 ${key} 包含不安全值`);
    return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  });
  const parsed = new URL(rendered);
  if (parsed.origin !== expectedOrigin) throw new Error("视频接口模板渲染后改变了协议或主机");
  return parsed.toString();
}

function isPrivateNetworkUrl(value: string): boolean {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1" || host.endsWith(".localhost")) return true;
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return false;
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function videoProviderRequiresExternalConfirmation(profile: VideoProviderProfile): boolean {
  const rawTarget = profile.kind === "comfyui-workflow" ? profile.comfyui?.baseUrl : profile.http?.submitUrl;
  let privateTarget = false;
  try { privateTarget = Boolean(rawTarget && isPrivateNetworkUrl(rawTarget)); } catch { return true; }
  return !privateTarget
    || profile.capabilities?.source === "cloud"
    || profile.capabilities?.billing !== "local";
}

function optionalPath(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const result = String(value).trim();
  if (!PATH_VALUE.test(result)) throw new Error(`${label}只能使用点号分隔的 JSON 字段路径`);
  if (result.split(".").some((segment) => UNSAFE_JSON_KEYS.has(segment))) throw new Error(`${label}包含不安全的保留字段`);
  return result;
}

function numberList(value: unknown, minimum: number, maximum: number, integer: boolean): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = [...new Set(value.map(Number).filter(Number.isFinite).map((item) => integer ? Math.round(item) : item)
    .filter((item) => item >= minimum && item <= maximum))];
  return result.length ? result.slice(0, 50) : undefined;
}

function normalizeCapabilities(value: VideoProviderCapabilities | undefined): VideoProviderCapabilities | undefined {
  if (!value) return undefined;
  const allowedModes = new Set(["image-to-video", "text-to-video", "first-last-frame"]);
  const allowedRatios = new Set<AspectRatio>(["9:16", "3:4", "1:1", "16:9"]);
  const modes = Array.isArray(value.modes) ? [...new Set(value.modes.filter((item) => allowedModes.has(item)))].slice(0, 3) : undefined;
  const aspectRatios = Array.isArray(value.aspectRatios)
    ? [...new Set(value.aspectRatios.filter((item) => allowedRatios.has(item)))].slice(0, 4)
    : undefined;
  const capabilities: VideoProviderCapabilities = {};
  if (value.source === "local" || value.source === "cloud") capabilities.source = value.source;
  if (value.billing === "local" || value.billing === "possibly-paid") capabilities.billing = value.billing;
  if (modes?.length) capabilities.modes = modes;
  if (aspectRatios?.length) capabilities.aspectRatios = aspectRatios;
  const frameRates = numberList(value.frameRates, 1, 240, true); if (frameRates) capabilities.frameRates = frameRates;
  const frameCounts = numberList(value.frameCounts, 1, 10_001, true); if (frameCounts) capabilities.frameCounts = frameCounts;
  const durations = numberList(value.durationsSeconds, 0.1, 3600, false); if (durations) capabilities.durationsSeconds = durations;
  if (typeof value.supportsNegativePrompt === "boolean") capabilities.supportsNegativePrompt = value.supportsNegativePrompt;
  if (typeof value.supportsAudio === "boolean") capabilities.supportsAudio = value.supportsAudio;
  if (value.maxConcurrency !== undefined) capabilities.maxConcurrency = Math.max(1, Math.min(128, Math.round(Number(value.maxConcurrency) || 1)));
  return Object.keys(capabilities).length ? capabilities : undefined;
}

function bindCapabilitiesToNetworkTarget(
  capabilities: VideoProviderCapabilities | undefined,
  targetUrl: string,
): VideoProviderCapabilities {
  const normalized = { ...(capabilities ?? {}) };
  // `source` affects whether the UI/server require an explicit external-cost
  // confirmation. A declarative draft must not be able to label a public URL
  // as local and bypass that boundary.
  if (isPrivateNetworkUrl(targetUrl)) normalized.source ??= "local";
  else normalized.source = "cloud";
  return normalized;
}

function workflowNodeRiskFlags(nodeId: string, signature: string): string[] {
  const flags: string[] = [];
  if (EXECUTABLE_NODE.test(signature)) flags.push(`code-execution:${nodeId}`);
  if (NETWORK_NODE.test(signature)) flags.push(`network-access:${nodeId}`);
  return flags;
}

function parsedWorkflow(
  format: ComfyUiWorkflowFormat,
  workflow: JsonRecord,
  nodes: VideoProviderWorkflowNodeSummary[],
): ParsedWorkflow {
  const riskFlags = [...new Set(nodes.flatMap((node) => node.riskFlags ?? []))].sort();
  return { format, workflow, nodes, sha256: canonicalHash(workflow), riskFlags };
}

function parseWorkflowJson(workflowJson: string): ParsedWorkflow {
  if (Buffer.byteLength(workflowJson, "utf8") > MAX_WORKFLOW_BYTES) throw new Error("ComfyUI 工作流不能超过 25MB");
  let raw: unknown;
  try { raw = JSON.parse(workflowJson); } catch { throw new Error("ComfyUI 工作流不是有效 JSON"); }
  const sanitized = scrubJsonSecrets(raw, "", 0, true);
  if (!isRecord(sanitized)) throw new Error("ComfyUI 工作流顶层必须是 JSON 对象");

  // Some custom nodes store credentials in unnamed widgets. Reject rather than
  // silently changing an executable graph, because a redacted workflow may
  // later submit an unexpected paid request.
  const secretNode = /api.?key|authorization|credential|secret|password|access.?token|cookie|jwt|signature/i;
  const rejectSecretNode = (node: JsonRecord): void => {
    const meta = isRecord(node._meta) ? node._meta : undefined;
    const inputNames = Array.isArray(node.inputs)
      ? node.inputs.filter(isRecord).map((input) => String(input.name ?? ""))
      : isRecord(node.inputs) ? Object.keys(node.inputs) : [];
    const signature = `${String(node.type ?? "")} ${String(node.class_type ?? "")} ${String(node.title ?? meta?.title ?? "")} ${inputNames.join(" ")}`;
    if (!secretNode.test(signature)) return;
    const values = [node.widgets_values, node.inputs].flatMap((value) => Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : []);
    if (values.some((item) => typeof item === "string" && item.trim() && !PLACEHOLDER.test(item))) {
      throw new Error("ComfyUI 工作流疑似在节点参数中嵌入凭据；请移除真实值后重新上传");
    }
  };
  if (Array.isArray(sanitized.nodes)) sanitized.nodes.filter(isRecord).forEach(rejectSecretNode);
  const promptCandidate = isRecord(sanitized.prompt) ? sanitized.prompt : sanitized;
  Object.values(promptCandidate).filter(isRecord).forEach(rejectSecretNode);

  if (Array.isArray(sanitized.nodes)) {
    const nodes = sanitized.nodes.map((item, index): VideoProviderWorkflowNodeSummary => {
      if (!isRecord(item)) throw new Error(`UI 工作流节点 ${index + 1} 无效`);
      const nodeId = String(item.id ?? "").trim();
      const classType = cleanText(item.type, 200);
      if (!nodeId || !classType) throw new Error(`UI 工作流节点 ${index + 1} 缺少 id 或 type`);
      assertSafeJsonIdentifier(nodeId, `UI 工作流节点 #${nodeId}`);
      const inputs = Array.isArray(item.inputs) ? item.inputs : [];
      const inputNames = inputs.filter(isRecord).map((input) => cleanText(input.name, 160)).filter(Boolean);
      if (isRecord(item.widgets_values)) inputNames.push(...Object.keys(item.widgets_values));
      // rgthree's Seed node stores its value only in widgets_values. The UI-to-
      // API converter materializes that value as an `inputs.seed` field, so the
      // validator must expose the same synthetic input for an explicit binding.
      if (classType === "Seed (rgthree)" && Array.isArray(item.widgets_values) && item.widgets_values.length) {
        inputNames.push("seed");
      }
      for (const inputName of inputNames) assertSafeJsonIdentifier(inputName, `工作流节点 #${nodeId} 的输入`);
      const title = cleanText(item.title ?? classType, 200) || undefined;
      return {
        nodeId,
        classType,
        title,
        inputNames: [...new Set(inputNames)],
        jsonPath: `$.nodes[${index}]`,
        riskFlags: workflowNodeRiskFlags(nodeId, `${classType} ${title ?? ""} ${inputNames.join(" ")}`),
      };
    });
    if (!nodes.length) throw new Error("UI 工作流没有节点");
    return parsedWorkflow("ui", sanitized, nodes);
  }

  const candidate = isRecord(sanitized.prompt) ? sanitized.prompt : sanitized;
  const entries = Object.entries(candidate);
  if (!entries.length || !entries.every(([, item]) => isRecord(item) && typeof item.class_type === "string" && isRecord(item.inputs))) {
    throw new Error("工作流既不是含 nodes[] 的 UI 格式，也不是 API prompt 对象");
  }
  const nodes = entries.map(([nodeId, item]): VideoProviderWorkflowNodeSummary => {
    const node = item as JsonRecord;
    const meta = isRecord(node._meta) ? node._meta : undefined;
    const classType = cleanText(node.class_type, 200);
    const title = cleanText(meta?.title, 200) || undefined;
    const inputNames = Object.keys(node.inputs as JsonRecord);
    return {
      nodeId,
      classType,
      title,
      inputNames,
      jsonPath: `$[${JSON.stringify(nodeId)}]`,
      riskFlags: workflowNodeRiskFlags(nodeId, `${classType} ${title ?? ""} ${inputNames.join(" ")}`),
    };
  });
  return parsedWorkflow("api", candidate, nodes);
}

function normalizeBindings(value: unknown): Partial<Record<ComfyUiBindingRole, ComfyUiBinding>> | undefined {
  if (!isRecord(value)) return undefined;
  const bindings: Partial<Record<ComfyUiBindingRole, ComfyUiBinding>> = {};
  for (const role of BINDING_ROLES) {
    const raw = value[role];
    if (raw === undefined) continue;
    if (!isRecord(raw)) throw new Error(`工作流绑定 ${role} 格式无效`);
    const nodeId = cleanText(raw.nodeId, 100);
    const inputName = cleanText(raw.inputName, 160);
    if (!nodeId || !inputName) throw new Error(`工作流绑定 ${role} 缺少 nodeId 或 inputName`);
    assertSafeJsonIdentifier(nodeId, `工作流绑定 ${role} 的节点 ID`);
    assertSafeJsonIdentifier(inputName, `工作流绑定 ${role} 的输入名`);
    bindings[role] = { nodeId, inputName };
  }
  for (const key of Object.keys(value)) if (!BINDING_ROLES.includes(key as ComfyUiBindingRole)) throw new Error(`未知工作流绑定角色：${key}`);
  return Object.keys(bindings).length ? bindings : undefined;
}

function validateWorkflowMapping(profile: VideoProviderProfile, workflow?: ParsedWorkflow): void {
  if (!profile.comfyui) return;
  const bindings = profile.comfyui.bindings;
  if (!bindings?.image || !bindings.prompt) {
    throw new Error("ComfyUI 工作流必须明确绑定首帧 image 与正向提示词 prompt；不会使用任何内置节点编号");
  }
  if (!workflow) return;
  if (profile.comfyui.workflowFormat && profile.comfyui.workflowFormat !== workflow.format) {
    throw new Error(`工作流实际是 ${workflow.format.toUpperCase()} 格式，与配置不一致`);
  }
  const byId = new Map(workflow.nodes.map((node) => [node.nodeId, node]));
  for (const [role, binding] of Object.entries(bindings)) {
    const node = byId.get(binding.nodeId);
    if (!node) throw new Error(`工作流绑定 ${role} 指向不存在的节点 #${binding.nodeId}`);
    if (!node.inputNames.includes(binding.inputName)) {
      throw new Error(`工作流节点 #${binding.nodeId} 不包含输入 ${binding.inputName}`);
    }
  }
  if (profile.comfyui.outputNodeId && !byId.has(profile.comfyui.outputNodeId)) {
    throw new Error(`视频输出节点 #${profile.comfyui.outputNodeId} 不存在`);
  }
  if (workflow.riskFlags.some((flag) => flag.startsWith("code-execution:"))) {
    throw new Error("工作流包含可执行系统命令或脚本的高风险节点；此发布版拒绝安装该工作流");
  }
  if (workflow.riskFlags.some((flag) => flag.startsWith("network-access:"))
    && profile.comfyui.workflowRiskAcceptedSha256 !== workflow.sha256) {
    throw new Error(`工作流包含可联网节点；请核对风险摘要，并明确确认当前工作流哈希 ${workflow.sha256}`);
  }
}

export function videoProviderWorkflowSha256(workflowJson: string): string {
  return parseWorkflowJson(workflowJson).sha256;
}

function effectiveHttpAuth(config: GenericHttpProviderConfig): { type: "none" | "bearer" | "header"; headerName?: string; scheme?: string } {
  const type = config.auth?.type ?? "none";
  if (type === "bearer") return { type, headerName: "authorization", scheme: config.auth?.scheme || "Bearer" };
  if (type === "header") return { type, headerName: (config.auth?.headerName || "X-API-Key").toLowerCase(), scheme: config.auth?.scheme || "" };
  return { type: "none" };
}

function videoProviderProfileRequiresCredential(profile: VideoProviderProfile): boolean {
  return profile.kind === "generic-http" && Boolean(profile.http?.auth?.type && profile.http.auth.type !== "none");
}

export function videoProviderCredentialScopeFingerprint(profile: VideoProviderProfile): string {
  if (profile.kind === "comfyui-workflow") {
    return canonicalHash({ kind: profile.kind, origin: new URL(profile.comfyui!.baseUrl).origin, auth: "none" });
  }
  const config = profile.http!;
  const auth = effectiveHttpAuth(config);
  return canonicalHash({
    kind: profile.kind,
    auth,
    submitOrigin: new URL(config.submitUrl).origin,
    statusOrigin: templateOrigin(config.statusUrlTemplate),
    cancelOrigin: templateOrigin(config.cancelUrlTemplate),
    downloadAuth: config.downloadAuth ?? "none",
    authenticatedDownloadOrigins: config.downloadAuth === "provider"
      ? [...new Set(config.allowedDownloadOrigins?.map((value) => new URL(value).origin) ?? [])].sort()
      : [],
  });
}

export function videoProviderExecutionFingerprint(profile: VideoProviderProfile): string {
  const credentialBoundary = videoProviderProfileRequiresCredential(profile)
    ? {
        scope: profile.credentialScopeFingerprint ?? videoProviderCredentialScopeFingerprint(profile),
        revision: profile.credentialRevision ?? "legacy-unversioned",
        state: profile.credentialState ?? "legacy-unversioned",
      }
    : undefined;
  const execution = profile.kind === "comfyui-workflow"
    ? {
        kind: profile.kind,
        enabled: profile.enabled,
        capabilities: profile.capabilities,
        defaults: profile.defaults,
        comfyui: {
          baseUrl: profile.comfyui!.baseUrl,
          queuePolicy: profile.comfyui!.queuePolicy,
          workflowFormat: profile.comfyui!.workflowFormat,
          workflowSha256: profile.comfyui!.workflowSha256,
          workflowRiskFlags: profile.comfyui!.workflowRiskFlags,
          bindings: profile.comfyui!.bindings,
          outputNodeId: profile.comfyui!.outputNodeId,
        },
      }
    : {
        kind: profile.kind,
        enabled: profile.enabled,
        capabilities: profile.capabilities,
        defaults: profile.defaults,
        credentialBoundary,
        http: profile.http,
      };
  return canonicalHash(execution);
}

export function normalizeVideoProviderProfile(
  input: VideoProviderProfile,
  previous?: VideoProviderProfile,
  workflow?: ParsedWorkflow,
): VideoProviderProfile {
  if (!input || typeof input !== "object") throw new Error("接口配置必须是 JSON 对象");
  const id = cleanText(input.id, 64).toLowerCase();
  if (!PROFILE_ID.test(id)) throw new Error("接口 ID 只能使用小写字母、数字、下划线和短横线");
  const timestamp = new Date().toISOString();
  const defaults = input.defaults;
  if (!defaults || typeof defaults !== "object") throw new Error("缺少视频默认参数");
  const profile: VideoProviderProfile = {
    schemaVersion: 1,
    id,
    name: cleanPersistedText(input.name, 80, "接口名称"),
    description: input.description === undefined ? undefined : cleanPersistedText(input.description, 2000, "接口说明") || undefined,
    kind: input.kind,
    enabled: input.enabled !== false,
    capabilities: normalizeCapabilities(input.capabilities),
    defaults: {
      width: Math.max(64, Math.min(4096, Math.round(Number(defaults.width) || 720))),
      height: Math.max(64, Math.min(4096, Math.round(Number(defaults.height) || 1280))),
      frameRate: Math.max(1, Math.min(240, Math.round(Number(defaults.frameRate) || 16))),
      frameCount: Math.max(1, Math.min(10_001, Math.round(Number(defaults.frameCount) || 65))),
      pollSeconds: Math.max(1, Math.min(120, Math.round(Number(defaults.pollSeconds) || 10))),
      timeoutMinutes: Math.max(1, Math.min(360, Math.round(Number(defaults.timeoutMinutes) || 90))),
    },
    createdAt: previous?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  if (!profile.name) throw new Error("接口名称不能为空");
  if (profile.kind !== "comfyui-workflow" && profile.kind !== "generic-http") throw new Error("不支持的视频接口类型");

  if (profile.kind === "comfyui-workflow") {
    if (!input.comfyui) throw new Error("缺少 ComfyUI 配置");
    const workflowFormat = input.comfyui.workflowFormat ?? workflow?.format ?? previous?.comfyui?.workflowFormat ?? "ui";
    const workflowFile = cleanPersistedText(path.basename(input.comfyui.workflowFile || WORKFLOW_FILE), 160, "工作流文件名");
    if (path.extname(workflowFile).toLowerCase() !== ".json") throw new Error("ComfyUI 工作流文件必须是 JSON");
    const baseUrl = cleanBaseUrl(input.comfyui.baseUrl);
    profile.capabilities = bindCapabilitiesToNetworkTarget(profile.capabilities, baseUrl);
    profile.comfyui = {
      baseUrl,
      workflowFile,
      queuePolicy: "wait-until-empty",
      workflowFormat,
      bindings: normalizeBindings(input.comfyui.bindings),
      outputNodeId: cleanText(input.comfyui.outputNodeId, 100) || undefined,
      workflowSha256: workflow?.sha256 ?? previous?.comfyui?.workflowSha256,
      workflowRiskFlags: workflow?.riskFlags ?? previous?.comfyui?.workflowRiskFlags ?? [],
      workflowRiskAcceptedSha256: (input.comfyui.workflowRiskAcceptedSha256 ?? previous?.comfyui?.workflowRiskAcceptedSha256)
        === (workflow?.sha256 ?? previous?.comfyui?.workflowSha256)
        ? (workflow?.sha256 ?? previous?.comfyui?.workflowSha256)
        : undefined,
    };
    validateWorkflowMapping(profile, workflow);
  } else {
    if (!input.http) throw new Error("缺少通用 HTTP 配置");
    const source = input.http;
    if (!["sync", "async"].includes(String(source.mode))) throw new Error("HTTP 接口模式必须是 sync 或 async");
    if (source.imageMode !== undefined && !["base64", "multipart"].includes(String(source.imageMode))) throw new Error("图片传输模式必须是 base64 或 multipart");
    if (!["POST", "PUT"].includes(String(source.submitMethod))) throw new Error("提交方法必须是 POST 或 PUT");
    if (source.statusMethod !== undefined && !["GET", "POST"].includes(String(source.statusMethod))) throw new Error("状态查询方法必须是 GET 或 POST");
    if (source.downloadAuth !== undefined && !["none", "provider"].includes(String(source.downloadAuth))) throw new Error("下载认证策略无效");
    if (source.auth?.type !== undefined && !["none", "bearer", "header"].includes(String(source.auth.type))) throw new Error("接口认证类型无效");
    const mode = source.mode;
    const statusMethod = source.statusMethod ?? "GET";
    const downloadAuth = source.downloadAuth ?? "none";
    const allowedDownloadOrigins = Array.isArray(source.allowedDownloadOrigins)
      ? [...new Set(source.allowedDownloadOrigins.map(String).map(cleanOrigin))].slice(0, 30)
      : [];
    if (downloadAuth === "provider" && !allowedDownloadOrigins.length) {
      throw new Error("下载携带接口凭据时，必须明确填写允许的下载来源");
    }
    const authType = source.auth?.type ?? "none";
    const headerName = cleanText(source.auth?.headerName, 80) || undefined;
    if (authType === "header" && headerName && !HEADER_NAME.test(headerName)) throw new Error("凭据请求头名称不合法");
    const scheme = cleanText(source.auth?.scheme, 40) || undefined;
    if (scheme && !/^[A-Za-z][A-Za-z0-9._~-]{0,39}$/.test(scheme)) throw new Error("凭据认证方案不合法");
    const idempotencyHeader = cleanText(source.idempotencyHeader, 80) || undefined;
    if (idempotencyHeader && !HEADER_NAME.test(idempotencyHeader)) throw new Error("幂等请求头名称不合法");
    const submitDetails = cleanHttpUrlDetails(source.submitUrl, "提交地址");
    const submitUrl = submitDetails.value;
    profile.capabilities = bindCapabilitiesToNetworkTarget(profile.capabilities, submitUrl);
    const statusDetails = source.statusUrlTemplate ? cleanHttpUrlDetails(source.statusUrlTemplate, "状态查询地址", true) : undefined;
    const cancelDetails = source.cancelUrlTemplate ? cleanHttpUrlDetails(source.cancelUrlTemplate, "取消任务地址", true) : undefined;
    if (authType !== "none" && new URL(submitUrl).protocol !== "https:" && !isPrivateNetworkUrl(submitUrl)) {
      throw new Error("公网视频接口携带密钥时必须使用 HTTPS；本机或局域网地址可继续使用 HTTP");
    }
    if (downloadAuth === "provider" && allowedDownloadOrigins.some((origin) => new URL(origin).protocol !== "https:" && !isPrivateNetworkUrl(origin))) {
      throw new Error("携带接口密钥下载公网结果时必须使用 HTTPS");
    }
    const http: GenericHttpProviderConfig = {
      mode,
      imageMode: source.imageMode ?? "base64",
      submitUrl,
      submitMethod: source.submitMethod,
      bodyTemplate: source.bodyTemplate === undefined ? undefined : normalizeTemplate(source.bodyTemplate, "提交请求模板"),
      imageField: cleanText(source.imageField || "image", 80),
      jobIdPath: optionalPath(source.jobIdPath, "任务 ID 路径"),
      resultUrlPath: optionalPath(source.resultUrlPath, "结果地址路径"),
      statusUrlTemplate: statusDetails?.value,
      statusMethod,
      statusBodyTemplate: source.statusBodyTemplate === undefined ? undefined : normalizeTemplate(source.statusBodyTemplate, "状态请求模板"),
      statusPath: optionalPath(source.statusPath, "任务状态路径"),
      progressPath: optionalPath(source.progressPath, "任务进度路径"),
      successValues: Array.isArray(source.successValues) ? [...new Set(source.successValues.map((item) => cleanText(item, 100)).filter(Boolean))].slice(0, 30) : undefined,
      failureValues: Array.isArray(source.failureValues) ? [...new Set(source.failureValues.map((item) => cleanText(item, 100)).filter(Boolean))].slice(0, 30) : undefined,
      cancelUrlTemplate: cancelDetails?.value,
      auth: { type: authType, headerName: authType === "header" ? headerName : undefined, scheme: authType === "none" ? undefined : scheme },
      downloadAuth,
      allowedDownloadOrigins,
      idempotencyHeader,
    };
    if (mode === "async") {
      if (!http.jobIdPath || !http.statusUrlTemplate || !http.statusPath) throw new Error("异步接口必须配置任务 ID、状态查询地址和状态字段路径");
      if (!http.resultUrlPath) throw new Error("异步接口必须配置结果地址字段路径");
    }
    if (authType !== "none" && statusDetails && statusDetails.origin !== submitDetails.origin) {
      throw new Error("携带接口凭据的状态查询地址必须与提交地址同源");
    }
    if (authType !== "none" && cancelDetails && cancelDetails.origin !== submitDetails.origin) {
      throw new Error("携带接口凭据的取消地址必须与提交地址同源");
    }
    if (statusMethod === "POST" && http.statusBodyTemplate === undefined) http.statusBodyTemplate = { id: "{{job_id}}" };
    profile.http = http;
  }
  profile.credentialScopeFingerprint = videoProviderCredentialScopeFingerprint(profile);
  if (videoProviderProfileRequiresCredential(profile)) {
    const previousUsesCredential = Boolean(previous && videoProviderProfileRequiresCredential(previous));
    profile.credentialRevision = previousUsesCredential
      ? previous!.credentialRevision ?? randomUUID()
      : randomUUID();
    profile.credentialState = previousUsesCredential
      ? previous!.credentialState ?? "ready"
      : "ready";
  }
  return profile;
}

export class VideoProviderStore {
  readonly rootDir: string;
  readonly profilesDir: string;
  readonly setupsDir: string;
  readonly settingsFile: string;
  readonly mutationLocksDir: string;
  private credentialBackend?: VideoProviderCredentialBackend;

  constructor(rootDir: string, credentialBackend?: VideoProviderCredentialBackend) {
    this.rootDir = path.resolve(rootDir);
    this.profilesDir = path.join(this.rootDir, "data", "local", "video-providers");
    this.setupsDir = path.join(this.rootDir, "data", "local", "video-provider-setups");
    this.settingsFile = path.join(this.profilesDir, "settings.json");
    this.mutationLocksDir = path.join(this.rootDir, ".runtime", "video-provider-locks");
    this.credentialBackend = credentialBackend;
  }

  async init(): Promise<void> {
    await Promise.all([
      ensureSafeLocalDirectory(this.profilesDir, "视频接口配置目录"),
      ensureSafeLocalDirectory(this.setupsDir, "视频接口接入目录"),
      ensureSafeLocalDirectory(this.mutationLocksDir, "视频接口变更锁目录"),
    ]);
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

  private async clearAbandonedMutationLock(lockPath: string): Promise<boolean> {
    try {
      const [raw, stats] = await Promise.all([fs.readFile(lockPath, "utf8"), fs.stat(lockPath)]);
      let owner: { pid?: number } | undefined;
      try { owner = JSON.parse(raw) as { pid?: number }; } catch { owner = undefined; }
      const abandoned = owner?.pid
        ? !this.processIsAlive(owner.pid)
        : Date.now() - stats.mtimeMs > PROVIDER_MUTATION_LOCK_STALE_MS;
      if (!abandoned) return false;
      await fs.rm(lockPath, { force: true });
      return true;
    } catch (error) {
      if (isFsError(error, ["ENOENT"])) return true;
      return false;
    }
  }

  private async acquireMutationLock(): Promise<() => Promise<void>> {
    await ensureSafeLocalDirectory(this.mutationLocksDir, "视频接口变更锁目录");
    const lockPath = path.join(this.mutationLocksDir, "profile-and-credential.lock");
    const token = randomUUID();
    const startedAt = Date.now();
    for (;;) {
      try {
        const handle = await fs.open(lockPath, "wx");
        try {
          await handle.writeFile(JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() }), "utf8");
        } catch (error) {
          await handle.close().catch(() => undefined);
          await fs.rm(lockPath, { force: true }).catch(() => undefined);
          throw error;
        }
        await handle.close();
        return async () => {
          try {
            const owner = JSON.parse(await fs.readFile(lockPath, "utf8")) as { token?: string };
            if (owner.token === token) await fs.rm(lockPath, { force: true });
          } catch (error) {
            if (!isFsError(error, ["ENOENT"])) throw error;
          }
        };
      } catch (error) {
        if (!isFsError(error, ["EEXIST"])) throw error;
        if (await this.clearAbandonedMutationLock(lockPath)) continue;
        if (Date.now() - startedAt >= PROVIDER_MUTATION_LOCK_TIMEOUT_MS) {
          throw new Error("视频接口配置或凭据正在由另一个进程更新，请稍后重试");
        }
        await new Promise((resolve) => setTimeout(resolve, 30 + Math.floor(Math.random() * 40)));
      }
    }
  }

  private async withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    // One conservative cross-process lock covers every profile/keyring/settings
    // compound mutation. This is intentionally stronger than per-profile
    // locking so service-wide credential cleanup cannot miss a concurrent save.
    const release = await this.acquireMutationLock();
    try { return await operation(); } finally { await release(); }
  }

  profileDir(profileId: string): string {
    if (!PROFILE_ID.test(profileId)) throw new Error("视频接口 ID 不合法");
    return path.join(this.profilesDir, profileId);
  }

  setupDir(requestId: string): string {
    if (!SETUP_ID.test(requestId)) throw new Error("视频接口接入请求 ID 不合法");
    return path.join(this.setupsDir, requestId);
  }

  workflowPath(profile: VideoProviderProfile): string {
    if (!profile.comfyui) throw new Error("当前接口不是 ComfyUI 工作流");
    return path.join(this.profileDir(profile.id), path.basename(profile.comfyui.workflowFile));
  }

  setupWorkflowPath(requestId: string): string {
    return path.join(this.setupDir(requestId), WORKFLOW_FILE);
  }

  async listProfiles(): Promise<VideoProviderProfile[]> {
    await this.init();
    const entries = await fs.readdir(this.profilesDir, { withFileTypes: true });
    const profiles: VideoProviderProfile[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !PROFILE_ID.test(entry.name)) continue;
      try {
        const raw = await fs.readFile(path.join(this.profileDir(entry.name), "profile.json"), "utf8");
        const profile = JSON.parse(raw) as VideoProviderProfile;
        profiles.push({ ...profile, hasCredential: await this.hasCredential(profile.id) });
      } catch {
        // Ignore incomplete local profiles without hiding healthy profiles.
      }
    }
    return profiles.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }

  async getProfile(profileId: string): Promise<VideoProviderProfile> {
    const raw = await fs.readFile(path.join(this.profileDir(profileId), "profile.json"), "utf8");
    return JSON.parse(raw) as VideoProviderProfile;
  }

  private async workflowForSave(input: VideoProviderProfile, workflowJson?: string): Promise<ParsedWorkflow | undefined> {
    if (input.kind !== "comfyui-workflow") return undefined;
    if (workflowJson !== undefined) return parseWorkflowJson(workflowJson);
    const id = cleanText(input.id, 64).toLowerCase();
    if (!PROFILE_ID.test(id)) throw new Error("视频接口 ID 不合法");
    const fileName = path.basename(input.comfyui?.workflowFile || WORKFLOW_FILE);
    const existingPath = path.join(this.profileDir(id), fileName);
    if (!await exists(existingPath)) return undefined;
    return parseWorkflowJson(await fs.readFile(existingPath, "utf8"));
  }

  async saveProfile(input: VideoProviderProfile, workflowJson?: string): Promise<VideoProviderProfile> {
    return this.withMutationLock(() => this.saveProfileUnlocked(input, workflowJson));
  }

  private async saveProfileUnlocked(input: VideoProviderProfile, workflowJson?: string): Promise<VideoProviderProfile> {
    await this.init();
    let previous: VideoProviderProfile | undefined;
    try { previous = await this.getProfile(cleanText(input.id, 64).toLowerCase()); } catch { /* New profile. */ }
    const workflow = await this.workflowForSave(input, workflowJson);
    const profile = normalizeVideoProviderProfile(input, previous, workflow);
    const previousScope = previous ? (previous.credentialScopeFingerprint ?? videoProviderCredentialScopeFingerprint(previous)) : undefined;
    const nextScope = profile.credentialScopeFingerprint!;
    const scopeChanged = Boolean(previous && previousScope !== nextScope);
    const profileDir = this.profileDir(profile.id);
    let previouslyHadCredential = false;
    let credentialReset = false;
    let guardedCredentialRevision: string | undefined;
    if (previous) {
      const previousScopedCredential = await this.readCredentialAccount(this.scopedCredentialAccount(previous.id, previousScope!));
      const previousLegacyCredential = await this.readCredentialAccount(this.legacyCredentialAccount(previous.id));
      previouslyHadCredential = Boolean(previousScopedCredential ?? previousLegacyCredential);
      if (scopeChanged && previouslyHadCredential) {
        if (videoProviderProfileRequiresCredential(previous)) {
          guardedCredentialRevision = randomUUID();
          await writeJsonAtomic(path.join(profileDir, "profile.json"), {
            ...previous,
            credentialRevision: guardedCredentialRevision,
            credentialState: "changing",
            updatedAt: new Date().toISOString(),
          });
        }
        // Invalidate the old scope before persisting the new endpoint. If a
        // secure-store operation fails, keep the old profile rather than carry
        // a credential into a different security boundary.
        await this.deleteCredentialAccount(this.scopedCredentialAccount(previous.id, previousScope!));
        await this.deleteCredentialAccount(this.legacyCredentialAccount(previous.id));
        credentialReset = true;
      } else if (!previous.credentialScopeFingerprint && previousLegacyCredential) {
        if (videoProviderProfileRequiresCredential(previous)) {
          guardedCredentialRevision = randomUUID();
          await writeJsonAtomic(path.join(profileDir, "profile.json"), {
            ...previous,
            credentialRevision: guardedCredentialRevision,
            credentialState: "changing",
            updatedAt: new Date().toISOString(),
          });
        }
        // An unscoped legacy secret cannot prove which endpoint or auth
        // boundary it belonged to. Discard it instead of silently rebinding it.
        await this.deleteCredentialAccount(this.legacyCredentialAccount(previous.id));
        credentialReset = true;
      }
    } else {
      // A deleted profile ID must never inherit an orphaned legacy credential.
      await this.deleteCredentialAccount(this.legacyCredentialAccount(profile.id)).catch(() => undefined);
    }
    if (videoProviderProfileRequiresCredential(profile) && guardedCredentialRevision) {
      profile.credentialRevision = guardedCredentialRevision;
      profile.credentialState = "ready";
    }
    await fs.mkdir(profileDir, { recursive: true });
    if (profile.kind === "comfyui-workflow") {
      const workflowPath = this.workflowPath(profile);
      if (workflow) await writeJsonAtomic(workflowPath, workflow.workflow);
      else if (!await exists(workflowPath)) throw new Error("请上传 ComfyUI 工作流 JSON");
    }
    await writeJsonAtomic(path.join(profileDir, "profile.json"), profile);
    return {
      ...profile,
      hasCredential: await this.hasCredential(profile.id),
      credentialReset: credentialReset ? true : undefined,
    };
  }

  async deleteProfile(profileId: string): Promise<void> {
    return this.withMutationLock(() => this.deleteProfileUnlocked(profileId));
  }

  private async deleteProfileUnlocked(profileId: string): Promise<void> {
    if (!PROFILE_ID.test(profileId)) throw new Error("视频接口 ID 不合法");
    const profilePath = this.profileDir(profileId);
    await assertSafeChildDirectoryIfPresent(this.profilesDir, profilePath, "视频接口配置目录");
    let profile: VideoProviderProfile | undefined;
    try { profile = await this.getProfile(profileId); } catch { /* Already missing. */ }
    if (profile) await this.deleteCredentialUnlocked(profileId);
    else await this.deleteCredentialAccount(this.legacyCredentialAccount(profileId));
    await fs.rm(profilePath, { recursive: true, force: true });
    const defaultId = await this.getDefaultProfileId();
    if (defaultId === profileId) await writeJsonAtomic(this.settingsFile, {});
  }

  async getDefaultProfileId(): Promise<string | undefined> {
    try {
      const settings = JSON.parse(await fs.readFile(this.settingsFile, "utf8")) as { defaultProfileId?: string };
      return settings.defaultProfileId;
    } catch {
      return undefined;
    }
  }

  async setDefaultProfileId(profileId: string): Promise<void> {
    return this.withMutationLock(() => this.setDefaultProfileIdUnlocked(profileId));
  }

  private async setDefaultProfileIdUnlocked(profileId: string): Promise<void> {
    const profile = await this.getProfile(profileId);
    if (!profile.enabled) throw new Error("不能把已停用接口设为默认");
    await writeJsonAtomic(this.settingsFile, { defaultProfileId: profileId });
  }

  async createSetupRequest(input: CreateSetupInput): Promise<VideoProviderSetupRequest> {
    await this.init();
    const description = cleanPersistedText(input.description, 12_000, "接入说明");
    if (!description) throw new Error("请用大白话说明要接入的视频模型和使用方式");
    const id = `setup_${Date.now().toString(36)}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const requestDir = this.setupDir(id);
    await fs.mkdir(requestDir, { recursive: true });
    let workflowFormat: ComfyUiWorkflowFormat | undefined;
    if (input.workflowJson?.trim()) {
      const workflow = parseWorkflowJson(input.workflowJson);
      workflowFormat = workflow.format;
      await writeJsonAtomic(this.setupWorkflowPath(id), workflow.workflow);
    }
    const now = new Date().toISOString();
    const request: VideoProviderSetupRequest = {
      schemaVersion: 1,
      id,
      status: "queued",
      description,
      docsUrl: cleanDocsUrl(input.docsUrl),
      baseUrl: input.baseUrl?.trim() ? cleanBaseUrl(input.baseUrl) : undefined,
      exampleRequest: cleanExample(input.exampleRequest),
      exampleResponse: cleanExample(input.exampleResponse),
      sampleRequest: cleanExample(input.exampleRequest),
      sampleResponse: cleanExample(input.exampleResponse),
      workflowFile: input.workflowJson?.trim() ? WORKFLOW_FILE : undefined,
      workflowFileName: input.workflowJson?.trim() ? WORKFLOW_FILE : undefined,
      workflowFormat,
      createdAt: now,
      updatedAt: now,
    };
    await writeJsonAtomic(path.join(requestDir, "request.json"), request);
    return withSetupAliases(request);
  }

  async getSetupRequest(requestId: string): Promise<VideoProviderSetupRequest> {
    const raw = await fs.readFile(path.join(this.setupDir(requestId), "request.json"), "utf8");
    return withSetupAliases(JSON.parse(raw) as VideoProviderSetupRequest);
  }

  async updateSetupRequest(
    requestId: string,
    status: Exclude<VideoProviderSetupStatus, "cancelled">,
    error?: string,
  ): Promise<VideoProviderSetupRequest> {
    const request = await this.getSetupRequest(requestId);
    if (request.status === "cancelled") throw new Error("已取消的接入请求不能继续更新");
    const transitions: Record<Exclude<VideoProviderSetupStatus, "cancelled">, Array<Exclude<VideoProviderSetupStatus, "cancelled">>> = {
      queued: ["queued", "analyzing", "failed"],
      analyzing: ["analyzing", "ready", "failed"],
      ready: ["ready", "analyzing", "failed"],
      failed: ["failed", "analyzing"],
    };
    if (!transitions[request.status as Exclude<VideoProviderSetupStatus, "cancelled">]?.includes(status)) {
      throw new Error(`接入请求不能从 ${request.status} 变为 ${status}`);
    }
    if (status === "ready" && !request.committedProviderId) {
      throw new Error("请先提交并保存已校验的视频连接器，再将接入请求标记为 ready");
    }
    request.status = status;
    request.error = status === "failed" ? redactSensitiveText(error || "接入分析失败", 4000).trim() : undefined;
    request.updatedAt = new Date().toISOString();
    await writeJsonAtomic(path.join(this.setupDir(requestId), "request.json"), request);
    return request;
  }

  async cancelSetupRequest(requestId: string): Promise<VideoProviderSetupRequest> {
    const request = await this.getSetupRequest(requestId);
    if (request.status === "cancelled") return request;
    request.status = "cancelled";
    request.error = undefined;
    request.updatedAt = new Date().toISOString();
    await writeJsonAtomic(path.join(this.setupDir(requestId), "request.json"), request);
    return request;
  }

  private async setupWorkflow(request: VideoProviderSetupRequest): Promise<ParsedWorkflow | undefined> {
    if (!request.workflowFile) return undefined;
    const workflowPath = this.setupWorkflowPath(request.id);
    if (!await exists(workflowPath)) throw new Error("接入请求的本机工作流文件不存在");
    return parseWorkflowJson(await fs.readFile(workflowPath, "utf8"));
  }

  async getSetupContext(requestId: string): Promise<VideoProviderSetupContext> {
    const request = await this.getSetupRequest(requestId);
    const workflow = await this.setupWorkflow(request);
    return {
      request,
      workflow: workflow ? {
        format: workflow.format,
        localPath: this.setupWorkflowPath(request.id),
        nodeCount: workflow.nodes.length,
        nodes: workflow.nodes,
        sha256: workflow.sha256,
        riskFlags: workflow.riskFlags,
        requiresReview: workflow.riskFlags.length > 0,
      } : undefined,
      rules: {
        declarativeOnly: true,
        credentialsStoredSeparately: true,
        templateVariables: TEMPLATE_VARIABLES,
        bindingRoles: BINDING_ROLES,
      },
    };
  }

  async validateSetupDraft(requestId: string, input: VideoProviderProfile): Promise<{ request: VideoProviderSetupRequest; profile: VideoProviderProfile }> {
    const request = await this.getSetupRequest(requestId);
    if (request.status === "cancelled") throw new Error("接入请求已取消");
    const workflow = await this.setupWorkflow(request);
    if (input.kind === "comfyui-workflow" && !workflow) throw new Error("ComfyUI 接入请求缺少本机工作流 JSON");
    let previous: VideoProviderProfile | undefined;
    try { previous = await this.getProfile(cleanText(input.id, 64).toLowerCase()); } catch { /* New profile. */ }
    const profile = normalizeVideoProviderProfile(input, previous, workflow);
    request.draft = profile;
    // A validated draft is not yet an installed provider. Keep the visible
    // setup in the analyzing state until commitSetupDraft finishes atomically,
    // otherwise the UI could announce success before the profile exists.
    request.status = "analyzing";
    request.error = undefined;
    request.updatedAt = new Date().toISOString();
    await writeJsonAtomic(path.join(this.setupDir(requestId), "request.json"), request);
    return { request, profile };
  }

  async commitSetupDraft(requestId: string, input?: VideoProviderProfile): Promise<{ request: VideoProviderSetupRequest; provider: VideoProviderProfile }> {
    let request = await this.getSetupRequest(requestId);
    if (request.status === "cancelled") throw new Error("接入请求已取消");
    const draft = input ?? request.draft;
    if (!draft) throw new Error("请先生成并校验声明式接口草稿");
    const validated = await this.validateSetupDraft(requestId, draft);
    request = validated.request;
    const workflow = await this.setupWorkflow(request);
    const provider = await this.saveProfile(validated.profile, workflow ? JSON.stringify(workflow.workflow) : undefined);
    request.committedProviderId = provider.id;
    request.providerId = provider.id;
    request.status = "ready";
    request.updatedAt = new Date().toISOString();
    await writeJsonAtomic(path.join(this.setupDir(requestId), "request.json"), request);
    return { request, provider };
  }

  private async credentials(): Promise<VideoProviderCredentialBackend> {
    if (this.credentialBackend) return this.credentialBackend;
    const { Entry, findCredentials } = await import("@napi-rs/keyring");
    this.credentialBackend = {
      getPassword: async (account) => new Entry(SERVICE_NAME, account).getPassword() ?? undefined,
      setPassword: async (account, secret) => { new Entry(SERVICE_NAME, account).setPassword(secret); },
      deletePassword: async (account) => { new Entry(SERVICE_NAME, account).deletePassword(); },
      listAccounts: async () => findCredentials(SERVICE_NAME).map((credential) => credential.account),
    };
    return this.credentialBackend;
  }

  private legacyCredentialAccount(profileId: string): string {
    return profileId;
  }

  private scopedCredentialAccount(profileId: string, fingerprint: string): string {
    return `v1:${profileId}:${fingerprint}`;
  }

  private async readCredentialAccount(account: string): Promise<string | undefined> {
    try { return await (await this.credentials()).getPassword(account); } catch { return undefined; }
  }

  private async deleteCredentialAccount(account: string): Promise<void> {
    await (await this.credentials()).deletePassword(account);
  }

  private async beginCredentialMutation(profile: VideoProviderProfile): Promise<string> {
    const revision = randomUUID();
    await writeJsonAtomic(path.join(this.profileDir(profile.id), "profile.json"), {
      ...profile,
      hasCredential: undefined,
      credentialReset: undefined,
      credentialRevision: revision,
      credentialState: "changing",
      updatedAt: new Date().toISOString(),
    });
    return revision;
  }

  private async finishCredentialMutation(profileId: string, revision: string): Promise<void> {
    const current = await this.getProfile(profileId);
    if (current.credentialRevision !== revision || current.credentialState !== "changing") {
      throw new Error("凭据在保存期间又发生变化；当前连接器保持锁定，请重新打开安全窗口确认");
    }
    await writeJsonAtomic(path.join(this.profileDir(profileId), "profile.json"), {
      ...current,
      credentialState: "ready",
      updatedAt: new Date().toISOString(),
    });
  }

  private async deleteCredentialForProfile(profile: VideoProviderProfile): Promise<void> {
    const scope = profile.credentialScopeFingerprint ?? videoProviderCredentialScopeFingerprint(profile);
    await this.deleteCredentialAccount(this.scopedCredentialAccount(profile.id, scope));
    await this.deleteCredentialAccount(this.legacyCredentialAccount(profile.id));
  }

  async setCredential(profileId: string, secret: string): Promise<void> {
    return this.withMutationLock(() => this.setCredentialUnlocked(profileId, secret));
  }

  private async setCredentialUnlocked(profileId: string, secret: string): Promise<void> {
    const profile = await this.getProfile(profileId);
    if (!videoProviderProfileRequiresCredential(profile)) throw new Error("当前接口未配置需要本机凭据的认证方式");
    if (!profile.credentialScopeFingerprint) throw new Error("旧连接器缺少凭据安全范围，请先重新保存连接器再录入密钥");
    if (secret.includes("\0")) throw new Error("凭据包含无效字符");
    if (Buffer.byteLength(secret, "utf8") > 16_384) throw new Error("凭据长度超过安全限制");
    const scope = profile.credentialScopeFingerprint;
    const account = this.scopedCredentialAccount(profile.id, scope);
    const revision = await this.beginCredentialMutation(profile);
    try {
      if (secret) await (await this.credentials()).setPassword(account, secret);
      else await this.deleteCredentialAccount(account);
      await this.deleteCredentialAccount(this.legacyCredentialAccount(profile.id));
    } catch {
      throw new Error("本机安全存储未能完成凭据更新；连接器已锁定，请在安全窗口重试");
    }
    await this.finishCredentialMutation(profile.id, revision);
  }

  async getCredential(profileId: string): Promise<string | undefined> {
    const profile = await this.getProfile(profileId);
    if (!videoProviderProfileRequiresCredential(profile)) return undefined;
    const scope = profile.credentialScopeFingerprint ?? videoProviderCredentialScopeFingerprint(profile);
    // Unscoped legacy credentials are never rebound automatically because the
    // old account does not prove which endpoint or auth boundary it belonged to.
    if (!profile.credentialScopeFingerprint || !profile.credentialRevision || profile.credentialState !== "ready") return undefined;
    return this.readCredentialAccount(this.scopedCredentialAccount(profile.id, scope));
  }

  async getCredentialForExecution(profileId: string, expectedExecutionFingerprint: string): Promise<string> {
    const before = await this.getProfile(profileId);
    if (!videoProviderProfileRequiresCredential(before)
      || !before.credentialScopeFingerprint
      || !before.credentialRevision
      || before.credentialState !== "ready"
      || videoProviderExecutionFingerprint(before) !== expectedExecutionFingerprint) {
      throw new Error("视频接口凭据或安全范围已在排队后变化；旧任务已停止");
    }
    const secret = await this.readCredentialAccount(
      this.scopedCredentialAccount(before.id, before.credentialScopeFingerprint),
    );
    if (!secret) throw new Error("视频接口尚未配置本机密钥");
    const after = await this.getProfile(profileId);
    if (after.credentialRevision !== before.credentialRevision
      || after.credentialState !== "ready"
      || videoProviderExecutionFingerprint(after) !== expectedExecutionFingerprint) {
      throw new Error("读取凭据期间安全范围发生变化；旧任务未发送网络请求");
    }
    return secret;
  }

  async hasCredential(profileId: string): Promise<boolean> {
    return Boolean(await this.getCredential(profileId));
  }

  async deleteCredential(profileId: string): Promise<void> {
    return this.withMutationLock(() => this.deleteCredentialUnlocked(profileId));
  }

  private async deleteCredentialUnlocked(profileId: string): Promise<void> {
    if (!PROFILE_ID.test(profileId)) throw new Error("视频接口 ID 不合法");
    let profile: VideoProviderProfile | undefined;
    try { profile = await this.getProfile(profileId); } catch { /* Missing profile. */ }
    if (!profile) {
      await this.deleteCredentialAccount(this.legacyCredentialAccount(profileId));
      return;
    }
    if (!videoProviderProfileRequiresCredential(profile)) {
      await this.deleteCredentialForProfile(profile);
      return;
    }
    const revision = await this.beginCredentialMutation(profile);
    try {
      await this.deleteCredentialForProfile(profile);
    } catch {
      throw new Error("本机安全存储未能完成凭据清理；连接器已锁定，请重试");
    }
    await this.finishCredentialMutation(profile.id, revision);
  }

  async deleteAllCredentials(): Promise<number> {
    return this.withMutationLock(() => this.deleteAllCredentialsUnlocked());
  }

  private async deleteAllCredentialsUnlocked(): Promise<number> {
    const backend = await this.credentials();
    if (!backend.listAccounts) throw new Error("当前安全存储不支持完整凭据清理");
    const guardedProfiles: Array<{ id: string; revision: string }> = [];
    for (const listed of await this.listProfiles()) {
      const profile = await this.getProfile(listed.id);
      if (!videoProviderProfileRequiresCredential(profile)) continue;
      guardedProfiles.push({ id: profile.id, revision: await this.beginCredentialMutation(profile) });
    }
    const accounts = await backend.listAccounts();
    const uniqueAccounts = [...new Set(accounts)];
    let deletedCount = 0;
    let failureCount = 0;
    for (const account of uniqueAccounts) {
      try {
        await backend.deletePassword(account);
        deletedCount += 1;
      } catch {
        failureCount += 1;
      }
    }
    if (failureCount > 0) throw new Error(`仍有 ${failureCount} 条本机密钥未能清除，请保持状态目录并重试`);
    for (const guarded of guardedProfiles) await this.finishCredentialMutation(guarded.id, guarded.revision);
    return deletedCount;
  }

  async getExecutionFingerprint(profileOrId: VideoProviderProfile | string): Promise<string> {
    const profile = await this.getProfile(typeof profileOrId === "string" ? profileOrId : profileOrId.id);
    if (videoProviderProfileRequiresCredential(profile)) {
      if (!profile.credentialScopeFingerprint || !profile.credentialRevision || profile.credentialState !== "ready") {
        throw new Error("视频接口凭据边界尚未就绪，请在本机安全窗口重新保存密钥");
      }
      if (!await this.hasCredential(profile.id)) throw new Error("视频接口尚未配置本机密钥");
    }
    return videoProviderExecutionFingerprint(profile);
  }

  async testProfile(profileId: string): Promise<{ ok: true; message: string; verification: "endpoint" | "reachable-only" }> {
    const profile = await this.getProfile(profileId);
    if (profile.kind === "comfyui-workflow") {
      const response = await fetch(`${profile.comfyui!.baseUrl}/queue`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`ComfyUI 连接失败：HTTP ${response.status}`);
      if (!await exists(this.workflowPath(profile))) throw new Error("本机工作流文件不存在");
      return { ok: true, message: "ComfyUI 在线，工作流文件可用", verification: "endpoint" };
    }
    const config = profile.http!;
    const headers = new Headers();
    if (config.auth?.type && config.auth.type !== "none") {
      const secret = await this.getCredential(profile.id);
      if (!secret) throw new Error("请先在本机填写 API Key / Token，再进行免费连接探测");
      if (config.auth.type === "bearer") headers.set("Authorization", `${config.auth.scheme || "Bearer"} ${secret}`.trim());
      if (config.auth.type === "header") headers.set(config.auth.headerName || "X-API-Key", `${config.auth.scheme ? `${config.auth.scheme} ` : ""}${secret}`);
    }
    const response = await fetch(config.submitUrl, {
      method: "OPTIONS",
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status >= 300 && response.status < 400) throw new Error("接口地址发生重定向，请改用服务商给出的最终 HTTPS 地址");
    if ([401, 403].includes(response.status)) throw new Error(`接口拒绝了本机凭据：HTTP ${response.status}`);
    if (response.status === 404) throw new Error("接口地址不存在：HTTP 404");
    if ([405, 501].includes(response.status)) {
      return { ok: true, message: "地址可达；服务未提供免费探测。未发送生成请求，字段映射将在首次主动试跑时验证。", verification: "reachable-only" };
    }
    if (!response.ok) throw new Error(`免费连接探测返回 HTTP ${response.status}`);
    return { ok: true, message: "地址可达，且本机密钥状态已就绪；未发送任何生成请求。", verification: "endpoint" };
  }
}
