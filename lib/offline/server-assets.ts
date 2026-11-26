import { OfflineHttpError } from "./server-auth";

const PUBLIC_IMAGE_HOSTS = new Set(["i.ytimg.com", "img.youtube.com"]);
const PRIVATE_IMAGE_PATHS = [/^\/api\/storage\/file\//, /^\/api\/courses\/[^/]+\/articles\/[^/]+\/source-figures\/[^/]+$/, /^\/api\/courses\/[^/]+\/material\/[^/]+\/(?:thumbnail|cover\.svg)$/, /^\/gamification\//, /^\/images\//, /^\/icons\//];
export const OFFLINE_ASSET_MAX_BYTES = 8 * 1024 * 1024;

/** Exact admitted URL, fixed origin and no redirects prevent SSRF/cookie disclosure. */
export function offlineAssetFetchTarget(source: string, environment: string): { url: string; sendCookies: boolean } {
  let url: URL;
  try { url = new URL(source, environment); } catch { throw new OfflineHttpError(400, "OFFLINE_ASSET_INVALID"); }
  if (url.username || url.password || url.hash || url.port && !["80", "443", "3000"].includes(url.port)) throw new OfflineHttpError(400, "OFFLINE_ASSET_INVALID");
  const sameOrigin = url.origin === environment;
  if (sameOrigin && PRIVATE_IMAGE_PATHS.some(pattern => pattern.test(url.pathname))) return { url: url.href, sendCookies: true };
  if (url.protocol === "https:" && !url.port && PUBLIC_IMAGE_HOSTS.has(url.hostname)) return { url: url.href, sendCookies: false };
  throw new OfflineHttpError(422, "OFFLINE_ASSET_SOURCE_UNSUPPORTED");
}

export async function readBoundedOfflineAsset(response: Response): Promise<Uint8Array> {
  if (!response.ok || !response.body) throw new OfflineHttpError(503, "OFFLINE_ASSET_UNAVAILABLE");
  const mime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
  if (!/^image\/(?:png|jpeg|webp|gif|avif|svg\+xml)$/.test(mime)) throw new OfflineHttpError(422, "OFFLINE_ASSET_TYPE_UNSUPPORTED");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > OFFLINE_ASSET_MAX_BYTES) { await response.body.cancel(); throw new OfflineHttpError(413, "OFFLINE_ASSET_TOO_LARGE"); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > OFFLINE_ASSET_MAX_BYTES) throw new OfflineHttpError(413, "OFFLINE_ASSET_TOO_LARGE");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
