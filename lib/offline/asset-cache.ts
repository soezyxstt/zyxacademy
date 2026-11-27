import { OFFLINE_HEADERS, type OfflineIdentity, type OfflineAsset, type OfflineResourceDescriptor } from "./sync-contract";

export const OFFLINE_PACKAGE_MAX_BYTES = 25 * 1024 * 1024;
export interface OfflineImageAsset { url: string; dataUrl: string; sizeBytes: number; leaseExpiresAt?: number }

export function collectSnapshotImageUrls(html: string): string[] {
  return [...new Set([...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(match => match[1].replaceAll("&amp;", "&")).filter(url => !url.startsWith("data:")))];
}
export function replaceOfflineAssetUrls<T>(data: T, assets: readonly OfflineImageAsset[]): T {
  const replacements = new Map(assets.map(asset => [asset.url, asset.dataUrl]));
  const replace = (value: unknown): unknown => {
    if (typeof value === "string") {
      const direct = replacements.get(value);
      if (direct) return direct;
      let result = value;
      for (const [url, dataUrl] of replacements) result = result.split(url).join(dataUrl).split(url.replaceAll("&", "&amp;")).join(dataUrl);
      return result;
    }
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, replace(nested)]));
    return value;
  };
  return replace(data) as T;
}
async function readBoundedImage(response: Response, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("offline_asset_too_large");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("offline_asset_too_large");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
export async function downloadOfflineImages(options: {
  assets: OfflineAsset[];
  resource: Pick<OfflineResourceDescriptor, "kind" | "id" | "courseId"> & { revision?: string };
  fetcher: typeof fetch;
  signal?: AbortSignal;
  maxBytes?: number;
  identity?: OfflineIdentity;
}): Promise<OfflineImageAsset[]> {
  const downloaded: OfflineImageAsset[] = [];
  let remaining = options.maxBytes ?? OFFLINE_PACKAGE_MAX_BYTES;
  // Bounded sequential fetch avoids a large image batch filling device memory.
  for (const asset of options.assets) {
    if (downloaded.some(item => item.url === asset.url) || asset.url.startsWith("data:")) continue;
    try {
      if (!asset.url.startsWith("/api/offline/asset?")) throw new Error("offline_asset_not_admitted");
      const headers = new Headers();
      if (options.identity) { headers.set(OFFLINE_HEADERS.accountId, options.identity.accountId); headers.set(OFFLINE_HEADERS.sessionId, options.identity.sessionId); }
      const response = await options.fetcher(asset.url, { headers, credentials: "same-origin", cache: "no-store", signal: options.signal });
      if (!response.ok) throw new Error("offline_asset_unavailable");
      if (options.identity && (response.headers.get(OFFLINE_HEADERS.accountId) !== options.identity.accountId || response.headers.get(OFFLINE_HEADERS.sessionId) !== options.identity.sessionId || response.headers.get(OFFLINE_HEADERS.environment) !== options.identity.environment || response.headers.get(OFFLINE_HEADERS.locale) !== options.identity.locale)) throw new Error("offline_asset_identity_changed");
      const leaseExpiresAt = Number(response.headers.get(OFFLINE_HEADERS.leaseExpiresAt));
      if (options.identity && (!Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= Date.now() || (options.resource.revision && response.headers.get(OFFLINE_HEADERS.revision) !== options.resource.revision))) throw new Error("offline_asset_grant_expired");
      const mime = (response.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
      if (!/^image\/(png|jpeg|webp|gif|avif|svg\+xml)$/.test(mime)) throw new Error("offline_asset_type");
      const bytes = await readBoundedImage(response, remaining, options.signal);
      if (mime === "image/svg+xml") {
        const svg = new TextDecoder().decode(bytes);
        const links = [...svg.matchAll(/(?:href|src)\s*=\s*["']([^"']*)["']/gi)].map(match => match[1]);
        const cssLinks = [...svg.matchAll(/url\(([^)]+)\)/gi)].map(match => match[1].trim().replace(/^["']|["']$/g, ""));
        if (/<script\b|<foreignObject\b|<!ENTITY/i.test(svg) || [...links, ...cssLinks].some(url => !url.startsWith("#") && !url.startsWith("data:"))) throw new Error("offline_svg_external_dependency");
      }
      if (!bytes.byteLength) throw new Error("offline_asset_empty");
      const dataUrl = `data:${mime};base64,${toBase64(bytes)}`;
      remaining -= dataUrl.length;
      if (remaining < 0) throw new Error("offline_asset_too_large");
      downloaded.push({ url: asset.url, dataUrl, sizeBytes: dataUrl.length, ...(options.identity ? { leaseExpiresAt } : {}) });
    } catch (error) {
      if (options.signal?.aborted || asset.required) throw error;
    }
  }
  return downloaded;
}
