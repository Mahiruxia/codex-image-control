import { useEffect, useMemo, useState } from "react";
import { MediaVideo } from "./MediaVideo";
import type { ShotRecord, VideoProviderProfile, VideoProviderSetup, VideoProviderSetupInput, VideoRequest } from "./types";
import { useDialogFocus } from "./useDialogFocus";
import { providerTargetOrigin } from "./videoProviderSecurity";

const VIDEO_STATUS: Record<ShotRecord["videoStatus"], string> = {
  missing_prompt: "缺提示词", ready: "可生成", queued: "排队中", uploading: "上传中", running: "远端生成中",
  downloading: "下载校验中", review: "已完成", accepted: "已完成", failed: "失败",
};

export function VideoInspectorContent({ projectId, shot, request, providers, defaultProviderId, busy, promptPreparing, imageRequestActive, onSavePlan, onPreparePrompt, onStopPromptWait, onGenerate, onRetry, onCancel }: {
  projectId: string; shot: ShotRecord; request?: VideoRequest; providers: VideoProviderProfile[]; defaultProviderId?: string; busy: boolean; promptPreparing: boolean; imageRequestActive: boolean;
  onSavePlan: (input: { prompt: string; negativePrompt: string; frameRate: number; frameCount: number }) => Promise<boolean>;
  onPreparePrompt: () => void; onStopPromptWait: () => void; onGenerate: () => void; onRetry: (requestId: string) => void; onCancel: (requestId: string) => void;
}) {
  const draftKey = `image-control:video-draft:${projectId}:${shot.id}`;
  const restoredDraft = useMemo(() => {
    try {
      const value = window.sessionStorage.getItem(draftKey);
      return value ? JSON.parse(value) as { prompt: string; negativePrompt: string; frameCount: number } : undefined;
    } catch { return undefined; }
  }, [draftKey]);
  const [prompt, setPrompt] = useState(restoredDraft?.prompt ?? shot.videoPlan?.prompt ?? "");
  const [negativePrompt, setNegativePrompt] = useState(restoredDraft?.negativePrompt ?? shot.videoPlan?.negativePrompt ?? "");
  const [frameCount, setFrameCount] = useState(restoredDraft?.frameCount ?? shot.videoPlan?.frameCount ?? 81);
  const [dirty, setDirty] = useState(Boolean(restoredDraft));
  useEffect(() => {
    try {
      if (dirty) window.sessionStorage.setItem(draftKey, JSON.stringify({ prompt, negativePrompt, frameCount }));
      else window.sessionStorage.removeItem(draftKey);
    } catch { /* embedded hosts can disable session storage */ }
  }, [dirty, draftKey, frameCount, negativePrompt, prompt]);
  const active = request && ["queued", "waiting_remote", "uploading", "submitting", "running", "downloading"].includes(request.status);
  const failedBeforeRemoteRun = request?.status === "failed" && (request.progress ?? 0) < 10;
  const displayedStatus = request?.status === "failed" && shot.videoArtifact ? "本次重做失败 · 上一版可用" : failedBeforeRemoteRun ? "尚未提交" : VIDEO_STATUS[shot.videoStatus];
  const activeStatus = request?.status === "waiting_remote" && request.remoteJobId
    ? "正在核对远端任务"
    : request?.status === "waiting_remote"
      ? "远端忙，正在等候"
      : request?.status === "submitting"
        ? "正在提交远端队列"
        : VIDEO_STATUS[shot.videoStatus];
  const provider = providers.find((item) => item.id === (request?.providerId || defaultProviderId));
  const frameRate = 16;
  const duration = frameCount / frameRate;
  const failedRequestMatchesCurrentPlan = Boolean(
    request?.status === "failed"
    && shot.videoPlan
    && request.snapshot.prompt === shot.videoPlan.prompt
    && request.snapshot.negativePrompt === shot.videoPlan.negativePrompt
    && request.snapshot.frameRate === shot.videoPlan.frameRate
    && request.snapshot.frameCount === shot.videoPlan.frameCount
    && request.snapshot.durationSeconds === shot.videoPlan.durationSeconds
    && (!shot.imageSha256 || request.snapshot.sourceImageSha256 === shot.imageSha256),
  );
  const negativePhrase = prompt.match(/禁止|不要|不得|避免|不能|不出现/)?.[0];
  const handlePrimaryAction = async () => {
    if (!prompt.trim()) {
      onPreparePrompt();
      return;
    }
    if (dirty) {
      if (negativePhrase) return;
      const saved = await onSavePlan({ prompt, negativePrompt, frameRate, frameCount });
      if (!saved) return;
      setDirty(false);
      onGenerate();
      return;
    }
    if (failedRequestMatchesCurrentPlan && request) onRetry(request.id);
    else onGenerate();
  };
  const primaryLabel = promptPreparing
    ? "正在准备提示词…"
    : !prompt.trim()
    ? "准备这一镜视频提示词"
    : dirty
      ? shot.videoArtifact || request?.status === "failed" ? "保存新提示词并重新生成" : "保存提示词并生成"
      : failedRequestMatchesCurrentPlan
        ? "只重试这一镜"
        : request?.status === "failed" ? "按当前方案新建任务" : shot.videoArtifact ? "重做这段视频" : "生成这一镜视频";
  return (
    <div className="video-inspector-content">
      <div className="video-status-hero">
        <div><span className="eyebrow">分镜视频</span><strong>{displayedStatus}</strong></div>
        <span>{provider?.name ?? "尚未选择视频模型"}</span>
      </div>
      {restoredDraft && dirty && <div className="draft-restored" role="status">已恢复这镜尚未保存的视频草稿</div>}
      {shot.videoArtifact?.mediaUrl ? (
        <div className="video-preview-shell">
          <MediaVideo src={shot.videoArtifact.mediaUrl} projectId={projectId} mediaPath={shot.videoArtifact.path} version={shot.videoArtifact.requestId} poster={shot.imageUrl} posterPath={shot.imagePath} posterVersion={shot.imageSha256 ?? shot.imagePath} loop />
          <div className="video-preview-meta"><span>{shot.videoArtifact.width}×{shot.videoArtifact.height}</span><span>{shot.videoArtifact.frameRate.toFixed(0)}fps · {shot.videoArtifact.durationSeconds.toFixed(2)}s</span>{shot.videoArtifact.stale && <b>图片或提示词已变化</b>}</div>
        </div>
      ) : (
        <div className="video-empty-state"><span>▶</span><strong>视频会在这里原位预览</strong><p>首帧仍使用当前正式分镜图，生成过程由本地后台继续执行。</p></div>
      )}
      <div className="prompt-order" aria-label="正向提示词书写顺序"><span>初始状态</span><i>→</i><span>唯一主动作</span><i>→</i><span>物理过程</span><i>→</i><span>结束状态</span><i>→</i><span>镜头表现</span></div>
      <label className="prompt-field"><span>正向提示词 <small>{prompt.length} / 12000{dirty ? " · 未保存" : " · 已写入"}</small></span><textarea className="video-prompt" value={prompt} disabled={imageRequestActive || Boolean(active)} onChange={(event) => { setPrompt(event.target.value); setDirty(true); }} placeholder="按上方顺序，只写人物和镜头实际发生的肯定状态" /></label>
      {negativePhrase && <div className="prompt-language-warning" role="alert"><strong>正向提示词中发现“{negativePhrase}”</strong><span>请改写成肯定状态；限制项移到下方负面提示词。</span></div>}
      <label className="prompt-field"><span>独立负面提示词 <small>{negativePrompt.length} / 8000</small></span><textarea className="short" value={negativePrompt} disabled={imageRequestActive || Boolean(active)} onChange={(event) => { setNegativePrompt(event.target.value); setDirty(true); }} placeholder="时序变形、多余肢体、脚底滑移、镜头突变……" /></label>
      <div className="video-duration-picker">
        <span>动作时长（目标约 5 秒）</span>
        {[49, 65, 81, 97, 113].map((count) => <button key={count} aria-pressed={frameCount === count} className={frameCount === count ? "active" : ""} disabled={imageRequestActive || Boolean(active)} onClick={() => { setFrameCount(count); setDirty(true); }}>{count} 帧<small>{(count / frameRate).toFixed(2)}s</small></button>)}
        <div className="fixed-frame-rate"><span>固定帧率</span><strong>16 fps</strong></div>
      </div>
      {dirty && shot.videoArtifact && <div className="video-warning"><strong>保存后现有视频会标记为“旧提示词”</strong><p>旧视频仍保留用于对照；下一次重做会使用当前新方案。</p></div>}
      {imageRequestActive && <div className="video-warning"><strong>图片正在更新</strong><p>新图片写回后再准备或生成视频，确保使用新的正式首帧。</p></div>}
      {shot.videoPlan?.stale && <div className="video-warning"><strong>提示词需要更新</strong><p>当前首帧或分镜动作已经变化。先自动更新，或检查后手动保存这版提示词。</p></div>}
      {promptPreparing && <div className="request-state-card state-queued" role="status"><div><span>等待视频提示词写回</span><strong>完成后这里会自动刷新，不需要重复点击。</strong></div><button type="button" onClick={onStopPromptWait}>不再等待</button></div>}
      <div className="video-plan-actions">
        <button className="quiet-button" onClick={onPreparePrompt} disabled={busy || promptPreparing || !shot.imagePath || imageRequestActive || Boolean(active)}>{promptPreparing ? "正在准备…" : "更新视频提示词"}</button>
        <button className="quiet-button" onClick={() => void onSavePlan({ prompt, negativePrompt, frameRate, frameCount }).then((saved) => saved && setDirty(false))} disabled={busy || !prompt.trim() || !dirty || imageRequestActive || Boolean(active) || Boolean(negativePhrase)}>保存提示词</button>
      </div>
      {request?.status === "failed" && request.error && <div className="video-error"><strong>{shot.videoArtifact ? "本次重做失败，仍可使用上方旧视频" : failedBeforeRemoteRun ? "视频尚未提交" : "视频处理失败"}</strong><p>{request.error}</p></div>}
      {active && <div className="video-progress" role="progressbar" aria-label={`视频${activeStatus}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(request.progress ?? 0)}><div><strong>{activeStatus}</strong><span>{Math.round(request.progress ?? 0)}%</span></div><i><span style={{ width: `${request.progress ?? 0}%` }} /></i>{["queued", "waiting_remote"].includes(request.status) && <button className="text-button" onClick={() => onCancel(request.id)}>取消本地排队</button>}</div>}
      <button className="primary-button wide" onClick={() => void handlePrimaryAction()} disabled={busy || promptPreparing || Boolean(active) || !shot.imagePath || imageRequestActive || Boolean(negativePhrase)} title={negativePhrase ? "请先把正向提示词中的否定式改写为肯定状态" : imageRequestActive ? "图片正在更新，完成后会使用新图片生成视频" : undefined}>
        {primaryLabel}
      </button>
      {shot.videoArtifact && <div className={`video-ready-callout${shot.videoArtifact.stale ? " is-stale" : ""}`}><strong>{shot.videoArtifact.stale ? "当前预览来自旧方案" : "视频已回到画布"}</strong><p>{shot.videoArtifact.stale ? "旧视频保留用于对照；重做时会使用当前正式图片和最新提示词。" : "无需额外审核；可直接播放、全屏查看或用上方按钮重做这一段。"}</p></div>}
      <p className="video-footnote">当前计划：{frameCount} 帧 / {frameRate}fps / {duration.toFixed(2)} 秒。只输出无声 MP4。</p>
    </div>
  );
}

type ProviderDrawerView = "list" | "assist" | "settings";
const PROVIDER_SETUP_DRAFT_KEY = "image-control:video-provider-setup-draft";

interface ProviderSetupDraft {
  description?: string;
  docsUrl?: string;
  baseUrl?: string;
  sampleRequest?: string;
  sampleResponse?: string;
  workflowJson?: string;
  workflowFileName?: string;
}

function readProviderSetupDraft(): ProviderSetupDraft {
  try { return JSON.parse(window.sessionStorage.getItem(PROVIDER_SETUP_DRAFT_KEY) ?? "{}") as ProviderSetupDraft; }
  catch { return {}; }
}

const SETUP_STATUS_COPY: Record<VideoProviderSetup["status"], { label: string; detail: string }> = {
  queued: { label: "已交给 Codex", detail: "正在等待分析接入资料。可以关闭这里，任务仍会继续。" },
  analyzing: { label: "正在分析模型", detail: "Codex 正在识别提交、查询、下载和能力限制。" },
  ready: { label: "配置已生成", detail: "连接器已经保存；服务需要密钥时，再在本机单独填写。" },
  failed: { label: "这次没有配置成功", detail: "资料仍然保留，可以补充后重新提交。" },
  cancelled: { label: "已停止等待", detail: "资料仍然保留，需要时可以修改后重新提交。" },
};

function mayContainCredential(value: string): boolean {
  if (!value) return false;
  const isPlaceholder = (candidate: string) => {
    const normalized = candidate.trim().toLowerCase().replace(/^sk-/, "").replace(/^["']|["']$/g, "");
    return /^(?:your|example|sample|placeholder|redacted|dummy|test)(?:[_-]?(?:api[_-]?key|access[_-]?token|token|key|secret))?$/i.test(normalized)
      || /^(?:x{3,}|\*{3,})$/.test(normalized)
      || /^\{\{[^{}]+\}\}$/.test(normalized)
      || /^<[^<>]+>$/.test(normalized)
      || /^\$\{?[a-z_][a-z0-9_]*\}?$/i.test(normalized)
      || /^%[a-z_][a-z0-9_]*%$/i.test(normalized)
      || /^(?:process\.)?env[.:][a-z_][a-z0-9_]*$/i.test(normalized);
  };
  const candidates: string[] = [];
  const collect = (pattern: RegExp, group = 1) => {
    for (const match of value.matchAll(pattern)) if (match[group]) candidates.push(match[group]);
  };
  collect(/\b(sk-[a-z0-9_-]{10,})\b/gi);
  collect(/\b(?:bearer|basic)\s+([a-z0-9+/._~=-]{8,})\b/gi);
  collect(/(?:api[-_ ]?key|x-api-key|access[-_ ]?token|refresh[-_ ]?token|id[-_ ]?token|authorization|proxy-authorization|client[-_ ]?secret|private[-_ ]?key|password|passwd|secret|cookie|set-cookie|session(?:id)?|x-amz-signature|signature|sig)\s*["']?\s*[:=]\s*["']?([^\s"'&,}]{6,})/gi);
  collect(/[?&](?:api[-_]?key|key|token|access[-_]?token|auth|signature|sig|x-amz-signature)=([^&#\s]{6,})/gi);
  collect(/\b(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[0-9A-Za-z]{20,})\b/g);
  collect(/\b(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{8,})\b/g);
  collect(/^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:([^\s/@]+)@/gim);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(value)) return true;
  return candidates.some((candidate) => !isPlaceholder(candidate));
}

function providerNeedsCredential(provider: VideoProviderProfile): boolean {
  return provider.kind === "generic-http" && Boolean(provider.http?.auth?.type && provider.http.auth.type !== "none");
}

function isRecognizedComfyWorkflow(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.nodes) && record.nodes.length > 0) return true;
  const prompt = record.prompt && typeof record.prompt === "object" && !Array.isArray(record.prompt)
    ? record.prompt as Record<string, unknown>
    : record;
  return Object.values(prompt).some((node) => Boolean(node && typeof node === "object" && !Array.isArray(node) && typeof (node as Record<string, unknown>).class_type === "string"));
}

export function VideoModelsDrawer({ providers, defaultProviderId, setup, busy, codexAvailable, onClose, onCreateSetup, onCancelSetup, onSave, onOpenCredentialWindow, onRemoveCredential, onDelete, onTest, onDefault }: {
  providers: VideoProviderProfile[];
  defaultProviderId?: string;
  setup?: VideoProviderSetup;
  busy: boolean;
  codexAvailable: boolean;
  onClose: () => void;
  onCreateSetup: (input: VideoProviderSetupInput) => Promise<boolean>;
  onCancelSetup: (requestId: string) => Promise<void>;
  onSave: (profile: VideoProviderProfile, workflowJson?: string, secret?: string) => Promise<boolean>;
  onOpenCredentialWindow: (providerId: string) => void;
  onRemoveCredential: (providerId: string) => Promise<boolean>;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  onDefault: (id: string) => void;
}) {
  const initialView: ProviderDrawerView = setup && ["queued", "analyzing", "failed"].includes(setup.status) ? "assist" : "list";
  const restoredSetupDraft = useMemo(readProviderSetupDraft, []);
  const [view, setView] = useState<ProviderDrawerView>(initialView);
  const [startingAnother, setStartingAnother] = useState(false);
  const [repairingProviderId, setRepairingProviderId] = useState<string>();
  const [editing, setEditing] = useState<VideoProviderProfile | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string>();
  const [secret, setSecret] = useState("");
  const [confirmCredentialRemoval, setConfirmCredentialRemoval] = useState(false);
  const [description, setDescription] = useState(setup?.description ?? restoredSetupDraft.description ?? "");
  const [docsUrl, setDocsUrl] = useState(setup?.docsUrl ?? restoredSetupDraft.docsUrl ?? "");
  const [baseUrl, setBaseUrl] = useState(setup?.baseUrl ?? restoredSetupDraft.baseUrl ?? "");
  const [sampleRequest, setSampleRequest] = useState(setup?.sampleRequest ?? setup?.exampleRequest ?? restoredSetupDraft.sampleRequest ?? "");
  const [sampleResponse, setSampleResponse] = useState(setup?.sampleResponse ?? setup?.exampleResponse ?? restoredSetupDraft.sampleResponse ?? "");
  const [setupWorkflowJson, setSetupWorkflowJson] = useState(restoredSetupDraft.workflowJson ?? "");
  const [setupWorkflowName, setSetupWorkflowName] = useState(setup?.workflowFileName ?? (setup?.workflowFile ? setup.workflowFile.split(/[\\/]/).pop() : undefined) ?? restoredSetupDraft.workflowFileName ?? "");
  const [fileError, setFileError] = useState<string>();
  const dialogRef = useDialogFocus<HTMLElement>(onClose, busy);
  const setupActive = setup?.status === "queued" || setup?.status === "analyzing";
  const setupId = setup?.id ?? setup?.requestId;
  const credentialSourceLabels = useMemo(() => [
    ["目标说明", description],
    ["文档链接", docsUrl],
    ["服务地址", baseUrl],
    ["示例请求", sampleRequest],
    ["示例响应", sampleResponse],
    ["工作流 JSON", setupWorkflowJson],
  ].filter((entry): entry is [string, string] => mayContainCredential(entry[1])), [baseUrl, description, docsUrl, sampleRequest, sampleResponse, setupWorkflowJson]);
  const potentialSecret = credentialSourceLabels.length > 0;
  const hasSupportingEvidence = Boolean(
    repairingProviderId
    || docsUrl.trim()
    || setupWorkflowJson.trim()
    || (sampleRequest.trim() && sampleResponse.trim()),
  );

  useEffect(() => {
    if (!setup) return;
    setDescription((current) => current || setup.description || "");
    setDocsUrl((current) => current || setup.docsUrl || "");
    setBaseUrl((current) => current || setup.baseUrl || "");
    setSampleRequest((current) => current || setup.sampleRequest || setup.exampleRequest || "");
    setSampleResponse((current) => current || setup.sampleResponse || setup.exampleResponse || "");
    setSetupWorkflowName((current) => current || setup.workflowFileName || (setup.workflowFile ? setup.workflowFile.split(/[\\/]/).pop() : "") || "");
  }, [setup?.id, setup?.requestId]);

  useEffect(() => {
    if (setup?.status !== "ready") setStartingAnother(false);
  }, [setup?.id, setup?.requestId, setup?.status]);

  useEffect(() => {
    if (setup?.status === "ready" && !startingAnother) {
      try { window.sessionStorage.removeItem(PROVIDER_SETUP_DRAFT_KEY); } catch { /* storage can be unavailable */ }
      return;
    }
    try {
      window.sessionStorage.setItem(PROVIDER_SETUP_DRAFT_KEY, JSON.stringify({ description, docsUrl, baseUrl, sampleRequest, sampleResponse, workflowJson: setupWorkflowJson, workflowFileName: setupWorkflowName } satisfies ProviderSetupDraft));
    } catch { /* very large workflow files can exceed embedded browser storage */ }
  }, [baseUrl, description, docsUrl, sampleRequest, sampleResponse, setup?.status, setupWorkflowJson, setupWorkflowName, startingAnother]);

  const openAssistedSetup = (provider?: VideoProviderProfile) => {
    if (setup?.status === "ready" || provider) {
      setDescription(""); setDocsUrl(""); setBaseUrl(""); setSampleRequest(""); setSampleResponse(""); setSetupWorkflowJson(""); setSetupWorkflowName("");
      setStartingAnother(true);
    }
    setRepairingProviderId(provider?.id);
    if (provider) setDescription(`请修正现有视频模型“${provider.name}”（provider ID：${provider.id}）。当前问题：请在这里补充具体报错或想修改的能力。`);
    setView("assist");
  };

  const resetSettings = () => {
    setEditing(null);
    setSecret("");
    setConfirmCredentialRemoval(false);
    setView("list");
  };

  const submitSetup = async () => {
    if (!description.trim() || setupActive) return;
    const saved = await onCreateSetup({
      description: description.trim(),
      docsUrl: docsUrl.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      sampleRequest: sampleRequest.trim() || undefined,
      sampleResponse: sampleResponse.trim() || undefined,
      workflowJson: setupWorkflowJson || undefined,
      workflowFileName: setupWorkflowName || undefined,
    });
    if (saved) setFileError(undefined);
  };

  const readSetupWorkflow = async (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setFileError("工作流文件不能超过 8MB");
      return;
    }
    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as unknown;
      if (!isRecognizedComfyWorkflow(parsed)) {
        setFileError("这个 JSON 不像 ComfyUI 工作流：应包含 UI 工作流的 nodes[]，或 API Prompt 中带 class_type 的节点");
        return;
      }
      setSetupWorkflowJson(content);
      setSetupWorkflowName(file.name);
      setFileError(undefined);
    } catch {
      setFileError("请选择有效的 ComfyUI JSON 工作流");
    }
  };

  const saveLocalSettings = async () => {
    if (!editing) return;
    const current = providers.find((provider) => provider.id === editing.id);
    if (!current) return;
    const saved = await onSave({ ...current, enabled: editing.enabled }, undefined, secret || undefined);
    if (saved) resetSettings();
  };

  return (
    <div className="drawer-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <aside ref={dialogRef} className="provider-drawer provider-models-drawer" role="dialog" aria-modal="true" aria-labelledby="provider-title" tabIndex={-1}>
        <header>
          <div><span className="eyebrow">连接器和密钥只保存在这台电脑</span><h2 id="provider-title">视频模型</h2><p>连接器只由 Codex 创建或修正；这里不会让你手动填写容易出错的接口字段。</p></div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="关闭视频模型设置">×</button>
        </header>

        {view === "list" && <>
          <button className="codex-provider-entry" type="button" onClick={() => openAssistedSetup()} disabled={!codexAvailable} aria-describedby={!codexAvailable ? "codex-provider-unavailable" : undefined}>
            <span className="codex-provider-mark" aria-hidden="true">✦</span>
            <span><strong>让 Codex 帮我接入 / 修正</strong><small>提供模型名称、官方资料或 ComfyUI 工作流，Codex 会检查并保存完整连接器</small></span>
            <b aria-hidden="true">→</b>
          </button>
          {!codexAvailable && <p id="codex-provider-unavailable" className="provider-host-note">当前窗口不能调用 Codex。请在 Codex 桌面端打开这个插件后再接入；这里不提供手动替代入口，以免把提交、轮询或下载字段配错。</p>}
          {setup?.status === "ready" && <div className="provider-ready-banner" role="status"><span>✓</span><div><strong>上次连接器已由 Codex 保存</strong><p>“{setup.description}”已接入。服务需要密钥时，只需在对应模型的“本机设置”中填写。</p></div></div>}
          <div className="provider-section-heading"><div><span>已连接</span><strong>{providers.length} 个本机模型</strong></div></div>
          <div className="provider-list">
            {providers.map((provider) => <article key={provider.id}>
              <div><span className={`provider-kind kind-${provider.kind}`}>{provider.kind === "comfyui-workflow" ? "ComfyUI" : "HTTP"}</span>{defaultProviderId === provider.id && <b>默认</b>}</div>
              <h3>{provider.name}</h3>
              <p>{provider.enabled ? "已启用" : "已停用"} · {providerNeedsCredential(provider) ? provider.hasCredential ? "密钥已在本机配置" : "等待本机填写密钥" : "无需密钥"}</p>
              <p><strong>网络目标：</strong>{providerTargetOrigin(provider)}</p>
              <button className="provider-repair-action" type="button" onClick={() => openAssistedSetup(provider)} disabled={busy || !codexAvailable}>让 Codex 修正这个连接器</button>
              {confirmDeleteId === provider.id ? <div className="provider-delete-confirm"><span>同时删除本机连接器、工作流和凭据？</span><button onClick={() => { onDelete(provider.id); setConfirmDeleteId(undefined); }} disabled={busy}>确认删除</button><button onClick={() => setConfirmDeleteId(undefined)} disabled={busy}>取消</button></div> : <footer><button onClick={() => onTest(provider.id)} disabled={busy}>手动测试</button><button onClick={() => onDefault(provider.id)} disabled={busy || defaultProviderId === provider.id}>设为默认</button><button onClick={() => { setEditing(structuredClone(provider)); setSecret(""); setConfirmCredentialRemoval(false); setView("settings"); }} disabled={busy}>本机设置</button><button className="danger-text" onClick={() => setConfirmDeleteId(provider.id)} disabled={busy}>删除</button></footer>}
            </article>)}
            {!providers.length && <div className="provider-empty"><strong>还没有视频模型</strong><p>点击上方“让 Codex 帮我接入”，按三步提供模型目标与脱敏资料。连接器字段会由 Codex 识别和校验。</p></div>}
          </div>
          <button className="text-button danger-text" type="button" disabled={busy} onClick={() => onOpenCredentialWindow("__all_credentials__")}>彻底清除本插件保存的全部密钥</button>
        </>}

        {view === "assist" && <section className="provider-setup-wizard">
          <button className="text-button back" onClick={() => setView("list")}>← 返回视频模型</button>
          <div className="provider-setup-intro"><span className="codex-provider-mark" aria-hidden="true">✦</span><div><strong>让 Codex 帮你接入或修正视频模型</strong><p>按下面三步填写。你只提供目标与证据资料，接口映射、校验和保存交给 Codex。</p></div></div>
          <ol className="provider-setup-steps" aria-label="接入步骤">
            <li className="active"><span>1</span><div><strong>说明目标</strong><small>模型、用途、能力</small></div></li>
            <li className="active"><span>2</span><div><strong>提供资料</strong><small>文档或工作流</small></div></li>
            <li><span>3</span><div><strong>Codex 校验</strong><small>保存后本机填密钥</small></div></li>
          </ol>
          {setup && !(setup.status === "ready" && startingAnother) && <div className={`provider-setup-status status-${setup.status}`} role="status" aria-live="polite"><i aria-hidden="true" /><div><strong>{SETUP_STATUS_COPY[setup.status].label}</strong><p>{setup.error || SETUP_STATUS_COPY[setup.status].detail}</p></div>{setupActive && setupId && <button className="text-button" type="button" disabled={busy} onClick={() => void onCancelSetup(setupId)}>停止等待</button>}</div>}
          {setup?.status === "ready" && !startingAnother ? <div className="provider-setup-complete"><span aria-hidden="true">✓</span><strong>连接器已由 Codex 校验并保存</strong><p>这一步没有读取 API Key，也没有测试连接或发起付费生成。服务需要密钥时，返回列表点击“本机设置”添加；之后由你主动点击“手动测试”验证。</p><button className="primary-button wide" type="button" onClick={() => setView("list")}>返回模型列表</button></div> : <>
            <section className="provider-setup-section" aria-labelledby="provider-step-one">
              <div className="provider-step-heading"><span>1</span><div><strong id="provider-step-one">用大白话说明目标</strong><p>请写模型或平台的准确名称、图生视频用途，以及必须支持的输入和输出。修正已有模型时，再写模型卡名称和当前报错。</p></div></div>
              <label className="provider-description-field">模型与需求<textarea autoFocus value={description} disabled={setupActive || busy} onChange={(event) => setDescription(event.target.value)} placeholder="例如：帮我接入 XX 平台的 YY 图生视频模型。需要上传真实首帧，传入正向/负面提示词、16fps 和帧数，输出竖屏 MP4。若任务异步，请自动查询状态并下载结果。" /><small>可以粘贴：模型名、用途、功能要求、错误现象。不要粘贴：API Key、Token、Cookie、账号密码或带签名的私有下载链接。</small></label>
            </section>
            <section className="provider-setup-section" aria-labelledby="provider-step-two">
              <div className="provider-step-heading"><span>2</span><div><strong id="provider-step-two">提供能证明接口结构的资料</strong><p>二选一即可；资料越完整，Codex 越能准确识别提交、查询、下载和参数映射。</p></div></div>
              <div className="provider-source-guide">
                <article><strong>官方 API</strong><p>优先给官方文档链接；最好能看到提交任务、查询状态、下载结果、鉴权方式、首帧/提示词/帧数参数和错误码。</p></article>
                <article><strong>ComfyUI</strong><p>填写服务器地址，并上传可用于 API 调用的工作流 JSON；同时在第 1 步说明依赖的自定义节点、模型及需要替换的图片、提示词、尺寸和帧数字段。</p></article>
              </div>
              <div className="provider-simple-fields"><label>官方文档链接 <em>官方 API 推荐</em><input type="url" value={docsUrl} disabled={setupActive || busy} onChange={(event) => setDocsUrl(event.target.value)} placeholder="https://docs.example.com/video" /></label><label>服务根地址 <em>ComfyUI 必填 / API 选填</em><input type="url" value={baseUrl} disabled={setupActive || busy} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com" /></label></div>
              <label className={`provider-workflow-drop${setupWorkflowName ? " has-file" : ""}`}><input type="file" accept=".json,application/json" disabled={setupActive || busy} onChange={(event) => { void readSetupWorkflow(event.target.files?.[0]); event.currentTarget.value = ""; }} /><span aria-hidden="true">⇧</span><strong>{setupWorkflowName || "上传 ComfyUI API 工作流 JSON"}</strong><small>{setupWorkflowName ? "已读取；重新选择可替换。文件只用于分析，不会在此运行" : "ComfyUI 接入时上传；官方 API 接入可跳过。最大 8MB"}</small></label>
              {fileError && <p className="provider-inline-error" role="alert">{fileError}</p>}
              <details className="provider-advanced-samples"><summary>补充脱敏的示例请求与响应（资料不完整时推荐）</summary><p>从服务商文档复制即可。请保留字段名、状态值和结果地址结构，把真实密钥替换成 YOUR_API_KEY，把真实图片或任务 ID 换成占位符。</p><label>示例请求<textarea value={sampleRequest} disabled={setupActive || busy} onChange={(event) => setSampleRequest(event.target.value)} placeholder={'例如：POST /v1/videos\nAuthorization: Bearer YOUR_API_KEY\n{ "image": "IMAGE_PLACEHOLDER", "prompt": "..." }'} /></label><label>示例响应 / 查询结果<textarea value={sampleResponse} disabled={setupActive || busy} onChange={(event) => setSampleResponse(event.target.value)} placeholder={'例如：{ "id": "TASK_ID", "status": "queued", "result": { "url": "VIDEO_URL" } }'} /></label></details>
            </section>
            <section className="provider-setup-section provider-validation-section" aria-labelledby="provider-step-three">
              <div className="provider-step-heading"><span>3</span><div><strong id="provider-step-three">交给 Codex 校验并安全保存</strong><p>提交后 Codex 会判断接口类型，检查地址与工作流，映射提交/轮询/下载字段，并保存声明式连接器。</p></div></div>
              <ul><li>只导入你信任的官方或自建服务资料；连接器获准访问其中填写的本机、局域网或公网地址。</li><li>只分析你提供的公开或脱敏资料，不执行工作流，也不运行资料中的代码。</li><li>API Key 仍由你在“本机设置”单独填写，不会写进连接器或发送给 Codex。</li><li>接入完成不会自动测试、不会提交远端任务、不会产生计费；测试连接和正式生成都必须由你主动点击。</li></ul>
            </section>
            <div className="provider-privacy-note"><span aria-hidden="true">⌁</span><p><strong>提交前最后检查</strong>至少写清模型目标，并提供官方文档或 ComfyUI 工作流中的一种；所有密钥都应替换为 YOUR_API_KEY 等占位符。</p></div>
            {!hasSupportingEvidence && description.trim() && <p className="provider-credential-warning provider-evidence-warning" role="alert"><strong>还缺一份可核对的接口资料</strong><span>请填写官方文档链接、上传 ComfyUI API 工作流，或同时补充一组脱敏的示例请求与响应。</span></p>}
            {potentialSecret && <p className="provider-credential-warning" role="alert"><strong>在{credentialSourceLabels.join("、")}中发现疑似密钥，暂未发送</strong><span>请移除真实 API Key / Token，改成 YOUR_API_KEY 等占位符后再提交。</span></p>}
            {!codexAvailable && <p className="provider-credential-warning" role="alert"><strong>请在 Codex 桌面端继续</strong><span>当前窗口不能登记自动接入任务，也不会显示手动配置入口。请在 Codex 中打开这个插件后提交上述资料。</span></p>}
            <button className="primary-button wide provider-setup-submit" type="button" disabled={busy || setupActive || !codexAvailable || !description.trim() || !hasSupportingEvidence || potentialSecret} onClick={() => void submitSetup()}>{busy ? "正在登记…" : setup?.status === "failed" || setup?.status === "cancelled" ? "补充资料并重新交给 Codex" : "交给 Codex 检查并保存连接器"}</button>
          </>}
        </section>}

        {view === "settings" && editing && <div className="provider-editor provider-local-settings">
          <button className="text-button back" onClick={resetSettings}>← 返回视频模型</button>
          <div className="provider-settings-heading"><span>本机安全设置</span><strong>{editing.name}</strong><p>网络目标：{providerTargetOrigin(editing)}</p><p>连接器类型、地址、工作流和请求映射由 Codex 管理，这里只处理这台电脑上的启用状态与密钥。</p></div>
          <div className="provider-locked-fields"><span aria-hidden="true">⌁</span><p><strong>连接器字段已锁定</strong>需要修改接口地址、工作流、模型参数或轮询/下载规则时，请返回并选择“让 Codex 帮我接入 / 修正”。</p></div>
          {providerNeedsCredential(editing) ? codexAvailable
            ? <div className="provider-no-credential"><strong>密钥在独立本机窗口中处理</strong><span>嵌入式工作台不会接收或转交密钥。服务地址、认证方式或授权域变化后，旧密钥会自动失效。</span><button type="button" disabled={busy} onClick={() => onOpenCredentialWindow(editing.id)}>打开本机安全窗口</button></div>
            : <label>API Key / Token<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="new-password" placeholder={editing.hasCredential ? "安全范围未变时可留空" : "只保存到 Windows 凭据库"} /><small>输入内容只交给本机凭据库；服务地址、认证方式或授权域变化后，旧密钥会自动失效并要求重新输入。</small></label>
            : <div className="provider-no-credential"><strong>此连接器不需要密钥</strong><span>连接测试与正式生成不会读取 Windows 凭据库。</span></div>}
          {!codexAvailable && editing.hasCredential && <div className="provider-credential-actions">{confirmCredentialRemoval ? <><span>确认移除这台电脑中保存的密钥？移除后模型可能无法连接。</span><button className="danger-text" type="button" disabled={busy} onClick={() => void onRemoveCredential(editing.id).then((removed) => { if (removed) { setEditing({ ...editing, hasCredential: false }); setConfirmCredentialRemoval(false); } })}>确认移除</button><button type="button" disabled={busy} onClick={() => setConfirmCredentialRemoval(false)}>保留</button></> : <button className="text-button danger-text" type="button" disabled={busy} onClick={() => setConfirmCredentialRemoval(true)}>移除已保存的密钥</button>}</div>}
          <label className="enable-row"><input type="checkbox" checked={editing.enabled} onChange={(event) => setEditing({ ...editing, enabled: event.target.checked })} />启用这个模型</label>
          <div className="provider-settings-actions"><button type="button" disabled={busy} onClick={() => onTest(editing.id)}>手动测试连接</button><button type="button" disabled={busy || defaultProviderId === editing.id} onClick={() => onDefault(editing.id)}>设为默认</button></div>
          <p className="provider-explicit-action-note">保存设置不会测试接口，也不会发起远端或付费生成。测试和生成都需要你之后主动点击。</p>
          <button className="primary-button wide" disabled={busy} onClick={() => void saveLocalSettings()}>{busy ? "正在保存…" : "只保存本机设置"}</button>
        </div>}
      </aside>
    </div>
  );
}
