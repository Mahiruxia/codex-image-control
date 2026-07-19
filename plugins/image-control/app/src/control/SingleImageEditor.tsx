import { useRef } from "react";
import { MediaImage } from "./MediaImage";
import type { GenerationRequest, ProjectRecord, ShotRecord } from "./types";

interface SingleImageEditorProps {
  project: ProjectRecord;
  shot: ShotRecord;
  activeRequest?: GenerationRequest;
  failedRequest?: GenerationRequest;
  busy: boolean;
  onUpload: (file: File) => void;
  onWholeEdit: () => void;
  onRegionEdit: () => void;
  onUndo: () => void;
  onCancelRequest: (requestId: string) => void;
}

const REQUEST_LABEL: Record<string, string> = {
  queued: "等待 Codex 接手",
  generating: "Codex 正在修改",
  saving: "正在安全写回",
};

export function SingleImageEditor({ project, shot, activeRequest, failedRequest, busy, onUpload, onWholeEdit, onRegionEdit, onUndo, onCancelRequest }: SingleImageEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const latestCompleted = project.generationRequests
    .filter((request) => request.shotIds.includes(shot.id) && request.status === "completed")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return (
    <section className="single-image-editor" aria-label="单图编辑工作台">
      <header className="single-editor-toolbar">
        <div>
          <span className="eyebrow">单图无限编辑</span>
          <h2>{shot.imagePath ? shot.title : "先放入一张图片"}</h2>
          <p>每次修改都会覆盖当前图；上一版保留一次撤销，之后可以继续不限次数修改。</p>
        </div>
        <div className="single-editor-actions">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.currentTarget.value = "";
          }} />
          <button className="quiet-button" type="button" onClick={() => fileRef.current?.click()} disabled={busy || Boolean(activeRequest)}>{shot.imagePath ? "替换原图" : "上传图片"}</button>
          <button className="primary-button" type="button" onClick={onWholeEdit} disabled={busy || !shot.imagePath || Boolean(activeRequest)}>整图修改</button>
          <button className="quiet-button" type="button" onClick={onRegionEdit} disabled={busy || !shot.imagePath || Boolean(activeRequest)}>框选修改</button>
          <button className="text-button editor-undo-button" type="button" onClick={onUndo} disabled={busy || !shot.hasUndo || Boolean(activeRequest)}>撤销上次覆盖</button>
        </div>
      </header>

      <div className={`single-editor-stage${shot.imagePath ? " has-image" : " is-empty"}`}>
        {shot.imagePath ? (
          <div className="single-editor-image-frame" style={{ aspectRatio: project.aspectRatio.replace(":", " / ") }}>
            <MediaImage projectId={project.id} mediaPath={shot.imagePath} variant="source" version={shot.imageSha256 ?? shot.imagePath} alt={`${shot.title} 当前编辑图片`} />
            {activeRequest && <div className="single-editor-progress" role="status"><i /><strong>{REQUEST_LABEL[activeRequest.status] ?? "图片处理中"}</strong><span>完成后会自动替换这里的当前图</span>{activeRequest.status === "queued" && <button type="button" onClick={() => onCancelRequest(activeRequest.id)}>取消等待</button>}</div>}
            {!activeRequest && failedRequest && <div className="single-editor-failure" role="alert"><strong>本次修改失败，当前图片没有被覆盖</strong><span>{failedRequest.error || "修改要求和原图仍然保留，可以重新提交"}</span></div>}
          </div>
        ) : (
          <button className="single-editor-dropzone" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
            <span>＋</span><strong>上传一张要修改的图片</strong><small>支持 PNG、JPEG、WebP，最大 25MB。上传后可直接整图改、框选改、画笔改。</small>
          </button>
        )}
      </div>

      <aside className="single-editor-guide">
        <div className="single-editor-guide-head"><span className="eyebrow">怎么改</span><strong>两种入口，结果都回到同一张图</strong></div>
        <button type="button" onClick={onWholeEdit} disabled={!shot.imagePath || busy || Boolean(activeRequest)}><b>01</b><span><strong>整图修改</strong><small>直接用中文描述：换背景、调光线、改风格、增删物体、重新构图。</small></span><i>→</i></button>
        <button type="button" onClick={onRegionEdit} disabled={!shot.imagePath || busy || Boolean(activeRequest)}><b>02</b><span><strong>精确框选</strong><small>矩形、椭圆、画笔、减选、箭头和文字定位只用于告诉 Codex 改哪里。</small></span><i>→</i></button>
        <div className="single-editor-history"><span>当前保存方式</span><strong>current.png + 一次撤销</strong><p>正式目录不会堆积失败版。每次成功写回后仍可继续下一轮修改。</p></div>
        {latestCompleted?.instruction && <div className="single-editor-last-request"><span>上次修改要求</span><p>{latestCompleted.instruction}</p></div>}
      </aside>
    </section>
  );
}
