import { useEffect, useRef, useState } from "react";
import { callTool, isCodexHost, localOrigin } from "./bridge";

export type MediaVariant = "thumbnail" | "preview" | "source";

type MediaResult = {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
};

interface MediaState {
  src?: string;
  loading: boolean;
  error?: string;
}

const mediaCache = new Map<string, string>();
const pendingMedia = new Map<string, Promise<string>>();
const MAX_CACHE_ENTRIES = 48;
const MAX_CACHE_CHARACTERS = 48 * 1024 * 1024;
let cachedCharacters = 0;

async function requestMediaThroughHost(
  projectId: string,
  relativePath: string,
  variant: MediaVariant,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await callTool<MediaResult>("get_media", { projectId, path: relativePath, variant });
      if (!result.dataUrl.startsWith("data:")) throw new Error("本机图片桥返回了无效内容");
      return result.dataUrl;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "图片读取失败"));
}

function cacheMedia(key: string, dataUrl: string): void {
  const previous = mediaCache.get(key);
  if (previous) {
    cachedCharacters -= previous.length;
    mediaCache.delete(key);
  }
  mediaCache.set(key, dataUrl);
  cachedCharacters += dataUrl.length;
  while (mediaCache.size > MAX_CACHE_ENTRIES || cachedCharacters > MAX_CACHE_CHARACTERS) {
    const oldest = mediaCache.keys().next().value as string | undefined;
    if (!oldest) break;
    cachedCharacters -= mediaCache.get(oldest)?.length ?? 0;
    mediaCache.delete(oldest);
  }
}

function directMediaUrl(projectId: string, relativePath: string, version: string): string {
  const encodedPath = relativePath.split(/[\\/]/).map(encodeURIComponent).join("/");
  return `${localOrigin()}/media/${encodeURIComponent(projectId)}/${encodedPath}?v=${encodeURIComponent(version)}`;
}

export function useMediaDataUrl(
  projectId: string,
  relativePath: string | undefined,
  variant: MediaVariant,
  version: string,
): MediaState {
  const key = relativePath ? `${projectId}|${relativePath}|${variant}|${version}` : "";
  const resourceKey = relativePath ? `${projectId}|${relativePath}|${variant}` : "";
  const previousResourceKeyRef = useRef(resourceKey);
  const [state, setState] = useState<MediaState>(() => ({
    src: key ? mediaCache.get(key) : undefined,
    loading: Boolean(key && !mediaCache.has(key)),
  }));

  useEffect(() => {
    if (!relativePath) {
      previousResourceKeyRef.current = "";
      setState({ loading: false });
      return;
    }

    // A Codex widget runs in a sandboxed origin. Loopback URLs can be valid for
    // the standalone browser and still be blocked inside that iframe, so all
    // embedded media must cross the widget-accessible MCP bridge as data URLs.
    if (!isCodexHost()) {
      setState({ src: directMediaUrl(projectId, relativePath, version), loading: false });
      return;
    }

    const cached = mediaCache.get(key);
    if (cached) {
      previousResourceKeyRef.current = resourceKey;
      setState({ src: cached, loading: false });
      return;
    }

    let active = true;
    const sameResource = previousResourceKeyRef.current === resourceKey;
    previousResourceKeyRef.current = resourceKey;
    // Keep the last good bitmap visible while a genuine new version loads.
    // Clearing src here caused the entire canvas to flash to skeletons.
    setState((current) => ({
      src: sameResource ? current.src : undefined,
      loading: true,
      error: undefined,
    }));
    let request = pendingMedia.get(key);
    if (!request) {
      request = requestMediaThroughHost(projectId, relativePath, variant)
        .then((dataUrl) => {
          cacheMedia(key, dataUrl);
          return dataUrl;
        })
        .finally(() => pendingMedia.delete(key));
      pendingMedia.set(key, request);
    }

    void request.then(
      (src) => { if (active) setState({ src, loading: false }); },
      (error) => {
        if (active) setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      },
    );
    return () => { active = false; };
  }, [key, projectId, relativePath, resourceKey, variant]);

  return state;
}
