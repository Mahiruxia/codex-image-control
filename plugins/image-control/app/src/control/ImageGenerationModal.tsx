import { useMemo, useState } from "react";
import { MediaImage } from "./MediaImage";
import type { ProjectRecord, ShotRecord } from "./types";
import { useDialogFocus } from "./useDialogFocus";

interface ImageGenerationModalProps {
  project: ProjectRecord;
  shotIds: string[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (instruction: string) => Promise<boolean>;
}

const SUGGESTIONS = [
  "动作更自然，重心和手脚接触更真实",
  "保持人物服装不变，换一个更有变化的机位",
  "场景增加真实生活细节，但不要变得杂乱",
  "保持剧情不变，画面更像手机随手抓拍",
];

export function ImageGenerationModal({ project, shotIds, busy, onClose, onSubmit }: ImageGenerationModalProps) {
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const shots = useMemo(() => shotIds
    .map((shotId) => project.shots.find((shot) => shot.id === shotId))
    .filter((shot): shot is ShotRecord => Boolean(shot)), [project.shots, shotIds]);
  const singleShot = shots.length === 1 ? shots[0] : undefined;
  const allExisting = shots.length > 0 && shots.every((shot) => shot.imagePath);
  const existingCount = shots.filter((shot) => shot.imagePath).length;
  const staleCount = shots.filter((shot) => shot.imagePath && shot.imageStale).length;
  const newCount = shots.length - existingCount;
  const selectedShotNumbers = shots.map((shot) => String(shot.index + 1).padStart(2, "0"));
  const currentVideoCount = shots.filter((shot) => shot.videoArtifact && !shot.videoArtifact.stale).length;
  const dialogRef = useDialogFocus<HTMLElement>(onClose, busy || submitting);

  const submit = async () => {
    setSubmitting(true);
    try {
      const saved = await onSubmit(instruction.trim());
      if (saved) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && !busy && !submitting && onClose()}>
      <section ref={dialogRef} className="image-generation-modal" role="dialog" aria-modal="true" aria-labelledby="image-generation-title" tabIndex={-1}>
        <header>
          <div>
            <span className="eyebrow">本次图片任务</span>
            <h2 id="image-generation-title">{singleShot ? singleShot.imagePath ? `重做第 ${singleShot.index + 1} 镜` : `生成第 ${singleShot.index + 1} 镜正式图` : allExisting ? `重做已选 ${shots.length} 张` : `生成 / 重做已选 ${shots.length} 张`}</h2>
            <p>{existingCount ? `其中 ${existingCount} 张会覆盖当前正式图` : "全部为首次生成"}{newCount ? `，${newCount} 张会生成新图` : ""}；留空则沿用各镜当前方案。</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy || submitting} aria-label="关闭图片任务设置">×</button>
        </header>

        {singleShot?.imagePath && (
          <div className="redo-shot-preview">
            <MediaImage projectId={project.id} mediaPath={singleShot.imagePath} variant="thumbnail" version={singleShot.imageSha256 ?? singleShot.imagePath} alt={`第 ${singleShot.index + 1} 镜当前图片`} />
            <div><strong>{String(singleShot.index + 1).padStart(2, "0")} · {singleShot.title}</strong><p>{singleShot.action || singleShot.scene}</p></div>
          </div>
        )}

        {shots.length > 1 && (
          <div className="redo-selection-summary" role="status">
            <strong>本次处理 {shots.length} 个分镜 · 新生成 {newCount} · 覆盖重做 {existingCount}</strong>
            <span>{selectedShotNumbers.map((number) => `第 ${number} 镜`).join(" · ")}</span>
          </div>
        )}

        <label className="redo-instruction-field">
          <span>{shots.length > 1 ? "本次生成要求（应用到全部已选分镜）" : "本次生成要求"}<small>只用于本次 · 可模糊描述</small></span>
          <textarea
            autoFocus
            value={instruction}
            maxLength={2000}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="例如：人物和服装保持不变，换成更低一点的机位；动作自然些，门把手接触要真实，背景增加一点傍晚生活气息。"
          />
        </label>

        <div className="redo-suggestions" aria-label="常用修改方向">
          <span>快速补充</span>
          <div>{SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => setInstruction((current) => current ? `${current}；${suggestion}` : suggestion)} disabled={busy || submitting}>{suggestion}</button>)}</div>
        </div>

        <div className="redo-guardrails"><i />这条文字会完整写入本次请求，不会修改长期分镜文案；人物身份、全身比例、服装和项目参考仍会自动继承。</div>
        {staleCount > 0 && <div className="redo-stale-impact" role="status"><strong>{staleCount} 张是旧方向图片</strong><span>本次会按已经确认的新宫格重新生成，成功写回后恢复为当前方案。</span></div>}
        {existingCount > 0 && <div className="redo-overwrite-impact" role="status"><strong>{existingCount} 张当前正式图会被替换</strong><span>写回采用安全覆盖，并为每镜保留一次“撤销上次覆盖”。未选中的分镜不受影响。</span></div>}
        {currentVideoCount > 0 && <div className="redo-video-impact" role="status"><strong>其中 {currentVideoCount} 镜已有视频</strong><span>新图片写回后，旧视频会标记为“旧首帧”；再次点击重做视频时会使用这次生成的新图片。</span></div>}
        <footer>
          <button className="quiet-button" type="button" onClick={onClose} disabled={busy || submitting}>取消，不创建请求</button>
          <button className="primary-button" type="button" onClick={() => void submit()} disabled={busy || submitting || shots.length === 0}>{submitting ? "正在登记…" : instruction.trim() ? allExisting ? "按这条意见重做" : "按这条要求生成" : allExisting ? "按当前方案重做" : "按当前方案生成"}</button>
        </footer>
      </section>
    </div>
  );
}
