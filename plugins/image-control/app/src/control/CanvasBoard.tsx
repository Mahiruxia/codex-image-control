import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { ContactSheetSelector, type ContactSheetEditPayload } from "./ContactSheetSelector";
import { MediaImage } from "./MediaImage";
import { MediaVideo } from "./MediaVideo";
import { useMediaDataUrl } from "./media";
import type { CanvasNote, Point, ProjectRecord, ShotRecord, VideoRequest, Viewport } from "./types";

const CARD_WIDTH = 264;
const CARD_GAP_X = 36;
const CARD_GAP_Y = 38;
const CONTACT_CARD_WIDTH = 420;
const CONTACT_CARD_MAX_HEIGHT = 720;
const WORLD_WIDTH = 8000;
const WORLD_HEIGHT = 6000;

const IMAGE_STATUS: Record<ShotRecord["status"], string> = {
  empty: "待生成图片",
  queued: "图片等待中",
  generating: "图片生成中",
  saving: "图片保存中",
  review: "图片已就绪",
  accepted: "图片已就绪",
  failed: "图片失败",
};

const VIDEO_STATUS: Record<ShotRecord["videoStatus"], string> = {
  missing_prompt: "可生成视频",
  ready: "可生成视频",
  queued: "视频排队中",
  uploading: "正在上传首帧",
  running: "视频生成中",
  downloading: "视频校验中",
  review: "视频已完成",
  accepted: "视频已完成",
  failed: "视频失败",
};

const ACTIVE_VIDEO_STATUSES = new Set(["queued", "waiting_remote", "uploading", "submitting", "running", "downloading"]);

interface CanvasBoardProps {
  project: ProjectRecord;
  busy: boolean;
  selectedShotId?: string;
  focusTarget?: "direction" | "storyboard" | "production" | "complete";
  layoutKey: string;
  checkedShotIds: Set<string>;
  formalBlockReason?: string;
  editBlockReason?: string;
  onSelectShot: (shotId?: string, tab?: "image" | "video") => void;
  onToggleShot: (shotId: string, selectRange: boolean) => void;
  onGenerateShot: (shotId: string) => void;
  onCancelGenerationRequest: (requestId: string) => void;
  onGenerateSelected: () => void;
  onGenerateSelectedShots: (shotIds: string[]) => void;
  onEditRegion: (shot: ShotRecord) => void;
  onPersistCanvas: (viewport: Viewport, positions: Record<string, Point>, contactSheetPosition?: Point) => void;
  onSelectAll: () => void;
  onSelectUnrendered: () => void;
  onClearSelection: () => void;
  onRetryFailed: () => void;
  onGenerateVideoShot: (shotId: string) => void;
  onGenerateSelectedVideos: () => void;
  onSelectVideoReady: () => void;
  onRetryVideoFailed: () => void;
  onReviewContactSheet: (approved: boolean) => void;
  onRebuildContactSheet: (instruction: string) => void;
  onEditContactSheet: (payload: ContactSheetEditPayload) => Promise<boolean>;
  onUpdateNote: (noteId: string, text: string) => void;
  onDeleteNote: (noteId: string) => void;
}

interface DragState {
  shotId: string;
  pointerId: number;
  startClient: Point;
  startPosition: Point;
}

interface PanState {
  pointerId: number;
  startClient: Point;
  startViewport: Viewport;
}

function ratioParts(aspectRatio: string): [number, number] {
  const [width, height] = aspectRatio.split(":").map(Number);
  return [width || 9, height || 16];
}

function cardFootprintHeight(aspectRatio: string): number {
  const [width, height] = ratioParts(aspectRatio);
  const mediaHeight = (CARD_WIDTH - 16) * (height / width);
  return Math.round(mediaHeight + 184);
}

function contactCardFootprintHeight(aspectRatio: string): number {
  const [width, height] = ratioParts(aspectRatio);
  const previewHeight = Math.min(520, (CONTACT_CARD_WIDTH - 24) * (height / width));
  return Math.round(Math.min(CONTACT_CARD_MAX_HEIGHT, previewHeight + 182));
}

function preferredColumnCount(count: number): number {
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  return 5;
}

function contactSheetGridFor(count: number): { columns: number; rows: number } {
  if (count <= 1) return { columns: 1, rows: 1 };
  if (count <= 3) return { columns: count, rows: 1 };
  if (count <= 4) return { columns: 2, rows: 2 };
  if (count <= 6) return { columns: 3, rows: 2 };
  if (count <= 8) return { columns: 4, rows: 2 };
  if (count === 9) return { columns: 3, rows: 3 };
  if (count <= 10) return { columns: 5, rows: 2 };
  if (count <= 12) return { columns: 4, rows: 3 };
  if (count <= 15) return { columns: 5, rows: 3 };
  if (count === 16) return { columns: 4, rows: 4 };
  if (count <= 18) return { columns: 6, rows: 3 };
  if (count <= 20) return { columns: 5, rows: 4 };
  if (count === 21) return { columns: 7, rows: 3 };
  return { columns: 8, rows: 3 };
}

function isContactSheetRequest(kind: ProjectRecord["generationRequests"][number]["kind"]): boolean {
  return kind === "contact_sheet" || kind === "contact_sheet_edit";
}

function contactSheetMediaVersion(project: ProjectRecord): string {
  const latestCompleted = project.generationRequests
    .filter((request) => isContactSheetRequest(request.kind) && request.status === "completed")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return latestCompleted?.updatedAt ?? project.contactSheetApprovedAt ?? project.contactSheetPath ?? project.id;
}

function arrangedPositions(shots: ShotRecord[], aspectRatio: string): Record<string, Point> {
  const columns = preferredColumnCount(shots.length);
  const rowStride = cardFootprintHeight(aspectRatio) + CARD_GAP_Y;
  return Object.fromEntries(shots.map((shot, index) => [shot.id, {
    x: 40 + (index % columns) * (CARD_WIDTH + CARD_GAP_X),
    y: 40 + Math.floor(index / columns) * rowStride,
  }]));
}

function hasCardCollision(shots: ShotRecord[], positions: Record<string, Point>, aspectRatio: string): boolean {
  const height = cardFootprintHeight(aspectRatio);
  for (let index = 0; index < shots.length; index += 1) {
    const a = positions[shots[index].id] ?? shots[index].position;
    for (let other = index + 1; other < shots.length; other += 1) {
      const b = positions[shots[other].id] ?? shots[other].position;
      if (a.x < b.x + CARD_WIDTH + 14 && a.x + CARD_WIDTH + 14 > b.x && a.y < b.y + height + 14 && a.y + height + 14 > b.y) return true;
    }
  }
  return false;
}

function contactHome(shots: ShotRecord[], positions: Record<string, Point>): Point {
  const columns = preferredColumnCount(shots.length);
  const gridWidth = columns * CARD_WIDTH + Math.max(0, columns - 1) * CARD_GAP_X;
  const minX = Math.min(40, ...shots.map((shot) => (positions[shot.id] ?? shot.position).x));
  return { x: minX + gridWidth + 74, y: 40 };
}

function latestVideoRequest(project: ProjectRecord, shotId: string): VideoRequest | undefined {
  return project.videoRequests
    .filter((request) => request.shotId === shotId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function progressFor(request?: VideoRequest): number {
  if (!request) return 0;
  if (typeof request.progress === "number") return Math.max(0, Math.min(100, request.progress));
  return ({ queued: 4, waiting_remote: 8, uploading: 16, submitting: 24, running: 48, downloading: 88, completed: 100, failed: 100, cancelled: 0 } as const)[request.status];
}

function ContactSheetCellPreview({ project, shot, grid, version }: { project: ProjectRecord; shot: ShotRecord; grid: { columns: number; rows: number }; version: string }) {
  const media = useMediaDataUrl(project.id, project.contactSheetPath, "preview", version);
  const [sheetAspect, setSheetAspect] = useState<number>();
  const column = shot.index % grid.columns;
  const row = Math.floor(shot.index / grid.columns);
  const [projectWidth, projectHeight] = ratioParts(project.aspectRatio);
  const cellAspect = sheetAspect ? (sheetAspect * grid.rows) / grid.columns : (projectWidth * grid.rows) / (projectHeight * grid.columns);
  const cropStyle = { aspectRatio: String(cellAspect) } as CSSProperties;
  const imageStyle = {
    width: `${grid.columns * 100}%`,
    height: `${grid.rows * 100}%`,
    left: `${column * -100}%`,
    top: `${row * -100}%`,
  } as CSSProperties;

  return (
    <span className="contact-cell-placeholder" role="img" aria-label={`第 ${shot.index + 1} 镜方向预览，非正式图片`}>
      <span className="contact-cell-placeholder-matte" />
      <span className="contact-cell-placeholder-crop" style={cropStyle}>
        {media.src ? <img src={media.src} alt="" aria-hidden="true" draggable={false} style={imageStyle} onLoad={(event) => setSheetAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} /> : <span className="media-state media-state-loading" />}
      </span>
      <span className="contact-cell-placeholder-label"><strong>方向预览</strong><small>待生成正式图</small></span>
    </span>
  );
}

export function CanvasBoard({
  project,
  busy,
  selectedShotId,
  focusTarget,
  layoutKey,
  checkedShotIds,
  formalBlockReason,
  editBlockReason,
  onSelectShot,
  onToggleShot,
  onGenerateShot,
  onCancelGenerationRequest,
  onGenerateSelected,
  onGenerateSelectedShots,
  onEditRegion,
  onPersistCanvas,
  onSelectAll,
  onSelectUnrendered,
  onClearSelection,
  onRetryFailed,
  onGenerateVideoShot,
  onGenerateSelectedVideos,
  onSelectVideoReady,
  onRetryVideoFailed,
  onReviewContactSheet,
  onRebuildContactSheet,
  onEditContactSheet,
  onUpdateNote,
  onDeleteNote,
}: CanvasBoardProps) {
  const orderedShots = useMemo(() => project.shots.slice().sort((a, b) => a.index - b.index), [project.shots]);
  const initialPositions = useMemo(() => Object.fromEntries(project.shots.map((shot) => [shot.id, shot.position])), [project.id]);
  const [viewport, setViewport] = useState(project.canvas.viewport);
  const [positions, setPositions] = useState<Record<string, Point>>(initialPositions);
  const [contactPosition, setContactPosition] = useState(project.canvas.contactSheetPosition);
  const [contactFeedback, setContactFeedback] = useState("");
  const [contactEditorOpen, setContactEditorOpen] = useState(false);
  const [surfaceRevision, setSurfaceRevision] = useState(0);
  // A grid can contain up to 24 completed clips. Start on the formal frame so
  // opening the canvas never asks the embedded host to decode every MP4 at once.
  // Video is loaded only after the user selects its card tab.
  const [mediaView, setMediaView] = useState<Record<string, "image" | "video">>({});
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const viewportRef = useRef(viewport);
  const positionsRef = useRef(positions);
  const contactPositionRef = useRef(contactPosition);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const contactDialogRef = useRef<HTMLDivElement>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arrangedOnceRef = useRef(false);
  const artifactRef = useRef<Record<string, string | undefined>>(Object.fromEntries(project.shots.map((shot) => [shot.id, shot.videoArtifact?.requestId])));
  const activeVideoShotSignature = project.videoRequests.filter((request) => ACTIVE_VIDEO_STATUSES.has(request.status)).map((request) => request.shotId).sort().join("|");

  useEffect(() => () => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
  }, []);

  useEffect(() => {
    setContactEditorOpen(false);
  }, [project.id]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || typeof ResizeObserver === "undefined") return;
    let lastWidth = -1;
    let lastHeight = -1;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      setSurfaceRevision((current) => current + 1);
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, [project.id]);

  useEffect(() => {
    if (!contactEditorOpen) return;
    const dialog = contactDialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const focusableSelector = "button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex='-1'])";
    const focusDialog = window.requestAnimationFrame(() => {
      (dialog?.querySelector<HTMLElement>("[data-dialog-close]") ?? dialog)?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setContactEditorOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [contactEditorOpen]);

  useEffect(() => {
    for (const shot of project.shots) {
      const previous = artifactRef.current[shot.id];
      if (shot.videoArtifact?.requestId && previous !== shot.videoArtifact.requestId) {
        setMediaView((current) => ({ ...current, [shot.id]: "video" }));
      }
      artifactRef.current[shot.id] = shot.videoArtifact?.requestId;
    }
  }, [project.shots]);

  useEffect(() => {
    if (!activeVideoShotSignature) return;
    const activeShotIds = activeVideoShotSignature.split("|");
    setMediaView((current) => ({ ...current, ...Object.fromEntries(activeShotIds.map((shotId) => [shotId, "video"])) }));
  }, [activeVideoShotSignature]);

  useEffect(() => {
    if (arrangedOnceRef.current || !orderedShots.length) return;
    arrangedOnceRef.current = true;
    const current = positionsRef.current;
    if (!hasCardCollision(orderedShots, current, project.aspectRatio)) return;
    const nextPositions = arrangedPositions(orderedShots, project.aspectRatio);
    const nextContact = contactHome(orderedShots, nextPositions);
    positionsRef.current = nextPositions;
    contactPositionRef.current = nextContact;
    setPositions(nextPositions);
    setContactPosition(nextContact);
    onPersistCanvas(viewportRef.current, nextPositions, nextContact);
  }, [onPersistCanvas, orderedShots, project.aspectRatio]);

  const failedCount = orderedShots.filter((shot) => project.generationRequests.slice().reverse().find((request) => !isContactSheetRequest(request.kind) && request.shotIds.includes(shot.id))?.status === "failed").length;
  const unrenderedCount = orderedShots.filter((shot) => !shot.imagePath || shot.imageStale).length;
  const videoReadyCount = orderedShots.filter((shot) => {
    const request = latestVideoRequest(project, shot.id);
    return shot.imagePath && !shot.imageStale && !["queued", "generating", "saving"].includes(shot.status) && ["missing_prompt", "ready", "failed"].includes(shot.videoStatus) && !(request && ACTIVE_VIDEO_STATUSES.has(request.status));
  }).length;
  const videoFailedCount = orderedShots.filter((shot) => shot.videoStatus === "failed").length;
  const checkedShots = orderedShots.filter((shot) => checkedShotIds.has(shot.id));
  const hasSelection = checkedShotIds.size > 0;
  const selectedWithImageCount = checkedShots.filter((shot) => shot.imagePath).length;
  const selectedWithoutImageCount = checkedShots.length - selectedWithImageCount;
  const selectedStaleImageCount = checkedShots.filter((shot) => Boolean(shot.imagePath && shot.imageStale)).length;
  const selectedVideoEligibleCount = checkedShots.filter((shot) => Boolean(shot.imagePath && !shot.imageStale)).length;
  const selectedPreviewVideoCount = checkedShots.filter((shot) => Boolean(shot.videoArtifact?.mediaUrl)).length;
  const selectedWithVideoCount = checkedShots.filter((shot) => Boolean(shot.imagePath && !shot.imageStale && shot.videoArtifact?.mediaUrl)).length;
  const selectedWithoutVideoCount = Math.max(0, selectedVideoEligibleCount - selectedWithVideoCount);
  const selectedVideoActiveCount = checkedShots.filter((shot) => {
    const request = latestVideoRequest(project, shot.id);
    return Boolean(request && ACTIVE_VIDEO_STATUSES.has(request.status));
  }).length;
  const selectedImageEligibleCount = checkedShots.filter((shot) => {
    const request = latestVideoRequest(project, shot.id);
    return !["queued", "generating", "saving"].includes(shot.status) && !(request && ACTIVE_VIDEO_STATUSES.has(request.status));
  }).length;
  const selectedImageSkippedCount = checkedShots.length - selectedImageEligibleCount;
  const selectedVideoEligibleNowCount = checkedShots.filter((shot) => {
    const request = latestVideoRequest(project, shot.id);
    return Boolean(shot.imagePath && !shot.imageStale && !["queued", "generating", "saving"].includes(shot.status) && !(request && ACTIVE_VIDEO_STATUSES.has(request.status)));
  }).length;
  const selectedVideoDeferredCount = checkedShots.filter((shot) => {
    const request = latestVideoRequest(project, shot.id);
    return ["queued", "generating", "saving"].includes(shot.status) && !(request && ACTIVE_VIDEO_STATUSES.has(request.status));
  }).length;
  const contactRequest = project.generationRequests.slice().reverse().find((request) => (
    isContactSheetRequest(request.kind) && ["queued", "generating", "saving"].includes(request.status)
  ));
  const latestContactRequest = project.generationRequests.slice().reverse().find((request) => isContactSheetRequest(request.kind));
  const failedContactRequest = latestContactRequest?.status === "failed" ? latestContactRequest : undefined;
  const contactRequestActive = Boolean(contactRequest);
  const contactReady = Boolean(project.brief.trim()) && orderedShots.every((shot) => shot.scene.trim() || shot.action.trim() || shot.instruction.trim());

  const switchSelectedMediaView = (view: "image" | "video") => {
    if (!checkedShots.length) return;
    setMediaView((current) => {
      const next = { ...current };
      for (const shot of checkedShots) {
        next[shot.id] = view === "video" && shot.videoArtifact?.mediaUrl ? "video" : "image";
      }
      return next;
    });
    const focus = view === "video"
      ? checkedShots.find((shot) => shot.videoArtifact?.mediaUrl) ?? checkedShots[0]
      : checkedShots[0];
    onSelectShot(focus.id, view === "video" && focus.videoArtifact?.mediaUrl ? "video" : "image");
  };

  const persist = (nextViewport = viewportRef.current, nextPositions = positionsRef.current, nextContact = contactPositionRef.current) => {
    onPersistCanvas(nextViewport, nextPositions, nextContact);
  };

  const schedulePersist = (nextViewport: Viewport, nextPositions = positionsRef.current, nextContact = contactPositionRef.current) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => onPersistCanvas(nextViewport, nextPositions, nextContact), 280);
  };

  const arrangeCanvas = () => {
    const nextPositions = arrangedPositions(orderedShots, project.aspectRatio);
    const nextContact = contactHome(orderedShots, nextPositions);
    positionsRef.current = nextPositions;
    contactPositionRef.current = nextContact;
    setPositions(nextPositions);
    setContactPosition(nextContact);
    persist(viewportRef.current, nextPositions, nextContact);
    window.setTimeout(fitCanvas, 0);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const cursor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const scale = Math.exp(-event.deltaY * 0.0012);
    const nextZoom = Math.max(0.24, Math.min(1.8, viewport.zoom * scale));
    const world = { x: (cursor.x - viewport.x) / viewport.zoom, y: (cursor.y - viewport.y) / viewport.zoom };
    const next = { x: cursor.x - world.x * nextZoom, y: cursor.y - world.y * nextZoom, zoom: nextZoom };
    viewportRef.current = next;
    setViewport(next);
    schedulePersist(next);
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest("button, input, textarea, select, label, video, .shot-card, [data-canvas-no-pan]")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { pointerId: event.pointerId, startClient: { x: event.clientX, y: event.clientY }, startViewport: viewport };
    onSelectShot(undefined);
  };

  const startDrag = (event: ReactPointerEvent<HTMLElement>, shot: ShotRecord) => {
    if (event.button !== 0 || (event.target as Element).closest("button, input, textarea, select, label, video, [data-canvas-no-drag]")) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { shotId: shot.id, pointerId: event.pointerId, startClient: { x: event.clientX, y: event.clientY }, startPosition: positions[shot.id] ?? shot.position };
    onSelectShot(shot.id);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan?.pointerId === event.pointerId) {
      event.preventDefault();
      const nextViewport = { ...pan.startViewport, x: pan.startViewport.x + event.clientX - pan.startClient.x, y: pan.startViewport.y + event.clientY - pan.startClient.y };
      viewportRef.current = nextViewport;
      setViewport(nextViewport);
      return;
    }
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      event.preventDefault();
      const next = { x: drag.startPosition.x + (event.clientX - drag.startClient.x) / viewport.zoom, y: drag.startPosition.y + (event.clientY - drag.startClient.y) / viewport.zoom };
      const nextPositions = { ...positionsRef.current, [drag.shotId]: next };
      positionsRef.current = nextPositions;
      setPositions(nextPositions);
    }
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId === event.pointerId) { panRef.current = null; persist(); }
    if (dragRef.current?.pointerId === event.pointerId) { dragRef.current = null; persist(); }
  };

  const setZoom = (zoom: number) => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const current = viewportRef.current;
    const nextZoom = Math.max(0.24, Math.min(1.8, zoom));
    const cursor = { x: (bounds?.width ?? 0) / 2, y: (bounds?.height ?? 0) / 2 };
    const world = { x: (cursor.x - current.x) / current.zoom, y: (cursor.y - current.y) / current.zoom };
    const next = { x: cursor.x - world.x * nextZoom, y: cursor.y - world.y * nextZoom, zoom: nextZoom };
    viewportRef.current = next;
    setViewport(next);
    persist(next);
  };

  function fitCanvas(shouldPersist = true) {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds || orderedShots.length === 0) return;
    const height = cardFootprintHeight(project.aspectRatio);
    const items = orderedShots.map((shot) => {
      const position = positionsRef.current[shot.id] ?? shot.position;
      return { left: position.x, top: position.y, right: position.x + CARD_WIDTH, bottom: position.y + height };
    });
    if (project.contactSheetPath) items.push({ left: contactPositionRef.current.x, top: contactPositionRef.current.y, right: contactPositionRef.current.x + CONTACT_CARD_WIDTH, bottom: contactPositionRef.current.y + contactCardFootprintHeight(project.aspectRatio) });
    const minX = Math.min(...items.map((item) => item.left));
    const minY = Math.min(...items.map((item) => item.top));
    const maxX = Math.max(...items.map((item) => item.right));
    const maxY = Math.max(...items.map((item) => item.bottom));
    const paddingX = 54;
    const paddingY = 54;
    const availableHeight = Math.max(220, bounds.height - 92);
    const nextZoom = Math.max(0.24, Math.min(1.25, Math.min((bounds.width - paddingX * 2) / (maxX - minX), (availableHeight - paddingY * 2) / (maxY - minY))));
    const next = { x: (bounds.width - (maxX - minX) * nextZoom) / 2 - minX * nextZoom, y: (availableHeight - (maxY - minY) * nextZoom) / 2 - minY * nextZoom + 14, zoom: nextZoom };
    viewportRef.current = next;
    setViewport(next);
    if (shouldPersist) persist(next);
  }

  useEffect(() => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const frame = window.requestAnimationFrame(() => {
      if (focusTarget === "storyboard" && project.contactSheetPath) {
        const height = contactCardFootprintHeight(project.aspectRatio);
        const zoom = Math.max(0.45, Math.min(1, (bounds.width - 96) / CONTACT_CARD_WIDTH, (bounds.height - 128) / height));
        const next = {
          x: (bounds.width - CONTACT_CARD_WIDTH * zoom) / 2 - contactPositionRef.current.x * zoom,
          y: (bounds.height - height * zoom) / 2 - contactPositionRef.current.y * zoom,
          zoom,
        };
        viewportRef.current = next;
        setViewport(next);
      } else if ((focusTarget === "production" || focusTarget === "complete") && selectedShotId) {
        const shot = orderedShots.find((item) => item.id === selectedShotId);
        if (!shot) return;
        const position = positionsRef.current[shot.id] ?? shot.position;
        const height = cardFootprintHeight(project.aspectRatio);
        const zoom = Math.max(0.55, Math.min(1, viewportRef.current.zoom));
        const next = {
          x: (bounds.width - CARD_WIDTH * zoom) / 2 - position.x * zoom,
          y: (bounds.height - height * zoom) / 2 - position.y * zoom,
          zoom,
        };
        viewportRef.current = next;
        setViewport(next);
      } else if (surfaceRevision > 0) fitCanvas(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusTarget, layoutKey, orderedShots.length, project.aspectRatio, project.contactSheetPath, selectedShotId, surfaceRevision]);

  return (
    <section ref={surfaceRef} className="canvas-surface unified-canvas" aria-label="无限分镜画布" aria-describedby="canvas-hint" onWheel={handleWheel} onPointerDown={startPan} onPointerMove={handlePointerMove} onPointerUp={endPointer} onPointerCancel={endPointer}>
      <div className="canvas-world" style={{ width: WORLD_WIDTH, height: WORLD_HEIGHT, transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})` }}>
        <svg className="connection-layer" width={WORLD_WIDTH} height={WORLD_HEIGHT} aria-hidden="true">
          <defs><marker id="flow-arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0,0 L0,8 L9,4 z" fill="rgba(215,255,99,.45)" /></marker></defs>
          {orderedShots.slice(0, -1).map((shot, index) => {
            const from = positions[shot.id] ?? shot.position;
            const nextShot = orderedShots[index + 1];
            const to = positions[nextShot.id] ?? nextShot.position;
            const x1 = from.x + CARD_WIDTH;
            const y1 = from.y + 220;
            const x2 = to.x;
            const y2 = to.y + 220;
            const mid = (x1 + x2) / 2;
            return <path key={`${shot.id}-${nextShot.id}`} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} />;
          })}
        </svg>

        {project.contactSheetPath && (
          <article className={`contact-sheet-node ${project.contactSheetStale ? "is-stale" : project.contactSheetApprovedAt ? "is-approved" : "is-pending"}`} data-canvas-no-pan style={{ left: contactPosition.x, top: contactPosition.y }}>
            <div className="node-heading"><div><span className="node-kicker">方向宫格 · 草案</span><strong>{project.contactSheetStale ? "方案已变化" : project.contactSheetApprovedAt ? "已确认创作方向" : "等待确认方向"}</strong></div><i /></div>
            {contactRequest && <div className="contact-update-banner" role="status"><i /><div><strong>{contactRequest.kind === "contact_sheet_edit" ? `正在重做选中的 ${contactRequest.shotIds.length} 格` : "正在重做整张方向宫格"}</strong><span>{contactRequest.kind === "contact_sheet_edit" ? `格子 ${contactRequest.shotIds.map((shotId) => String((orderedShots.find((shot) => shot.id === shotId)?.index ?? 0) + 1).padStart(2, "0")).join("、")} 完成后会自动替换，其他格保持原样。` : "完成后会自动替换当前宫格，并等待你重新确认。"}</span></div></div>}
            <button type="button" className="contact-sheet-preview-button" onClick={() => setContactEditorOpen(true)} aria-label="打开宫格检查，选格生成正式图或重做草案">
              <MediaImage projectId={project.id} mediaPath={project.contactSheetPath} variant="preview" version={contactSheetMediaVersion(project)} alt="当前方向宫格总览" className="contact-sheet-preview-media" draggable={false} />
              <span><strong>检查宫格</strong><small>选格生成正式图 · 或重做草案</small></span>
            </button>
            <p className="contact-sheet-node-copy">这是整体方向草案。正式分镜会逐张生成；重做正式图不会反向修改这张宫格。</p>
            {failedContactRequest && <div className="contact-failure-note" role="alert"><strong>本次宫格重做失败，原宫格保持不变</strong><span>{failedContactRequest.error || "可以修改意见后重新提交"}</span></div>}
            <details className="contact-shot-details"><summary>查看 {orderedShots.length} 格对应的分镜文字</summary><ol className="contact-shot-map">{orderedShots.map((shot) => <li key={shot.id}><span>{String(shot.index + 1).padStart(2, "0")}</span><div><strong>{shot.title}</strong><p>{shot.action || shot.scene || "待补充动作"}</p></div></li>)}</ol></details>
            <div className="contact-node-primary-actions">
              <button type="button" className="inspect-contact-action" onClick={() => setContactEditorOpen(true)}>选格生成正式图 / 重做草案</button>
              {!project.contactSheetStale && (project.contactSheetApprovedAt ? <button className="text-action" onClick={() => onReviewContactSheet(false)} disabled={busy}>撤销确认</button> : <button className="confirm-action" onClick={() => onReviewContactSheet(true)} disabled={busy || contactRequestActive}>确认方向，进入正式图</button>)}
            </div>
            <details className="contact-whole-redo" data-canvas-no-pan>
              <summary>整张重新编排</summary>
              <div className="contact-feedback"><label htmlFor={`contact-feedback-${project.id}`}>整张宫格需要怎么改</label><textarea id={`contact-feedback-${project.id}`} value={contactFeedback} maxLength={1000} onChange={(event) => setContactFeedback(event.target.value)} placeholder="例如：整体场景改成清晨卧室，保留人物、服装和 6 镜连续情节。" /><small>{contactReady ? "这会重新生成全部格子。只改几格请使用上方“选格重做”。" : "当前还有空白分镜；先在右侧补全后再重做。"}</small></div>
              <div className="contact-node-actions">{contactRequest?.status === "queued" ? <button className="cancel-wait-action" onClick={() => onCancelGenerationRequest(contactRequest.id)} disabled={busy}>取消宫格等待</button> : <button className="text-action" onClick={() => { onRebuildContactSheet(contactFeedback.trim()); setContactFeedback(""); }} disabled={busy || contactRequestActive || !contactReady} title={!contactReady ? "请先补全方向摘要与逐镜内容" : undefined}>{contactRequestActive ? "宫格正在处理中…" : contactFeedback.trim() ? "按意见重做整张" : "按当前方案重做整张"}</button>}</div>
            </details>
          </article>
        )}

        {project.canvas.notes.map((note) => <CanvasNoteCard key={note.id} note={note} onUpdate={onUpdateNote} onDelete={onDeleteNote} />)}

        {orderedShots.map((shot) => {
          const position = positions[shot.id] ?? shot.position;
          const isSelected = selectedShotId === shot.id;
          const isChecked = checkedShotIds.has(shot.id);
          const imageStyle = { aspectRatio: project.aspectRatio.replace(":", " / ") } as CSSProperties;
          const requestActive = ["queued", "generating", "saving"].includes(shot.status);
          const latestImageRequest = project.generationRequests.slice().reverse().find((request) => !isContactSheetRequest(request.kind) && request.shotIds.includes(shot.id));
          const activeImageRequest = project.generationRequests.slice().reverse().find((request) => !isContactSheetRequest(request.kind) && request.shotIds.includes(shot.id) && ["queued", "generating", "saving"].includes(request.status));
          const failedImageRequest = latestImageRequest?.status === "failed" ? latestImageRequest : undefined;
          const videoRequest = latestVideoRequest(project, shot.id);
          const videoActive = Boolean(videoRequest && ACTIVE_VIDEO_STATUSES.has(videoRequest.status));
          const showingVideo = mediaView[shot.id] === "video" && Boolean(shot.imagePath);
          const showImageStatus = requestActive || !shot.imagePath || shot.status === "failed";
          const statusText = failedImageRequest && shot.imagePath ? "本次重做失败 · 上一版可用" : shot.imageStale && !requestActive ? "旧方案图片 · 建议重做" : showImageStatus ? IMAGE_STATUS[shot.status] : showingVideo && videoRequest?.status === "failed" && shot.videoArtifact ? "本次重做失败 · 上一版可用" : showingVideo ? VIDEO_STATUS[shot.videoStatus] : "正式图已就绪";
          const statusClass = failedImageRequest ? "status-failed" : shot.imageStale && !requestActive ? "status-stale" : showImageStatus ? `status-${shot.status}` : showingVideo ? `video-status-${shot.videoStatus}` : "status-accepted";
          return (
            <article key={shot.id} className={`shot-card unified-shot-card ${isSelected ? "is-selected" : ""} ${isChecked ? "is-checked" : ""} status-${shot.status}`} style={{ left: position.x, top: position.y }} onPointerDown={(event) => startDrag(event, shot)} onDoubleClick={() => onSelectShot(shot.id, showingVideo ? "video" : "image")}>
              <header><label className="shot-check" onPointerDown={(event) => event.stopPropagation()} title="点击多选；按住 Shift 可连续选择"><input type="checkbox" aria-label={`选择分镜 ${String(shot.index + 1).padStart(2, "0")} ${shot.title}`} checked={checkedShotIds.has(shot.id)} onChange={(event) => onToggleShot(shot.id, "shiftKey" in event.nativeEvent && Boolean((event.nativeEvent as MouseEvent).shiftKey))} /><span>{String(shot.index + 1).padStart(2, "0")}</span></label><span className={`status-badge ${statusClass}`}>{statusText}</span></header>
              <div className="shot-media-shell" style={imageStyle} data-canvas-no-drag>
                {shot.imagePath ? showingVideo && shot.videoArtifact?.mediaUrl ? (
                  <MediaVideo src={shot.videoArtifact.mediaUrl} projectId={project.id} mediaPath={shot.videoArtifact.path} version={shot.videoArtifact.requestId} poster={shot.imageUrl} posterPath={shot.imagePath} posterVersion={shot.imageSha256 ?? shot.imagePath} compact deferLoad={!isSelected} loop onClick={() => onSelectShot(shot.id, "video")} />
                ) : (
                  <button className="shot-image" onClick={() => onSelectShot(shot.id, showingVideo ? "video" : "image")}><MediaImage projectId={project.id} mediaPath={shot.imagePath} variant="preview" version={shot.imageSha256 ?? shot.imagePath} alt={`${shot.title} 当前正式分镜`} draggable={false} /></button>
                ) : project.contactSheetPath && !project.contactSheetStale ? (
                  <button className="shot-image" onClick={() => onSelectShot(shot.id, "image")}><ContactSheetCellPreview project={project} shot={shot} grid={project.contactSheetGrid ?? contactSheetGridFor(orderedShots.length)} version={contactSheetMediaVersion(project)} /></button>
                ) : <button className="shot-image" onClick={() => onSelectShot(shot.id, "image")}><span className="empty-frame"><strong>{shot.title}</strong><small>{shot.scene || "等待补充场景"}</small></span></button>}
                {shot.imagePath && <div className="card-media-switch" role="group" aria-label="查看图片或视频"><button aria-pressed={!showingVideo} className={!showingVideo ? "active" : ""} onClick={() => { setMediaView((current) => ({ ...current, [shot.id]: "image" })); onSelectShot(shot.id, "image"); }}>图片</button><button aria-pressed={showingVideo} className={showingVideo ? "active" : ""} onClick={() => { setMediaView((current) => ({ ...current, [shot.id]: "video" })); onSelectShot(shot.id, "video"); }}>视频{videoActive ? " · 生成中" : shot.videoArtifact?.stale ? " · 旧方案" : shot.videoArtifact ? " · 已完成" : ""}</button></div>}
                {requestActive && <span className="image-progress"><i />{IMAGE_STATUS[shot.status]}</span>}
                {showingVideo && videoActive && <div className="card-video-progress" role="progressbar" aria-label={`分镜 ${shot.index + 1} 视频进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressFor(videoRequest))}><div><strong>{videoRequest?.status === "waiting_remote" ? "远端忙，正在排队" : VIDEO_STATUS[shot.videoStatus]}</strong><span>{Math.round(progressFor(videoRequest))}%</span></div><i><span style={{ width: `${progressFor(videoRequest)}%` }} /></i><small>可切换任务或对话，后台会继续处理</small></div>}
                {showingVideo && shot.videoArtifact?.stale && !videoActive && videoRequest?.status !== "failed" && <div className="card-video-stale" role="status"><strong>这是旧图片或旧提示词生成的视频</strong><small>重做时使用当前正式图片和最新提示词</small></div>}
                {showingVideo && shot.videoArtifact && !videoActive && videoRequest?.status === "failed" && <div className="card-video-stale is-error" role="alert"><strong>本次重做失败，上一版仍可播放</strong><small>{videoRequest.error || "可在下方重新生成这一镜"}</small></div>}
                {showingVideo && !shot.videoArtifact && !videoActive && shot.videoStatus === "failed" && <div className="card-video-empty is-error"><strong>本镜视频生成失败</strong><small>{videoRequest?.error || "可直接点击下方重新生成"}</small></div>}
                {showingVideo && !shot.videoArtifact && !videoActive && shot.videoStatus !== "failed" && <div className="card-video-empty"><strong>视频会回到这里</strong><small>{shot.videoPlan?.prompt && !shot.videoPlan.stale ? "提示词已准备，可直接开始" : "点击生成视频会自动准备提示词并继续"}</small></div>}
              </div>
              <div className="shot-copy"><h3>{shot.title}</h3><p>{shot.action || "还没有填写动作描述"}</p></div>
              {activeImageRequest?.instruction && <div className="request-feedback-chip" title={activeImageRequest.instruction}><strong>本次要求</strong><span>{activeImageRequest.instruction}</span></div>}
              {failedImageRequest && <div className="card-image-error" role="alert"><strong>{shot.imagePath ? "本次重做失败，仍在使用上一版" : "图片生成失败"}</strong><span>{failedImageRequest.error || "可以修改要求后重新提交这一镜"}</span></div>}
              {shot.imageStale && !activeImageRequest && !failedImageRequest && <div className="card-image-stale" role="status"><strong>这张图来自修改前的方向</strong><span>原图仍保留用于对照；按当前宫格重做后再生成视频。</span></div>}
              <footer className="unified-card-actions" onPointerDown={(event) => event.stopPropagation()}>
                {!shot.imagePath ? activeImageRequest?.status === "queued" ? <button className="cancel-wait-action formal-image-action" onClick={() => onCancelGenerationRequest(activeImageRequest.id)} disabled={busy}>取消图片等待</button> : <div className="formal-image-entry"><button className="formal-image-action" onClick={() => onGenerateShot(shot.id)} disabled={busy || Boolean(formalBlockReason) || requestActive} title={formalBlockReason}>{requestActive ? IMAGE_STATUS[shot.status] : `生成第 ${String(shot.index + 1).padStart(2, "0")} 镜正式图`}</button>{formalBlockReason && !requestActive && <small className="formal-image-blocker">{formalBlockReason}</small>}</div> : <>
                  <div>{activeImageRequest?.status === "queued" ? <button className="cancel-wait-action" onClick={() => onCancelGenerationRequest(activeImageRequest.id)} disabled={busy}>取消图片等待</button> : <button onClick={() => onGenerateShot(shot.id)} disabled={busy || Boolean(formalBlockReason) || requestActive || videoActive} title={videoActive ? "视频正在生成，完成后再重做图片" : formalBlockReason}>整张重做</button>}<button className="text-action" disabled={busy || Boolean(editBlockReason) || requestActive || videoActive} title={videoActive ? "视频正在生成，完成后再修改图片" : editBlockReason} onClick={() => onEditRegion(shot)}>局部修改</button></div>
                  <button className="video-card-action" onClick={() => { setMediaView((current) => ({ ...current, [shot.id]: "video" })); onGenerateVideoShot(shot.id); }} disabled={busy || videoActive || requestActive || shot.imageStale} title={shot.imageStale ? "这张图片来自旧方向，请先重做图片" : requestActive ? "图片正在更新，完成后会以新图片生成视频" : videoActive ? "本镜视频正在后台处理中" : undefined}>{videoActive ? `${VIDEO_STATUS[shot.videoStatus]} ${Math.round(progressFor(videoRequest))}%` : shot.imageStale ? "先重做图片" : shot.videoArtifact?.stale ? "按当前方案重做视频" : shot.videoArtifact ? "重做视频" : shot.videoStatus === "failed" ? "重新生成视频" : "生成视频"}</button>
                </>}
              </footer>
            </article>
          );
        })}
      </div>

      {contactEditorOpen && project.contactSheetPath && <div className="contact-sheet-editor-backdrop" data-canvas-no-pan onPointerDown={(event) => { if (event.target === event.currentTarget) setContactEditorOpen(false); }} onWheel={(event) => event.stopPropagation()}>
        <div ref={contactDialogRef} className="contact-sheet-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-sheet-editor-title" tabIndex={-1}>
          <header><div><span>方向宫格</span><h2 id="contact-sheet-editor-title">点选画面，直接生成正式图或重做草案</h2><p>选中状态同时使用描边、编号和勾选标记；“生成正式图”与“修改宫格草案”是两个独立操作。</p></div><button type="button" className="contact-sheet-editor-close" data-dialog-close onClick={() => setContactEditorOpen(false)} aria-label="关闭宫格编辑器">×</button></header>
          {project.contactSheetStale && <div className="contact-sheet-stale-alert" role="alert"><strong>这张宫格对应的是旧方案</strong><span>请先整张重做，生成当前方案的宫格后再选格修改。</span></div>}
          {contactRequest && <div className="contact-update-banner" role="status"><i /><div><strong>{contactRequest.kind === "contact_sheet_edit" ? `正在重做选中的 ${contactRequest.shotIds.length} 格` : "正在重做整张方向宫格"}</strong><span>请求已登记，完成后这里会自动换入新宫格。</span></div></div>}
          <ContactSheetSelector projectId={project.id} mediaPath={project.contactSheetPath} version={contactSheetMediaVersion(project)} shots={orderedShots} grid={project.contactSheetGrid ?? contactSheetGridFor(orderedShots.length)} disabled={busy || contactRequestActive || project.contactSheetStale || !contactReady} formalBlockReason={formalBlockReason} onGenerateSelected={(shotIds) => { setContactEditorOpen(false); onGenerateSelectedShots(shotIds); }} onSubmit={async (payload) => { const accepted = await onEditContactSheet(payload); if (accepted) setContactEditorOpen(false); return accepted; }} />
        </div>
      </div>}

      <div className="canvas-command-bar unified-command-bar" data-canvas-no-pan aria-label="分镜批量操作">
        <span className="selection-count"><strong>{checkedShotIds.size}</strong><small>/ {orderedShots.length} 已选</small></span>
        <button onClick={onSelectAll} disabled={checkedShotIds.size === orderedShots.length}>全选</button>
        {!hasSelection && <span className="selection-hint">点编号多选 · Shift 连选</span>}
        {!hasSelection && unrenderedCount > 0 && <button onClick={onSelectUnrendered}>待出图 {unrenderedCount}</button>}
        {!hasSelection && videoReadyCount > 0 && <button onClick={onSelectVideoReady}>可做视频 {videoReadyCount}</button>}
        {hasSelection && <button className="clear-selection-action" onClick={onClearSelection}>清除</button>}
        {hasSelection && <div className="command-view-switch" role="group" aria-label="切换已选分镜视图">
          <button className="image-view-action" onClick={() => switchSelectedMediaView("image")}>图片</button>
          <button className="video-view-action" onClick={() => switchSelectedMediaView("video")} disabled={selectedPreviewVideoCount === 0} title={selectedPreviewVideoCount ? `切换 ${selectedPreviewVideoCount} 个已有视频的分镜` : "已选分镜还没有可预览的视频"}>视频{selectedPreviewVideoCount > 0 ? ` ${selectedPreviewVideoCount}` : ""}</button>
        </div>}
        {hasSelection && <div className="command-primary-actions">
          <button className="batch-generate-action image-batch-action" onClick={onGenerateSelected} disabled={busy || Boolean(formalBlockReason) || selectedImageEligibleCount === 0} title={formalBlockReason ?? (selectedImageSkippedCount ? `先处理可用的 ${selectedImageEligibleCount} 张，跳过 ${selectedImageSkippedCount} 张处理中` : `处理已选 ${checkedShotIds.size} 个分镜`)}>{selectedImageSkippedCount ? `处理可用 ${selectedImageEligibleCount} 张 · 跳过 ${selectedImageSkippedCount}` : selectedWithImageCount === 0 ? "生成图片" : selectedWithoutImageCount === 0 ? "重做图片" : `生成 ${selectedWithoutImageCount} · 重做 ${selectedWithImageCount}`}</button>
          <button className="batch-generate-action video-batch-action" onClick={() => { if (selectedWithVideoCount > 0 && !window.confirm(`已选分镜中有 ${selectedWithVideoCount} 段现有视频会被重做，确定继续吗？`)) return; onGenerateSelectedVideos(); }} disabled={busy || selectedVideoEligibleNowCount + selectedVideoDeferredCount === 0} title={selectedVideoDeferredCount ? `先处理 ${selectedVideoEligibleNowCount} 张已就绪图片；另有 ${selectedVideoDeferredCount} 张会在图片写回后继续` : selectedStaleImageCount ? "旧方案图片不会提交，需先重做" : selectedVideoActiveCount ? "正在生成的视频会自动跳过" : `使用 ${selectedVideoEligibleNowCount} 张已选图片生成视频`}>{selectedVideoDeferredCount ? `先做 ${selectedVideoEligibleNowCount} 段 · 等待 ${selectedVideoDeferredCount} 张` : selectedWithVideoCount === 0 ? "生成视频" : selectedWithoutVideoCount === 0 ? "重做视频" : `生成 ${selectedWithoutVideoCount} · 重做 ${selectedWithVideoCount}`}</button>
        </div>}
        {failedCount > 0 && <button className="retry-action" onClick={onRetryFailed} disabled={busy || Boolean(formalBlockReason)}>图片失败 {failedCount}</button>}
        {videoFailedCount > 0 && <button className="retry-action" onClick={onRetryVideoFailed}>视频失败 {videoFailedCount}</button>}
      </div>

      <div className="zoom-dock" data-canvas-no-pan aria-label="画布布局与缩放"><button className="arrange-canvas-action" onClick={arrangeCanvas} title="按当前比例重新排成不重叠的网格">整理</button><button onClick={() => setZoom(viewport.zoom - 0.1)} aria-label="缩小">−</button><button className="zoom-value" onClick={() => fitCanvas()} title="适配全部分镜">{Math.round(viewport.zoom * 100)}%</button><button onClick={() => setZoom(viewport.zoom + 0.1)} aria-label="放大">＋</button></div>
      <div className="canvas-hint" id="canvas-hint">空白处拖动画布 · 滚轮缩放 · 卡片可自由移动 · “整理布局”可一键消除重叠</div>
    </section>
  );
}

function CanvasNoteCard({ note, onUpdate, onDelete }: { note: CanvasNote; onUpdate: (noteId: string, text: string) => void; onDelete: (noteId: string) => void }) {
  const [text, setText] = useState(note.text);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setText(note.text); }, [dirty, note.text]);
  const persist = () => {
    if (!dirty) return;
    const normalized = text.trim() || "空白便签";
    setText(normalized);
    setDirty(false);
    onUpdate(note.id, normalized);
  };
  return <aside className={`canvas-note note-${note.color}`} style={{ left: note.position.x, top: note.position.y }} data-canvas-no-pan><header><span>创作便签</span><button type="button" onClick={() => onDelete(note.id)} aria-label="删除便签" title="删除便签">×</button></header><textarea value={text} onChange={(event) => { setText(event.target.value); setDirty(true); }} onBlur={persist} aria-label="便签内容" /></aside>;
}
