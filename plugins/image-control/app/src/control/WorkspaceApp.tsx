import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasBoard } from "./CanvasBoard";
import { ImageGenerationModal } from "./ImageGenerationModal";
import { MediaImage } from "./MediaImage";
import { RegionEditor } from "./RegionEditor";
import { SingleImageEditor } from "./SingleImageEditor";
import { WholeImageEditModal } from "./WholeImageEditModal";
import { useDialogFocus } from "./useDialogFocus";
import {
  callReadTool,
  callTool,
  canRequestDisplayMode,
  deleteProviderCredential,
  fileToDataUrl,
  getAvailableDisplayModes,
  getDisplayMode,
  type ImageConcurrency,
  isCodexHost,
  openProviderCredentialWindow,
  requestDisplayMode,
  saveProviderCredential,
  sendDirectionMessage,
  sendGenerationMessage,
  sendVideoProviderSetupMessage,
  sendVideoPromptMessage,
  subscribeDisplayMode,
  waitForDisplayModeBridge,
} from "./bridge";
import { VideoInspectorContent, VideoModelsDrawer } from "./VideoPanel";
import { providerRequiresExternalConfirmation, providerTargetOrigin } from "./videoProviderSecurity";
import type { DisplayMode } from "./bridge";
import type {
  AspectRatio,
  CanvasNote,
  GenerationKind,
  GenerationRequest,
  Point,
  ProjectRecord,
  ProjectStage,
  ProjectSummary,
  ReferenceSlot,
  ShotRecord,
  TemplateId,
  VideoProviderProfile,
  VideoProviderSetup,
  VideoProviderSetupInput,
  VideoRequest,
  Viewport,
} from "./types";

type WorkspaceMode = "image" | "video";
type WorkflowPhase = ProjectStage;
type WorkspaceSurfaceSupport = "unknown" | "sidebar" | "fullscreen" | "inline-only";
const STAGES: Array<{ id: WorkflowPhase; label: string; index: string }> = [
  { id: "direction", label: "方向", index: "01" },
  { id: "storyboard", label: "宫格", index: "02" },
  { id: "production", label: "图片与视频", index: "03" },
  { id: "complete", label: "完成", index: "04" },
];

const REFERENCE_LABELS: Array<{ slot: ReferenceSlot; label: string; example: string }> = [
  { slot: "face", label: "主体身份", example: "描述主角最稳定、最容易辨认的脸部或头部特征；动物可写毛色、耳形和眼睛特征。" },
  { slot: "body", label: "主体全貌", example: "描述主角的体型、比例、姿态与四肢特征，确保每个镜头保持同一主体。" },
  { slot: "outfit", label: "造型 / 商品", example: "描述需要固定的服装、配饰、商品外观、颜色、结构和数量。" },
  { slot: "environment", label: "场景参考", example: "描述统一地点、光线、材质、陈设与需要贯穿整组的空间关系。" },
  { slot: "identitySupport", label: "补充参考", example: "补充需要持续保持一致、但不属于以上分类的视觉特征。" },
];

const REFERENCE_LABEL_MAP = Object.fromEntries(REFERENCE_LABELS.map((item) => [item.slot, item.label])) as Record<ReferenceSlot, string>;

function referenceDefinitions(_templateId: TemplateId) {
  return REFERENCE_LABELS;
}

function referenceLabel(templateId: TemplateId, slot: ReferenceSlot) {
  return referenceDefinitions(templateId).find((item) => item.slot === slot)?.label ?? REFERENCE_LABEL_MAP[slot];
}

const AUTO_CONTACT_AFTER_DIRECTION_KEY = "image-control:auto-contact-after-direction";
const ROLLING_VIDEO_INTENT_KEY = "image-control:rolling-video-intents:v1";
const WORKSPACE_PREFERENCES_KEY = "image-control:workspace-preferences:v2";
const VIDEO_PROVIDER_SETUP_KEY = "image-control:last-video-provider-setup";
const ACTIVE_IMAGE_STATUSES = new Set(["queued", "generating", "saving"]);
const ACTIVE_VIDEO_STATUSES = new Set(["queued", "waiting_remote", "uploading", "submitting", "running", "downloading"]);
const LEGACY_GENERATION_STALL_MS = 15 * 60 * 1000;
const VIDEO_PROMPT_TIMEOUT_MS = 10 * 60 * 1000;
const EMPTY_VIDEO_PROMPT_PENDING = new Map<string, string | undefined>();

function isContactSheetKind(kind: GenerationKind): boolean {
  return kind === "contact_sheet" || kind === "contact_sheet_edit";
}

function hasActiveImageRequest(project: ProjectRecord, shotId: string): boolean {
  return project.generationRequests.some((request) => !isContactSheetKind(request.kind) && request.shotIds.includes(shotId) && ACTIVE_IMAGE_STATUSES.has(request.status));
}

function hasActiveVideoRequest(project: ProjectRecord, shotId: string): boolean {
  return project.videoRequests.some((request) => request.shotId === shotId && ACTIVE_VIDEO_STATUSES.has(request.status));
}

function isRecoverableGenerationRequest(request: GenerationRequest, now = Date.now()): boolean {
  if (!["generating", "saving"].includes(request.status)) return false;
  if (request.leaseExpiresAt) return new Date(request.leaseExpiresAt).getTime() <= now;
  return now - new Date(request.updatedAt).getTime() >= LEGACY_GENERATION_STALL_MS;
}

function detectWorkspaceSurfaceSupport(): WorkspaceSurfaceSupport {
  const currentMode = getDisplayMode();
  if (currentMode === "pip") return "sidebar";
  if (currentMode === "fullscreen") return "fullscreen";
  const availableModes = getAvailableDisplayModes();
  if (!availableModes) return "unknown";
  if (availableModes.includes("pip")) return "sidebar";
  if (availableModes.includes("fullscreen")) return "fullscreen";
  return "inline-only";
}

interface WorkspacePreferences {
  activeProjectId?: string;
  workspaceMode: WorkspaceMode;
  viewPhase?: WorkflowPhase;
  focusMode: boolean;
  imageConcurrency: ImageConcurrency;
  selectedShotByProject: Record<string, string | null>;
}

function readWorkspacePreferences(): WorkspacePreferences {
  const fallback: WorkspacePreferences = { workspaceMode: "image", focusMode: false, imageConcurrency: "pro_max", selectedShotByProject: {} };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_PREFERENCES_KEY) ?? "null") as Partial<WorkspacePreferences> | null;
    if (!parsed) return fallback;
    return {
      activeProjectId: typeof parsed.activeProjectId === "string" ? parsed.activeProjectId : undefined,
      workspaceMode: parsed.workspaceMode === "video" ? "video" : "image",
      viewPhase: STAGES.some((stage) => stage.id === parsed.viewPhase) ? parsed.viewPhase : undefined,
      focusMode: Boolean(parsed.focusMode),
      imageConcurrency: parsed.imageConcurrency === 1 || parsed.imageConcurrency === 2 || parsed.imageConcurrency === 4 || parsed.imageConcurrency === 8 ? parsed.imageConcurrency : "pro_max",
      selectedShotByProject: parsed.selectedShotByProject && typeof parsed.selectedShotByProject === "object" ? parsed.selectedShotByProject : {},
    };
  } catch {
    return fallback;
  }
}

function saveWorkspacePreferences(preferences: WorkspacePreferences): void {
  try { window.localStorage.setItem(WORKSPACE_PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* embedded hosts can disable persistent storage */ }
}

function rememberAutoContact(projectId: string) {
  try { window.localStorage.setItem(AUTO_CONTACT_AFTER_DIRECTION_KEY, JSON.stringify({ projectId, startedAt: Date.now() })); } catch { /* storage can be unavailable in embedded hosts */ }
}

function readAutoContact(): { projectId?: string; startedAt: number } {
  try {
    const value = window.localStorage.getItem(AUTO_CONTACT_AFTER_DIRECTION_KEY);
    if (!value) return { startedAt: 0 };
    if (!value.startsWith("{")) return { projectId: value, startedAt: 0 };
    const parsed = JSON.parse(value) as { projectId?: string; startedAt?: number };
    return { projectId: parsed.projectId, startedAt: Number(parsed.startedAt) || 0 };
  } catch { return { startedAt: 0 }; }
}

function consumeAutoContact(projectId: string) {
  try {
    if (readAutoContact().projectId === projectId) {
      window.localStorage.removeItem(AUTO_CONTACT_AFTER_DIRECTION_KEY);
    }
  } catch { /* storage can be unavailable in embedded hosts */ }
}

function hasAutoContact(projectId: string) {
  return readAutoContact().projectId === projectId;
}

interface RollingVideoIntentItem {
  shotId: string;
  waitingForImage: boolean;
  baselineSha?: string;
}

interface RollingVideoPromptWait {
  baselineUpdatedAt?: string;
  startedAt: number;
}

interface RollingVideoProjectState {
  intents: RollingVideoIntentItem[];
  promptPending: Record<string, RollingVideoPromptWait>;
}

function readRollingVideoIntents(): Record<string, RollingVideoProjectState> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ROLLING_VIDEO_INTENT_KEY) ?? "{}") as Record<string, unknown>;
    const result: Record<string, RollingVideoProjectState> = {};
    for (const [projectId, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) {
        const shotIds = [...new Set(value.filter((shotId): shotId is string => typeof shotId === "string"))];
        result[projectId] = { intents: shotIds.map((shotId) => ({ shotId, waitingForImage: false })), promptPending: {} };
        continue;
      }
      if (!value || typeof value !== "object") continue;
      const record = value as { intents?: unknown; promptPending?: unknown };
      const intents: RollingVideoIntentItem[] = [];
      for (const item of Array.isArray(record.intents) ? record.intents : []) {
        if (!item || typeof item !== "object" || typeof (item as { shotId?: unknown }).shotId !== "string") continue;
        const candidate = item as { shotId: string; waitingForImage?: unknown; baselineSha?: unknown };
        intents.push({ shotId: candidate.shotId, waitingForImage: Boolean(candidate.waitingForImage), baselineSha: typeof candidate.baselineSha === "string" ? candidate.baselineSha : undefined });
      }
      const promptPending: Record<string, RollingVideoPromptWait> = {};
      if (record.promptPending && typeof record.promptPending === "object" && !Array.isArray(record.promptPending)) {
        for (const [shotId, pending] of Object.entries(record.promptPending as Record<string, unknown>)) {
          if (!pending || typeof pending !== "object") continue;
          const candidate = pending as { baselineUpdatedAt?: unknown; startedAt?: unknown };
          const startedAt = Number(candidate.startedAt);
          if (!Number.isFinite(startedAt) || startedAt <= 0) continue;
          promptPending[shotId] = { baselineUpdatedAt: typeof candidate.baselineUpdatedAt === "string" ? candidate.baselineUpdatedAt : undefined, startedAt };
        }
      }
      result[projectId] = { intents, promptPending };
    }
    return result;
  } catch {
    return {};
  }
}

function saveRollingVideoIntents(intents: Record<string, RollingVideoProjectState>): void {
  try { window.localStorage.setItem(ROLLING_VIDEO_INTENT_KEY, JSON.stringify(intents)); } catch { /* embedded hosts can disable persistent storage */ }
}

function projectShotKey(projectId: string, shotId: string): string {
  return `${projectId}:${shotId}`;
}

interface ToastState { tone: "success" | "error" | "info"; text: string }
type VideoProviderSetupToolResult = Record<string, unknown> & { setup?: VideoProviderSetup; request?: VideoProviderSetup };

function setupFromToolResult(result: VideoProviderSetupToolResult): VideoProviderSetup | undefined {
  return result.setup ?? result.request;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatSyncTime(value?: number): string {
  if (!value) return "等待首次同步";
  return `已同步 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value)}`;
}

function projectProgress(project: ProjectSummary): number {
  return project.shotCount ? Math.round((project.acceptedCount / project.shotCount) * 100) : 0;
}

function imageFileError(file: File): string | undefined {
  if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type)) return "只支持 PNG、JPEG 或 WebP 图片";
  if (file.size > 25 * 1024 * 1024) return "图片不能超过 25MB";
  return undefined;
}

export default function WorkspaceApp() {
  const initialPreferences = useMemo(readWorkspacePreferences, []);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string>();
  const [checkedShotIds, setCheckedShotIds] = useState<Set<string>>(new Set());
  const [editingShot, setEditingShot] = useState<ShotRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [shotCountOpen, setShotCountOpen] = useState(false);
  const [projectPendingDeletion, setProjectPendingDeletion] = useState<ProjectSummary | null>(null);
  const [constraintSlot, setConstraintSlot] = useState<ReferenceSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [switchingProjectId, setSwitchingProjectId] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string>();
  const [toast, setToast] = useState<ToastState>();
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => getDisplayMode());
  const [displayModeBusy, setDisplayModeBusy] = useState(false);
  const [workspaceSurfaceSupport, setWorkspaceSurfaceSupport] = useState<WorkspaceSurfaceSupport>(() => detectWorkspaceSurfaceSupport());
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(initialPreferences.workspaceMode);
  const [viewPhase, setViewPhase] = useState<WorkflowPhase | undefined>(initialPreferences.viewPhase);
  const [focusMode, setFocusMode] = useState(initialPreferences.focusMode);
  const imageConcurrency: ImageConcurrency = "pro_max";
  const [lastSyncedAt, setLastSyncedAt] = useState<number>();
  const [syncError, setSyncError] = useState<string>();
  const [videoProviders, setVideoProviders] = useState<VideoProviderProfile[]>([]);
  const [videoProvidersLoaded, setVideoProvidersLoaded] = useState(false);
  const [defaultVideoProviderId, setDefaultVideoProviderId] = useState<string>();
  const [videoProviderSetup, setVideoProviderSetup] = useState<VideoProviderSetup>();
  const [providerDrawerOpen, setProviderDrawerOpen] = useState(false);
  const [autoVideoIntentState, setAutoVideoIntentState] = useState<{ projectId?: string; shotIds: string[] }>({ shotIds: [] });
  const autoVideoBatchShotIds = autoVideoIntentState.projectId === project?.id ? autoVideoIntentState.shotIds : [];
  const [imageGenerationShotIds, setImageGenerationShotIds] = useState<string[]>([]);
  const [wholeImageEditOpen, setWholeImageEditOpen] = useState(false);
  const [directionAnalysisPending, setDirectionAnalysisPending] = useState(false);
  const [videoPromptPendingState, setVideoPromptPendingState] = useState<{ projectId?: string; pending: Map<string, string | undefined> }>({ pending: new Map() });
  const videoPromptPendingShotIds = videoPromptPendingState.projectId === project?.id ? videoPromptPendingState.pending : EMPTY_VIDEO_PROMPT_PENDING;
  const activeProjectIdRef = useRef<string | undefined>(undefined);
  const desiredProjectIdRef = useRef<string | undefined>(initialPreferences.activeProjectId);
  const projectNavigationRef = useRef(0);
  const selectedShotIdRef = useRef<string | undefined>(undefined);
  const lastCheckedShotIdRef = useRef<string | undefined>(undefined);
  const autoAdvanceProjectRef = useRef<string | undefined>(undefined);
  const autoContactEnqueueProjectRef = useRef<Set<string>>(new Set());
  const directionAnalysisStartedAtRef = useRef(0);
  const lastResumeRefreshRef = useRef(0);
  const toastTimerRef = useRef<number | undefined>(undefined);
  const syncErrorRef = useRef<string | undefined>(undefined);
  const projectRefreshRef = useRef<{ projectId: string; token: symbol; promise: Promise<ProjectRecord | undefined> } | undefined>(undefined);
  const requestStatusRef = useRef<{ projectId?: string; generation: Map<string, string>; video: Map<string, string> }>({ generation: new Map(), video: new Map() });
  const completedProviderSetupRef = useRef<string | undefined>(undefined);
  const automaticSidebarOpenAttemptedRef = useRef(false);
  const autoVideoSubmittingShotIdsRef = useRef<Set<string>>(new Set());
  const videoSubmitCountRef = useRef(0);
  const videoPromptStartedAtRef = useRef<Map<string, number>>(new Map());
  const rollingVideoIntentsRef = useRef<Record<string, RollingVideoProjectState>>(readRollingVideoIntents());

  const persistRollingProjectState = useCallback((projectId: string, state: RollingVideoProjectState) => {
    if (state.intents.length || Object.keys(state.promptPending).length) {
      rollingVideoIntentsRef.current = { ...rollingVideoIntentsRef.current, [projectId]: state };
    } else {
      const remaining = { ...rollingVideoIntentsRef.current };
      delete remaining[projectId];
      rollingVideoIntentsRef.current = remaining;
    }
    saveRollingVideoIntents(rollingVideoIntentsRef.current);
  }, []);

  const updateAutoVideoIntent = useCallback((projectId: string, updater: string[] | ((current: string[]) => string[])) => {
    const state = rollingVideoIntentsRef.current[projectId] ?? { intents: [], promptPending: {} };
    const current = state.intents.map((item) => item.shotId);
    const next = [...new Set(typeof updater === "function" ? updater(current) : updater)];
    const existing = new Map(state.intents.map((item) => [item.shotId, item]));
    persistRollingProjectState(projectId, {
      ...state,
      intents: next.map((shotId) => existing.get(shotId) ?? { shotId, waitingForImage: false }),
    });
    if (activeProjectIdRef.current === projectId) setAutoVideoIntentState({ projectId, shotIds: next });
  }, [persistRollingProjectState]);

  const updateAutoVideoWaitingImage = useCallback((projectId: string, shotId: string, waitingForImage: boolean, baselineSha?: string) => {
    const state = rollingVideoIntentsRef.current[projectId] ?? { intents: [], promptPending: {} };
    if (!state.intents.some((item) => item.shotId === shotId)) return;
    persistRollingProjectState(projectId, {
      ...state,
      intents: state.intents.map((item) => item.shotId === shotId ? { shotId, waitingForImage, baselineSha: waitingForImage ? baselineSha : undefined } : item),
    });
  }, [persistRollingProjectState]);

  const updateVideoPromptPending = useCallback((projectId: string, updater: (current: Map<string, string | undefined>) => Map<string, string | undefined>) => {
    const state = rollingVideoIntentsRef.current[projectId] ?? { intents: [], promptPending: {} };
    const current = new Map(Object.entries(state.promptPending).map(([shotId, pending]) => [shotId, pending.baselineUpdatedAt]));
    const next = updater(current);
    const now = Date.now();
    const promptPending = Object.fromEntries([...next].map(([shotId, baselineUpdatedAt]) => [shotId, {
      baselineUpdatedAt,
      startedAt: state.promptPending[shotId]?.startedAt ?? now,
    }]));
    persistRollingProjectState(projectId, { ...state, promptPending });
    if (activeProjectIdRef.current === projectId) {
      videoPromptStartedAtRef.current = new Map(Object.entries(promptPending).map(([shotId, pending]) => [shotId, pending.startedAt]));
      setVideoPromptPendingState({ projectId, pending: next });
    }
  }, [persistRollingProjectState]);

  const clearRollingVideoProject = useCallback((projectId: string) => {
    persistRollingProjectState(projectId, { intents: [], promptPending: {} });
    if (activeProjectIdRef.current === projectId) {
      videoPromptStartedAtRef.current.clear();
      setAutoVideoIntentState({ projectId, shotIds: [] });
      setVideoPromptPendingState({ projectId, pending: new Map() });
    }
  }, [persistRollingProjectState]);

  const notify = useCallback((text: string, tone: ToastState["tone"] = "info") => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ text, tone });
    toastTimerRef.current = window.setTimeout(() => setToast(undefined), tone === "error" ? 7000 : 3600);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  const applyProjectSnapshot = useCallback((nextProject: ProjectRecord, expectedProjectId = nextProject.id) => {
    if (nextProject.id !== expectedProjectId) return false;
    const intendedProjectId = desiredProjectIdRef.current ?? activeProjectIdRef.current;
    if (intendedProjectId && intendedProjectId !== expectedProjectId) return false;
    desiredProjectIdRef.current = expectedProjectId;
    activeProjectIdRef.current = expectedProjectId;
    setProject((current) => current?.id === nextProject.id && current.updatedAt === nextProject.updatedAt ? current : nextProject);
    return true;
  }, []);

  const loadProjects = useCallback(async (preferredProjectId?: string) => {
    const navigationVersion = projectNavigationRef.current;
    const preferences = readWorkspacePreferences();
    const result = await callReadTool<{ projects: ProjectSummary[] }>("list_projects");
    setProjects(result.projects);
    const availableIds = new Set(result.projects.map((item) => item.id));
    const targetId = [desiredProjectIdRef.current, preferredProjectId, activeProjectIdRef.current, preferences.activeProjectId, result.projects[0]?.id]
      .find((id): id is string => Boolean(id && availableIds.has(id)));
    if (targetId) {
      if (!desiredProjectIdRef.current || !availableIds.has(desiredProjectIdRef.current)) desiredProjectIdRef.current = targetId;
      const detail = await callReadTool<{ project: ProjectRecord }>("get_project", { projectId: targetId });
      if (navigationVersion !== projectNavigationRef.current || desiredProjectIdRef.current !== targetId) return result.projects;
      const currentSelection = targetId === activeProjectIdRef.current && detail.project.shots.some((shot) => shot.id === selectedShotIdRef.current)
        ? selectedShotIdRef.current
        : undefined;
      applyProjectSnapshot(detail.project, targetId);
      const preferredSelection = currentSelection ?? preferences.selectedShotByProject[targetId] ?? undefined;
      setSelectedShotId(preferredSelection && detail.project.shots.some((shot) => shot.id === preferredSelection) ? preferredSelection : undefined);
    } else {
      desiredProjectIdRef.current = undefined;
      activeProjectIdRef.current = undefined;
      setProject(null);
    }
    setLastSyncedAt(Date.now());
    return result.projects;
  }, [applyProjectSnapshot]);

  const refreshProject = useCallback(async (projectId: string, force = true) => {
    const pending = projectRefreshRef.current;
    if (pending?.projectId === projectId) {
      if (!force) return pending.promise;
      await pending.promise;
    }
    const token = Symbol(projectId);
    const promise = (async () => {
      try {
        const result = await callReadTool<{ project: ProjectRecord }>("get_project", { projectId });
        const intendedProjectId = desiredProjectIdRef.current ?? activeProjectIdRef.current;
        if (intendedProjectId === projectId) applyProjectSnapshot(result.project, projectId);
        setLastSyncedAt(Date.now());
        if (syncErrorRef.current) notify("已恢复自动同步", "success");
        syncErrorRef.current = undefined;
        setSyncError(undefined);
        return result.project;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (syncErrorRef.current !== message) notify(`自动同步暂时中断：${message}`, "error");
        syncErrorRef.current = message;
        setSyncError(message);
      } finally {
        if (projectRefreshRef.current?.token === token) projectRefreshRef.current = undefined;
      }
    })();
    projectRefreshRef.current = { projectId, token, promise };
    return promise;
  }, [notify]);

  const loadVideoProviders = useCallback(async () => {
    try {
      const result = await callReadTool<{ providers: VideoProviderProfile[]; defaultProviderId?: string }>("list_video_providers");
      setVideoProviders(Array.isArray(result.providers) ? result.providers : []);
      setDefaultVideoProviderId(result.defaultProviderId);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setVideoProvidersLoaded(true);
    }
  }, [notify]);

  useEffect(() => {
    let requestId: string | null = null;
    try { requestId = window.localStorage.getItem(VIDEO_PROVIDER_SETUP_KEY); } catch { /* storage can be unavailable */ }
    if (!requestId) return;
    void callReadTool<VideoProviderSetupToolResult>("get_video_provider_setup", { requestId })
      .then((result) => {
        const setup = setupFromToolResult(result);
        if (setup) setVideoProviderSetup(setup);
      })
      .catch(() => { /* the setup may belong to an older local-service version */ });
  }, []);

  useEffect(() => {
    const requestId = videoProviderSetup?.id ?? videoProviderSetup?.requestId;
    if (!requestId) return;
    try { window.localStorage.setItem(VIDEO_PROVIDER_SETUP_KEY, requestId); } catch { /* storage can be unavailable */ }
  }, [videoProviderSetup?.id, videoProviderSetup?.requestId]);

  useEffect(() => {
    const setup = videoProviderSetup;
    const requestId = setup?.id ?? setup?.requestId;
    if (!setup || !requestId || !["queued", "analyzing"].includes(setup.status)) return;
    let stopped = false;
    const refreshSetup = async () => {
      try {
        const result = await callReadTool<VideoProviderSetupToolResult>("get_video_provider_setup", { requestId });
        const refreshedSetup = setupFromToolResult(result);
        if (!stopped && refreshedSetup) setVideoProviderSetup(refreshedSetup);
      } catch {
        // A short local-service interruption should not discard the registered setup request.
      }
    };
    const timer = window.setInterval(() => void refreshSetup(), 1400);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [videoProviderSetup?.id, videoProviderSetup?.requestId, videoProviderSetup?.status]);

  useEffect(() => {
    const requestId = videoProviderSetup?.id ?? videoProviderSetup?.requestId;
    if (!requestId || videoProviderSetup?.status !== "ready" || completedProviderSetupRef.current === requestId) return;
    completedProviderSetupRef.current = requestId;
    void loadVideoProviders();
    notify("视频模型配置已生成；需要密钥时请只在本机填写", "success");
  }, [loadVideoProviders, notify, videoProviderSetup]);

  useEffect(() => {
    void (async () => {
      try {
        const initial = window.openai?.toolOutput as { projects?: ProjectSummary[]; project?: ProjectRecord } | undefined;
        if (initial?.projects) setProjects(initial.projects);
        if (initial?.project && !desiredProjectIdRef.current) {
          desiredProjectIdRef.current = initial.project.id;
          applyProjectSnapshot(initial.project);
        }
        await loadProjects(initial?.project?.id);
        await loadVideoProviders();
        setStartupError(undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStartupError(message);
        notify(message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [applyProjectSnapshot, loadProjects, loadVideoProviders, notify]);

  useEffect(() => {
    if (project?.id && (!desiredProjectIdRef.current || desiredProjectIdRef.current === project.id)) {
      desiredProjectIdRef.current = project.id;
      activeProjectIdRef.current = project.id;
    }
    lastCheckedShotIdRef.current = undefined;
    const rememberedDirection = readAutoContact();
    directionAnalysisStartedAtRef.current = rememberedDirection.projectId === project?.id ? rememberedDirection.startedAt : 0;
    setDirectionAnalysisPending(Boolean(project?.id && hasAutoContact(project.id)));
    const rollingState = project?.id ? rollingVideoIntentsRef.current[project.id] : undefined;
    const pendingEntries = Object.entries(rollingState?.promptPending ?? {});
    setVideoPromptPendingState({ projectId: project?.id, pending: new Map(pendingEntries.map(([shotId, pending]) => [shotId, pending.baselineUpdatedAt])) });
    setAutoVideoIntentState({ projectId: project?.id, shotIds: rollingState?.intents.map((item) => item.shotId) ?? [] });
    videoPromptStartedAtRef.current = new Map(pendingEntries.map(([shotId, pending]) => [shotId, pending.startedAt]));
  }, [project?.id]);

  useEffect(() => {
    selectedShotIdRef.current = selectedShotId;
  }, [selectedShotId]);

  const currentProjectId = project?.id;
  useEffect(() => {
    if (!currentProjectId) return;
    const preferences = readWorkspacePreferences();
    saveWorkspacePreferences({
      ...preferences,
      activeProjectId: currentProjectId,
      workspaceMode,
      viewPhase,
      focusMode,
      imageConcurrency,
      selectedShotByProject: { ...preferences.selectedShotByProject, [currentProjectId]: selectedShotId ?? null },
    });
  }, [currentProjectId, focusMode, imageConcurrency, selectedShotId, viewPhase, workspaceMode]);

  useEffect(() => {
    if (workspaceMode === "video" && project && !project.shots.some((shot) => shot.imagePath)) {
      setWorkspaceMode("image");
      setViewPhase(undefined);
    }
  }, [project, workspaceMode]);

  useEffect(() => {
    if (loading) return;
    const refreshAfterResume = () => {
      if (document.visibilityState !== "visible" || busy) return;
      const timestamp = Date.now();
      if (timestamp - lastResumeRefreshRef.current < 750) return;
      lastResumeRefreshRef.current = timestamp;
      void loadProjects(activeProjectIdRef.current).catch((error) => {
        notify(error instanceof Error ? error.message : String(error), "error");
      });
    };
    document.addEventListener("visibilitychange", refreshAfterResume);
    window.addEventListener("focus", refreshAfterResume);
    window.addEventListener("pageshow", refreshAfterResume);
    return () => {
      document.removeEventListener("visibilitychange", refreshAfterResume);
      window.removeEventListener("focus", refreshAfterResume);
      window.removeEventListener("pageshow", refreshAfterResume);
    };
  }, [busy, loadProjects, loading, notify]);

  useEffect(() => subscribeDisplayMode(setDisplayMode), []);

  // The workbench is a persistent production surface. The host bridge can be
  // injected shortly after the widget mounts, so wait briefly before making
  // the one automatic request for Codex's right-hand workspace.
  useEffect(() => {
    if (automaticSidebarOpenAttemptedRef.current || displayMode !== "inline") return;
    let cancelled = false;
    void waitForDisplayModeBridge().then((ready) => {
      if (cancelled || !ready || automaticSidebarOpenAttemptedRef.current) return;
      automaticSidebarOpenAttemptedRef.current = true;
      const availableModes = getAvailableDisplayModes();
      if (availableModes && !availableModes.includes("pip")) {
        setWorkspaceSurfaceSupport(availableModes.includes("fullscreen") ? "fullscreen" : "inline-only");
        return;
      }
      return requestDisplayMode("pip").then((grantedMode) => {
        setDisplayMode(grantedMode);
        setWorkspaceSurfaceSupport(grantedMode === "pip" ? "sidebar" : "fullscreen");
      }).catch(() => {
        // The explicit preview CTA stays available when the host declines the
        // automatic request, so the user can retry after the widget is ready.
      });
    });
    return () => { cancelled = true; };
  }, [displayMode]);

  const changeDisplayMode = async (requestedMode: DisplayMode) => {
    setDisplayModeBusy(true);
    try {
      if (!await waitForDisplayModeBridge()) {
        throw new Error("侧边栏能力还没有就绪，请稍后再试或重新打开图片中控");
      }
      const availableModes = getAvailableDisplayModes();
      let targetMode = requestedMode;
      if (requestedMode === "pip" && workspaceSurfaceSupport === "fullscreen") targetMode = "fullscreen";
      if (requestedMode === "pip" && availableModes && !availableModes.includes("pip")) {
        targetMode = availableModes.includes("fullscreen") ? "fullscreen" : "inline";
      }
      let grantedMode = await requestDisplayMode(targetMode);
      setDisplayMode(grantedMode);
      if (grantedMode === "pip") {
        setWorkspaceSurfaceSupport("sidebar");
      } else if (grantedMode === "fullscreen") {
        setWorkspaceSurfaceSupport("fullscreen");
      } else if (targetMode === "pip") {
        setWorkspaceSurfaceSupport("fullscreen");
        grantedMode = await requestDisplayMode("fullscreen");
        setDisplayMode(grantedMode);
        setWorkspaceSurfaceSupport(grantedMode === "fullscreen" ? "fullscreen" : "inline-only");
      } else if (targetMode === "fullscreen") {
        setWorkspaceSurfaceSupport("inline-only");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setDisplayModeBusy(false);
    }
  };

  const hasActiveRequests = Boolean(project?.generationRequests.some((request) => ["queued", "generating", "saving"].includes(request.status))
    || project?.videoRequests?.some((request) => ["queued", "waiting_remote", "uploading", "submitting", "running", "downloading"].includes(request.status)));
  const shouldAutoRefresh = hasActiveRequests || videoPromptPendingShotIds.size > 0 || autoVideoBatchShotIds.length > 0;
  useEffect(() => {
    if (!project?.id || !shouldAutoRefresh) return;
    const timer = window.setInterval(() => void refreshProject(project.id, false), syncError ? 5000 : 1000);
    return () => window.clearInterval(timer);
  }, [project?.id, refreshProject, shouldAutoRefresh, syncError]);

  useEffect(() => {
    if (!project) return;
    const currentGeneration = new Map(project.generationRequests.map((request) => [request.id, request.status]));
    const currentVideo = new Map(project.videoRequests.map((request) => [request.id, request.status]));
    const previous = requestStatusRef.current;
    if (previous.projectId !== project.id) {
      requestStatusRef.current = { projectId: project.id, generation: currentGeneration, video: currentVideo };
      return;
    }
    let imageCompleted = 0;
    let contactRebuilt = 0;
    const contactEditedShotNumbers: string[] = [];
    let videoCompleted = 0;
    let failed = 0;
    for (const request of project.generationRequests) {
      const before = previous.generation.get(request.id);
      if (!before || !ACTIVE_IMAGE_STATUSES.has(before)) continue;
      if (request.status === "completed") {
        if (request.kind === "contact_sheet_edit") {
          request.shotIds.forEach((shotId) => {
            const shot = project.shots.find((item) => item.id === shotId);
            if (shot) contactEditedShotNumbers.push(String(shot.index + 1).padStart(2, "0"));
          });
        } else if (request.kind === "contact_sheet") contactRebuilt += 1;
        else imageCompleted += request.shotIds.length;
      } else if (request.status === "failed") failed += 1;
    }
    for (const request of project.videoRequests) {
      const before = previous.video.get(request.id);
      if (!before || !ACTIVE_VIDEO_STATUSES.has(before)) continue;
      if (request.status === "completed") videoCompleted += 1;
      else if (request.status === "failed") failed += 1;
    }
    requestStatusRef.current = { projectId: project.id, generation: currentGeneration, video: currentVideo };
    const completedParts = [
      contactEditedShotNumbers.length ? `宫格 ${contactEditedShotNumbers.join("、")} 已更新` : contactRebuilt ? "新宫格已写回，请重新确认" : "",
      imageCompleted ? `${imageCompleted} 张图片已写回` : "",
      videoCompleted ? `${videoCompleted} 段视频已回传` : "",
    ].filter(Boolean);
    if (failed) notify(`${completedParts.length ? `${completedParts.join("，")}；` : ""}${failed} 个生成任务失败，原因已显示在对应分镜`, "error");
    else if (completedParts.length) notify(completedParts.join("，"), "success");
  }, [notify, project]);

  useEffect(() => {
    if (videoPromptPendingShotIds.size === 0) return;
    const nextDeadline = Math.min(...[...videoPromptPendingShotIds.keys()].map((shotId) => (
      (videoPromptStartedAtRef.current.get(shotId) ?? Date.now()) + VIDEO_PROMPT_TIMEOUT_MS
    )));
    const timer = window.setTimeout(() => {
      setVideoPromptPendingState((current) => ({ ...current, pending: new Map(current.pending) }));
    }, Math.max(0, nextDeadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [videoPromptPendingShotIds]);

  useEffect(() => {
    if (!project || videoPromptPendingShotIds.size === 0) return;
    const now = Date.now();
    const timedOutShotIds = new Set([...videoPromptPendingShotIds.keys()].filter((shotId) => {
      const startedAt = videoPromptStartedAtRef.current.get(shotId);
      return Boolean(startedAt && now - startedAt >= VIDEO_PROMPT_TIMEOUT_MS);
    }));
    const completedCount = [...videoPromptPendingShotIds].filter(([shotId, baselineUpdatedAt]) => {
      const shot = project.shots.find((item) => item.id === shotId);
      return Boolean(shot?.videoPlan && !shot.videoPlan.stale && shot.videoPlan.updatedAt !== baselineUpdatedAt);
    }).length;
    const remaining = new Map([...videoPromptPendingShotIds].filter(([shotId, baselineUpdatedAt]) => {
      if (timedOutShotIds.has(shotId)) return false;
      const shot = project.shots.find((item) => item.id === shotId);
      return Boolean(shot?.imagePath && (!shot.videoPlan || shot.videoPlan.stale || shot.videoPlan.updatedAt === baselineUpdatedAt));
    }));
    if (remaining.size !== videoPromptPendingShotIds.size) {
      updateVideoPromptPending(project.id, () => remaining);
      if (timedOutShotIds.size) {
        updateAutoVideoIntent(project.id, (current) => current.filter((shotId) => !timedOutShotIds.has(shotId)));
        notify(`${timedOutShotIds.size} 镜提示词准备超过 10 分钟，已停止自动等待；可在对应分镜重新发起`, "error");
      }
      if (completedCount) notify(`${completedCount} 镜视频提示词已写回，可继续编辑或直接生成`, "success");
    }
  }, [notify, project?.id, project?.updatedAt, project?.shots, updateAutoVideoIntent, updateVideoPromptPending, videoPromptPendingShotIds, videoPromptPendingShotIds.size]);

  useEffect(() => {
    if (selectedShotId && project && !project.shots.some((shot) => shot.id === selectedShotId)) setSelectedShotId(project.shots[0]?.id);
  }, [project?.id, project?.shots, selectedShotId]);

  const shotIdSignature = project?.shots.map((shot) => shot.id).join("|") ?? "";
  useEffect(() => {
    if (!project) return;
    const validIds = new Set(project.shots.map((shot) => shot.id));
    setCheckedShotIds((current) => {
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [project, shotIdSignature]);

  const selectedShot = project?.shots.find((shot) => shot.id === selectedShotId);
  const selectedLatestImageRequest = selectedShot && project?.generationRequests
    .filter((request) => !isContactSheetKind(request.kind) && request.shotIds.includes(selectedShot.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const selectedImageRequest = selectedShot && project?.generationRequests
    .filter((request) => !isContactSheetKind(request.kind) && request.shotIds.includes(selectedShot.id) && ["queued", "generating", "saving"].includes(request.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const selectedVideoRequest = selectedShot && project?.videoRequests
    .filter((request) => request.shotId === selectedShot.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const selectedVideoRequestActive = Boolean(selectedVideoRequest && ACTIVE_VIDEO_STATUSES.has(selectedVideoRequest.status));
  const singleEditorShot = project?.templateId === "image-editor" ? project.shots[0] : undefined;
  const singleEditorLatestRequest = singleEditorShot && project?.generationRequests
    .filter((request) => request.shotIds.includes(singleEditorShot.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const contactSheetUpdating = Boolean(project?.generationRequests.some((request) => isContactSheetKind(request.kind) && ACTIVE_IMAGE_STATUSES.has(request.status)));
  const storyboardBlockReason = project?.templateId === "image-editor"
    ? undefined
    : contactSheetUpdating
    ? "宫格正在更新，完成并重新确认后再生成正式图"
    : !project?.contactSheetPath
    ? "请先生成宫格总览并确认"
    : project.contactSheetStale
      ? "方向、分镜或参考约束已变化，请重做宫格总览"
      : !project.contactSheetApprovedAt
        ? "请先人工确认宫格总览"
        : undefined;
  const formalBlockReason = project?.templateId === "image-editor" ? undefined : storyboardBlockReason;

  const openProject = async (projectId: string): Promise<boolean> => {
    const navigationVersion = ++projectNavigationRef.current;
    desiredProjectIdRef.current = projectId;
    setSwitchingProjectId(projectId);
    try {
      const result = await callReadTool<{ project: ProjectRecord }>("get_project", { projectId });
      if (navigationVersion !== projectNavigationRef.current || desiredProjectIdRef.current !== projectId) return false;
      applyProjectSnapshot(result.project, projectId);
      const preferences = readWorkspacePreferences();
      const savedShotId = preferences.selectedShotByProject[projectId];
      setSelectedShotId(savedShotId && result.project.shots.some((shot) => shot.id === savedShotId) ? savedShotId : undefined);
      setWorkspaceMode(preferences.workspaceMode === "video" && result.project.shots.some((shot) => shot.imagePath) ? "video" : "image");
      setViewPhase(preferences.viewPhase);
      setCheckedShotIds(new Set());
      setEditingShot(null);
      setImageGenerationShotIds([]);
      setConstraintSlot(null);
      setWholeImageEditOpen(false);
      setShotCountOpen(false);
      setLastSyncedAt(Date.now());
      return true;
    } catch (error) {
      if (navigationVersion === projectNavigationRef.current) {
        desiredProjectIdRef.current = activeProjectIdRef.current;
        notify(error instanceof Error ? error.message : String(error), "error");
      }
      return false;
    } finally {
      if (navigationVersion === projectNavigationRef.current) setSwitchingProjectId(undefined);
    }
  };

  const openProjectInSidebar = async (projectId: string) => {
    if (await openProject(projectId)) await changeDisplayMode("pip");
  };

  const refreshCurrentProject = async () => {
    if (!project) return;
    setRefreshing(true);
    try {
      await loadProjects(project.id);
      syncErrorRef.current = undefined;
      setSyncError(undefined);
      notify("项目状态已刷新", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setRefreshing(false);
    }
  };

  const createProject = async (name: string, templateId: TemplateId, aspectRatio: AspectRatio, shotCount: number, sourceFile?: File) => {
    if (sourceFile) {
      const error = imageFileError(sourceFile);
      if (error) return notify(error, "error");
    }
    const navigationVersion = projectNavigationRef.current;
    setBusy(true);
    try {
      const projectName = name.trim() || sourceFile?.name.replace(/\.[^.]+$/, "") || "单图编辑";
      const result = await callTool<{ project: ProjectRecord }>("create_project", { name: projectName, templateId, aspectRatio, shotCount: templateId === "image-editor" ? 1 : shotCount });
      let created = result.project;
      let sourceImportError: string | undefined;
      if (templateId === "image-editor" && sourceFile) {
        try {
          const imported = await callTool<{ project: ProjectRecord }>("import_editor_image", {
            projectId: created.id,
            dataUrl: await fileToDataUrl(sourceFile),
            fileName: sourceFile.name,
          });
          created = imported.project;
        } catch (error) {
          sourceImportError = error instanceof Error ? error.message : String(error);
        }
      }
      const shouldOpenCreatedProject = navigationVersion === projectNavigationRef.current;
      if (shouldOpenCreatedProject) {
        projectNavigationRef.current += 1;
        desiredProjectIdRef.current = created.id;
        applyProjectSnapshot(created, created.id);
        setSelectedShotId(templateId === "image-editor" ? created.shots[0]?.id : undefined);
        setWorkspaceMode("image");
        setViewPhase(templateId === "image-editor" ? "production" : "direction");
      }
      setCreateOpen(false);
      await loadProjects(shouldOpenCreatedProject ? created.id : desiredProjectIdRef.current);
      if (sourceImportError) {
        notify(`空编辑台已保留并打开，但这张图片导入失败：${sourceImportError}。可以在编辑台内重新上传。`, "error");
      } else {
        notify(templateId === "image-editor" ? (sourceFile ? "图片已进入单图编辑台" : "单图编辑台已创建，可以上传图片") : "项目已创建", "success");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteProject = async () => {
    if (!projectPendingDeletion) return;
    const target = projectPendingDeletion;
    const deletingActiveProject = target.id === activeProjectIdRef.current;
    const deleteNavigationVersion = projectNavigationRef.current;
    setBusy(true);
    try {
      await callTool<{ deletedProjectId: string }>("delete_project", { projectId: target.id });
      const stillDeletingCurrentProject = deletingActiveProject
        && deleteNavigationVersion === projectNavigationRef.current
        && desiredProjectIdRef.current === target.id;
      if (stillDeletingCurrentProject) {
        projectNavigationRef.current += 1;
        desiredProjectIdRef.current = undefined;
        activeProjectIdRef.current = undefined;
        setProject(null);
        setSelectedShotId(undefined);
        setCheckedShotIds(new Set());
        setEditingShot(null);
      }
      clearRollingVideoProject(target.id);
      setProjectPendingDeletion(null);
      await loadProjects(stillDeletingCurrentProject ? undefined : desiredProjectIdRef.current ?? activeProjectIdRef.current);
      notify(`“${target.name}”已彻底删除`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const updateProject = async (patch: Record<string, unknown>): Promise<boolean> => {
    if (!project) return false;
    setBusy(true);
    try {
      const result = await callTool<{ project: ProjectRecord }>("update_project", { projectId: project.id, ...patch });
      const applied = applyProjectSnapshot(result.project, project.id);
      void loadProjects(project.id);
      if (applied) notify("项目已保存", "success");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const importReference = async (slot: ReferenceSlot, file: File) => {
    if (!project) return;
    if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type)) {
      notify("只支持 PNG、JPEG 或 WebP 图片", "error");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      notify("参考图不能超过 25MB", "error");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const result = await callTool<{ project: ProjectRecord }>("import_reference", {
        projectId: project.id, slot, dataUrl, fileName: file.name,
      });
      applyProjectSnapshot(result.project, project.id);
      notify("参考图已更新", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const importEditorImage = async (file: File) => {
    if (!project || project.templateId !== "image-editor") return;
    const error = imageFileError(file);
    if (error) return notify(error, "error");
    setBusy(true);
    try {
      const result = await callTool<{ project: ProjectRecord }>("import_editor_image", {
        projectId: project.id,
        dataUrl: await fileToDataUrl(file),
        fileName: file.name,
      });
      const applied = applyProjectSnapshot(result.project, project.id);
      if (applied) setSelectedShotId(result.project.shots[0]?.id);
      await loadProjects(project.id);
      if (applied) notify(project.shots[0]?.imagePath ? "原图已替换，可撤销回上一张" : "图片已进入编辑画布", "success");
    } catch (uploadError) {
      notify(uploadError instanceof Error ? uploadError.message : String(uploadError), "error");
    } finally {
      setBusy(false);
    }
  };

  const removeReference = async (slot: ReferenceSlot) => {
    if (!project) return;
    setBusy(true);
    try {
      const result = await callTool<{ project: ProjectRecord }>("remove_reference", { projectId: project.id, slot });
      applyProjectSnapshot(result.project, project.id);
      notify(`${referenceLabel(project.templateId, slot)}图片已移除，文字约束仍保留`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const updateReferenceConstraint = async (slot: ReferenceSlot, constraint: string) => {
    if (!project) return false;
    setBusy(true);
    try {
      const result = await callTool<{ project: ProjectRecord }>("update_reference_constraint", {
        projectId: project.id,
        slot,
        constraint,
      });
      applyProjectSnapshot(result.project, project.id);
      setConstraintSlot(null);
      notify(constraint.trim() ? `${referenceLabel(project.templateId, slot)}文字约束已保存` : `${referenceLabel(project.templateId, slot)}文字约束已清除`, "success");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const cancelQueuedGenerationRequests = async (requestIds: string[], message = "已取消等待，当前图片保持不变") => {
    if (!project) return false;
    const queuedIds = [...new Set(requestIds)].filter((requestId) => project.generationRequests.some((request) => request.id === requestId && request.status === "queued"));
    if (!queuedIds.length) {
      notify("请求已经开始处理，当前阶段不能直接取消", "info");
      return false;
    }
    setBusy(true);
    try {
      const results = await Promise.allSettled(queuedIds.map((requestId) => callTool("cancel_queued_request", { projectId: project.id, requestId })));
      const cancelledCount = results.filter((result) => result.status === "fulfilled").length;
      await refreshProject(project.id);
      if (!cancelledCount) throw new Error("请求状态已经变化，请刷新后查看最新进度");
      notify(cancelledCount === 1 ? message : `已取消 ${cancelledCount} 个等待请求，现有图片均未改动`, "success");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const recoverInterruptedGenerationRequests = async (requestIds: string[]) => {
    if (!project) return false;
    const recoverableIds = [...new Set(requestIds)].filter((requestId) => project.generationRequests.some((request) => request.id === requestId && isRecoverableGenerationRequest(request)));
    if (!recoverableIds.length) return notify("这些任务仍在有效处理期内，暂时不能释放", "info");
    setBusy(true);
    try {
      const results = await Promise.allSettled(recoverableIds.map((requestId) => callTool("recover_generation_request", {
        projectId: project.id,
        requestId,
        reason: "工作台检测到生成租约已过期，用户选择释放并重新登记。",
      })));
      const recoveredCount = results.filter((result) => result.status === "fulfilled").length;
      await refreshProject(project.id);
      if (!recoveredCount) throw new Error("任务状态已经变化，请刷新后再试");
      notify(`已释放 ${recoveredCount} 个中断任务；旧结果将无法覆盖，现可重新生成`, "success");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const enqueue = async (
    kind: GenerationKind,
    shotIds: string[],
    extra: Record<string, unknown> = {},
  ) => {
    if (!project) return;
    if (!isCodexHost()) {
      notify("当前是浏览模式；请在 Codex 工作台内发起图片生成", "info");
      return;
    }
    setBusy(true);
    try {
      const existingRequestIds = new Set(project.generationRequests.map((request) => request.id));
      const result = await callTool<{ requests: GenerationRequest[] }>("enqueue_generation", {
        projectId: project.id, kind, shotIds, ...extra,
      });
      const refreshedProject = await refreshProject(project.id);
      // Some Codex host versions only return a text acknowledgement for app-side tool calls.
      // The request has still been registered, so recover its IDs from the refreshed project state.
      const returnedRequests = Array.isArray(result.requests) ? result.requests : [];
      const requests = returnedRequests.length ? returnedRequests : (refreshedProject?.generationRequests ?? []).filter((request) => (
        !existingRequestIds.has(request.id) && request.kind === kind
      ));
      if (!requests.length) throw new Error("请求已登记，但工作台未读取到请求编号；请刷新后重试通知 Codex");
      try {
        await sendGenerationMessage(project.id, requests.map((request) => request.id), imageConcurrency);
        if (kind === "contact_sheet_edit") {
          const numbers = shotIds.map((shotId) => {
            const shot = project.shots.find((item) => item.id === shotId);
            return shot ? String(shot.index + 1).padStart(2, "0") : "";
          }).filter(Boolean);
          notify(`已登记重做宫格 ${numbers.join("、")}；完成后会自动替换，未选格保持原样`, "success");
        } else if (kind === "contact_sheet") {
          notify("已登记重做整张方向宫格；完成后会自动替换并等待重新确认", "success");
        } else {
          notify(imageConcurrency === "pro_max"
            ? `已提交 ${requests.length} 个请求；Codex 会使用当前可用的最大安全并发，完成一张立即写回`
            : `已提交 ${requests.length} 个请求，最多使用 ${imageConcurrency} 路并发；完成一张立即写回`, "success");
        }
      } catch (error) {
        await Promise.allSettled(requests.map((request) => callTool("cancel_queued_request", { projectId: project.id, requestId: request.id })));
        await refreshProject(project.id);
        notify(`本次交接已取消，没有留下等待任务：${error instanceof Error ? error.message : String(error)}`, "error");
        return;
      }
      return requests;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const openImageGeneration = (shotIds: string[]) => {
    if (!project) return;
    const validIds = new Set(project.shots.map((shot) => shot.id));
    const ids = [...new Set(shotIds)].filter((shotId) => validIds.has(shotId));
    if (!ids.length) return notify("请先勾选至少一个分镜", "error");
    const imageBusy = new Set(ids.filter((shotId) => hasActiveImageRequest(project, shotId)));
    const videoBusy = new Set(ids.filter((shotId) => hasActiveVideoRequest(project, shotId)));
    const eligible = ids.filter((shotId) => !imageBusy.has(shotId) && !videoBusy.has(shotId));
    const skippedCount = ids.length - eligible.length;
    if (!eligible.length) return notify(`所选 ${ids.length} 镜都在处理中；完成一镜后即可单独继续`, "info");
    if (skippedCount) notify(`先处理可用的 ${eligible.length} 镜，已自动跳过 ${skippedCount} 镜处理中任务`, "info");
    setImageGenerationShotIds(eligible);
  };

  const generateBatch = () => openImageGeneration([...checkedShotIds]);

  const startImageGeneration = (shotId: string) => {
    if (!project) return;
    openImageGeneration([shotId]);
  };

  const toggleShotChecked = (shotId: string, selectRange: boolean) => {
    if (!project) return;
    setCheckedShotIds((current) => {
      const next = new Set(current);
      const shouldSelect = !next.has(shotId);
      const previousId = lastCheckedShotIdRef.current;
      if (selectRange && previousId) {
        const ordered = project.shots.slice().sort((a, b) => a.index - b.index);
        const previousIndex = ordered.findIndex((shot) => shot.id === previousId);
        const currentIndex = ordered.findIndex((shot) => shot.id === shotId);
        if (previousIndex >= 0 && currentIndex >= 0) {
          ordered.slice(Math.min(previousIndex, currentIndex), Math.max(previousIndex, currentIndex) + 1).forEach((shot) => {
            if (shouldSelect) next.add(shot.id); else next.delete(shot.id);
          });
        }
      } else if (shouldSelect) next.add(shotId);
      else next.delete(shotId);
      lastCheckedShotIdRef.current = shotId;
      return next;
    });
  };

  const selectUnrenderedShots = () => {
    if (!project) return;
    lastCheckedShotIdRef.current = undefined;
    setCheckedShotIds(new Set(project.shots.filter((shot) => !shot.imagePath || shot.imageStale).map((shot) => shot.id)));
  };

  const selectVideoReadyShots = () => {
    if (!project) return;
    lastCheckedShotIdRef.current = undefined;
    setCheckedShotIds(new Set(project.shots.filter((shot) => shot.imagePath && !shot.imageStale && !hasActiveImageRequest(project, shot.id) && !hasActiveVideoRequest(project, shot.id) && ["missing_prompt", "ready", "failed"].includes(shot.videoStatus)).map((shot) => shot.id)));
  };

  const notifyQueuedRequests = async () => {
    if (!project) return;
    const queuedIds = project.generationRequests.filter((request) => request.status === "queued").map((request) => request.id);
    if (!queuedIds.length) return notify("当前没有等待通知 Codex 的请求", "info");
    setBusy(true);
    try {
      await sendGenerationMessage(project.id, queuedIds, imageConcurrency);
      notify(imageConcurrency === "pro_max"
        ? `已将 ${queuedIds.length} 个请求交给 Codex；会按当前可用安全槽位并发处理`
        : `已将 ${queuedIds.length} 个请求交给 Codex，最多使用 ${imageConcurrency} 路并发`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const retryFailed = () => {
    if (!project) return;
    const failedIds = project.shots.filter((shot) => project.generationRequests.slice().reverse().find((request) => !isContactSheetKind(request.kind) && request.shotIds.includes(shot.id))?.status === "failed").map((shot) => shot.id);
    if (!failedIds.length) return notify("当前没有失败分镜", "info");
    setCheckedShotIds(new Set(failedIds));
    openImageGeneration(failedIds);
  };

  const saveCanvas = (viewport: Viewport, positions: Record<string, Point>, contactSheetPosition?: Point) => {
    if (!project) return;
    void callTool("save_canvas", { projectId: project.id, viewport, shotPositions: positions, contactSheetPosition }).catch((error) => {
      notify(error instanceof Error ? error.message : String(error), "error");
    });
  };

  const addNote = async () => {
    if (!project) return;
    const note: CanvasNote = {
      id: `note_${Date.now()}`,
      text: "双击分镜卡进入详细编辑；这里可以记录连续性提醒。",
      position: { x: project.canvas.contactSheetPosition.x + 380, y: 40 + project.canvas.notes.length * 160 },
      color: project.canvas.notes.length % 2 ? "sage" : "sand",
    };
    await saveNotes([...project.canvas.notes, note]);
  };

  const saveNotes = async (notes: CanvasNote[]) => {
    if (!project) return false;
    try {
      const result = await callTool<{ project: ProjectRecord }>("save_canvas", { projectId: project.id, notes });
      applyProjectSnapshot(result.project, project.id);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
      return false;
    }
  };

  const updateNote = (noteId: string, text: string) => {
    if (!project) return;
    void saveNotes(project.canvas.notes.map((note) => note.id === noteId ? { ...note, text: text.slice(0, 2000) } : note));
  };

  const deleteNote = (noteId: string) => {
    if (!project) return;
    void saveNotes(project.canvas.notes.filter((note) => note.id !== noteId));
  };

  const addShot = async () => {
    if (!project) return;
    const result = await callTool<{ project: ProjectRecord }>("add_shot", { projectId: project.id });
    if (applyProjectSnapshot(result.project, project.id)) setSelectedShotId(result.project.shots.at(-1)?.id);
  };

  const resizeShotCount = async (targetCount: number, confirmRemoval: boolean) => {
    if (!project) return false;
    setBusy(true);
    try {
      const result = await callTool<{ project: ProjectRecord }>("resize_shot_count", {
        projectId: project.id,
        targetCount,
        confirmRemoval,
      });
      if (applyProjectSnapshot(result.project, project.id)) {
        setCheckedShotIds((current) => new Set([...current].filter((shotId) => result.project.shots.some((shot) => shot.id === shotId))));
        if (selectedShotId && !result.project.shots.some((shot) => shot.id === selectedShotId)) setSelectedShotId(result.project.shots.at(-1)?.id);
        setShotCountOpen(false);
        notify(`已调整为 ${result.project.shots.length} 格分镜；宫格需要重新生成并确认`, "success");
      }
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const updateShot = async (shotId: string, patch: Record<string, unknown>, quiet = false): Promise<boolean> => {
    if (!project) return false;
    const projectId = project.id;
    try {
      const result = await callTool<{ project: ProjectRecord }>("update_shot", { projectId, shotId, ...patch });
      if (applyProjectSnapshot(result.project, projectId)) {
        if (!quiet) notify("分镜描述已保存", "success");
      }
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
      return false;
    }
  };

  const reviewContactSheet = async (approved: boolean) => {
    if (!project) return;
    setBusy(true);
    try {
      const result = await callTool<{ project: ProjectRecord }>("mark_contact_sheet_review", { projectId: project.id, approved });
      if (!applyProjectSnapshot(result.project, project.id)) return;
      if (approved) {
        const unrenderedIds = result.project.shots.filter((shot) => !shot.imagePath || shot.imageStale).map((shot) => shot.id);
        setCheckedShotIds(new Set(unrenderedIds));
        notify(`宫格已确认，已默认勾选 ${unrenderedIds.length} 张待生成分镜`, "success");
      } else {
        notify("已撤销宫格确认", "success");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!project || (autoAdvanceProjectRef.current !== project.id && !hasAutoContact(project.id))) return;
    if (directionAnalysisStartedAtRef.current && new Date(project.updatedAt).getTime() <= directionAnalysisStartedAtRef.current) {
      const timer = window.setTimeout(() => void refreshProject(project.id, false), 1200);
      return () => window.clearTimeout(timer);
    }
    const directionReady = project.stage !== "direction" && project.shots.some((shot) => shot.action.trim() || shot.instruction.trim());
    const contactReady = Boolean(project.brief.trim()) && project.shots.every((shot) => shot.scene.trim() || shot.action.trim() || shot.instruction.trim());
    const contactRequestActive = project.generationRequests.some((request) => (
      isContactSheetKind(request.kind) && ["queued", "generating", "saving"].includes(request.status)
    ));
    if (!directionReady || !contactReady) {
      const timer = window.setTimeout(() => void refreshProject(project.id, false), 1200);
      return () => window.clearTimeout(timer);
    }
    if (contactRequestActive || (project.contactSheetPath && !project.contactSheetStale)) {
      autoAdvanceProjectRef.current = undefined;
      directionAnalysisStartedAtRef.current = 0;
      consumeAutoContact(project.id);
      setDirectionAnalysisPending(false);
      return;
    }
    if (!project.contactSheetPath || project.contactSheetStale) {
      if (autoContactEnqueueProjectRef.current.has(project.id)) return;
      autoContactEnqueueProjectRef.current.add(project.id);
      void enqueue("contact_sheet", project.shots.map((shot) => shot.id), { instruction: "方向分析完成后自动生成宫格总览。" }).finally(() => {
        autoContactEnqueueProjectRef.current.delete(project.id);
        autoAdvanceProjectRef.current = undefined;
        directionAnalysisStartedAtRef.current = 0;
        consumeAutoContact(project.id);
        setDirectionAnalysisPending(false);
      });
    }
  }, [enqueue, project, refreshProject]);

  const undoShot = async (shotId: string) => {
    if (!project) return;
    try {
      const result = await callTool<{ project: ProjectRecord }>("undo_last_overwrite", { projectId: project.id, shotId });
      if (applyProjectSnapshot(result.project, project.id)) notify("已恢复上一张图片", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const deleteShot = async (shotId: string) => {
    if (!project) return;
    const result = await callTool<{ project: ProjectRecord }>("delete_shot", { projectId: project.id, shotId });
    if (applyProjectSnapshot(result.project, project.id)) {
      setSelectedShotId(result.project.shots[0]?.id);
      notify("分镜已删除", "success");
    }
  };

  const moveShot = async (shotId: string, direction: -1 | 1) => {
    if (!project) return;
    const result = await callTool<{ project: ProjectRecord }>("move_shot", { projectId: project.id, shotId, direction });
    applyProjectSnapshot(result.project, project.id);
  };

  const prepareVideoPrompts = async (shotIds: string[]) => {
    if (!project) return;
    const candidates = [...new Set(shotIds)].filter((shotId) => {
      const shot = project.shots.find((item) => item.id === shotId);
      return Boolean(shot?.imagePath && !shot.imageStale);
    });
    const eligible = candidates.filter((shotId) => !hasActiveImageRequest(project, shotId));
    if (!eligible.length) return notify("当前图片仍在写回；完成一张后会立即准备该镜视频提示词", "info");
    if (eligible.length < candidates.length) notify(`先准备已就绪的 ${eligible.length} 镜，其余图片写回后继续`, "info");
    const pipelineProjectId = project.id;
    try {
      updateVideoPromptPending(pipelineProjectId, (current) => {
        const next = new Map(current);
        for (const shotId of eligible) next.set(shotId, project.shots.find((shot) => shot.id === shotId)?.videoPlan?.updatedAt);
        return next;
      });
      await sendVideoPromptMessage(pipelineProjectId, eligible);
      notify(`正在准备 ${eligible.length} 个镜头的视频提示词，完成后会自动刷新`, "success");
    } catch (error) {
      updateVideoPromptPending(pipelineProjectId, (current) => new Map([...current].filter(([shotId]) => !eligible.includes(shotId))));
      updateAutoVideoIntent(pipelineProjectId, (current) => current.filter((shotId) => !eligible.includes(shotId)));
      notify(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const enterVideoWorkspace = () => {
    if (!project) return;
    const imageShots = project.shots.filter((shot) => shot.imagePath && !shot.imageStale);
    if (!imageShots.length) return notify("请先完成至少一张正式分镜图", "error");
    setWorkspaceMode("video");
    setViewPhase("production");
    setSelectedShotId((current) => current && imageShots.some((shot) => shot.id === current) ? current : imageShots[0].id);
    const readyIds = imageShots.filter((shot) => !hasActiveImageRequest(project, shot.id) && (!shot.videoPlan || shot.videoPlan.stale)).map((shot) => shot.id);
    setCheckedShotIds(new Set(imageShots.filter((shot) => !hasActiveImageRequest(project, shot.id) && !hasActiveVideoRequest(project, shot.id) && ["missing_prompt", "ready", "failed"].includes(shot.videoStatus)).map((shot) => shot.id)));
    if (readyIds.length && isCodexHost()) void prepareVideoPrompts(readyIds);
    else if (readyIds.length) notify("已有正式图；可手动填写视频提示词，或在 Codex 内打开后自动准备", "info");
  };

  const navigateWorkflowPhase = (phase: WorkflowPhase) => {
    if (!project) return;
    if (phase === "complete") {
      const allComplete = project.shots.length > 0 && project.shots.every((shot) => shot.imagePath && !shot.imageStale && shot.videoArtifact && !shot.videoArtifact.stale);
      if (!allComplete) return notify("全部分镜视频完成后才会进入“完成”阶段", "info");
      setViewPhase(phase);
      setWorkspaceMode("video");
      const completedShot = project.shots.find((shot) => shot.videoArtifact);
      if (completedShot) setSelectedShotId(completedShot.id);
      return;
    }
    setViewPhase(phase);
    setWorkspaceMode("image");
    if (phase === "direction" || phase === "storyboard") {
      setSelectedShotId(undefined);
      return;
    }
    const target = project.shots.find((shot) => !shot.imagePath || shot.imageStale) ?? project.shots[0];
    setSelectedShotId(target?.id);
  };

  const saveVideoPlan = async (shotId: string, input: { prompt: string; negativePrompt: string; frameRate: number; frameCount: number }): Promise<boolean> => {
    if (!project) return false;
    const previousShot = project.shots.find((shot) => shot.id === shotId);
    const materiallyChanged = !previousShot?.videoPlan
      || previousShot.videoPlan.prompt !== input.prompt.trim()
      || previousShot.videoPlan.negativePrompt !== input.negativePrompt.trim()
      || previousShot.videoPlan.frameCount !== input.frameCount;
    setBusy(true);
    try {
      const result = await callTool<{ project: ProjectRecord }>("update_video_plan", { projectId: project.id, shotId, ...input, source: "user" });
      if (applyProjectSnapshot(result.project, project.id)) notify(previousShot?.videoArtifact && materiallyChanged ? "提示词已写入；现有视频已标记为“旧提示词”" : "视频提示词已写入本镜方案", "success");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
      return false;
    } finally { setBusy(false); }
  };

  const submitVideosNow = async (shotIds: string[]): Promise<boolean> => {
    if (!project) return false;
    const candidates = [...new Set(shotIds)].filter((shotId) => project.shots.some((shot) => shot.id === shotId && shot.imagePath && !shot.imageStale));
    const unique = candidates.filter((shotId) => !hasActiveImageRequest(project, shotId) && !hasActiveVideoRequest(project, shotId));
    if (!unique.length) {
      notify("这些镜头仍在处理，已自动跳过重复提交", "info");
      return false;
    }
    const preferredProviderId = project.defaultVideoProviderId ?? defaultVideoProviderId;
    const provider = videoProviders.find((item) => item.id === preferredProviderId && item.enabled) ?? videoProviders.find((item) => item.enabled);
    if (!provider) {
      setProviderDrawerOpen(true);
      notify("请先接入一个可用的视频模型", "info");
      return false;
    }
    const requiresExternalCostConfirmation = providerRequiresExternalConfirmation(provider);
    if (requiresExternalCostConfirmation) {
      const confirmed = window.confirm(
        `即将把 ${unique.length} 个分镜发送到“${provider.name}”\n目标：${providerTargetOrigin(provider)}\n该接口可能产生费用，确认现在提交吗？`,
      );
      if (!confirmed) {
        notify("已取消提交，没有调用视频接口", "info");
        return false;
      }
    }
    videoSubmitCountRef.current += 1;
    setBusy(true);
    try {
      const result = await callTool<{ requests: VideoRequest[] }>("enqueue_video_generation", {
        projectId: project.id,
        shotIds: unique,
        providerId: provider.id,
        allowUnreviewed: true,
        allowStalePrompt: false,
        confirmExternalCost: requiresExternalCostConfirmation,
      });
      await refreshProject(project.id);
      notify(`已开始 ${result.requests?.length ?? unique.length} 个视频任务；进度会直接显示在分镜卡上`, "success");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
      return false;
    } finally {
      videoSubmitCountRef.current = Math.max(0, videoSubmitCountRef.current - 1);
      if (videoSubmitCountRef.current === 0) setBusy(false);
    }
  };

  const generateVideosFromCanvas = (shotIds: string[]) => {
    if (!project) return;
    const requestedIds = [...new Set(shotIds)].filter((shotId) => project.shots.some((shot) => shot.id === shotId));
    if (!requestedIds.length) return notify("请先勾选至少一个分镜", "error");
    if (!videoProviders.some((provider) => provider.enabled)) {
      setProviderDrawerOpen(true);
      return notify("先在“视频模型”中完成接入；配置只保存在本机", "info");
    }
    const pipelineIds = requestedIds.filter((shotId) => {
      const shot = project.shots.find((item) => item.id === shotId);
      if (!shot || hasActiveVideoRequest(project, shotId)) return false;
      return hasActiveImageRequest(project, shotId) || Boolean(shot.imagePath && !shot.imageStale);
    });
    if (!pipelineIds.length) return notify("所选分镜尚无可用正式图，也没有正在生成的图片", "error");
    const readyNow = pipelineIds.filter((shotId) => !hasActiveImageRequest(project, shotId));
    const waitingForImage = pipelineIds.length - readyNow.length;
    const skipped = requestedIds.length - pipelineIds.length;
    updateAutoVideoIntent(project.id, (current) => [...current, ...pipelineIds]);
    pipelineIds.forEach((shotId) => {
      const shot = project.shots.find((item) => item.id === shotId);
      updateAutoVideoWaitingImage(project.id, shotId, hasActiveImageRequest(project, shotId), shot?.imageSha256);
    });
    notify(
      waitingForImage
        ? `已开启滚动生成：先处理 ${readyNow.length} 镜，另有 ${waitingForImage} 镜在图片写回后自动继续${skipped ? `；跳过 ${skipped} 镜已有任务` : ""}`
        : `已开始处理 ${readyNow.length} 镜视频；每条提示词写回后立即提交${skipped ? `，跳过 ${skipped} 镜已有任务` : ""}`,
      "success",
    );
  };

  useEffect(() => {
    if (!project || loading || !videoProvidersLoaded || autoVideoIntentState.projectId !== project.id || autoVideoBatchShotIds.length === 0) return;
    if (!videoProviders.some((provider) => provider.enabled)) return;
    const relevantIds = autoVideoBatchShotIds.filter((shotId) => {
      const shot = project.shots.find((item) => item.id === shotId);
      if (!shot || hasActiveVideoRequest(project, shotId)) return false;
      const intent = rollingVideoIntentsRef.current[project.id]?.intents.find((item) => item.shotId === shotId);
      if (hasActiveImageRequest(project, shotId)) {
        if (!intent?.waitingForImage) updateAutoVideoWaitingImage(project.id, shotId, true, shot.imageSha256);
        return true;
      }
      if (intent?.waitingForImage) {
        const baselineSha = intent.baselineSha;
        updateAutoVideoWaitingImage(project.id, shotId, false);
        if (!shot.imagePath || shot.imageSha256 === baselineSha) return false;
      }
      return Boolean(shot.imagePath && !shot.imageStale);
    });
    if (relevantIds.length !== autoVideoBatchShotIds.length) {
      updateAutoVideoIntent(project.id, relevantIds);
    }

    const readyForPrompt = relevantIds.filter((shotId) => {
      const shot = project.shots.find((item) => item.id === shotId);
      return Boolean(shot?.imagePath && !shot.imageStale && !hasActiveImageRequest(project, shotId) && (!shot.videoPlan?.prompt || shot.videoPlan.stale) && !videoPromptPendingShotIds.has(shotId));
    });
    if (readyForPrompt.length) void prepareVideoPrompts(readyForPrompt);

    const readyForSubmit = relevantIds.filter((shotId) => {
      const shot = project.shots.find((item) => item.id === shotId);
      return Boolean(shot?.imagePath && !shot.imageStale && !hasActiveImageRequest(project, shotId) && shot.videoPlan?.prompt && !shot.videoPlan.stale && !autoVideoSubmittingShotIdsRef.current.has(projectShotKey(project.id, shotId)));
    });
    if (!readyForSubmit.length) return;
    const pipelineProjectId = project.id;
    for (const shotId of readyForSubmit) {
      const key = projectShotKey(pipelineProjectId, shotId);
      autoVideoSubmittingShotIdsRef.current.add(key);
      void submitVideosNow([shotId]).finally(() => {
        autoVideoSubmittingShotIdsRef.current.delete(key);
        updateAutoVideoIntent(pipelineProjectId, (current) => current.filter((currentShotId) => currentShotId !== shotId));
      });
    }
  }, [autoVideoBatchShotIds, autoVideoIntentState.projectId, loading, project?.updatedAt, updateAutoVideoIntent, updateAutoVideoWaitingImage, videoPromptPendingShotIds, videoProviders, videoProvidersLoaded]);

  const retryVideo = async (requestId: string) => {
    if (!project) return;
    try { await callTool("retry_video_request", { projectId: project.id, requestId }); await refreshProject(project.id); notify("该镜已重新排队", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); }
  };

  const cancelVideo = async (requestId: string) => {
    if (!project) return;
    try { await callTool("cancel_video_request", { projectId: project.id, requestId }); await refreshProject(project.id); notify("本地排队已取消", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); }
  };

  const createVideoProviderSetup = async (input: VideoProviderSetupInput): Promise<boolean> => {
    setBusy(true);
    let registeredSetup: VideoProviderSetup | undefined;
    try {
      const result = await callTool<VideoProviderSetupToolResult>("create_video_provider_setup", {
        ...input,
        exampleRequest: input.sampleRequest,
        exampleResponse: input.sampleResponse,
      });
      registeredSetup = setupFromToolResult(result);
      if (!registeredSetup) throw new Error("没有收到视频模型接入请求");
      setVideoProviderSetup(registeredSetup);
      const requestId = registeredSetup.id ?? registeredSetup.requestId;
      if (!requestId) throw new Error("视频模型接入请求缺少编号");
      await sendVideoProviderSetupMessage(requestId);
      notify("已交给 Codex 分析；关闭这里也会继续", "success");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (registeredSetup) {
        const requestId = registeredSetup.id ?? registeredSetup.requestId;
        if (requestId) {
          try { await callTool("cancel_video_provider_setup", { requestId }); } catch { /* keep the local failure explanation */ }
        }
        setVideoProviderSetup({ ...registeredSetup, status: "failed", error: message, updatedAt: new Date().toISOString() });
      }
      notify(message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const cancelVideoProviderSetup = async (requestId: string): Promise<void> => {
    setBusy(true);
    try {
      const result = await callTool<VideoProviderSetupToolResult>("cancel_video_provider_setup", { requestId });
      const cancelledSetup = setupFromToolResult(result);
      setVideoProviderSetup((current) => cancelledSetup ?? (current ? { ...current, status: "cancelled", updatedAt: new Date().toISOString() } : current));
      notify("已停止等待，接入资料仍保留在表单中", "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const saveVideoProvider = async (profile: VideoProviderProfile, workflowJson?: string, secret?: string): Promise<boolean> => {
    setBusy(true);
    try {
      await callTool("save_video_provider", { profile, workflowJson });
      if (secret) await saveProviderCredential(profile.id, secret);
      await loadVideoProviders();
      notify("视频模型配置只保存在本机", "success");
      return true;
    } catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); return false; }
    finally { setBusy(false); }
  };

  const removeVideoProviderCredential = async (providerId: string): Promise<boolean> => {
    setBusy(true);
    try {
      await deleteProviderCredential(providerId);
      await loadVideoProviders();
      notify("已从 Windows 本机安全存储中移除密钥", "success");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
      return false;
    } finally { setBusy(false); }
  };

  const deleteVideoProvider = async (providerId: string) => {
    setBusy(true);
    try { await callTool("delete_video_provider", { providerId }); await loadVideoProviders(); notify("视频模型已删除", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); }
    finally { setBusy(false); }
  };

  const testVideoProvider = async (providerId: string) => {
    setBusy(true);
    try { const result = await callTool<{ message: string; verification?: "endpoint" | "reachable-only" }>("test_video_provider", { providerId }); notify(result.message || "模型连接正常", result.verification === "reachable-only" ? "info" : "success"); }
    catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); }
    finally { setBusy(false); }
  };

  const setDefaultVideoProvider = async (providerId: string) => {
    setBusy(true);
    try { await callTool("set_default_video_provider", { providerId }); await loadVideoProviders(); notify("默认视频模型已更新", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); }
    finally { setBusy(false); }
  };

  const submitRegionEdit = async (payload: { instruction: string; maskDataUrl: string; annotatedPreviewDataUrl: string }) => {
    if (!project || !editingShot) return false;
    const created = Boolean((await enqueue("region_edit", [editingShot.id], {
      instruction: payload.instruction,
      selectionMaskDataUrl: payload.maskDataUrl,
      annotatedPreviewDataUrl: payload.annotatedPreviewDataUrl,
    }))?.length);
    if (created) setEditingShot(null);
    return created;
  };

  const submitWholeImageEdit = async (instruction: string): Promise<boolean> => {
    if (!project || project.templateId !== "image-editor" || !project.shots[0]?.imagePath) return false;
    return Boolean((await enqueue("image_edit", [project.shots[0].id], { instruction }))?.length);
  };

  const retryWorkspaceLoad = async () => {
    setLoading(true);
    try {
      await loadProjects();
      await loadVideoProviders();
      setStartupError(undefined);
      notify("工作台已重新连接", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStartupError(message);
      notify(message, "error");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className={`app-shell display-${displayMode}${focusMode ? " focus-mode" : ""}`}>
      <a className="skip-link" href="#main-workspace">跳到主工作区</a>
      <ProjectRail
        projects={projects}
        activeProjectId={switchingProjectId ?? project?.id}
        switchingProjectId={switchingProjectId}
        busy={busy}
        displayMode={displayMode}
        displayModeBusy={displayModeBusy}
        workspaceSurfaceSupport={workspaceSurfaceSupport}
        canChangeDisplayMode={canRequestDisplayMode()}
        onChangeDisplayMode={(mode) => void changeDisplayMode(mode)}
        onOpen={openProject}
        onOpenInSidebar={(id) => void openProjectInSidebar(id)}
        onDelete={setProjectPendingDeletion}
        onCreate={() => setCreateOpen(true)}
      />
      <button
        type="button"
        className="focus-rail-toggle"
        onClick={() => setFocusMode((current) => !current)}
        aria-label={focusMode ? "展开左侧栏" : "收起左侧栏"}
        aria-expanded={!focusMode}
        aria-controls="project-rail"
        title={focusMode ? "展开左侧栏" : "收起左侧栏"}
      >
        <span aria-hidden="true">{focusMode ? "›" : "‹"}</span>
      </button>
      <main id="main-workspace" className="workspace-main" tabIndex={-1}>
        {project ? (
          <>
            <WorkspaceHeader
              project={project}
              viewPhase={viewPhase}
              busy={busy}
              hasActiveRequests={hasActiveRequests}
              lastSyncedAt={lastSyncedAt}
              syncError={syncError}
              onRatio={(aspectRatio) => void updateProject({ aspectRatio })}
              refreshing={refreshing}
              onRefresh={() => void refreshCurrentProject()}
              onResizeShotCount={() => setShotCountOpen(true)}
              onAddNote={() => void addNote()}
              onOpenProviders={() => setProviderDrawerOpen(true)}
              onNavigatePhase={navigateWorkflowPhase}
            />
            {project.templateId !== "image-editor" && <WorkflowGuide
              project={project}
              checkedCount={checkedShotIds.size}
              busy={busy}
              providers={videoProviders}
              promptPendingCount={videoPromptPendingShotIds.size}
              directionAnalysisPending={directionAnalysisPending}
              formalBlockReason={formalBlockReason}
              onGenerateContactSheet={() => void enqueue("contact_sheet", project.shots.map((shot) => shot.id))}
              onGenerateBatch={generateBatch}
              onGenerateMissing={(shotIds) => openImageGeneration(shotIds)}
              onResumeQueued={() => void notifyQueuedRequests()}
              onCancelQueued={(requestIds) => void cancelQueuedGenerationRequests(requestIds)}
              onRecoverInterrupted={(requestIds) => void recoverInterruptedGenerationRequests(requestIds)}
              onStopDirectionWait={() => { autoAdvanceProjectRef.current = undefined; directionAnalysisStartedAtRef.current = 0; consumeAutoContact(project.id); setDirectionAnalysisPending(false); notify("已停止自动跟进；已发出的方向任务仍可能稍后写回", "info"); }}
              onPrepareVideos={() => void prepareVideoPrompts(project.shots.filter((shot) => shot.imagePath && !shot.imageStale && (!shot.videoPlan || shot.videoPlan.stale)).map((shot) => shot.id))}
              onStopPromptWait={() => { clearRollingVideoProject(project.id); notify("已停止自动跟进；已发出的提示词任务仍可能稍后写回", "info"); }}
              onSelectVideoReady={selectVideoReadyShots}
              onGenerateVideos={() => generateVideosFromCanvas([...checkedShotIds])}
              onProviders={() => setProviderDrawerOpen(true)}
            />}
            {project.templateId === "image-editor" && project.shots[0] ? (
              <SingleImageEditor
                project={project}
                shot={project.shots[0]}
                  activeRequest={singleEditorLatestRequest && ACTIVE_IMAGE_STATUSES.has(singleEditorLatestRequest.status) ? singleEditorLatestRequest : undefined}
                  failedRequest={singleEditorLatestRequest?.status === "failed" ? singleEditorLatestRequest : undefined}
                busy={busy}
                onUpload={(file) => void importEditorImage(file)}
                onWholeEdit={() => setWholeImageEditOpen(true)}
                onRegionEdit={() => setEditingShot(project.shots[0])}
                onUndo={() => void undoShot(project.shots[0].id)}
                onCancelRequest={(requestId) => void cancelQueuedGenerationRequests([requestId])}
              />
            ) : <div className="workspace-grid">
              <ReferencePanel
                key={`references:${project.id}`}
                project={project}
                busy={busy}
                onImport={importReference}
                onEditConstraint={setConstraintSlot}
                onRemove={(slot) => void removeReference(slot)}
              />
              <CanvasBoard
                key={`canvas:${project.id}`}
                project={project}
                busy={busy}
                selectedShotId={selectedShotId}
                focusTarget={viewPhase}
                layoutKey={`${displayMode}:${focusMode ? "focus" : "standard"}`}
                checkedShotIds={checkedShotIds}
                formalBlockReason={formalBlockReason}
                onSelectShot={(shotId, tab) => {
                  setSelectedShotId(shotId);
                  if (shotId) {
                    setWorkspaceMode(tab ?? "image");
                    setViewPhase("production");
                  }
                }}
                onToggleShot={toggleShotChecked}
                onGenerateShot={startImageGeneration}
                onCancelGenerationRequest={(requestId) => void cancelQueuedGenerationRequests([requestId])}
                onGenerateSelected={generateBatch}
                onGenerateSelectedShots={openImageGeneration}
                onEditRegion={setEditingShot}
                onPersistCanvas={(viewport, positions, contactSheetPosition) => saveCanvas(viewport, positions, contactSheetPosition)}
                onSelectAll={() => { lastCheckedShotIdRef.current = undefined; setCheckedShotIds(new Set(project.shots.map((shot) => shot.id))); }}
                onSelectUnrendered={selectUnrenderedShots}
                onClearSelection={() => { lastCheckedShotIdRef.current = undefined; setCheckedShotIds(new Set()); }}
                onRetryFailed={retryFailed}
                onGenerateVideoShot={(shotId) => generateVideosFromCanvas([shotId])}
                onGenerateSelectedVideos={() => generateVideosFromCanvas([...checkedShotIds])}
                onSelectVideoReady={selectVideoReadyShots}
                onRetryVideoFailed={() => generateVideosFromCanvas(project.shots.filter((shot) => shot.videoStatus === "failed").map((shot) => shot.id))}
                onReviewContactSheet={(approved) => void reviewContactSheet(approved)}
                onRebuildContactSheet={(instruction) => void enqueue("contact_sheet", project.shots.map((shot) => shot.id), { instruction })}
                onEditContactSheet={async (payload) => Boolean(await enqueue("contact_sheet_edit", payload.shotIds, {
                  instruction: payload.instruction,
                  selectionMaskDataUrl: payload.selectionMaskDataUrl,
                  annotatedPreviewDataUrl: payload.annotatedPreviewDataUrl,
                }))}
                onUpdateNote={updateNote}
                onDeleteNote={deleteNote}
              />
              {selectedShot && workspaceMode === "video" ? (
                <aside key={`video-inspector:${selectedShot.id}`} className="inspector-panel shot-inspector video-shot-inspector">
                  <div className="inspector-tabs"><button aria-pressed="false" onClick={() => { setWorkspaceMode("image"); setViewPhase("production"); }}>图片</button><button className="active" aria-pressed="true">视频</button></div>
                  <div className="panel-heading compact"><span className="eyebrow">分镜 {String(selectedShot.index + 1).padStart(2, "0")} / {project.shots.length}</span><h2>{selectedShot.title}</h2></div>
                  <VideoInspectorContent
                    key={`${selectedShot.id}-${selectedShot.videoPlan?.updatedAt ?? "none"}`}
                    projectId={project.id}
                    shot={selectedShot}
                    request={selectedVideoRequest}
                    providers={videoProviders}
                    defaultProviderId={project.defaultVideoProviderId ?? defaultVideoProviderId}
                    busy={busy}
                    promptPreparing={videoPromptPendingShotIds.has(selectedShot.id)}
                    imageRequestActive={Boolean(selectedImageRequest)}
                    onSavePlan={(input) => saveVideoPlan(selectedShot.id, input)}
                    onPreparePrompt={() => void prepareVideoPrompts([selectedShot.id])}
                    onStopPromptWait={() => {
                      updateVideoPromptPending(project.id, (current) => { const next = new Map(current); next.delete(selectedShot.id); return next; });
                      updateAutoVideoIntent(project.id, (current) => current.filter((shotId) => shotId !== selectedShot.id));
                    }}
                    onGenerate={() => generateVideosFromCanvas([selectedShot.id])}
                    onRetry={(requestId) => void retryVideo(requestId)}
                    onCancel={(requestId) => void cancelVideo(requestId)}
                  />
                </aside>
              ) : selectedShot ? (
                <ShotInspector
                  key={`shot-inspector:${selectedShot.id}`}
                  shot={selectedShot}
                  shotCount={project.shots.length}
                  busy={busy}
                  formalBlockReason={formalBlockReason}
                  activeRequest={selectedImageRequest}
                  failedRequest={selectedLatestImageRequest?.status === "failed" ? selectedLatestImageRequest : undefined}
                  videoRequestActive={selectedVideoRequestActive}
                  onSave={(patch) => updateShot(selectedShot.id, patch, true)}
                  onGenerate={() => startImageGeneration(selectedShot.id)}
                  onCancelRequest={(requestId) => void cancelQueuedGenerationRequests([requestId])}
                  onEdit={() => setEditingShot(selectedShot)}
                  onUndo={() => void undoShot(selectedShot.id)}
                  onDelete={() => void deleteShot(selectedShot.id)}
                  onMove={(direction) => void moveShot(selectedShot.id, direction)}
                  onVideoTab={enterVideoWorkspace}
                />
              ) : (
                <DirectionInspector
                  key={`direction-inspector:${project.id}`}
                  project={project}
                  busy={busy}
                  analysisPending={directionAnalysisPending}
                  onSave={(brief) => updateProject({ brief })}
                  onAnalyze={async () => {
                    autoAdvanceProjectRef.current = project.id;
                    directionAnalysisStartedAtRef.current = Date.now();
                    rememberAutoContact(project.id);
                    setDirectionAnalysisPending(true);
                    try { await sendDirectionMessage(project.id); notify("已交给 Codex 分析并生成宫格分镜图；关闭这里也会继续", "success"); }
                    catch (error) { autoAdvanceProjectRef.current = undefined; directionAnalysisStartedAtRef.current = 0; consumeAutoContact(project.id); setDirectionAnalysisPending(false); notify(error instanceof Error ? error.message : String(error), "error"); }
                  }}
                  onStopAnalysisWait={() => { autoAdvanceProjectRef.current = undefined; directionAnalysisStartedAtRef.current = 0; consumeAutoContact(project.id); setDirectionAnalysisPending(false); notify("已停止自动跟进；已发出的方向任务仍可能稍后写回", "info"); }}
                  onContactSheet={(instruction) => void enqueue("contact_sheet", project.shots.map((shot) => shot.id), { instruction })}
                  onReviewContactSheet={(approved) => void reviewContactSheet(approved)}
                />
              )}
            </div>}
          </>
        ) : (
          <EmptyWorkspace error={startupError} onRetry={() => void retryWorkspaceLoad()} onCreate={() => setCreateOpen(true)} />
        )}
      </main>
      {createOpen && <CreateProjectModal busy={busy} onClose={() => setCreateOpen(false)} onCreate={createProject} />}
      {wholeImageEditOpen && project?.templateId === "image-editor" && project.shots[0] && (
        <WholeImageEditModal title={project.shots[0].title} busy={busy} onClose={() => setWholeImageEditOpen(false)} onSubmit={submitWholeImageEdit} />
      )}
      {project && imageGenerationShotIds.length > 0 && (
        <ImageGenerationModal
          project={project}
          shotIds={imageGenerationShotIds}
          busy={busy}
          onClose={() => setImageGenerationShotIds([])}
          onSubmit={async (instruction) => {
            const submittedIds = [...imageGenerationShotIds];
            const created = Boolean((await enqueue("final", submittedIds, { instruction }))?.length);
            if (created) setCheckedShotIds((current) => new Set([...current].filter((shotId) => !submittedIds.includes(shotId))));
            return created;
          }}
        />
      )}
      {shotCountOpen && project && <ShotCountModal currentCount={project.shots.length} busy={busy} onClose={() => setShotCountOpen(false)} onResize={resizeShotCount} />}
      {projectPendingDeletion && (
        <DeleteProjectModal
          project={projectPendingDeletion}
          busy={busy}
          onClose={() => setProjectPendingDeletion(null)}
          onDelete={() => void deleteProject()}
        />
      )}
      {constraintSlot && project && (
        <ReferenceConstraintModal
          slot={constraintSlot}
          templateId={project.templateId}
          initialValue={project.referenceConstraints[constraintSlot] ?? ""}
          hasImage={Boolean(project.references[constraintSlot])}
          busy={busy}
          onClose={() => setConstraintSlot(null)}
          onSave={(value) => updateReferenceConstraint(constraintSlot, value)}
        />
      )}
      {editingShot && project && (
        <RegionEditor
          projectId={project.id}
          mediaVersion={editingShot.imageSha256 ?? editingShot.imagePath ?? project.id}
          shot={editingShot}
          busy={busy}
          onClose={() => setEditingShot(null)}
          onSubmit={submitRegionEdit}
        />
      )}
      {providerDrawerOpen && <VideoModelsDrawer providers={videoProviders} defaultProviderId={defaultVideoProviderId} setup={videoProviderSetup} busy={busy} codexAvailable={isCodexHost()} onClose={() => setProviderDrawerOpen(false)} onCreateSetup={createVideoProviderSetup} onCancelSetup={cancelVideoProviderSetup} onSave={saveVideoProvider} onOpenCredentialWindow={openProviderCredentialWindow} onRemoveCredential={removeVideoProviderCredential} onDelete={(id) => void deleteVideoProvider(id)} onTest={(id) => void testVideoProvider(id)} onDefault={(id) => void setDefaultVideoProvider(id)} />}
      {toast && <div className={`toast toast-${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"} aria-live={toast.tone === "error" ? "assertive" : "polite"} aria-atomic="true"><span>{toast.text}</span><button type="button" onClick={() => setToast(undefined)} aria-label="关闭提示">×</button></div>}
    </div>
  );
}

function LoadingScreen() {
  return <div className="loading-screen"><div className="brand-mark">IC</div><div><strong>图片生成中控</strong><span>正在读取本机项目…</span></div></div>;
}

function ProjectRail({ projects, activeProjectId, switchingProjectId, busy, displayMode, displayModeBusy, workspaceSurfaceSupport, canChangeDisplayMode, onChangeDisplayMode, onOpen, onOpenInSidebar, onDelete, onCreate }: {
  projects: ProjectSummary[];
  activeProjectId?: string;
  switchingProjectId?: string;
  busy: boolean;
  displayMode: DisplayMode;
  displayModeBusy: boolean;
  workspaceSurfaceSupport: WorkspaceSurfaceSupport;
  canChangeDisplayMode: boolean;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  onOpen: (id: string) => void | Promise<boolean>;
  onOpenInSidebar: (id: string) => void;
  onDelete: (project: ProjectSummary) => void;
  onCreate: () => void;
}) {
  const showDisplayModeAction = displayMode === "inline" || canChangeDisplayMode;
  const displayActionDisabled = displayMode === "inline" && workspaceSurfaceSupport === "inline-only";
  const displayAction = displayMode === "fullscreen"
    ? workspaceSurfaceSupport === "sidebar"
      ? { mode: "pip" as const, icon: "▯", label: "返回侧边栏", detail: "收回到右侧，继续当前项目" }
      : { mode: "inline" as const, icon: "↙", label: "返回对话预览", detail: "收起完整画布，继续当前项目" }
    : displayMode === "pip"
      ? { mode: "fullscreen" as const, icon: "↗", label: "展开工作区", detail: "需要更大画布时再展开" }
      : workspaceSurfaceSupport === "inline-only"
        ? { mode: "inline" as const, icon: "·", label: "当前仅支持对话预览", detail: "Codex 暂未开放侧栏或大工作区" }
        : workspaceSurfaceSupport === "fullscreen"
          ? { mode: "fullscreen" as const, icon: "↗", label: "展开大工作区", detail: "侧边栏暂不可用，改用完整画布" }
          : { mode: "pip" as const, icon: "▯", label: "在侧边栏打开", detail: "默认在右侧持续编辑" };
  return (
    <nav id="project-rail" className="project-rail" aria-label="图片项目">
      <div className="rail-brand"><div className="brand-mark">IC</div><div><strong>图片中控</strong><span>单图编辑 · 分镜 · 视频</span></div></div>
      {showDisplayModeAction && (
        <button className={`display-mode-button${displayActionDisabled ? " is-unavailable" : ""}`} onClick={() => onChangeDisplayMode(displayAction.mode)} disabled={displayModeBusy || displayActionDisabled} aria-label={displayAction.label}>
          <span className="display-mode-icon" aria-hidden="true">{displayAction.icon}</span>
          <span>
            <strong>{displayModeBusy ? "正在切换…" : displayAction.label}</strong>
            <small>{displayAction.detail}</small>
          </span>
        </button>
      )}
      <button className="new-project-button" onClick={onCreate}>＋ 新建项目</button>
      <div className="rail-section-title"><span>最近项目</span><b>{projects.length}</b></div>
      <div className="project-list">
        {projects.length === 0 ? <p className="rail-empty">还没有工作区。可以直接上传一张图片开始编辑，也可以创建分镜项目。</p> : projects.map((item) => (
          <div key={item.id} className="project-list-entry">
            <button className={`project-item ${item.id === activeProjectId ? "active" : ""} ${item.id === switchingProjectId ? "is-switching" : ""}`} aria-current={item.id === activeProjectId ? "page" : undefined} aria-busy={item.id === switchingProjectId || undefined} onClick={() => onOpen(item.id)} disabled={item.id === switchingProjectId}>
              <span className="project-thumb">
                {item.previewPath ? (
                  <MediaImage projectId={item.id} mediaPath={item.previewPath} variant="thumbnail" version={item.previewUrl ?? item.previewPath} alt={`${item.name} 预览`} />
                ) : <i>{item.templateId === "image-editor" ? "编辑" : "分镜"}</i>}
              </span>
              <span className="project-meta"><strong>{item.name}</strong><small>{item.templateId === "image-editor" ? `${item.acceptedCount ? "已有当前图" : "等待上传"} · ${formatDate(item.updatedAt)}` : `${item.acceptedCount}/${item.shotCount} 已出图 · ${formatDate(item.updatedAt)}`}</small><em style={{ width: `${projectProgress(item)}%` }} /></span>
            </button>
            {showDisplayModeAction && workspaceSurfaceSupport !== "inline-only" && <button
              className="project-sidebar-open"
              type="button"
              disabled={displayModeBusy || item.id === switchingProjectId}
              onClick={() => onOpenInSidebar(item.id)}
              aria-label={`${workspaceSurfaceSupport === "fullscreen" ? "在大工作区" : "在侧边栏"}打开项目 ${item.name}`}
              title={workspaceSurfaceSupport === "fullscreen" ? "在大工作区打开" : "在侧边栏打开"}
            >{workspaceSurfaceSupport === "fullscreen" ? "工作区" : "侧栏"}</button>}
            <button
              className="project-delete-button"
              type="button"
              disabled={busy}
              onClick={() => onDelete(item)}
              aria-label={`彻底删除项目 ${item.name}`}
              title="彻底删除项目"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg>
            </button>
          </div>
        ))}
      </div>
      <div className="rail-footer"><span className={`host-dot ${isCodexHost() ? "online" : "offline"}`} />{isCodexHost() ? "内置生图可用 · 视频后台常驻" : "浏览模式 · 视频后台仍可运行"}</div>
    </nav>
  );
}

function DeleteProjectModal({ project, busy, onClose, onDelete }: {
  project: ProjectSummary;
  busy: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLElement>(onClose, busy);
  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section ref={dialogRef} className="delete-project-modal" role="dialog" aria-modal="true" aria-labelledby="delete-project-title" tabIndex={-1}>
        <div className="delete-project-icon" aria-hidden="true">!</div>
        <div>
          <span className="eyebrow">不可恢复操作</span>
          <h2 id="delete-project-title">彻底删除“{project.name}”？</h2>
          <p>项目记录、参考图、宫格、正式分镜图、一次撤销备份和运行临时文件都会从 D 盘永久删除。</p>
        </div>
        <div className="delete-project-summary">
          <span>{project.shotCount} 个分镜</span>
          <span>{project.acceptedCount} 张已出图</span>
          <span>更新于 {formatDate(project.updatedAt)}</span>
        </div>
        <footer>
          <button className="quiet-button" type="button" onClick={onClose} disabled={busy}>取消</button>
          <button className="destructive-button" type="button" onClick={onDelete} disabled={busy}>{busy ? "正在彻底删除…" : "确认彻底删除"}</button>
        </footer>
      </section>
    </div>
  );
}

function ReferenceConstraintModal({ slot, templateId, initialValue, hasImage, busy, onClose, onSave }: {
  slot: ReferenceSlot;
  templateId: TemplateId;
  initialValue: string;
  hasImage: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (value: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(initialValue);
  const [fileError, setFileError] = useState<string>();
  const metadata = referenceDefinitions(templateId).find((item) => item.slot === slot)!;
  const dialogRef = useDialogFocus<HTMLElement>(onClose, busy);

  const importPromptFile = async (file?: File) => {
    if (!file) return;
    setFileError(undefined);
    if (file.size > 64 * 1024) {
      setFileError("提示词文件不能超过 64KB");
      return;
    }
    if (!/\.(txt|md)$/i.test(file.name) && !["text/plain", "text/markdown"].includes(file.type)) {
      setFileError("只支持 TXT 或 Markdown 文件");
      return;
    }
    try {
      const text = await file.text();
      setValue(text.slice(0, 8000));
    } catch {
      setFileError("无法读取这个提示词文件");
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section ref={dialogRef} className="constraint-modal" role="dialog" aria-modal="true" aria-labelledby="constraint-title" tabIndex={-1}>
        <header>
          <div><span className="eyebrow">图片之外的约束</span><h2 id="constraint-title">{metadata.label} · 文字约束</h2></div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="关闭文字约束">×</button>
        </header>
        <p className="constraint-intro">文字可以单独使用，也可以补充图片没有表达清楚的结构、比例与连续性。{hasImage ? "当前图片会与这段文字共同参与生成。" : "当前没有图片，保存文字后即可满足这个参考槽位。"}</p>
        <label>约束内容<textarea autoFocus value={value} maxLength={8000} onChange={(event) => setValue(event.target.value)} placeholder={metadata.example} /></label>
        <div className="constraint-meta"><span>{value.length} / 8000</span><span>建议写稳定特征，不必堆砌画质词</span></div>
        <label className="prompt-file-button">
          <input type="file" accept=".txt,.md,text/plain,text/markdown" disabled={busy} onChange={(event) => {
            void importPromptFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }} />
          导入 TXT / Markdown 提示词
        </label>
        {fileError && <p className="inline-error" role="alert">{fileError}</p>}
        <div className="constraint-example"><span>写法示例</span><p>{metadata.example}</p></div>
        <footer>
          <button className="text-button" type="button" onClick={() => setValue("")} disabled={busy || !value}>清空文字</button>
          <button className="quiet-button" type="button" onClick={onClose} disabled={busy}>取消</button>
          <button className="primary-button" type="button" onClick={() => void onSave(value)} disabled={busy}>{busy ? "正在保存…" : "保存文字约束"}</button>
        </footer>
      </section>
    </div>
  );
}

function WorkspaceHeader({ project, viewPhase, busy, refreshing, hasActiveRequests, lastSyncedAt, syncError, onRatio, onRefresh, onResizeShotCount, onAddNote, onOpenProviders, onNavigatePhase }: {
  project: ProjectRecord; busy: boolean; viewPhase?: WorkflowPhase;
  refreshing: boolean; hasActiveRequests: boolean; lastSyncedAt?: number; syncError?: string;
  onRatio: (ratio: AspectRatio) => void; onRefresh: () => void; onResizeShotCount: () => void; onAddNote: () => void;
  onOpenProviders: () => void;
  onNavigatePhase: (phase: WorkflowPhase) => void;
}) {
  const imageShots = project.shots.filter((shot) => shot.imagePath && !shot.imageStale);
  const allVideosReady = imageShots.length === project.shots.length && imageShots.every((shot) => shot.videoArtifact && !shot.videoArtifact.stale);
  const activePhase: WorkflowPhase = viewPhase ?? (project.stage === "direction" || project.stage === "storyboard" ? project.stage : allVideosReady ? "complete" : "production");
  const activePhaseIndex = STAGES.findIndex((stage) => stage.id === activePhase);
  const queuedImageCount = project.generationRequests.filter((request) => request.status === "queued").length;
  const runningImageCount = project.generationRequests.filter((request) => ["generating", "saving"].includes(request.status)).length;
  const activeVideoCount = project.videoRequests.filter((request) => ["queued", "waiting_remote", "uploading", "submitting", "running", "downloading"].includes(request.status)).length;
  const activeCount = queuedImageCount + runningImageCount + activeVideoCount;
  const activityLabel = queuedImageCount > 0 && runningImageCount + activeVideoCount === 0 ? `${queuedImageCount} 项等待交接` : `${activeCount} 项处理中`;
  const singleEditor = project.templateId === "image-editor";
  return (
    <header className="workspace-header">
      <div className="project-heading"><span>{singleEditor ? "单图编辑工作区" : "通用分镜项目"}</span><h1>{project.name}</h1></div>
      {singleEditor ? <div className="editor-stage-track" aria-label="单图编辑流程"><span className={project.shots[0]?.imagePath ? "done" : "active"}>01 上传</span><i>→</i><span className={project.shots[0]?.imagePath ? "active" : ""}>02 描述或标记</span><i>→</i><span>03 继续修改</span></div> : <div className="stage-track" aria-label="项目阶段">
        {STAGES.map((stage, index) => <button key={stage.id} type="button" className={`${activePhase === stage.id ? "active" : ""}${index < activePhaseIndex ? " done" : ""}`} aria-current={activePhase === stage.id ? "step" : undefined} disabled={stage.id === "complete" && !allVideosReady} title={stage.id === "complete" && !allVideosReady ? "全部分镜视频完成后开放" : undefined} onClick={() => onNavigatePhase(stage.id)}><small>{stage.index}</small>{stage.label}</button>)}
      </div>}
      <div className="header-actions">
        <select value={project.aspectRatio} onChange={(event) => onRatio(event.target.value as AspectRatio)} aria-label="画面比例" disabled={busy || hasActiveRequests} title={hasActiveRequests ? "生成任务完成后可修改画面比例" : undefined}>
          {(["9:16", "3:4", "1:1", "16:9"] as AspectRatio[]).map((ratio) => <option key={ratio}>{ratio}</option>)}
        </select>
        <button className={`sync-button${hasActiveRequests ? " is-live" : ""}${syncError ? " has-error" : ""}`} onClick={onRefresh} disabled={busy || refreshing} title={syncError ?? "重新读取本机项目、队列、图片和视频状态"}><i /><span><strong>{refreshing ? "同步中…" : syncError ? "连接中断" : hasActiveRequests ? activityLabel : "状态正常"}</strong><small>{syncError ? "点击立即重试" : queuedImageCount > 0 ? "可在流程栏取消等待" : hasActiveRequests ? "每秒自动同步" : formatSyncTime(lastSyncedAt)}</small></span></button>
        <details className="header-more-menu" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.removeAttribute("open"); }} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.removeAttribute("open"); (event.currentTarget.querySelector("summary") as HTMLElement | null)?.focus(); } }}>
          <summary aria-label="更多项目工具">更多</summary>
          <div>
            {!singleEditor && <button type="button" onClick={(event) => { onOpenProviders(); event.currentTarget.closest("details")?.removeAttribute("open"); }}><span>视频模型</span><small>Codex 自动接入</small></button>}
            {!singleEditor && <button type="button" onClick={(event) => { onAddNote(); event.currentTarget.closest("details")?.removeAttribute("open"); }}><span>添加便签</span><small>画布标记</small></button>}
            {!singleEditor && <button type="button" onClick={(event) => { onResizeShotCount(); event.currentTarget.closest("details")?.removeAttribute("open"); }} disabled={busy || hasActiveRequests} title={hasActiveRequests ? "生成任务完成后可调整分镜数量" : undefined}><span>调整分镜数量</span><small>{project.shots.length} 格</small></button>}
          </div>
        </details>
      </div>
    </header>
  );
}

function WorkflowGuide({ project, checkedCount, busy, providers, promptPendingCount, directionAnalysisPending, formalBlockReason, onGenerateContactSheet, onGenerateBatch, onGenerateMissing, onResumeQueued, onCancelQueued, onRecoverInterrupted, onStopDirectionWait, onPrepareVideos, onStopPromptWait, onSelectVideoReady, onGenerateVideos, onProviders }: {
  project: ProjectRecord;
  checkedCount: number;
  busy: boolean;
  providers: VideoProviderProfile[];
  promptPendingCount: number;
  directionAnalysisPending: boolean;
  formalBlockReason?: string;
  onGenerateContactSheet: () => void;
  onGenerateBatch: () => void;
  onGenerateMissing: (shotIds: string[]) => void;
  onResumeQueued: () => void;
  onCancelQueued: (requestIds: string[]) => void;
  onRecoverInterrupted: (requestIds: string[]) => void;
  onStopDirectionWait: () => void;
  onPrepareVideos: () => void;
  onStopPromptWait: () => void;
  onSelectVideoReady: () => void;
  onGenerateVideos: () => void;
  onProviders: () => void;
}) {
  const directionReady = project.stage !== "direction" && project.shots.some((shot) => shot.action.trim() || shot.instruction.trim());
  const contactActive = project.generationRequests.some((request) => isContactSheetKind(request.kind) && ["queued", "generating", "saving"].includes(request.status));
  const contactApproved = Boolean(project.contactSheetPath && !project.contactSheetStale && project.contactSheetApprovedAt);
  const imageShots = project.shots.filter((shot) => shot.imagePath && !shot.imageStale);
  const unrenderedCount = project.shots.filter((shot) => !shot.imagePath || shot.imageStale).length;
  const allImagesReady = imageShots.length === project.shots.length;
  const missingPrompts = imageShots.filter((shot) => !shot.videoPlan?.prompt || shot.videoPlan.stale);
  const activeVideos = project.videoRequests.filter((request) => ["queued", "waiting_remote", "uploading", "submitting", "running", "downloading"].includes(request.status));
  const completedVideos = imageShots.filter((shot) => shot.videoArtifact && !shot.videoArtifact.stale).length;
  const failedVideos = imageShots.filter((shot) => shot.videoStatus === "failed").length;
  const hasVideoProvider = providers.some((provider) => provider.enabled);
  const queuedRequests = project.generationRequests.filter((request) => request.status === "queued");
  const queuedCount = queuedRequests.length;
  const eligibleUnrenderedIds = project.shots.filter((shot) => (!shot.imagePath || shot.imageStale) && !hasActiveImageRequest(project, shot.id) && !hasActiveVideoRequest(project, shot.id)).map((shot) => shot.id);
  const runningImageCount = project.generationRequests.filter((request) => !isContactSheetKind(request.kind) && ["generating", "saving"].includes(request.status)).reduce((total, request) => total + request.shotIds.length, 0);
  const queuedImageCount = project.generationRequests.filter((request) => !isContactSheetKind(request.kind) && request.status === "queued").reduce((total, request) => total + request.shotIds.length, 0);
  const stalledQueuedCount = queuedRequests.filter((request) => Date.now() - new Date(request.updatedAt).getTime() > 45_000).length;
  const recoverableRequests = project.generationRequests.filter((request) => isRecoverableGenerationRequest(request));
  const nextStep = directionAnalysisPending
    ? { title: "正在分析并生成宫格分镜图", text: "分镜文字写回后会自动生成宫格；如果已在对话中停止任务，可在右侧结束等待。" }
    : queuedCount > 0
    ? { title: contactActive ? "宫格请求等待交接" : `${queuedCount} 个图片请求等待交接`, text: stalledQueuedCount ? "请求一段时间没有进展，可以安全地再次通知 Codex，也可以取消等待且保留当前图片。" : imageShots.length ? `${imageShots.length} 张已写回，可先用已完成图片做视频；其余请求继续在后台处理。` : "请求已登记并自动交给 Codex；需要改变主意时可直接取消等待。" }
    : recoverableRequests.length > 0
    ? { title: `${recoverableRequests.length} 个图片任务已中断`, text: "生成租约已经过期。释放后可安全重新登记，旧任务的迟到结果不会覆盖新图片。" }
    : !directionReady
    ? { title: "先确定方向并生成宫格", text: "在右侧填写摘要并交给 Codex 分析；完成后会自动生成宫格分镜图。" }
    : !project.contactSheetPath || project.contactSheetStale
      ? { title: contactActive ? "正在生成宫格总览" : `下一步：生成 ${project.shots.length} 格宫格`, text: contactActive ? "Codex 正在根据方向、参考和逐镜动作绘制无文字宫格。" : "先用整体宫格确认角色、服装、场景与叙事节奏。" }
      : !contactApproved
        ? { title: "检查宫格并提出意见", text: "在宫格卡片中可写“第几格怎么改”，重做满意后再确认。" }
        : unrenderedCount > 0
          ? { title: `还需生成 ${unrenderedCount} 张正式图`, text: runningImageCount || queuedImageCount ? `${imageShots.length}/${project.shots.length} 已写回 · ${runningImageCount} 生成中 · ${queuedImageCount} 等待交接。每张完成后会立即出现。` : "图片生成后立即可用；可直接重做、局部修改或在同一卡片生成视频。" }
          : !hasVideoProvider
            ? { title: "图片已齐，接入一个视频模型", text: "可以直接用大白话让 Codex 帮你配置；模型地址、工作流和密钥只保存在本机。" }
            : promptPendingCount > 0
              ? { title: `正在准备 ${promptPendingCount} 条视频提示词`, text: "提示词写回后会自动开始你刚才选择的视频任务，无需再次点击。" }
              : activeVideos.length > 0
                ? { title: `${activeVideos.length} 个视频正在后台处理`, text: "每张分镜卡会显示独立进度；切换项目或对话不会中断。" }
                : failedVideos > 0
                  ? { title: `${failedVideos} 个视频可单独重试`, text: "失败不影响其他镜头；可在原卡片直接重新生成。" }
                  : missingPrompts.length > 0
                    ? { title: "直接选择分镜生成视频", text: "点击后会自动补齐所需提示词并继续生成，也可以先批量准备。" }
                    : completedVideos === imageShots.length
                      ? { title: "图片与视频都已回到同一画布", text: "可以继续重做任意图片或视频，也可在卡片内切换预览。" }
                      : { title: "选择任意分镜生成视频", text: "单镜、任意多选和全选都在画布底部完成。" };
  return (
    <section className="workflow-guide" aria-label="当前工作流程">
      <div className="workflow-steps">
        <span className={directionReady ? "done" : "active"}><b>01</b>方向</span>
        <span className={contactApproved ? "done" : directionReady ? "active" : ""}><b>02</b>宫格</span>
        <span className={allImagesReady ? "done" : contactApproved ? "active" : ""}><b>03</b>图片</span>
        <span className={completedVideos === imageShots.length && imageShots.length > 0 ? "done" : allImagesReady ? "active" : ""}><b>04</b>视频</span>
      </div>
      <div className="workflow-next">
        <div><span>现在该做什么</span><strong>{nextStep.title}</strong><p>{nextStep.text}</p></div>
        {recoverableRequests.length > 0 && <button className="primary-button" onClick={() => onRecoverInterrupted(recoverableRequests.map((request) => request.id))} disabled={busy}>释放中断任务</button>}
        {directionAnalysisPending ? <button className="text-button" onClick={onStopDirectionWait} disabled={busy}>不再等待</button> : queuedCount > 0 ? <div className="queued-guide-actions">{stalledQueuedCount > 0 && <button className="quiet-button" onClick={onResumeQueued} disabled={busy}>再次通知 Codex</button>}<button className="text-button" onClick={() => onCancelQueued(queuedRequests.map((request) => request.id))} disabled={busy}>取消等待</button></div> : directionReady && (!project.contactSheetPath || project.contactSheetStale) && !contactActive && (
          <button className="quiet-button" onClick={onGenerateContactSheet} disabled={busy}>生成宫格</button>
        )}
        {contactApproved && unrenderedCount > 0 && (checkedCount > 0 || eligibleUnrenderedIds.length > 0) && <button className="primary-button" onClick={checkedCount ? onGenerateBatch : () => onGenerateMissing(eligibleUnrenderedIds)} disabled={busy || Boolean(formalBlockReason)} title={formalBlockReason}>{checkedCount ? `处理已选 ${checkedCount} 张` : `生成可用的 ${eligibleUnrenderedIds.length} 张`}</button>}
        {imageShots.length > 0 && !hasVideoProvider && <button className="primary-button" onClick={onProviders}>接入视频模型</button>}
        {imageShots.length > 0 && hasVideoProvider && promptPendingCount > 0 && <button className="text-button" onClick={onStopPromptWait}>停止等待</button>}
        {imageShots.length > 0 && hasVideoProvider && checkedCount > 0 && <button className="primary-button" onClick={onGenerateVideos} disabled={busy}>先做已选 {checkedCount} 镜</button>}
        {imageShots.length > 0 && hasVideoProvider && promptPendingCount === 0 && checkedCount === 0 && missingPrompts.length > 0 && <button className="quiet-button" onClick={onPrepareVideos} disabled={busy}>准备已完成图片的提示词</button>}
        {imageShots.length > 0 && hasVideoProvider && promptPendingCount === 0 && checkedCount === 0 && missingPrompts.length === 0 && completedVideos < imageShots.length && <button className="quiet-button" onClick={onSelectVideoReady}>选择可生成视频</button>}
      </div>
    </section>
  );
}

function ReferencePanel({ project, busy, onImport, onEditConstraint, onRemove }: {
  project: ProjectRecord;
  busy: boolean;
  onImport: (slot: ReferenceSlot, file: File) => void;
  onEditConstraint: (slot: ReferenceSlot) => void;
  onRemove: (slot: ReferenceSlot) => void;
}) {
  const [confirmRemoveSlot, setConfirmRemoveSlot] = useState<ReferenceSlot | null>(null);
  const definitions = referenceDefinitions(project.templateId);
  return (
    <aside className="reference-panel">
      <div className="panel-heading"><span className="eyebrow">参考与约束</span><h2>主体与场景</h2><p>用图片或文字固定角色、动物、商品、造型和场景。多角色请按角色名称分别描述；每一镜的精确数量与身份关系在“出场主体锁定”中填写。</p></div>
      <div className="reference-stack">
        {definitions.map(({ slot, label }) => {
          const asset = project.references[slot];
          const hasConstraint = Boolean(project.referenceConstraints[slot]?.trim());
          return (
            <article key={slot} className={`reference-card ${asset || hasConstraint ? "is-ready" : "missing"}`}>
              <label className="reference-image-control" title={asset ? `替换${label}参考图` : `上传${label}参考图`}>
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onImport(slot, file);
                  event.currentTarget.value = "";
                }} />
                {asset ? (
                  <MediaImage projectId={project.id} mediaPath={asset.path} variant="thumbnail" version={asset.createdAt} alt={`${label}参考图`} />
                ) : <span className="reference-placeholder">＋</span>}
              </label>
              <div className="reference-card-copy">
                <strong>{label}</strong>
                <div className="reference-presence" aria-label={`${label}约束状态`}>
                  <span className={asset ? "active" : ""}>图片</span>
                  <span className={hasConstraint ? "active" : ""}>文字</span>
                </div>
                <button className="reference-constraint-button" type="button" onClick={() => onEditConstraint(slot)} disabled={busy}>{hasConstraint ? "编辑文字约束" : "添加文字约束"}</button>
              </div>
              {asset && <button className="reference-remove-button" type="button" onClick={() => setConfirmRemoveSlot(slot)} disabled={busy} title={`移除${label}参考图`} aria-label={`移除${label}参考图`}>×</button>}
              {confirmRemoveSlot === slot && (
                <div className="reference-remove-confirm" role="group" aria-label={`确认移除${label}参考图`}>
                  <span>只移除图片？</span>
                  <button type="button" onClick={() => { setConfirmRemoveSlot(null); onRemove(slot); }} disabled={busy}>移除</button>
                  <button type="button" onClick={() => setConfirmRemoveSlot(null)} disabled={busy}>取消</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className="reference-ready">参考项都可按需要选填。涉及多个主体时，请给每个角色单独命名并固定外形，再到分镜卡写清本镜出场数量。</p>
    </aside>
  );
}

function DirectionInspector({ project, busy, analysisPending, onSave, onAnalyze, onStopAnalysisWait, onContactSheet, onReviewContactSheet }: {
  project: ProjectRecord;
  busy: boolean;
  analysisPending: boolean;
  onSave: (brief: string) => Promise<boolean>;
  onAnalyze: () => Promise<void>;
  onStopAnalysisWait: () => void;
  onContactSheet: (instruction?: string) => void;
  onReviewContactSheet: (approved: boolean) => void;
}) {
  const draftKey = `image-control:direction-draft:${project.id}`;
  const restoredBrief = useMemo(() => {
    try { return window.sessionStorage.getItem(draftKey) ?? undefined; } catch { return undefined; }
  }, [draftKey]);
  const [brief, setBrief] = useState(restoredBrief ?? project.brief);
  const [briefDirty, setBriefDirty] = useState(restoredBrief !== undefined && restoredBrief !== project.brief);
  const [submitting, setSubmitting] = useState(false);
  const directionReady = project.stage !== "direction" && project.shots.some((shot) => shot.action.trim() || shot.instruction.trim());
  const incompleteShots = project.shots.filter((shot) => !shot.scene.trim() && !shot.action.trim() && !shot.instruction.trim());
  const missingCastShots = project.shots.filter((shot) => !shot.cast.trim());
  const supplementShots = project.shots.filter((shot) => incompleteShots.includes(shot) || missingCastShots.includes(shot));
  const needsSupplement = supplementShots.length > 0;
  const contactReady = Boolean(brief.trim()) && supplementShots.length === 0;
  const contactRequest = project.generationRequests.slice().reverse().find((request) => isContactSheetKind(request.kind) && ["queued", "generating", "saving"].includes(request.status));

  useEffect(() => {
    if (!briefDirty) setBrief(project.brief);
  }, [briefDirty, project.brief]);

  useEffect(() => {
    try {
      if (briefDirty) window.sessionStorage.setItem(draftKey, brief);
      else window.sessionStorage.removeItem(draftKey);
    } catch { /* embedded hosts can disable session storage */ }
  }, [brief, briefDirty, draftKey]);

  const persistBrief = async () => {
    const saved = await onSave(brief);
    if (saved) setBriefDirty(false);
    return saved;
  };

  const saveThenAnalyze = async () => {
    setSubmitting(true);
    try {
      const saved = await persistBrief();
      if (saved) await onAnalyze();
    } finally {
      setSubmitting(false);
    }
  };

  const saveThenContact = async () => {
    setSubmitting(true);
    try {
      const saved = briefDirty ? await persistBrief() : true;
      if (saved) onContactSheet();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside className="inspector-panel">
      <div className="panel-heading"><span className="eyebrow">项目方向</span><h2>{directionReady ? "方向已整理，先看整体" : "先把模糊想法说清"}</h2><p>{directionReady ? `当前已有 ${project.shots.length} 个连续分镜，先用宫格确认身份、服装、场景和节奏。` : "写目标、人物、场景或情绪即可，完整提示词由后台维护。"}</p></div>
      <label>{directionReady ? "已确认方向" : "创作摘要"}<textarea value={brief} onChange={(event) => { setBrief(event.target.value); setBriefDirty(true); }} placeholder="例如：一天的真实生活 Vlog，蓝色背心与牛仔裤，临时赴约，从家里整理到街口等待。" /></label>
      <button className="quiet-button wide" onClick={() => void persistBrief()} disabled={busy || submitting || !briefDirty}>保存摘要</button>
      {analysisPending ? (
        <div className="request-state-card state-queued" role="status"><div><span>Codex 正在分析并生成宫格</span><strong>完成后会自动写回宫格分镜图，不需要重复点击。</strong></div><button type="button" onClick={onStopAnalysisWait} disabled={busy}>不再等待</button></div>
      ) : directionReady ? (
        <>
          <button
            className="primary-button wide"
            onClick={() => void (needsSupplement ? saveThenAnalyze() : saveThenContact())}
            disabled={busy || submitting || Boolean(contactRequest) || (!needsSupplement && !contactReady)}
            title={needsSupplement ? `让 Codex 为第 ${supplementShots.map((shot) => shot.index + 1).join("、")} 镜补齐内容与出场主体锁定` : undefined}
          >
            {contactRequest?.status === "queued" ? "宫格等待交接…" : contactRequest ? "宫格正在生成…" : submitting ? briefDirty && !needsSupplement ? "正在保存摘要…" : "正在补全分镜…" : needsSupplement ? `补全 ${supplementShots.length} 个分镜并继续` : briefDirty ? `保存摘要并${project.contactSheetPath ? "重做" : "生成"}宫格` : project.contactSheetPath ? `重做 ${project.shots.length} 格宫格` : `生成 ${project.shots.length} 格宫格总览`}
          </button>
          {project.contactSheetPath && (
            <div className={`contact-review-callout ${project.contactSheetStale ? "is-stale" : project.contactSheetApprovedAt ? "is-approved" : ""}`}>
              <strong>{project.contactSheetStale ? "宫格需要重做" : project.contactSheetApprovedAt ? "宫格已确认" : "等待你确认宫格"}</strong>
              <p>{project.contactSheetStale ? "当前方向、分镜或参考约束已经变化，旧宫格不再代表当前方案。" : project.contactSheetApprovedAt ? "正式图入口已开放；后续修改方向或分镜会自动撤销确认。" : "检查人物、服装、统一场景、连续情节和每格动作后再进入正式图。"}</p>
              {!project.contactSheetStale && (project.contactSheetApprovedAt
                ? <button className="text-button" onClick={() => onReviewContactSheet(false)} disabled={busy}>撤销确认</button>
                : <button className="accept-button wide" onClick={() => onReviewContactSheet(true)} disabled={busy || Boolean(contactRequest)}>确认宫格，进入正式图</button>)}
            </div>
          )}
          <button className="text-button" onClick={() => void saveThenAnalyze()} disabled={busy || submitting}>{submitting ? "正在保存…" : "重新分析并生成宫格分镜图"}</button>
        </>
      ) : (
        <button className="primary-button wide" onClick={() => void saveThenAnalyze()} disabled={busy || submitting || !brief.trim()}>{submitting ? "正在保存并提交…" : "交给 Codex 分析并生成宫格分镜图"}</button>
      )}
      <div className="process-note"><span>{directionReady ? "下一步" : "自动完成"}</span><p>{directionReady ? "先生成无文字宫格；确认整体后，可勾选任意分镜批量生成正式图，也可逐镜处理。" : "Codex 会整理明确选题、统一场景、连续剧情与逐镜动作，并自动生成宫格分镜图。"}</p></div>
    </aside>
  );
}

function ShotInspector({ shot, shotCount, busy, formalBlockReason, activeRequest, failedRequest, videoRequestActive, onSave, onGenerate, onCancelRequest, onEdit, onUndo, onDelete, onMove, onVideoTab }: {
  shot: ShotRecord; shotCount: number; busy: boolean; formalBlockReason?: string; activeRequest?: GenerationRequest; failedRequest?: GenerationRequest; videoRequestActive: boolean; onSave: (patch: Record<string, unknown>) => Promise<boolean>; onGenerate: () => void; onCancelRequest: (requestId: string) => void; onEdit: () => void;
  onUndo: () => void; onDelete: () => void; onMove: (direction: -1 | 1) => void;
  onVideoTab: () => void;
}) {
  const [draft, setDraft] = useState({ title: shot.title, cast: shot.cast ?? "", scene: shot.scene, action: shot.action, composition: shot.composition, instruction: shot.instruction });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const requestActive = shot.status === "queued" || shot.status === "generating" || shot.status === "saving";
  const editingLocked = requestActive || videoRequestActive;
  const changeDraft = (key: keyof typeof draft, value: string) => {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    dirtyRef.current = true;
    setDraft(next);
    setSaveState("dirty");
  };
  const persistDraft = async () => {
    if (savingRef.current || !dirtyRef.current || editingLocked) return;
    savingRef.current = true;
    dirtyRef.current = false;
    const snapshot = { ...draftRef.current };
    setSaveState("saving");
    const saved = await onSave(snapshot);
    savingRef.current = false;
    if (!saved) {
      dirtyRef.current = true;
      setSaveState("error");
      return;
    }
    setSaveState(dirtyRef.current ? "dirty" : "saved");
    if (dirtyRef.current) void persistDraft();
  };
  return (
    <aside className="inspector-panel shot-inspector">
      <div className="inspector-tabs"><button className="active">图片</button><button onClick={onVideoTab} disabled={!shot.imagePath} title={!shot.imagePath ? "生成正式分镜图后可制作视频" : undefined}>视频</button></div>
      <div className="panel-heading compact"><span className="eyebrow">分镜 {String(shot.index + 1).padStart(2, "0")} / {shotCount}</span><h2>{shot.title}</h2></div>
      <div className="order-actions"><button disabled={shot.index === 0 || editingLocked} onClick={() => onMove(-1)}>← 前移</button><button disabled={shot.index === shotCount - 1 || editingLocked} onClick={() => onMove(1)}>后移 →</button></div>
      <label>标题<input value={draft.title} disabled={editingLocked} onChange={(event) => changeDraft("title", event.target.value)} onBlur={() => void persistDraft()} /></label>
      <label>出场主体锁定<textarea className="short" value={draft.cast} disabled={editingLocked} onChange={(event) => changeDraft("cast", event.target.value)} onBlur={() => void persistDraft()} placeholder="例如：男主 1 人＋女主 1 人，主要人物共 2 人；固定为同一男主与同一女主，身份和性别不互换" /></label>
      <label>场景<textarea className="short" value={draft.scene} disabled={editingLocked} onChange={(event) => changeDraft("scene", event.target.value)} onBlur={() => void persistDraft()} placeholder="具体地点、时间、现场光线" /></label>
      <label>唯一主动作<textarea className="short" value={draft.action} disabled={editingLocked} onChange={(event) => changeDraft("action", event.target.value)} onBlur={() => void persistDraft()} placeholder="一个可执行、符合物理逻辑的动作" /></label>
      <label>构图<textarea className="short" value={draft.composition} disabled={editingLocked} onChange={(event) => changeDraft("composition", event.target.value)} onBlur={() => void persistDraft()} placeholder="景别、机位、人物朝向" /></label>
      <label>本镜长期要求<textarea className="short" value={draft.instruction} disabled={editingLocked} onChange={(event) => changeDraft("instruction", event.target.value)} onBlur={() => void persistDraft()} placeholder="每次生成都要遵守的要求，例如：固定低机位、保持手提包在左手" /></label>
      <div className={`autosave-status state-${saveState}`} aria-live="polite"><span />{requestActive ? "图片处理中，分镜内容暂时锁定" : videoRequestActive ? "视频生成中，分镜内容暂时锁定" : saveState === "saving" ? "正在自动保存…" : saveState === "dirty" ? "离开输入框后自动保存" : saveState === "error" ? "保存失败，请重试" : "分镜描述已保存"}</div>
      <button className="quiet-button wide" onClick={() => void persistDraft()} disabled={busy || editingLocked || saveState === "saving" || saveState === "saved"}>{saveState === "saving" ? "正在保存…" : "立即保存"}</button>
      {videoRequestActive && <div className="action-blocker is-video-busy" role="status"><strong>本镜视频正在生成</strong><p>动作、构图和图片操作暂时锁定，完成后即可继续修改，避免旧方案视频覆盖新方案。</p></div>}
      {formalBlockReason && <div className="action-blocker" role="status"><strong>正式图暂未开放</strong><p>{formalBlockReason}</p></div>}
      {shot.imageStale && <div className="action-blocker is-stale" role="status"><strong>当前图片来自修改前的方向</strong><p>图片仍保留用于对照。确认新宫格后重做这一镜，再继续生成视频。</p></div>}
      {activeRequest && <div className={`request-state-card state-${activeRequest.status}`} role="status"><div><span>{activeRequest.status === "queued" ? "请求已登记" : activeRequest.status === "generating" ? "Codex 正在生成" : "正在安全保存"}</span><strong>{activeRequest.status === "queued" ? "等待交接，可随时取消" : activeRequest.status === "generating" ? "生成开始后请等待本镜完成" : "新图校验完成前，当前图片不会被覆盖"}</strong></div>{activeRequest.status === "queued" && <button type="button" onClick={() => onCancelRequest(activeRequest.id)} disabled={busy}>取消等待</button>}</div>}
      {!activeRequest && failedRequest && <div className="request-state-card state-failed" role="alert"><div><span>{shot.imagePath ? "本次重做失败，上一版仍可用" : "图片生成失败"}</span><strong>{failedRequest.error || "可修改本次要求后重新提交"}</strong></div></div>}
      {!activeRequest && <div className="inspector-action-row"><button className="primary-button" onClick={onGenerate} disabled={busy || Boolean(formalBlockReason) || requestActive || videoRequestActive} title={videoRequestActive ? "视频正在生成，完成后再重做图片" : formalBlockReason}>{shot.imagePath ? "整张重做…" : "生成正式图"}</button><button className="quiet-button" onClick={onEdit} disabled={!shot.imagePath || busy || requestActive || videoRequestActive} title={videoRequestActive ? "视频正在生成，完成后再修改图片" : undefined}>局部修改</button></div>}
      {shot.hasUndo && <button className="text-button" onClick={onUndo} disabled={editingLocked}>撤销上次覆盖</button>}
      {shot.imagePath && <div className="direct-video-callout"><span className="eyebrow">{shot.imageStale ? "先更新正式图片" : "下一步可直接做视频"}</span><p>{shot.imageStale ? "这张图来自旧方向，暂不作为新视频首帧；重做图片后入口会自动恢复。" : "这张图片已经是可用首帧；无需审核。你仍可随时重做或局部修改，改图后视频提示词会自动更新。"}</p><button className="quiet-button wide" onClick={onVideoTab} disabled={requestActive || shot.imageStale}>{shot.imageStale ? "等待重做图片" : "查看或生成本镜视频"}</button></div>}
      <div className="danger-zone">{confirmDelete ? <><span>删除会同时移除该镜图片。</span><button onClick={onDelete} disabled={editingLocked}>确认删除</button><button onClick={() => setConfirmDelete(false)}>取消</button></> : <button onClick={() => setConfirmDelete(true)} disabled={editingLocked}>删除这个分镜</button>}</div>
    </aside>
  );
}

function CreateProjectModal({ busy, onClose, onCreate }: { busy: boolean; onClose: () => void; onCreate: (name: string, template: TemplateId, ratio: AspectRatio, shotCount: number, sourceFile?: File) => Promise<void> }) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<TemplateId>("image-editor");
  const [ratio, setRatio] = useState<AspectRatio>("9:16");
  const [shotCount, setShotCount] = useState(6);
  const [sourceFile, setSourceFile] = useState<File>();
  const dialogRef = useDialogFocus<HTMLElement>(onClose, busy);
  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section ref={dialogRef} className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title" tabIndex={-1}>
        <header><div><span className="eyebrow">新建工作区</span><h2 id="create-title">选择一种工作方式</h2><p>先确定是反复修改一张图，还是规划一组连续分镜。</p></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="关闭新建项目">×</button></header>
        <div className="template-choice" role="group" aria-label="项目类型">
          <button type="button" aria-pressed={template === "image-editor"} className={template === "image-editor" ? "active" : ""} onClick={() => { setTemplate("image-editor"); setShotCount(1); }}><strong>单图无限编辑</strong><span>上传一张图片，整图或框选后反复修改，不经过宫格流程</span></button>
          <button type="button" aria-pressed={template === "blank"} className={template === "blank" ? "active" : ""} onClick={() => { setTemplate("blank"); setShotCount((current) => current === 1 ? 6 : current); setSourceFile(undefined); }}><strong>通用分镜</strong><span>规划方向、统一角色与场景，生成自定义数量的连续分镜</span></button>
        </div>
        <label>工作区名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={template === "image-editor" ? "可留空，默认使用图片文件名" : "例如：雨天咖啡店重逢"} /></label>
        {template === "image-editor" ? (
          <label className={`single-editor-file-pick${sourceFile ? " has-file" : ""}`}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setSourceFile(event.target.files?.[0])} /><span>{sourceFile ? "已选择" : "选择图片"}</span><strong>{sourceFile?.name ?? "也可以先创建空编辑台，稍后再上传"}</strong><small>PNG / JPEG / WebP · 最大 25MB</small></label>
        ) : <>
          <label>画面比例<select value={ratio} onChange={(event) => setRatio(event.target.value as AspectRatio)}>{(["9:16", "3:4", "1:1", "16:9"] as AspectRatio[]).map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className="shot-count-field"><span>初始宫格</span><div>{[4, 6, 9].map((count) => <button key={count} aria-pressed={shotCount === count} className={shotCount === count ? "active" : ""} type="button" onClick={() => setShotCount(count)}>{count} 格</button>)}</div><label className="shot-count-custom">自定义 <input type="number" min="1" max="24" value={shotCount} onChange={(event) => setShotCount(Math.max(1, Math.min(24, Number(event.target.value) || 1)))} /> <span>格（1–24）</span></label></div>
        </>}
        <button className="primary-button wide" onClick={() => void onCreate(name, template, ratio, template === "image-editor" ? 1 : shotCount, sourceFile)} disabled={busy || (template !== "image-editor" && !name.trim())}>{busy ? "正在创建…" : template === "image-editor" ? sourceFile ? "打开图片编辑台" : "创建空编辑台" : `创建 ${shotCount} 格工作区`}</button>
      </section>
    </div>
  );
}

function ShotCountModal({ currentCount, busy, onClose, onResize }: { currentCount: number; busy: boolean; onClose: () => void; onResize: (targetCount: number, confirmRemoval: boolean) => Promise<boolean> }) {
  const [targetCount, setTargetCount] = useState(currentCount);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const reducing = targetCount < currentCount;
  const dialogRef = useDialogFocus<HTMLElement>(onClose, busy);
  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section ref={dialogRef} className="shot-count-modal" role="dialog" aria-modal="true" aria-labelledby="shot-count-title" tabIndex={-1}>
        <header><div><span className="eyebrow">分镜数量</span><h2 id="shot-count-title">调整这套宫格</h2><p>可设置 1–24 格。增加会追加空白分镜；减少会删除末尾分镜及其正式图片。</p></div><button className="icon-button" onClick={onClose} aria-label="关闭分镜数量设置">×</button></header>
        <label className="shot-count-large">目标数量<input type="number" min="1" max="24" value={targetCount} onChange={(event) => { setTargetCount(Math.max(1, Math.min(24, Number(event.target.value) || 1))); setConfirmRemoval(false); }} /><span>格</span></label>
        <div className="shot-count-presets">{[1, 4, 6, 9, 12, 16, 24].map((count) => <button key={count} type="button" aria-pressed={targetCount === count} className={targetCount === count ? "active" : ""} onClick={() => { setTargetCount(count); setConfirmRemoval(false); }}>{count} 格</button>)}</div>
        {reducing && <label className="reduce-confirm"><input type="checkbox" checked={confirmRemoval} onChange={(event) => setConfirmRemoval(event.target.checked)} />我知道会永久删除第 {targetCount + 1} 到第 {currentCount} 镜及其图片</label>}
        <p className="shot-count-note">调整后，当前宫格总览会失效；按新数量重新生成并确认即可继续正式图。</p>
        <footer><button className="quiet-button" onClick={onClose} disabled={busy}>取消</button><button className={reducing ? "destructive-button" : "primary-button"} onClick={() => void onResize(targetCount, confirmRemoval)} disabled={busy || targetCount === currentCount || (reducing && !confirmRemoval)}>{busy ? "正在调整…" : `调整为 ${targetCount} 格`}</button></footer>
      </section>
    </div>
  );
}

function EmptyWorkspace({ error, onRetry, onCreate }: { error?: string; onRetry: () => void; onCreate: () => void }) {
  if (error) return <section className="empty-workspace is-error"><span className="empty-orbit" /><p className="eyebrow">工作台暂时没有连上本机服务</p><h1>项目没有丢，<br />重新连接即可继续。</h1><p>{error}</p><div className="empty-workspace-actions"><button className="primary-button" onClick={onRetry}>重新连接</button><button className="quiet-button" onClick={onCreate}>仍要新建项目</button></div></section>;
  return <section className="empty-workspace"><span className="empty-orbit" /><p className="eyebrow">单图编辑 · 分镜 · 视频工作台</p><h1>上传一张图直接改，<br />或把想法铺成完整分镜。</h1><p>整图修改、实时框选、画笔与减选、箭头文字定位和连续分镜都保存在本机同一个工作台里。</p><button className="primary-button" onClick={onCreate}>开始处理图片</button></section>;
}
