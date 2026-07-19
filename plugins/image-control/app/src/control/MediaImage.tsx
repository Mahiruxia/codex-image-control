import { useEffect, useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { useMediaDataUrl, type MediaVariant } from "./media";

interface MediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> {
  projectId: string;
  mediaPath: string;
  variant: MediaVariant;
  version: string;
  alt: string;
}

export function MediaImage({ projectId, mediaPath, variant, version, alt, className, onError, ...imageProps }: MediaImageProps) {
  const media = useMediaDataUrl(projectId, mediaPath, variant, version);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    setRetryAttempt(0);
    setImageError(false);
  }, [media.src]);
  if (!media.src || imageError) {
    return (
      <span
        className={`media-state ${media.error || imageError ? "media-state-error" : "media-state-loading"} ${className ?? ""}`.trim()}
        role="img"
        aria-label={media.error || imageError ? `${alt || "图片"}载入失败` : `${alt || "图片"}正在载入`}
        title={media.error || imageError ? "图片载入失败；状态刷新后会再次尝试" : undefined}
      />
    );
  }
  const displaySrc = media.src.startsWith("data:") || retryAttempt === 0
    ? media.src
    : `${media.src}${media.src.includes("?") ? "&" : "?"}retry=${retryAttempt}`;
  return <img src={displaySrc} alt={alt} className={className} decoding="async" onError={(event) => {
    onError?.(event);
    if (retryAttempt < 2 && !media.src?.startsWith("data:")) {
      setRetryAttempt((current) => current + 1);
    } else setImageError(true);
  }} {...imageProps} />;
}
