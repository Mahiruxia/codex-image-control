import { useState } from "react";
import { useDialogFocus } from "./useDialogFocus";

const SUGGESTIONS = ["换成更干净自然的背景", "调整光线与色彩，让主体更突出", "保持主体不变，重新优化构图", "去掉画面里多余的物体"] as const;

export function WholeImageEditModal({ title, busy, onClose, onSubmit }: { title: string; busy: boolean; onClose: () => void; onSubmit: (instruction: string) => Promise<boolean> }) {
  const [instruction, setInstruction] = useState("");
  const dialogRef = useDialogFocus<HTMLElement>(onClose, busy);
  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section ref={dialogRef} className="whole-image-edit-modal" role="dialog" aria-modal="true" aria-labelledby="whole-edit-title" tabIndex={-1}>
        <header><div><span className="eyebrow">整图修改</span><h2 id="whole-edit-title">告诉 Codex 这张图要怎么变</h2><p>{title} · 当前图片会自动作为编辑底图。</p></div><button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="关闭整图修改">×</button></header>
        <label>修改要求<textarea autoFocus value={instruction} maxLength={5000} onChange={(event) => setInstruction(event.target.value)} placeholder="例如：人物保持完全不变，把背景换成傍晚的海边步道；光线改成自然落日侧光，保留真实手机拍摄质感。" /></label>
        <div className="whole-edit-suggestions">{SUGGESTIONS.map((item) => <button type="button" key={item} onClick={() => setInstruction((current) => current ? `${current}；${item}` : item)}>{item}</button>)}</div>
        <div className="whole-edit-note"><strong>默认保护</strong><span>未要求变化的主体、身份、服装、比例和画面细节会尽量保持。</span></div>
        <footer><span>{instruction.length} / 5000</span><button className="quiet-button" type="button" onClick={onClose} disabled={busy}>取消</button><button className="primary-button" type="button" disabled={busy || !instruction.trim()} onClick={() => void onSubmit(instruction.trim()).then((ok) => ok && onClose())}>{busy ? "正在登记…" : "开始修改"}</button></footer>
      </section>
    </div>
  );
}
