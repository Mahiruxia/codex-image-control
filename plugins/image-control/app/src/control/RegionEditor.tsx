import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useMediaDataUrl } from "./media";
import type { ShotRecord } from "./types";
import { useDialogFocus } from "./useDialogFocus";

type EditMode = "rectangle" | "ellipse" | "brush" | "eraser" | "arrow" | "text";

interface RegionEditPayload {
  instruction: string;
  maskDataUrl: string;
  annotatedPreviewDataUrl: string;
}

interface RegionEditorProps {
  projectId: string;
  mediaVersion: string;
  shot: ShotRecord;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: RegionEditPayload) => Promise<boolean>;
}

interface DrawPoint { x: number; y: number }

type DrawCommand =
  | { kind: "rectangle"; from: DrawPoint; to: DrawPoint }
  | { kind: "ellipse"; from: DrawPoint; to: DrawPoint }
  | { kind: "brush"; points: DrawPoint[]; size: number; erase: boolean }
  | { kind: "arrow"; from: DrawPoint; to: DrawPoint; radius: number }
  | { kind: "text"; point: DrawPoint; text: string; radius: number };

interface ActiveGesture {
  pointerId: number;
  start: DrawPoint;
  points: DrawPoint[];
  size: number;
}

const MODE_LABELS: Array<{ id: EditMode; label: string; hint: string }> = [
  { id: "rectangle", label: "矩形框", hint: "拖动框出规则区域" },
  { id: "ellipse", label: "椭圆圈", hint: "圈出人物或物体" },
  { id: "brush", label: "画笔", hint: "精细涂抹修改范围" },
  { id: "eraser", label: "减去选区", hint: "擦掉多选的部分" },
  { id: "arrow", label: "箭头定位", hint: "箭头终点是修改位置" },
  { id: "text", label: "文字定位", hint: "点击目标并添加说明" },
];

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("无法导出图片"));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("无法读取导出的图片"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    }, "image/png");
  });
}

function drawPath(context: CanvasRenderingContext2D, points: DrawPoint[], width: number) {
  if (!points.length) return;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(points[0].x * context.canvas.width, points[0].y * context.canvas.height);
  if (points.length === 1) {
    context.lineTo(points[0].x * context.canvas.width + 0.01, points[0].y * context.canvas.height + 0.01);
  } else {
    for (const point of points.slice(1)) context.lineTo(point.x * context.canvas.width, point.y * context.canvas.height);
  }
  context.stroke();
}

function paintCommand(
  command: DrawCommand,
  mask: CanvasRenderingContext2D | undefined,
  overlay: CanvasRenderingContext2D,
  draft = false,
) {
  const width = overlay.canvas.width;
  const height = overlay.canvas.height;
  const shortSide = Math.min(width, height);
  const accent = draft ? "rgba(215,255,99,.42)" : "rgba(215,255,99,.3)";
  const accentStrong = "rgba(215,255,99,.96)";
  const lineWidth = Math.max(2, shortSide / 240);
  overlay.save();
  mask?.save();

  if (command.kind === "brush") {
    const brushWidth = Math.max(2, command.size * shortSide);
    if (command.erase && !draft) {
      if (mask) {
        mask.globalCompositeOperation = "destination-out";
        mask.strokeStyle = "#000";
        drawPath(mask, command.points, brushWidth);
      }
      overlay.globalCompositeOperation = "destination-out";
      overlay.strokeStyle = "#000";
      drawPath(overlay, command.points, brushWidth);
    } else {
      if (mask && !command.erase) {
        mask.globalCompositeOperation = "source-over";
        mask.strokeStyle = "#fff";
        drawPath(mask, command.points, brushWidth);
      }
      overlay.globalCompositeOperation = "source-over";
      overlay.strokeStyle = command.erase ? "rgba(255,190,120,.9)" : (draft ? accentStrong : "rgba(215,255,99,.5)");
      if (command.erase) overlay.setLineDash([Math.max(5, brushWidth / 3), Math.max(4, brushWidth / 4)]);
      drawPath(overlay, command.points, command.erase ? Math.max(3, brushWidth * .18) : brushWidth);
    }
  } else if (command.kind === "rectangle" || command.kind === "ellipse") {
    const x = Math.min(command.from.x, command.to.x) * width;
    const y = Math.min(command.from.y, command.to.y) * height;
    const boxWidth = Math.abs(command.to.x - command.from.x) * width;
    const boxHeight = Math.abs(command.to.y - command.from.y) * height;
    overlay.fillStyle = accent;
    overlay.strokeStyle = accentStrong;
    overlay.lineWidth = lineWidth;
    if (mask) mask.fillStyle = "#fff";
    if (command.kind === "ellipse") {
      for (const context of [mask, overlay].filter(Boolean) as CanvasRenderingContext2D[]) {
        context.beginPath();
        context.ellipse(x + boxWidth / 2, y + boxHeight / 2, boxWidth / 2, boxHeight / 2, 0, 0, Math.PI * 2);
        context.fill();
        if (context === overlay) context.stroke();
      }
    } else {
      mask?.fillRect(x, y, boxWidth, boxHeight);
      overlay.fillRect(x, y, boxWidth, boxHeight);
      overlay.strokeRect(x, y, boxWidth, boxHeight);
    }
  } else if (command.kind === "arrow") {
    const from = { x: command.from.x * width, y: command.from.y * height };
    const to = { x: command.to.x * width, y: command.to.y * height };
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const head = Math.max(16, shortSide / 24);
    overlay.strokeStyle = accentStrong;
    overlay.fillStyle = accentStrong;
    overlay.lineWidth = lineWidth * 1.4;
    overlay.lineCap = "round";
    overlay.beginPath();
    overlay.moveTo(from.x, from.y);
    overlay.lineTo(to.x, to.y);
    overlay.stroke();
    overlay.beginPath();
    overlay.moveTo(to.x, to.y);
    overlay.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
    overlay.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
    overlay.closePath();
    overlay.fill();
    if (mask) {
      mask.fillStyle = "#fff";
      mask.beginPath();
      mask.arc(to.x, to.y, Math.max(10, command.radius * shortSide), 0, Math.PI * 2);
      mask.fill();
    }
  } else {
    const point = { x: command.point.x * width, y: command.point.y * height };
    const radius = Math.max(10, command.radius * shortSide);
    if (mask) {
      mask.fillStyle = "#fff";
      mask.beginPath();
      mask.arc(point.x, point.y, radius, 0, Math.PI * 2);
      mask.fill();
    }
    overlay.strokeStyle = accentStrong;
    overlay.fillStyle = accentStrong;
    overlay.lineWidth = lineWidth;
    overlay.beginPath();
    overlay.arc(point.x, point.y, radius, 0, Math.PI * 2);
    overlay.stroke();
    const fontSize = Math.max(18, shortSide / 24);
    const labelX = Math.min(width - 12, point.x + radius + 12);
    const labelY = Math.max(fontSize + 8, point.y - radius / 2);
    overlay.font = `600 ${fontSize}px "Microsoft YaHei", sans-serif`;
    overlay.strokeStyle = "rgba(15,18,13,.94)";
    overlay.lineWidth = Math.max(3, fontSize / 8);
    overlay.strokeText(command.text, labelX, labelY, Math.max(80, width - labelX - 12));
    overlay.fillText(command.text, labelX, labelY, Math.max(80, width - labelX - 12));
  }

  mask?.restore();
  overlay.restore();
}

function selectionExists(commands: DrawCommand[]): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const overlay = document.createElement("canvas").getContext("2d");
  if (!context || !overlay) return commands.length > 0;
  overlay.canvas.width = overlay.canvas.height = 128;
  for (const command of commands) paintCommand(command, context, overlay);
  const pixels = context.getImageData(0, 0, 128, 128).data;
  for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) return true;
  return false;
}

export function RegionEditor({ projectId, mediaVersion, shot, busy, onClose, onSubmit }: RegionEditorProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<HTMLCanvasElement>(null);
  const commandsRef = useRef<DrawCommand[]>([]);
  const activeRef = useRef<ActiveGesture | null>(null);
  const [mode, setMode] = useState<EditMode>("rectangle");
  const [instruction, setInstruction] = useState("");
  const [brushSize, setBrushSize] = useState(28);
  const [annotationText, setAnnotationText] = useState("修改这里");
  const [hasSelection, setHasSelection] = useState(false);
  const [historyDepth, setHistoryDepth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const sourceMedia = useMediaDataUrl(projectId, shot.imagePath, "source", mediaVersion);

  const requestClose = () => {
    if (submitting) return;
    if (closeConfirmOpen) return setCloseConfirmOpen(false);
    if (hasSelection || instruction.trim()) return setCloseConfirmOpen(true);
    onClose();
  };
  const dialogRef = useDialogFocus<HTMLElement>(requestClose, submitting);

  const contexts = () => {
    const mask = maskRef.current?.getContext("2d");
    const overlay = overlayRef.current?.getContext("2d");
    const draft = draftRef.current?.getContext("2d");
    if (!mask || !overlay || !draft) throw new Error("编辑画布尚未准备好");
    return { mask, overlay, draft };
  };

  const renderCommands = () => {
    const { mask, overlay, draft } = contexts();
    mask.clearRect(0, 0, mask.canvas.width, mask.canvas.height);
    overlay.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
    draft.clearRect(0, 0, draft.canvas.width, draft.canvas.height);
    for (const command of commandsRef.current) paintCommand(command, mask, overlay);
    const selected = selectionExists(commandsRef.current);
    setHasSelection(selected);
    setHistoryDepth(commandsRef.current.length);
  };

  const syncCanvasSize = () => {
    const image = imageRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) return;
    for (const canvas of [maskRef.current, overlayRef.current, draftRef.current]) {
      if (!canvas) continue;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
    }
    renderCommands();
  };

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete) syncCanvasSize();
  }, [sourceMedia.src]);

  const pointFromClient = (clientX: number, clientY: number, canvas: HTMLCanvasElement): DrawPoint => {
    const bounds = canvas.getBoundingClientRect();
    return { x: clamp((clientX - bounds.left) / bounds.width), y: clamp((clientY - bounds.top) / bounds.height) };
  };

  const showDraft = (command?: DrawCommand) => {
    const draft = draftRef.current?.getContext("2d");
    if (!draft) return;
    draft.clearRect(0, 0, draft.canvas.width, draft.canvas.height);
    if (command) paintCommand(command, undefined, draft, true);
  };

  const commitCommand = (command: DrawCommand) => {
    commandsRef.current.push(command);
    renderCommands();
    setError("");
  };

  const commandFromGesture = (gesture: ActiveGesture, end: DrawPoint): DrawCommand | undefined => {
    if (mode === "brush" || mode === "eraser") {
      const points = [...gesture.points, end];
      return { kind: "brush", points, size: gesture.size, erase: mode === "eraser" };
    }
    if (mode === "arrow") {
      if (Math.hypot(end.x - gesture.start.x, end.y - gesture.start.y) < .008) return undefined;
      return { kind: "arrow", from: gesture.start, to: end, radius: gesture.size * 1.4 };
    }
    if (Math.abs(end.x - gesture.start.x) < .004 || Math.abs(end.y - gesture.start.y) < .004) return undefined;
    return { kind: mode, from: gesture.start, to: end } as DrawCommand;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary || event.button !== 0 || activeRef.current) return;
    event.preventDefault();
    const point = pointFromClient(event.clientX, event.clientY, event.currentTarget);
    const bounds = event.currentTarget.getBoundingClientRect();
    const normalizedSize = brushSize / Math.max(1, Math.min(bounds.width, bounds.height));
    if (mode === "text") {
      commitCommand({ kind: "text", point, text: annotationText.trim() || "修改这里", radius: Math.max(normalizedSize, .025) });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    activeRef.current = { pointerId: event.pointerId, start: point, points: [point], size: Math.max(normalizedSize, .008) };
    const draft = commandFromGesture(activeRef.current, point);
    if (draft) showDraft(draft);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = activeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const nativeEvents = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const points = nativeEvents.map((item) => pointFromClient(item.clientX, item.clientY, event.currentTarget));
    const end = points.at(-1) ?? gesture.start;
    if (mode === "brush" || mode === "eraser") gesture.points.push(...points);
    const draft = commandFromGesture(gesture, end);
    showDraft(draft);
  };

  const finishGesture = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = activeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const end = pointFromClient(event.clientX, event.clientY, event.currentTarget);
    activeRef.current = null;
    showDraft();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const command = commandFromGesture(gesture, end);
    if (command) commitCommand(command);
  };

  const cancelGesture = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activeRef.current?.pointerId !== event.pointerId) return;
    activeRef.current = null;
    showDraft();
  };

  const changeMode = (nextMode: EditMode) => {
    activeRef.current = null;
    showDraft();
    setMode(nextMode);
  };

  const clearSelection = () => {
    commandsRef.current = [];
    renderCommands();
    setError("");
  };

  const undoSelection = () => {
    commandsRef.current.pop();
    renderCommands();
    setError("");
  };

  const submit = async () => {
    setError("");
    if (!instruction.trim()) return setError("请先写明要修改的内容");
    if (!hasSelection) return setError("请先框选、圈选或涂抹要修改的区域");
    const image = imageRef.current;
    const mask = maskRef.current;
    const overlay = overlayRef.current;
    if (!sourceMedia.src || !image || !mask || !overlay) return setError("原图尚未载入完成");
    const annotated = document.createElement("canvas");
    annotated.width = image.naturalWidth;
    annotated.height = image.naturalHeight;
    const context = annotated.getContext("2d");
    if (!context) return setError("无法导出标注预览");
    context.drawImage(image, 0, 0, annotated.width, annotated.height);
    context.drawImage(overlay, 0, 0);
    setSubmitting(true);
    try {
      const [maskDataUrl, annotatedPreviewDataUrl] = await Promise.all([canvasToDataUrl(mask), canvasToDataUrl(annotated)]);
      const submitted = await onSubmit({ instruction: instruction.trim(), maskDataUrl, annotatedPreviewDataUrl });
      if (!submitted) setError("请求没有成功登记，选区和修改要求已为你保留，请重试");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "局部修改登记失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const stageStyle = { "--editor-zoom": String(zoom) } as CSSProperties;

  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && requestClose()}>
      <section ref={dialogRef} className="region-editor" role="dialog" aria-modal="true" aria-labelledby="region-editor-title" tabIndex={-1}>
        <header>
          <div>
            <span className="eyebrow">精准局部修改</span>
            <h2 id="region-editor-title">{shot.title}</h2>
          </div>
          <button className="icon-button" onClick={requestClose} disabled={submitting} aria-label="关闭编辑器">×</button>
        </header>
        <div className="editor-layout">
          <aside className="editor-tools">
            <div className="segmented vertical">
              {MODE_LABELS.map((item) => (
                <button key={item.id} title={item.hint} aria-pressed={mode === item.id} className={mode === item.id ? "active" : ""} onClick={() => changeMode(item.id)}>{item.label}</button>
              ))}
            </div>
            {(mode === "brush" || mode === "eraser" || mode === "arrow" || mode === "text") && (
              <label className="range-field">作用范围
                <input type="range" min="8" max="96" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
              </label>
            )}
            {mode === "text" && (
              <label>定位说明
                <input value={annotationText} onChange={(event) => setAnnotationText(event.target.value)} maxLength={30} />
              </label>
            )}
            <button className="quiet-button" onClick={undoSelection} disabled={!historyDepth}>撤销上一步</button>
            <button className="quiet-button" onClick={clearSelection} disabled={!historyDepth}>清空全部标记</button>
            <p className="tool-note">拖动时会实时显示轨迹。箭头和文字只标记终点区域；所有绿色标记都不会进入成图。</p>
          </aside>
          <div className="editor-stage-wrap">
            <div className="editor-stage-toolbar" aria-label="图片缩放">
              <span>查看比例</span>
              <button className="quiet-button" onClick={() => setZoom((value) => Math.max(.5, Math.round((value - .25) * 4) / 4))} disabled={zoom <= .5} aria-label="缩小">−</button>
              <output>{Math.round(zoom * 100)}%</output>
              <button className="quiet-button" onClick={() => setZoom((value) => Math.min(2, Math.round((value + .25) * 4) / 4))} disabled={zoom >= 2} aria-label="放大">＋</button>
              <button className="quiet-button" onClick={() => setZoom(1)} disabled={zoom === 1}>适应</button>
            </div>
            <div className="editor-stage-viewport">
              {sourceMedia.src ? (
                <div className="editor-stage" style={stageStyle}>
                  <img ref={imageRef} src={sourceMedia.src} onLoad={syncCanvasSize} alt={`${shot.title} 局部编辑原图`} draggable={false} />
                  <canvas ref={overlayRef} aria-hidden="true" />
                  <canvas ref={draftRef} className="editor-draft" aria-hidden="true" />
                  <canvas
                    ref={maskRef}
                    className={`editor-input mode-${mode}`}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={finishGesture}
                    onPointerCancel={cancelGesture}
                    onLostPointerCapture={cancelGesture}
                    aria-label="局部修改选区画布"
                  />
                </div>
              ) : (
                <div className={`editor-media-state ${sourceMedia.error ? "is-error" : ""}`} role="status">
                  {sourceMedia.error ? "原图载入失败，请重新打开工作台" : "正在安全载入原图…"}
                </div>
              )}
            </div>
          </div>
          <aside className="editor-request">
            <label htmlFor="edit-instruction">修改要求</label>
            <textarea id="edit-instruction" value={instruction} onChange={(event) => { setInstruction(event.target.value); setError(""); }} placeholder={shot.instruction ? `例如：只修正选中区域。长期要求会自动继承：${shot.instruction}` : "例如：只修正右手握包的手指，人物身份、服装、构图和光线保持不变。"} />
            <div className="edit-guardrails">
              <span>稳定性保护</span>
              <ul>
                <li>原图、选区与标注一起交给 Codex</li>
                <li>选区尺寸和有效范围提交前校验</li>
                <li>服务端合成，选区外原像素保持不变</li>
                <li>角色、造型和项目质感约束继续继承</li>
              </ul>
            </div>
            {error && <p className="inline-error" role="alert">{error}</p>}
            <p className="editor-submit-hint" aria-live="polite">{!hasSelection ? "先在图片上框选、圈选或涂抹修改范围" : !instruction.trim() ? "选区已准备，请写明希望怎么修改" : "选区和修改要求已准备完成"}</p>
            <button className="primary-button wide" onClick={submit} disabled={submitting || busy || !sourceMedia.src || !hasSelection || !instruction.trim()}>{submitting || busy ? "正在登记…" : "提交局部修改"}</button>
          </aside>
        </div>
        {closeConfirmOpen && (
          <div className="editor-close-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-edit-title">
            <div>
              <span className="eyebrow">标记尚未提交</span>
              <h3 id="discard-edit-title">要放弃这次局部修改吗？</h3>
              <p>关闭后，当前选区和修改要求不会保存。</p>
              <div className="modal-actions">
                <button className="quiet-button" onClick={() => setCloseConfirmOpen(false)} autoFocus>继续编辑</button>
                <button className="destructive-button" onClick={onClose}>放弃并关闭</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
