import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { useMediaDataUrl } from "./media";
import type { ContactSheetGrid, ShotRecord } from "./types";

export interface ContactSheetEditPayload {
  instruction: string;
  shotIds: string[];
  selectionMaskDataUrl: string;
  annotatedPreviewDataUrl: string;
}

interface ContactSheetSelectorProps {
  projectId: string;
  mediaPath: string;
  version: string;
  shots: ShotRecord[];
  grid: ContactSheetGrid;
  disabled?: boolean;
  formalBlockReason?: string;
  onGenerateSelected: (shotIds: string[]) => void;
  onSubmit: (payload: ContactSheetEditPayload) => Promise<boolean>;
}

function selectedRect(index: number, grid: ContactSheetGrid, width: number, height: number) {
  const column = index % grid.columns;
  const row = Math.floor(index / grid.columns);
  return {
    x: (column * width) / grid.columns,
    y: (row * height) / grid.rows,
    width: width / grid.columns,
    height: height / grid.rows,
  };
}

export function ContactSheetSelector({ projectId, mediaPath, version, shots, grid, disabled, formalBlockReason, onGenerateSelected, onSubmit }: ContactSheetSelectorProps) {
  const media = useMediaDataUrl(projectId, mediaPath, "source", version);
  const imageRef = useRef<HTMLImageElement>(null);
  const lastClickedRef = useRef<number | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setSelected(new Set());
    setInstruction("");
    lastClickedRef.current = undefined;
  }, [projectId, mediaPath, version]);

  const toggle = (event: MouseEvent<HTMLButtonElement>, shot: ShotRecord, index: number) => {
    if (disabled) return;
    const selectRange = event.shiftKey;
    const rangeStart = lastClickedRef.current;
    setSelected((current) => {
      const next = new Set(current);
      if (selectRange && rangeStart !== undefined) {
        const start = Math.min(rangeStart, index);
        const end = Math.max(rangeStart, index);
        const shouldSelect = !current.has(shot.id);
        shots.slice(start, end + 1).forEach((item) => shouldSelect ? next.add(item.id) : next.delete(item.id));
      } else if (next.has(shot.id)) next.delete(shot.id);
      else next.add(shot.id);
      return next;
    });
    lastClickedRef.current = index;
  };

  const clearSelection = () => {
    setSelected(new Set());
    lastClickedRef.current = undefined;
  };

  const selectAll = () => {
    setSelected(new Set(shots.map((shot) => shot.id)));
    lastClickedRef.current = shots.length ? shots.length - 1 : undefined;
  };

  const removeSelected = (shotId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      next.delete(shotId);
      return next;
    });
    lastClickedRef.current = undefined;
  };

  const submit = async () => {
    const image = imageRef.current;
    const cleanInstruction = instruction.trim();
    if (!image || !loaded || !selected.size || !cleanInstruction) return;
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const mask = document.createElement("canvas");
    mask.width = width;
    mask.height = height;
    const maskContext = mask.getContext("2d");
    const preview = document.createElement("canvas");
    preview.width = width;
    preview.height = height;
    const previewContext = preview.getContext("2d");
    if (!maskContext || !previewContext) return;
    maskContext.clearRect(0, 0, width, height);
    maskContext.fillStyle = "#ffffff";
    previewContext.drawImage(image, 0, 0, width, height);
    previewContext.font = `700 ${Math.max(18, Math.round(Math.min(width, height) * 0.024))}px sans-serif`;
    previewContext.textAlign = "center";
    previewContext.textBaseline = "middle";
    shots.forEach((shot, index) => {
      if (!selected.has(shot.id)) return;
      const rect = selectedRect(index, grid, width, height);
      const inset = Math.max(1, Math.round(Math.min(rect.width, rect.height) * 0.005));
      maskContext.fillRect(rect.x + inset, rect.y + inset, rect.width - inset * 2, rect.height - inset * 2);
      previewContext.fillStyle = "rgba(196, 255, 84, 0.2)";
      previewContext.fillRect(rect.x, rect.y, rect.width, rect.height);
      previewContext.strokeStyle = "#c4ff54";
      previewContext.lineWidth = Math.max(3, Math.round(Math.min(width, height) * 0.004));
      previewContext.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
      previewContext.fillStyle = "#17220a";
      previewContext.fillRect(rect.x + rect.width * 0.35, rect.y + rect.height * 0.4, rect.width * 0.3, rect.height * 0.2);
      previewContext.fillStyle = "#eaffb8";
      previewContext.fillText(String(shot.index + 1).padStart(2, "0"), rect.x + rect.width / 2, rect.y + rect.height / 2);
    });
    setSubmitting(true);
    try {
      const accepted = await onSubmit({
        instruction: cleanInstruction,
        shotIds: shots.filter((shot) => selected.has(shot.id)).map((shot) => shot.id),
        selectionMaskDataUrl: mask.toDataURL("image/png"),
        annotatedPreviewDataUrl: preview.toDataURL("image/png"),
      });
      if (accepted) {
        clearSelection();
        setInstruction("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCount = selected.size;
  const selectedShots = shots.filter((shot) => selected.has(shot.id));
  return (
    <section className="contact-sheet-editor" aria-label="宫格选格生成正式图或重做草案">
      <div className="contact-sheet-selection-pane">
        <div className="contact-sheet-select-heading">
          <div><strong>先点选要处理的画面</strong><small>选中后可直接生成正式图，也可只重做这些宫格草案；Shift 可连续选择</small></div>
          <div className="contact-sheet-selection-tools">
            <button type="button" onClick={selectAll} disabled={disabled || selectedCount === shots.length}>全选</button>
            <button type="button" onClick={clearSelection} disabled={disabled || !selectedCount}>清空</button>
          </div>
        </div>
        <div className={`contact-sheet-select-image ${disabled ? "is-disabled" : ""}`}>
          {media.src ? <img ref={imageRef} src={media.src} alt="可选择格子的宫格总览" draggable={false} onLoad={() => setLoaded(true)} /> : <span className="media-state media-state-loading" role="img" aria-label="宫格正在载入" />}
          {media.loading && media.src && <span className="contact-media-refresh" role="status">正在换入新宫格…</span>}
          {media.error && media.src && <span className="contact-media-refresh is-error" role="alert">新宫格载入失败，已保留上一版</span>}
          {media.src && <div className="contact-cell-grid" style={{ "--contact-columns": grid.columns, "--contact-rows": grid.rows } as CSSProperties}>
            {shots.map((shot, index) => {
              const isSelected = selected.has(shot.id);
              return <button key={shot.id} type="button" className={isSelected ? "is-selected" : ""} aria-label={`${isSelected ? "取消选择" : "选择"}宫格 ${String(shot.index + 1).padStart(2, "0")} ${shot.title}`} aria-pressed={isSelected} disabled={disabled || submitting || !loaded} onClick={(event) => toggle(event, shot, index)}><span>{String(shot.index + 1).padStart(2, "0")}</span>{isSelected && <i aria-hidden="true">✓</i>}</button>;
            })}
          </div>}
        </div>
        <div className="contact-sheet-select-legend"><span><i />点击格子切换选择</span><span><i />带勾的格子就是本次处理范围</span></div>
      </div>
      <aside className="contact-sheet-edit-form">
        <div className="contact-sheet-selection-summary">
          <div><span>本次修改范围</span><strong role="status" aria-live="polite">{selectedCount}<small>/ {shots.length} 格</small></strong></div>
          {selectedCount ? <div className="contact-sheet-selected-chips">{selectedShots.map((shot) => <button type="button" key={shot.id} onClick={() => removeSelected(shot.id)} disabled={disabled || submitting} title={`移除第 ${shot.index + 1} 格`}><b>{String(shot.index + 1).padStart(2, "0")}</b><span>{shot.title}</span><i aria-hidden="true">×</i></button>)}</div> : <p>先在左侧点选一个或多个格子，选中范围会列在这里。</p>}
        </div>
        <div className="contact-sheet-formal-action">
          <div><span>生成最终分镜</span><strong>{selectedCount ? `已选 ${selectedCount} 格` : "先在左侧选格"}</strong><p>使用已确认的方向与对应宫格画面，逐张生成可用于视频的正式图片。</p></div>
          <button
            type="button"
            className="primary-button wide"
            onClick={() => onGenerateSelected(selectedShots.map((shot) => shot.id))}
            disabled={disabled || submitting || !loaded || !selectedCount || Boolean(formalBlockReason)}
            title={formalBlockReason}
          >
            {selectedCount === 1 ? `生成第 ${String(selectedShots[0].index + 1).padStart(2, "0")} 镜正式图` : selectedCount ? `生成所选 ${selectedCount} 张正式图` : "选择格子后生成正式图"}
          </button>
          {formalBlockReason && <small className="contact-sheet-formal-block" role="status">{formalBlockReason}</small>}
        </div>
        <div className="contact-sheet-action-divider"><span>或者，只修改宫格草案</span></div>
        <label htmlFor={`contact-sheet-edit-${projectId}`}>这些格子的草案需要怎么改</label>
        <textarea id={`contact-sheet-edit-${projectId}`} value={instruction} maxLength={1000} onChange={(event) => setInstruction(event.target.value)} disabled={disabled || submitting} placeholder="例如：人物改成自然回头，保留同一套衣服、同一个客厅和原来的情节顺序。" />
        <div className="contact-sheet-edit-guard"><strong>只替换选中格</strong><span>其他格子的画面和顺序保持原样。</span></div>
        <button type="button" className="contact-sheet-edit-submit" onClick={() => void submit()} disabled={disabled || submitting || !loaded || !selectedCount || !instruction.trim()}>{submitting ? "正在登记草案重做请求…" : selectedCount ? `按要求重做草案 · ${selectedCount} 格` : "请先选择要重做的格子"}</button>
      </aside>
    </section>
  );
}
