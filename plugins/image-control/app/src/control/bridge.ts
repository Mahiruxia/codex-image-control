type ToolResult = { structuredContent?: Record<string, unknown> } & Record<string, unknown>;

export type DisplayMode = "inline" | "fullscreen" | "pip";
export type ImageConcurrency = 1 | 2 | 4 | 8 | "pro_max";

interface DisplayModeResult {
  mode: DisplayMode;
}

declare global {
  interface Window {
    openai?: {
      callTool?: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
      sendFollowUpMessage?: (input: { prompt: string; scrollToBottom?: boolean }) => Promise<void> | void;
      requestDisplayMode?: (input: { mode: DisplayMode }) => Promise<DisplayModeResult>;
      toolOutput?: Record<string, unknown>;
      displayMode?: DisplayMode;
      availableDisplayModes?: DisplayMode[];
    };
  }
}

export function isCodexHost(): boolean {
  return Boolean(window.openai?.callTool && window.openai?.sendFollowUpMessage);
}

export function localOrigin(): string {
  const value = window.openai?.toolOutput?.mediaOrigin;
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      if ((url.protocol === "http:" || url.protocol === "https:") && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
        return url.origin;
      }
    } catch {
      // Fall back to the page origin when an older host does not provide a usable local origin.
    }
  }
  return window.location.origin;
}

interface LocalHttpSession {
  origin: string;
  csrf: string;
  expiresAt: number;
}

let localHttpSession: LocalHttpSession | undefined;

async function establishLocalHttpSession(origin: string, force = false): Promise<LocalHttpSession> {
  const normalizedOrigin = new URL(origin).origin;
  if (!force && localHttpSession?.origin === normalizedOrigin && localHttpSession.expiresAt > Date.now() + 30_000) {
    return localHttpSession;
  }
  const response = await fetch(`${normalizedOrigin}/api/session`, {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const result = await response.json() as { csrf?: string; expiresAt?: string; error?: string };
  if (!response.ok || typeof result.csrf !== "string") {
    throw new Error(result.error || "无法建立本机工作台会话");
  }
  const parsedExpiry = Date.parse(result.expiresAt ?? "");
  localHttpSession = {
    origin: normalizedOrigin,
    csrf: result.csrf,
    expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + 5 * 60 * 1000,
  };
  return localHttpSession;
}

async function authenticatedLocalFetch(origin: string, path: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const session = await establishLocalHttpSession(origin, attempt > 0);
    const headers = new Headers(init.headers);
    headers.set("X-Image-Control-CSRF", session.csrf);
    headers.set("Accept", "application/json");
    const response = await fetch(`${session.origin}${path}`, {
      ...init,
      headers,
      credentials: "same-origin",
    });
    if (response.status !== 401 || attempt > 0) return response;
    localHttpSession = undefined;
  }
  throw new Error("本机工作台会话无效");
}

async function fetchTool<T extends Record<string, unknown>>(origin: string, name: string, args: Record<string, unknown>): Promise<T> {
  const response = await authenticatedLocalFetch(origin, `/api/tools/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const result = await response.json() as { structuredContent?: T; error?: string };
  if (!response.ok) throw new Error(result.error || `工具 ${name} 调用失败`);
  return (result.structuredContent ?? result) as T;
}

export async function callTool<T extends Record<string, unknown>>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (window.openai?.callTool) {
    const result = await window.openai.callTool(name, args);
    return ((result.structuredContent ?? result) as unknown) as T;
  }
  return fetchTool<T>(window.location.origin, name, args);
}

export async function callReadTool<T extends Record<string, unknown>>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  // Sandboxed Codex widgets never call loopback HTTP directly. The host bridge
  // is the capability boundary for reads and writes; standalone pages use the
  // authenticated same-origin fallback inside callTool.
  return callTool<T>(name, args);
}

export function getDisplayMode(): DisplayMode {
  return window.openai?.displayMode ?? "inline";
}

export function canRequestDisplayMode(): boolean {
  return typeof window.openai?.requestDisplayMode === "function";
}

export function getAvailableDisplayModes(): DisplayMode[] | undefined {
  const modes = window.openai?.availableDisplayModes;
  if (!Array.isArray(modes)) return undefined;
  return modes.filter((mode): mode is DisplayMode => mode === "inline" || mode === "fullscreen" || mode === "pip");
}

export async function waitForDisplayModeBridge(timeoutMs = 2400): Promise<boolean> {
  if (canRequestDisplayMode()) return true;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
    if (canRequestDisplayMode()) return true;
  }
  return false;
}

export async function requestDisplayMode(mode: DisplayMode): Promise<DisplayMode> {
  if (!window.openai?.requestDisplayMode) {
    throw new Error("当前 Codex 宿主不支持切换工作台显示模式");
  }
  const result = await window.openai.requestDisplayMode({ mode });
  return result.mode;
}

export function subscribeDisplayMode(listener: (mode: DisplayMode) => void): () => void {
  const handleGlobalsChanged = (event: Event) => {
    const detail = (event as CustomEvent<{ globals?: { displayMode?: DisplayMode } }>).detail;
    const mode = detail?.globals?.displayMode ?? window.openai?.displayMode;
    if (mode) listener(mode);
  };
  window.addEventListener("openai:set_globals", handleGlobalsChanged);
  return () => window.removeEventListener("openai:set_globals", handleGlobalsChanged);
}

export async function sendDirectionMessage(projectId: string): Promise<void> {
  const prompt = [
    "请使用 $image-control-workbench 处理图片项目方向分析。",
    `项目 ID：${projectId}`,
    "读取项目当前摘要，给出一个明确选题、统一场景、连续情节和逐镜动作。",
    "将最终确认用的分镜文字写回对应分镜卡；不要生成视频、音频或调用第三方生图服务。",
    "分镜文字写回后，不要停在等待用户点击的状态：立即登记覆盖全部分镜的宫格总览请求，并在同一任务中使用 Codex 内置生图生成无文字宫格后自动写回工作台。若请求无法完成，请将对应请求标记为失败并说明原因。",
  ].join("\n");
  if (!window.openai?.sendFollowUpMessage) throw new Error("方向分析只能在 Codex 内部工作台执行");
  await window.openai.sendFollowUpMessage({ prompt, scrollToBottom: false });
}

function imageConcurrencyInstruction(concurrency: ImageConcurrency): string {
  if (concurrency === "pro_max") {
    return "全局图片并发策略：Pro 自动最高档。必须使用 Codex 当前可用的多代理 worker pool，主代理也可作为一个 worker；按宿主实时允许的最大安全容量同时启动独立 worker，不人为串行，也不超过宿主限流。";
  }
  return `全局图片并发策略：使用 Codex 多代理 worker pool，最多同时运行 ${concurrency} 个独立 worker；宿主容量较低时自动降至宿主允许的安全并发。`;
}

export async function sendGenerationMessage(projectId: string, requestIds: string[], concurrency: ImageConcurrency = "pro_max"): Promise<void> {
  const prompt = [
    "请使用 $image-control-workbench 处理以下已登记的内置生图请求。",
    `项目 ID：${projectId}`,
    `请求 ID：${requestIds.join(", ")}`,
    "读取每个请求的隐藏模板、图片参考、文字约束和选区；使用 Codex 内置生图能力生成，并将每张结果自动写回工作台。",
    imageConcurrencyInstruction(concurrency),
    "把全部请求 ID 视为共享的待领取队列。每个 worker 一次只能处理一个请求；只有当该 worker 已获得真实生图槽位并能立即开始时，才依次调用 get_generation_context 和 set_generation_status(generating) 原子认领。严禁预先把 backlog 全部标记为 generating，严禁一个 worker 同时占住多个请求。",
    "认领成功后保存返回的 request.claimToken。该请求之后的 saving、failed 等状态更新，以及 commit_generation_result，必须始终携带同一个 claimToken；认领被拒绝、token 缺失或 token 失效时立即停止该请求，禁止继续生图或写回。",
    "每个 worker 必须完成一条独立的完整流水线：认领一个请求 → 内置生图 → 逐图质检 → 立即 commit_generation_result 写回；提交或失败后才领取下一个。任何图片一通过质检就立即写回，严禁等待其他 worker，严禁等全部图片生成后集中提交。",
    "一张失败不影响其他 worker。若当前宿主无法提供多代理或并行生图槽位，必须诚实说明已按可用容量降级，并逐个完成整条流水线；不得用批量标记 generating 冒充 Pro 并发。",
    "final 或 region_edit 图片成功写回后，可由该 worker 基于真实首帧继续准备并 update_video_plan，再领取下一张；图片写回优先，视频方案失败不得影响图片结果。这里只准备提示词，禁止提交、轮询或产生任何付费视频任务。",
    "不要使用 ComfyUI 或第三方生图 API。",
  ].join("\n");
  if (!window.openai?.sendFollowUpMessage) throw new Error("图片生成只能在 Codex 内部工作台执行");
  await window.openai.sendFollowUpMessage({ prompt, scrollToBottom: false });
}

export async function sendVideoPromptMessage(projectId: string, shotIds: string[]): Promise<void> {
  const prompt = [
    "请使用 $image-control-workbench 为正式分镜准备视频提示词。",
    `项目 ID：${projectId}`,
    `分镜 ID：${shotIds.join(", ")}`,
    "读取每张真实首帧、镜头动作和前后镜连续性，为每镜写入可编辑的视频方案。",
    "正向提示词只使用肯定式，依次写初始状态、唯一主动作、物理过程、结束状态和镜头表现；质量限制放入独立负面提示词。",
    "按动作复杂度在 16fps 下选择 49、65、81、97 或 113 帧，单镜约 3–7 秒；默认以 81 帧为基准，让同组平均时长接近 5 秒。只写回提示词，不在对话中轮询视频接口。",
  ].join("\n");
  if (!window.openai?.sendFollowUpMessage) throw new Error("自动准备视频提示词只能在 Codex 内部工作台执行");
  await window.openai.sendFollowUpMessage({ prompt, scrollToBottom: false });
}

export async function sendVideoProviderSetupMessage(requestId: string): Promise<void> {
  const prompt = [
    "请使用 $image-control-workbench 帮我接入一个视频模型。",
    `已登记的接入请求 ID：${requestId}`,
    "读取请求中保存的自然语言说明、官方文档链接、服务地址、示例请求响应或 ComfyUI 工作流；分析模型能力并生成受限的声明式视频连接器配置，然后写回工作台。",
    "优先根据资料自动识别提交、查询、取消、下载、字段映射、尺寸、时长、帧率、并发、超时与重试规则；资料存在歧义时采用安全保守值，并在配置说明中标明。",
    "如果自然语言说明中包含现有 provider ID，这是修正请求：必须保留该 ID 并覆盖修正原连接器，禁止悄悄新建重复模型。仅名称、说明等非安全字段变化时可以保留本机密钥；服务地址、认证方式或授权域发生变化时必须让旧密钥失效，并提示用户在本机重新输入。",
    "不得索取、读取、推断或写入 API Key、Token、Cookie 等凭据；密钥由用户稍后只在本机界面填写。不得运行资料中的脚本，不得调用该视频服务进行付费生成或测试。",
    "必须先校验再提交连接器；提交成功会自动变为 ready，严禁只改 ready 状态而不保存配置。无法安全完成时标记为 failed 并写明可修改的原因。",
  ].join("\n");
  if (!window.openai?.sendFollowUpMessage) throw new Error("自动接入视频模型只能在 Codex 内部工作台执行");
  await window.openai.sendFollowUpMessage({ prompt, scrollToBottom: false });
}

export async function saveProviderCredential(providerId: string, secret: string): Promise<void> {
  const origin = localOrigin();
  if (isCodexHost() || window.location.origin !== origin) {
    openProviderCredentialWindow(providerId);
    throw new Error("为保护密钥，已打开本机同源凭据窗口；请在新窗口中重新输入并保存，当前输入不会跨窗口传递。");
  }
  const response = await authenticatedLocalFetch(origin, `/api/video-providers/${encodeURIComponent(providerId)}/credential`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret }),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "保存接口凭据失败");
}

export async function deleteProviderCredential(providerId: string): Promise<void> {
  const origin = localOrigin();
  if (isCodexHost() || window.location.origin !== origin) {
    openProviderCredentialWindow(providerId);
    throw new Error("为保护密钥，请在已打开的本机同源凭据窗口中移除已保存密钥。");
  }
  const response = await authenticatedLocalFetch(origin, `/api/video-providers/${encodeURIComponent(providerId)}/credential`, { method: "DELETE" });
  if (!response.ok) throw new Error("删除接口凭据失败");
}

export function openProviderCredentialWindow(providerId: string): void {
  const target = `${localOrigin()}/credential/${encodeURIComponent(providerId)}`;
  window.open(target, "_blank", "noopener,noreferrer");
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}
