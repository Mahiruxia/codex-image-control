import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { ProjectStore, VideoJobContext } from "./store.js";
import type { GenericHttpProviderConfig, VideoRequest, VideoRequestStatus } from "./types.js";
import { redactSensitiveText, renderVideoProviderUrlTemplate, videoProviderWorkflowSha256 } from "./video-providers.js";

type JsonRecord = Record<string, unknown>;
class CancelledRequestError extends Error {}
class RetryableRemoteStateError extends Error {}
const AMBIGUOUS_SUBMIT_HTTP_STATUSES = new Set([408, 409, 425, 429]);

function isDefinitiveSubmitRejection(status: number): boolean {
  return status >= 400 && status < 500 && !AMBIGUOUS_SUBMIT_HTTP_STATUSES.has(status);
}
type RemotePromptState = "present" | "absent" | "unknown";
interface VideoRunResult { outputPath: string; cleanup?: () => Promise<void> }

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_ERROR_BYTES = 64 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function timeoutSignal(deadline: number, maximumMs: number): AbortSignal {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("视频任务已达到总等待时限");
  return AbortSignal.timeout(Math.max(1, Math.min(maximumMs, remaining)));
}

function isPrivateRuntimeUrl(url: URL): boolean {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1" || host.endsWith(".localhost")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match = /^172\.(\d{1,3})\./.exec(host);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function assertRuntimeUrl(url: URL): void {
  if (!/^https?:$/.test(url.protocol)) throw new Error("远端地址使用了不支持的协议");
  if (url.username || url.password) throw new Error("远端地址不得包含账号或凭据");
  if (url.protocol !== "https:" && !isPrivateRuntimeUrl(url)) throw new Error("公网远端地址必须使用 HTTPS");
}

function stripCredentialHeaders(headers: Headers): void {
  for (const name of [...headers.keys()]) {
    if (/^(?:authorization|cookie|proxy-authorization)$/i.test(name) || /(?:api.?key|token|secret|credential)/i.test(name)) headers.delete(name);
  }
}

async function fetchWithSafeRedirects(
  rawUrl: string | URL,
  init: RequestInit = {},
  approvedOrigins?: Iterable<string>,
): Promise<Response> {
  let current = rawUrl instanceof URL ? new URL(rawUrl) : new URL(rawUrl);
  assertRuntimeUrl(current);
  const approved = new Set(approvedOrigins ?? [current.origin]);
  if (!approved.has(current.origin)) throw new Error("远端地址不在此连接器允许的来源范围内");
  let method = String(init.method ?? "GET").toUpperCase();
  let body = init.body;
  const headers = new Headers(init.headers);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(current, { ...init, method, body, headers, redirect: "manual" });
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("远端重定向缺少目标地址");
    }
    const next = new URL(location, current);
    assertRuntimeUrl(next);
    const crossOrigin = next.origin !== current.origin;
    if (crossOrigin && (body !== undefined && body !== null || !["GET", "HEAD"].includes(method))) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("远端接口发生跨来源重定向，已停止请求以保护凭据与请求内容");
    }
    if (!approved.has(next.origin)) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("远端重定向目标不在此连接器允许的来源范围内");
    }
    if (crossOrigin) stripCredentialHeaders(headers);
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
      headers.delete("content-type");
      headers.delete("content-length");
    }
    await response.body?.cancel().catch(() => undefined);
    current = next;
  }
  throw new Error("远端重定向次数过多");
}

async function readResponseBytes(response: Response, maxBytes: number, label: string): Promise<Uint8Array> {
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`${label}超过安全大小限制`);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`${label}超过安全大小限制`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

async function readResponseText(response: Response, maxBytes: number, label: string): Promise<string> {
  return new TextDecoder("utf-8", { fatal: false }).decode(await readResponseBytes(response, maxBytes, label));
}

async function readResponseJson<T>(response: Response, maxBytes = MAX_JSON_BYTES): Promise<T> {
  const text = await readResponseText(response, maxBytes, "远端 JSON 响应");
  try { return JSON.parse(text) as T; } catch { throw new Error("视频接口返回的 JSON 格式无效"); }
}

function stableRemotePromptId(requestId: string): string {
  const hex = createHash("sha256").update(`image-control:${requestId}`).digest("hex");
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function remotePromptState(baseUrl: string, promptId: string, deadline = Date.now() + 60_000): Promise<RemotePromptState> {
  let historyChecked = false;
  let queueChecked = false;
  try {
    const historyResponse = await fetchWithSafeRedirects(`${baseUrl}/history/${encodeURIComponent(promptId)}`, { signal: timeoutSignal(deadline, 30_000) });
    if (historyResponse.ok) {
      historyChecked = true;
      const history = await readResponseJson<JsonRecord>(historyResponse);
      if (Object.prototype.hasOwnProperty.call(history, promptId)) return "present";
    } else await historyResponse.body?.cancel().catch(() => undefined);
  } catch { /* Reconciled with the queue below. */ }
  try {
    const queueResponse = await fetchWithSafeRedirects(`${baseUrl}/queue`, { signal: timeoutSignal(deadline, 30_000) });
    if (queueResponse.ok) {
      queueChecked = true;
      const queue = await readResponseJson<{ queue_running?: unknown[]; queue_pending?: unknown[] }>(queueResponse);
      if ([...(queue.queue_running ?? []), ...(queue.queue_pending ?? [])].some((item) => JSON.stringify(item).includes(promptId))) return "present";
    } else await queueResponse.body?.cancel().catch(() => undefined);
  } catch { /* A failed queue lookup cannot prove that the prompt is absent. */ }
  return historyChecked && queueChecked ? "absent" : "unknown";
}

async function waitForRemotePrompt(baseUrl: string, promptId: string, attempts = 6, deadline = Date.now() + 60_000): Promise<RemotePromptState> {
  let latest: RemotePromptState = "unknown";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (Date.now() >= deadline) break;
    latest = await remotePromptState(baseUrl, promptId, deadline);
    if (latest === "present") return latest;
    if (attempt < attempts - 1 && Date.now() < deadline) await sleep(Math.min(2_000, Math.max(0, deadline - Date.now())));
  }
  return latest;
}

function isNetworkTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return ["AbortError", "TimeoutError"].includes(error.name) || /aborted due to timeout|timed?\s*out/i.test(error.message);
}

async function retryNetworkTimeout<T>(operation: () => Promise<T>, failureMessage: string, attempts = 3): Promise<T> {
  let latest: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      latest = error;
      if (!isNetworkTimeout(error)) throw error;
      if (attempt < attempts - 1) await sleep(2_000 * (attempt + 1));
    }
  }
  throw new Error(`${failureMessage}${latest instanceof Error ? `（${redactSensitiveText(latest.message, 800)}）` : ""}`);
}

function getPath(value: unknown, dottedPath?: string): unknown {
  if (!dottedPath) return value;
  return dottedPath.split(".").filter(Boolean).reduce<unknown>((current, segment) => {
    if (current && typeof current === "object") return (current as JsonRecord)[segment];
    return undefined;
  }, value);
}

function safeRemoteJobId(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (/[\u0000-\u001F\u007F]/.test(raw) || raw === "." || raw === "..") {
    throw new Error("视频接口返回的任务 ID 含不安全字符");
  }
  if (raw.length > 1_000) throw new Error("视频接口返回的任务 ID 过长");
  if (redactSensitiveText(raw, 1_001) !== raw) throw new Error("视频接口把疑似凭据或签名值放入了任务 ID；已拒绝持久化");
  return raw;
}

function renderString(template: string, variables: Record<string, string | number>): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key: string) => String(variables[key] ?? ""));
}

function renderTemplate(value: unknown, variables: Record<string, string | number>): unknown {
  if (typeof value === "string") return renderString(value, variables);
  if (Array.isArray(value)) return value.map((item) => renderTemplate(item, variables));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderTemplate(item, variables)]));
  }
  return value;
}

async function responseError(response: Response): Promise<Error> {
  let text = "";
  try { text = redactSensitiveText(await readResponseText(response, MAX_ERROR_BYTES, "远端错误响应"), 1200).trim(); }
  catch { text = "错误内容超过安全限制"; }
  return new Error(`视频接口返回 HTTP ${response.status}${text ? `：${text}` : ""}`);
}

async function ffprobe(filePath: string): Promise<{ width: number; height: number; frameRate: number; durationSeconds: number }> {
  const args = ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", filePath];
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("ffprobe", args, { windowsHide: true });
    let stdout = ""; let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(stdout);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error("视频校验超过 30 秒安全时限")); }, 30_000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (Buffer.byteLength(stdout, "utf8") > 1024 * 1024) { child.kill(); finish(new Error("视频校验输出超过安全限制")); }
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (Buffer.byteLength(stderr, "utf8") > 128 * 1024) { child.kill(); finish(new Error("视频校验错误输出超过安全限制")); }
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => code === 0
      ? finish()
      : finish(new Error(`视频校验失败：${redactSensitiveText(stderr.replaceAll(filePath, "[LOCAL_FILE]"), 600)}`)));
  });
  const parsed = JSON.parse(output) as { streams?: Array<{ width?: number; height?: number; r_frame_rate?: string }>; format?: { duration?: string } };
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream.height) throw new Error("视频缺少有效画面轨道");
  const [numerator, denominator] = (stream.r_frame_rate ?? "0/1").split("/").map(Number);
  const frameRate = denominator ? numerator / denominator : numerator;
  const durationSeconds = Number(parsed.format?.duration ?? 0);
  if (!frameRate || !durationSeconds) throw new Error("视频帧率或时长无效");
  return { width: stream.width, height: stream.height, frameRate, durationSeconds };
}

function convertWorkflowToPrompt(workflow: JsonRecord): JsonRecord {
  const nodes = workflow.nodes as JsonRecord[];
  const links = (workflow.links ?? []) as unknown[];
  const linkById = new Map<string, [string, number]>();
  for (const raw of links) {
    if (Array.isArray(raw)) linkById.set(String(raw[0]), [String(raw[1]), Number(raw[2])]);
    else if (raw && typeof raw === "object") {
      const link = raw as JsonRecord;
      linkById.set(String(link.id), [String(link.origin_id), Number(link.origin_slot)]);
    }
  }
  const setSources = new Map<string, [string, number]>();
  for (const node of nodes) {
    if (node.type !== "SetNode") continue;
    const name = String((node.widgets_values as unknown[])?.[0] ?? "");
    const input = ((node.inputs ?? []) as JsonRecord[]).find((item) => item.link !== null && item.link !== undefined);
    const source = input ? linkById.get(String(input.link)) : undefined;
    if (name && source) setSources.set(name, source);
  }
  const virtualSources = new Map<string, [string, number]>();
  for (const node of nodes) {
    if (node.type !== "GetNode") continue;
    const source = setSources.get(String((node.widgets_values as unknown[])?.[0] ?? ""));
    if (!source) continue;
    for (const output of (node.outputs ?? []) as JsonRecord[]) {
      for (const linkId of (output.links ?? []) as unknown[]) if (linkId !== null) virtualSources.set(String(linkId), source);
    }
  }
  const skipped = new Set(["Note", "MarkdownNote", "Label (rgthree)", "Fast Groups Bypasser (rgthree)", "SetNode", "GetNode"]);
  const prompt: JsonRecord = {};
  for (const node of nodes) {
    if (skipped.has(String(node.type))) continue;
    const inputs: JsonRecord = {};
    let widgetIndex = 0;
    for (const input of (node.inputs ?? []) as JsonRecord[]) {
      const inputName = String(input.name ?? "");
      if (!inputName || (node.type === "VHS_VideoCombine" && ["save_metadata", "trim_to_audio", "pix_fmt", "crf"].includes(inputName)) || input.type === "IMAGEUPLOAD") continue;
      let hasWidget = false; let widgetValue: unknown;
      if (input.widget && typeof input.widget === "object") {
        const widgetName = String((input.widget as JsonRecord).name ?? "");
        if (Array.isArray(node.widgets_values) && widgetIndex < node.widgets_values.length) {
          widgetValue = node.widgets_values[widgetIndex++]; hasWidget = true;
          if (/seed/i.test(inputName) && ["fixed", "randomize", "increment", "decrement"].includes(String(node.widgets_values[widgetIndex]))) widgetIndex += 1;
        } else if (node.widgets_values && typeof node.widgets_values === "object" && widgetName in (node.widgets_values as JsonRecord)) {
          widgetValue = (node.widgets_values as JsonRecord)[widgetName]; hasWidget = true;
        }
      }
      if (input.link !== null && input.link !== undefined) {
        const source = virtualSources.get(String(input.link)) ?? linkById.get(String(input.link));
        if (source) inputs[inputName] = source;
      } else if (hasWidget) inputs[inputName] = widgetValue;
    }
    if (node.type === "Seed (rgthree)" && Array.isArray(node.widgets_values)) inputs.seed = node.widgets_values[0];
    prompt[String(node.id)] = { class_type: String(node.type), inputs, _meta: { title: String(node.title ?? node.type) } };
  }
  return prompt;
}

function promptFromWorkflow(workflow: JsonRecord, format?: "ui" | "api"): JsonRecord {
  if (format === "ui" || Array.isArray(workflow.nodes)) return convertWorkflowToPrompt(workflow);
  const prompt = workflow.prompt;
  if (prompt && typeof prompt === "object" && !Array.isArray(prompt)) return structuredClone(prompt as JsonRecord);
  return structuredClone(workflow);
}

function setPromptBinding(prompt: JsonRecord, binding: { nodeId: string; inputName: string } | undefined, value: unknown): void {
  if (!binding) return;
  const node = prompt[String(binding.nodeId)] as JsonRecord | undefined;
  if (!node) throw new Error(`ComfyUI 工作流缺少已映射节点 #${binding.nodeId}`);
  const inputs = node.inputs as JsonRecord | undefined;
  if (!inputs || typeof inputs !== "object") throw new Error(`ComfyUI 节点 #${binding.nodeId} 缺少 inputs`);
  if (!(binding.inputName in inputs)) throw new Error(`ComfyUI 节点 #${binding.nodeId} 缺少输入 ${binding.inputName}`);
  inputs[binding.inputName] = value;
}

function comfyVideoOutput(entry: JsonRecord, preferredNodeId?: string): JsonRecord | undefined {
  const outputs = entry.outputs as JsonRecord | undefined;
  if (!outputs) return undefined;
  const values = preferredNodeId && outputs[preferredNodeId]
    ? [outputs[preferredNodeId], ...Object.entries(outputs).filter(([id]) => id !== preferredNodeId).map(([, value]) => value)]
    : Object.values(outputs);
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    for (const key of ["gifs", "videos"]) {
      for (const item of (((value as JsonRecord)[key] ?? []) as JsonRecord[])) {
        if (/\.(mp4|mov|mkv|webm)$/i.test(String(item.filename ?? "")) || String(item.format ?? "").startsWith("video/")) return item;
      }
    }
  }
  return undefined;
}

function authHeaders(config: GenericHttpProviderConfig, secret?: string): Headers {
  const headers = new Headers();
  if (config.auth?.type === "none" || !config.auth) return headers;
  if (!secret) throw new Error("视频接口尚未配置本机密钥");
  if (config.auth.type === "bearer") headers.set("Authorization", `${config.auth.scheme || "Bearer"} ${secret}`.trim());
  if (config.auth.type === "header") headers.set(config.auth.headerName || "X-API-Key", `${config.auth.scheme ? `${config.auth.scheme} ` : ""}${secret}`);
  return headers;
}

async function downloadTo(response: Response, filePath: string, maxBytes = 2 * 1024 * 1024 * 1024): Promise<void> {
  if (!response.ok) throw await responseError(response);
  if (!response.body) throw new Error("视频接口返回了空文件");
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > maxBytes) throw new Error("视频结果超过 2GB 安全限制");
  const handle = await fs.open(filePath, "w");
  const reader = response.body.getReader();
  let received = 0;
  let failure: unknown;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new Error("视频结果超过 2GB 安全限制");
      await handle.write(Buffer.from(value));
    }
    if (!received) throw new Error("视频接口返回了空文件");
  } catch (error) {
    failure = error;
    await reader.cancel().catch(() => undefined);
  } finally {
    reader.releaseLock();
    await handle.close();
  }
  if (failure) {
    await fs.rm(filePath, { force: true }).catch(() => undefined);
    throw failure;
  }
}

function downloadOriginAllowed(resultUrl: URL, config: GenericHttpProviderConfig): boolean {
  const allowed = config.allowedDownloadOrigins?.map((value) => new URL(value).origin) ?? [];
  if (allowed.length) return allowed.includes(resultUrl.origin);
  return resultUrl.origin === new URL(config.submitUrl).origin;
}

async function fetchVideoResult(config: GenericHttpProviderConfig, rawUrl: string, credentialSnapshot?: string): Promise<Response> {
  const current = new URL(rawUrl, config.submitUrl);
  if (!downloadOriginAllowed(current, config)) throw new Error("视频结果来源未列入此连接器的下载允许列表");
  const headers = config.downloadAuth === "provider"
    ? authHeaders(config, credentialSnapshot)
    : new Headers();
  const approvedOrigins = config.allowedDownloadOrigins?.length
    ? config.allowedDownloadOrigins.map((value) => new URL(value).origin)
    : [new URL(config.submitUrl).origin];
  return fetchWithSafeRedirects(current, { headers, signal: AbortSignal.timeout(600_000) }, approvedOrigins);
}

export class VideoWorker {
  private running = false;
  private stopped = false;
  private loopPromise?: Promise<void>;
  private releaseLease?: () => Promise<void>;

  constructor(private readonly store: ProjectStore) {}

  private update(
    context: VideoJobContext,
    status: VideoRequestStatus,
    patch: Partial<Pick<VideoRequest, "progress" | "error" | "remoteJobId" | "remoteOutput" | "submissionState" | "idempotencyKey">> = {},
  ): Promise<VideoRequest> {
    return this.store.updateVideoRequestStatus(
      context.project.id,
      context.request.id,
      status,
      patch,
      context.request.claimToken,
    );
  }

  start(): void {
    if (this.running) return;
    this.stopped = false;
    this.running = true;
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.loopPromise;
    this.loopPromise = undefined;
  }

  private async loop(): Promise<void> {
    try {
      while (!this.stopped) {
        try {
          if (!this.releaseLease) {
            const lease = await this.store.tryAcquireVideoWorkerLease();
            if (!lease) { await sleep(1_500); continue; }
            this.releaseLease = lease.release;
          }
        const request = await this.store.claimPendingVideoRequest();
        if (!request) { await sleep(1_500); continue; }
        try {
          const context = await this.store.getVideoJobContext(request.projectId, request.id, request.claimToken);
          await this.process(context);
        } catch (error) {
          const message = redactSensitiveText(error instanceof Error ? error.message : String(error), 4_000).trim();
          await this.store.updateVideoRequestStatus(request.projectId, request.id, "failed", { error: message }, request.claimToken).catch(() => undefined);
          process.stderr.write(`视频请求 ${request.id} 无法继续：${message}\n`);
        }
        } catch (error) {
          process.stderr.write(`视频工作器：${redactSensitiveText(error instanceof Error ? error.message : String(error), 4_000)}\n`);
          await sleep(2_000);
        }
      }
    } finally {
      await this.releaseLease?.().catch(() => undefined);
      this.releaseLease = undefined;
      this.running = false;
    }
  }

  private async process(context: VideoJobContext): Promise<void> {
    await fs.mkdir(context.runtimeDirectory, { recursive: true });
    try {
      const result = context.provider.kind === "comfyui-workflow"
        ? await this.runComfy(context)
        : await this.runGenericHttp(context);
      const metadata = await ffprobe(result.outputPath);
      const expected = context.request.snapshot;
      if (metadata.width !== expected.width || metadata.height !== expected.height) {
        throw new Error(`视频尺寸不符：收到 ${metadata.width}×${metadata.height}，预期 ${expected.width}×${expected.height}`);
      }
      if (Math.abs(metadata.frameRate - expected.frameRate) > 0.25) {
        throw new Error(`视频帧率不符：收到 ${metadata.frameRate.toFixed(2)}fps，预期 ${expected.frameRate}fps`);
      }
      if (Math.abs(metadata.durationSeconds - expected.durationSeconds) > Math.max(0.75, 2 / expected.frameRate)) {
        throw new Error(`视频时长不符：收到 ${metadata.durationSeconds.toFixed(2)} 秒，预期约 ${expected.durationSeconds.toFixed(2)} 秒`);
      }
      await this.store.commitVideoResult(context.project.id, context.request.id, result.outputPath, metadata, context.request.claimToken);
      await result.cleanup?.().catch(() => undefined);
    } catch (error) {
      if (error instanceof RetryableRemoteStateError) {
        const patch: Partial<Pick<VideoRequest, "progress" | "remoteJobId">> = {
          progress: Math.max(8, context.request.progress ?? 0),
        };
        if (context.provider.kind === "comfyui-workflow") {
          patch.remoteJobId = context.request.remoteJobId ?? stableRemotePromptId(context.request.id);
        }
        const waiting = await this.update(context, "waiting_remote", patch).then(() => true, () => false);
        if (waiting) {
          await this.store.releaseVideoRequestClaim(
            context.project.id,
            context.request.id,
            context.request.claimToken,
          ).catch(() => undefined);
        }
        await sleep(5_000);
      } else if (!(error instanceof CancelledRequestError)) {
        await this.update(context, "failed", {
          error: redactSensitiveText(error instanceof Error ? error.message : String(error), 4_000).trim(),
        }).catch(() => undefined);
      }
    } finally {
      await fs.rm(context.runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async runComfy(context: VideoJobContext): Promise<VideoRunResult> {
    const config = context.provider.comfyui!;
    const baseUrl = config.baseUrl;
    const deadline = Date.now() + context.provider.defaults.timeoutMinutes * 60_000;
    const stablePromptId = stableRemotePromptId(context.request.id);
    let promptId = context.request.remoteJobId;
    if (promptId) {
      const state = await waitForRemotePrompt(baseUrl, promptId, 2, deadline);
      if (state === "present") {
        await this.update(context, "running", {
          remoteJobId: promptId,
          progress: Math.max(10, context.request.progress ?? 0),
          submissionState: "accepted",
        });
      } else if (state === "unknown") {
        throw new RetryableRemoteStateError("暂时无法确认远端任务状态");
      } else if (promptId === stablePromptId && (context.request.submissionState ?? "not-submitted") === "not-submitted") {
        // The stable ID can be reserved before any paid submit while waiting for
        // the remote queue. An absent lookup is safe only in that pre-submit case.
        promptId = undefined;
      } else if (promptId === stablePromptId && context.request.status === "queued") {
        // A queued request with a non-initial submission state can only come from
        // the explicit user retry action. The worker has now confirmed the old ID
        // absent, so reset the durable boundary before performing the new submit.
        await this.store.prepareComfyVideoResubmission(
          context.project.id,
          context.request.id,
          context.request.claimToken,
        );
        promptId = undefined;
      } else {
        throw new Error("上次 ComfyUI 提交结果无法确认，系统已停止自动重提；请核对远端后手动重试这一镜");
      }
    } else {
      const state = await remotePromptState(baseUrl, stablePromptId, deadline);
      if (state === "present") {
        promptId = stablePromptId;
        await this.update(context, "running", { remoteJobId: promptId, progress: 10, submissionState: "accepted" });
      } else if (state === "unknown") {
        throw new RetryableRemoteStateError("暂时无法核对远端队列");
      }
    }
    if (!promptId) {
      let queueReady = false;
      while (Date.now() < deadline) {
        const current = (await this.store.getVideoRequests(context.project.id)).find((request) => request.id === context.request.id);
        if (current?.status === "cancelled") throw new CancelledRequestError("视频请求已取消");
        let queueResponse: Response;
        try {
          queueResponse = await fetchWithSafeRedirects(`${baseUrl}/queue`, { signal: timeoutSignal(deadline, 30_000) });
        } catch (error) {
          if (isNetworkTimeout(error)) throw new RetryableRemoteStateError("远端队列连接超时");
          throw error;
        }
        if (!queueResponse.ok) throw await responseError(queueResponse);
        const queue = await readResponseJson<{ queue_running?: unknown[]; queue_pending?: unknown[] }>(queueResponse);
        if ((queue.queue_running?.length ?? 0) + (queue.queue_pending?.length ?? 0) === 0) { queueReady = true; break; }
        await this.update(context, "waiting_remote", { progress: 0 });
        await sleep(Math.max(1, context.provider.defaults.pollSeconds) * 1_000);
      }
      if (!queueReady) throw new Error("ComfyUI 在总等待时限内未腾出可用队列");
      await this.update(context, "uploading", { progress: 3 });
      const image = await fs.readFile(context.sourceImagePath);
      const uploaded = await retryNetworkTimeout(async () => {
        const form = new FormData();
        form.append("image", new Blob([image], { type: "image/png" }), `${context.request.id}.png`);
        form.append("type", "input"); form.append("overwrite", "true");
        const upload = await fetchWithSafeRedirects(`${baseUrl}/upload/image`, { method: "POST", body: form, signal: timeoutSignal(deadline, 120_000) });
        if (!upload.ok) throw await responseError(upload);
        return await readResponseJson<{ name?: string }>(upload);
      }, "首帧上传连续超时，视频尚未提交远端；可以稍后只重试这一镜");
      if (!uploaded.name) throw new Error("ComfyUI 上传结果缺少图片名称");

      let workflowJson: string;
      try {
        workflowJson = await fs.readFile(this.store.videoProviders.workflowPath(context.provider), "utf8");
      } catch {
        throw new Error("本机工作流不可读，请在视频接口设置中重新保存工作流");
      }
      const workflowSha256 = videoProviderWorkflowSha256(workflowJson);
      if (!config.workflowSha256 || workflowSha256 !== config.workflowSha256) {
        throw new Error("本机工作流内容已在任务排队后变化，已停止远端提交；请重新检查并保存连接器");
      }
      const workflow = JSON.parse(workflowJson) as JsonRecord;
      const bindings = config.bindings;
      if (!bindings?.image || !bindings.prompt) throw new Error("ComfyUI 连接器缺少明确的 image 与 prompt 绑定");
      const apiPrompt = promptFromWorkflow(workflow, config.workflowFormat);
      const snapshot = context.request.snapshot;
      setPromptBinding(apiPrompt, bindings.image, uploaded.name);
      setPromptBinding(apiPrompt, bindings.prompt, snapshot.prompt);
      setPromptBinding(apiPrompt, bindings.negativePrompt, snapshot.negativePrompt);
      setPromptBinding(apiPrompt, bindings.width, snapshot.width);
      setPromptBinding(apiPrompt, bindings.height, snapshot.height);
      setPromptBinding(apiPrompt, bindings.frameCount, snapshot.frameCount);
      setPromptBinding(apiPrompt, bindings.frameRate, snapshot.frameRate);
      setPromptBinding(apiPrompt, bindings.seed, Math.floor(100_000_000 + Math.random() * 2_000_000_000));
      setPromptBinding(apiPrompt, bindings.filenamePrefix, `image-control/${context.project.id}/${context.shot.storageKey}-${context.request.id}`);
      promptId = stablePromptId;
      await this.update(context, "submitting", {
        progress: 8, remoteJobId: stablePromptId, submissionState: "submitting", idempotencyKey: stablePromptId,
      });
      const submitPayload = { prompt: apiPrompt, prompt_id: stablePromptId, client_id: `image-control-${context.request.id}` };
      try {
        const submit = await fetchWithSafeRedirects(`${baseUrl}/prompt`, {
          method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify(submitPayload), signal: timeoutSignal(deadline, 60_000),
        });
        if (!submit.ok) throw await responseError(submit);
        const submitted = await readResponseJson<{ prompt_id?: string; node_errors?: JsonRecord }>(submit);
        if (submitted.node_errors && Object.keys(submitted.node_errors).length) {
          throw new Error(`ComfyUI 节点错误：${redactSensitiveText(JSON.stringify(submitted.node_errors), 1200)}`);
        }
        promptId = safeRemoteJobId(submitted.prompt_id || stablePromptId);
      } catch (error) {
        // The remote server can accept the prompt and time out before returning JSON.
        // Reconcile the stable ID before treating it as a failure, otherwise a retry
        // would submit the same shot again.
        const state = await waitForRemotePrompt(baseUrl, stablePromptId, 6, deadline);
        if (state === "present") promptId = stablePromptId;
        else if (state === "unknown") {
          await this.update(context, "waiting_remote", {
            remoteJobId: stablePromptId, progress: 8, submissionState: "unknown",
          }).catch(() => undefined);
          throw new RetryableRemoteStateError("提交结果暂时无法确认，正在继续核对远端任务");
        }
        else throw error;
      }
      await this.update(context, "running", {
        remoteJobId: promptId, progress: 10, submissionState: "accepted",
      });
    }
    while (Date.now() < deadline) {
      const current = (await this.store.getVideoRequests(context.project.id)).find((request) => request.id === context.request.id);
      if (current?.status === "cancelled") throw new CancelledRequestError("视频请求已取消");
      let history: JsonRecord;
      try {
        const historyResponse = await fetchWithSafeRedirects(`${baseUrl}/history/${encodeURIComponent(promptId)}`, { signal: timeoutSignal(deadline, 30_000) });
        if (!historyResponse.ok) {
          if (historyResponse.status >= 500) {
            await historyResponse.body?.cancel().catch(() => undefined);
            await this.update(context, "running", { remoteJobId: promptId });
            await sleep(Math.max(1, context.provider.defaults.pollSeconds) * 1_000);
            continue;
          }
          throw await responseError(historyResponse);
        }
        history = await readResponseJson<JsonRecord>(historyResponse);
      } catch (error) {
        if (!isNetworkTimeout(error)) throw error;
        await this.update(context, "running", { remoteJobId: promptId });
        await sleep(Math.max(1, context.provider.defaults.pollSeconds) * 1_000);
        continue;
      }
      const entry = history[promptId] as JsonRecord | undefined;
      if (entry) {
        const status = entry.status as JsonRecord | undefined;
        if (status?.status_str && status.status_str !== "success") throw new Error(`ComfyUI 运行失败：${redactSensitiveText(JSON.stringify(status), 1000)}`);
        const output = comfyVideoOutput(entry, config.outputNodeId);
        if (!output) throw new Error("ComfyUI 已结束但没有找到视频输出");
        await this.update(context, "downloading", { progress: 92, remoteOutput: "远端结果已就绪" });
        const query = new URLSearchParams({ filename: String(output.filename), type: String(output.type ?? "output") });
        if (output.subfolder) query.set("subfolder", String(output.subfolder));
        const target = path.join(context.runtimeDirectory, "result.mp4");
        await downloadTo(await fetchWithSafeRedirects(`${baseUrl}/view?${query}`, { signal: timeoutSignal(deadline, 600_000) }), target);
        return {
          outputPath: target,
          cleanup: async () => {
            const response = await fetchWithSafeRedirects(`${baseUrl}/history`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ delete: [promptId] }),
              signal: AbortSignal.timeout(30_000),
            });
            await response.body?.cancel().catch(() => undefined);
          },
        };
      }
      const latest = (await this.store.getVideoRequests(context.project.id)).find((request) => request.id === context.request.id);
      await this.update(context, "running", { progress: Math.min(88, (latest?.progress ?? 10) + 2) });
      await sleep(Math.max(1, context.provider.defaults.pollSeconds) * 1_000);
    }
    const finalState = await waitForRemotePrompt(baseUrl, promptId, 2, Date.now() + 30_000);
    if (finalState !== "absent") throw new RetryableRemoteStateError("远端任务仍存在，继续等待完成结果");
    throw new Error("ComfyUI 视频任务超时，且远端队列与历史中已找不到对应任务");
  }

  private async runGenericHttp(context: VideoJobContext): Promise<VideoRunResult> {
    const config = context.provider.http!;
    const snapshot = context.request.snapshot;
    const image = await fs.readFile(context.sourceImagePath);
    // Bind this live execution to one credential revision. A later rotation may
    // affect new or resumed jobs, but this process never mixes a new account's
    // credential into an already accepted remote job.
    const credentialSnapshot = config.auth?.type && config.auth.type !== "none"
      ? await this.store.videoProviders.getCredentialForExecution(
          context.provider.id,
          context.request.providerExecutionFingerprint!,
        )
      : undefined;
    const variables: Record<string, string | number> = {
      image_base64: image.toString("base64"), prompt: snapshot.prompt, negative_prompt: snapshot.negativePrompt,
      duration_seconds: snapshot.durationSeconds, fps: snapshot.frameRate, frame_count: snapshot.frameCount,
      width: snapshot.width, height: snapshot.height, project_id: context.project.id, shot_id: context.shot.id,
      request_id: context.request.id, job_id: context.request.remoteJobId ?? "",
    };
    const target = path.join(context.runtimeDirectory, "result.mp4");
    let payload: JsonRecord = {};
    let jobId = safeRemoteJobId(context.request.remoteJobId ?? "");
    if (!jobId) {
      if (["submitting", "unknown", "accepted"].includes(context.request.submissionState ?? "not-submitted") && !config.idempotencyHeader) {
        const priorDetail = redactSensitiveText(context.request.error ?? "", 800).trim();
        throw new Error(`${priorDetail ? `${priorDetail}；` : ""}上次远端提交结果无法确认，且此连接器未配置幂等请求头；请先在服务商后台核对，系统不会自动重复提交`);
      }
      const headers = authHeaders(config, credentialSnapshot);
      const idempotencyKey = context.request.idempotencyKey || context.request.id;
      if (config.idempotencyHeader) headers.set(config.idempotencyHeader, idempotencyKey);
      await this.update(context, "uploading", { progress: 4 });
      let body: BodyInit;
      const defaultFields = {
        prompt: "{{prompt}}", negative_prompt: "{{negative_prompt}}", duration: "{{duration_seconds}}",
        fps: "{{fps}}", frame_count: "{{frame_count}}", width: "{{width}}", height: "{{height}}",
      };
      if (config.imageMode === "multipart") {
        const form = new FormData();
        form.append(config.imageField || "image", new Blob([image], { type: "image/png" }), `${context.request.id}.png`);
        const rendered = renderTemplate(config.bodyTemplate ?? defaultFields, variables) as JsonRecord;
        for (const [key, value] of Object.entries(rendered)) form.append(key, typeof value === "string" ? value : JSON.stringify(value));
        body = form;
      } else {
        headers.set("content-type", "application/json");
        body = JSON.stringify(renderTemplate(config.bodyTemplate ?? { image: "{{image_base64}}", ...defaultFields }, variables));
      }
      await this.update(context, "submitting", {
        progress: 8, submissionState: "submitting", idempotencyKey,
      });
      let response: Response;
      try {
        response = await fetchWithSafeRedirects(config.submitUrl, { method: config.submitMethod, headers, body, signal: AbortSignal.timeout(120_000) });
      } catch (error) {
        const detail = redactSensitiveText(error instanceof Error ? error.message : String(error), 800).trim();
        await this.update(context, "waiting_remote", {
          progress: 8,
          error: detail,
          submissionState: "unknown",
          idempotencyKey,
        }).catch(() => undefined);
        throw new RetryableRemoteStateError(config.idempotencyHeader
          ? "远端提交结果暂时无法确认；恢复时只会复用原幂等键"
          : "远端提交结果暂时无法确认；已停止自动重复提交");
      }
      if (!response.ok) {
        const failure = await responseError(response);
        if (isDefinitiveSubmitRejection(response.status)) {
          // A conclusive client-side rejection means the provider did not
          // accept paid work. Persist that durable fact so an explicit user
          // retry can safely reset this request to not-submitted.
          await this.update(context, "failed", {
            progress: 8,
            error: failure.message,
            submissionState: "rejected",
          });
          throw failure;
        }
        // Timeouts, conflicts, rate limits, early-data responses, and 5xx
        // replies can all occur after an upstream accepted work. Preserve the
        // ambiguity and let only an idempotent connector replay automatically.
        await this.update(context, "waiting_remote", {
          progress: 8,
          error: failure.message,
          submissionState: "unknown",
          idempotencyKey,
        }).catch(() => undefined);
        throw new RetryableRemoteStateError(config.idempotencyHeader
          ? "远端提交返回不确定状态；恢复时只会复用原幂等键"
          : "远端提交返回不确定状态；已停止自动重复提交");
      }
      if ((response.headers.get("content-type") ?? "").startsWith("video/")) {
        await this.update(context, "downloading", {
          progress: 92, submissionState: "accepted", remoteOutput: "远端结果已就绪",
        });
        await downloadTo(response, target);
        return { outputPath: target };
      }
      payload = await readResponseJson<JsonRecord>(response);
      jobId = safeRemoteJobId(getPath(payload, config.jobIdPath));
      if (jobId) await this.update(context, "running", {
        remoteJobId: jobId, progress: 12, submissionState: "accepted",
      });
      else if (config.mode === "sync") await this.update(context, "running", {
        progress: 12, submissionState: "accepted",
      });
    } else {
      await this.update(context, "running", {
        remoteJobId: jobId,
        progress: Math.max(12, context.request.progress ?? 12),
        submissionState: "accepted",
      });
    }
    if (config.mode === "async") {
      if (!jobId || !config.statusUrlTemplate) throw new Error("异步 HTTP 接口缺少任务 ID 或轮询地址模板");
      const deadline = Date.now() + context.provider.defaults.timeoutMinutes * 60_000;
      let completed = false;
      while (Date.now() < deadline) {
        variables.job_id = jobId;
        const current = (await this.store.getVideoRequests(context.project.id)).find((request) => request.id === context.request.id);
        if (current?.status === "cancelled") throw new CancelledRequestError("视频请求已取消");
        const statusHeaders = authHeaders(config, credentialSnapshot);
        const statusMethod = config.statusMethod ?? "GET";
        const statusInit: RequestInit = { method: statusMethod, headers: statusHeaders, signal: AbortSignal.timeout(30_000) };
        if (statusMethod === "POST") {
          statusHeaders.set("content-type", "application/json");
          statusInit.body = JSON.stringify(renderTemplate(config.statusBodyTemplate ?? {}, variables));
        }
        const statusUrl = renderVideoProviderUrlTemplate(config.statusUrlTemplate, variables);
        const statusResponse = await fetchWithSafeRedirects(statusUrl, statusInit);
        if (!statusResponse.ok) throw await responseError(statusResponse);
        payload = await readResponseJson<JsonRecord>(statusResponse);
        const status = String(getPath(payload, config.statusPath) ?? "");
        const progress = Number(getPath(payload, config.progressPath));
        if (Number.isFinite(progress)) await this.update(context, "running", { progress: Math.max(12, Math.min(90, progress)) });
        else await this.update(context, "running");
        if ((config.failureValues ?? ["failed", "error", "cancelled"]).includes(status)) throw new Error(`HTTP 视频任务失败：${redactSensitiveText(status, 300)}`);
        if ((config.successValues ?? ["success", "completed", "succeeded"]).includes(status)) { completed = true; break; }
        await sleep(Math.max(1, context.provider.defaults.pollSeconds) * 1_000);
      }
      if (!completed) throw new Error(`HTTP 视频任务等待超过 ${context.provider.defaults.timeoutMinutes} 分钟`);
    }
    const rawResult = getPath(payload, config.resultUrlPath);
    const resultUrl = String(Array.isArray(rawResult) ? rawResult[0] ?? "" : rawResult ?? "");
    if (!resultUrl) throw new Error("HTTP 视频接口未返回结果地址");
    await this.update(context, "downloading", { progress: 92, remoteOutput: "远端结果已就绪" });
    await downloadTo(await fetchVideoResult(config, resultUrl, credentialSnapshot), target);
    return { outputPath: target };
  }
}
