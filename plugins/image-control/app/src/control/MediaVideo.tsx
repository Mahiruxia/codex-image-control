import { useEffect, useMemo, useState } from "react";
import type { MouseEvent, VideoHTMLAttributes } from "react";
import { callTool, isCodexHost } from "./bridge";
import { useMediaDataUrl } from "./media";

interface MediaVideoProps extends Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "poster"> {
  src: string;
  poster?: string;
  posterPath?: string;
  posterVersion?: string;
  projectId?: string;
  mediaPath?: string;
  version?: string;
  compact?: boolean;
  /** Delay full MP4 bridge loading until the card is explicitly opened. */
  deferLoad?: boolean;
}

type PlaybackState = "idle" | "loading" | "ready" | "error";

type BridgedMedia = { dataUrl?: string };

// The canvas and inspector can request the same video simultaneously. Share
// that bridge call, but do not retain large data URLs after playback starts.
const pendingVideoLoads = new Map<string, Promise<string>>();

function loadVideoThroughBridge(projectId: string, mediaPath: string): Promise<string> {
  const key = `${projectId}:${mediaPath}`;
  const existing = pendingVideoLoads.get(key);
  if (existing) return existing;
  const request = callTool<BridgedMedia>("get_media", { projectId, path: mediaPath, variant: "source" })
    .then((result) => {
      if (!result.dataUrl) throw new Error("视频数据未返回");
      return result.dataUrl;
    })
    .finally(() => pendingVideoLoads.delete(key));
  pendingVideoLoads.set(key, request);
  return request;
}

function retryUrl(src: string, retryCount: number): string {
  if (src.startsWith("data:")) return src;
  if (!retryCount) return src;
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}retry=${retryCount}`;
}

export function MediaVideo({ src, poster, posterPath, posterVersion, projectId, mediaPath, version, compact = false, deferLoad = false, className, onLoadedMetadata, onCanPlay, onError, ...videoProps }: MediaVideoProps) {
  const [retryCount, setRetryCount] = useState(0);
  const [loadRequested, setLoadRequested] = useState(!deferLoad);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(deferLoad ? "idle" : "loading");
  const [bridgedSrc, setBridgedSrc] = useState<string>();
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeError, setBridgeError] = useState<string>();
  const useBridge = isCodexHost() && Boolean(projectId && mediaPath);
  const posterMedia = useMediaDataUrl(projectId ?? "", posterPath, "preview", posterVersion ?? posterPath ?? poster ?? src);
  const posterSrc = posterMedia.src ?? poster;

  useEffect(() => {
    if (!useBridge || !projectId || !mediaPath || !loadRequested) {
      setBridgedSrc(undefined);
      setBridgeLoading(false);
      setBridgeError(undefined);
      return;
    }
    let active = true;
    setBridgeLoading(true);
    setBridgeError(undefined);
    setBridgedSrc(undefined);
    // The Codex iframe may block browser fetches to a loopback address even
    // though the local media service is healthy. Tool calls are explicitly
    // permitted by the host and do not cross that browser network boundary.
    void loadVideoThroughBridge(projectId, mediaPath)
      .then((dataUrl) => { if (active) setBridgedSrc(dataUrl); })
      .catch((error) => { if (active) setBridgeError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setBridgeLoading(false); });
    return () => { active = false; };
  }, [loadRequested, mediaPath, projectId, retryCount, src, useBridge, version]);

  // A loopback media URL is unreliable in the Codex iframe. Its data URL comes
  // from the same local API through CORS, while standalone browser use keeps
  // the efficient byte-range stream.
  const mediaSrc = useBridge ? (bridgedSrc ?? "") : src;
  const playbackSrc = useMemo(() => retryUrl(mediaSrc, retryCount), [mediaSrc, retryCount]);

  useEffect(() => {
    setRetryCount(0);
    setLoadRequested(!deferLoad);
    setPlaybackState(deferLoad ? "idle" : "loading");
  }, [deferLoad, mediaPath, projectId, src, version]);

  const retry = () => {
    setLoadRequested(true);
    setPlaybackState("loading");
    setRetryCount((current) => current + 1);
  };

  const requestLoad = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setLoadRequested(true);
    setPlaybackState("loading");
  };

  return (
    <div className={`media-video${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}>
      <video
        {...videoProps}
        src={playbackSrc || undefined}
        poster={posterSrc}
        controls
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          setPlaybackState("ready");
          onLoadedMetadata?.(event);
        }}
        onCanPlay={(event) => {
          setPlaybackState("ready");
          onCanPlay?.(event);
        }}
        onError={(event) => {
          setPlaybackState("error");
          onError?.(event);
        }}
      />
      {useBridge && !loadRequested && (
        <button className="media-video-load" type="button" onClick={requestLoad}>
          加载视频预览
        </button>
      )}
      {(playbackState === "loading" || bridgeLoading) && <span className="media-video-loading" role="status">正在读取视频…</span>}
      {(playbackState === "error" || bridgeError) && (
        <div className="media-video-error" role="alert">
          <strong>{bridgeError ? "视频读取失败" : "视频暂时未载入"}</strong>
          <button type="button" onClick={(event) => { event.stopPropagation(); retry(); }}>重新载入</button>
        </div>
      )}
    </div>
  );
}
