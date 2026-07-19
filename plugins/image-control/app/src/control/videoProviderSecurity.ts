import type { VideoProviderProfile } from "./types";

function providerTargetUrl(provider: VideoProviderProfile): string | undefined {
  return provider.kind === "comfyui-workflow" ? provider.comfyui?.baseUrl : provider.http?.submitUrl;
}

function isPrivateNetworkTarget(rawUrl: string): boolean {
  const host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1" || host.endsWith(".localhost")) return true;
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return false;
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function providerTargetOrigin(provider: VideoProviderProfile): string {
  try {
    const raw = providerTargetUrl(provider);
    return raw ? new URL(raw).origin : "地址未配置";
  } catch {
    return "地址无效";
  }
}

export function providerRequiresExternalConfirmation(provider: VideoProviderProfile): boolean {
  try {
    const raw = providerTargetUrl(provider);
    return !raw
      || !isPrivateNetworkTarget(raw)
      || provider.capabilities?.source === "cloud"
      || provider.capabilities?.billing !== "local";
  } catch {
    return true;
  }
}
