export const assessmentRasterTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export const publicAssessmentRasterLimit = 4 * 1024 * 1024;
export const rasterPrefixLimit = 64 * 1024;

const hostname = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;
const localDomain = /(?:^|\.)(?:localhost|localdomain|local|test|invalid|example|internal|lan|home(?:\.arpa)?|corp|onion)$/;
const renditionParams = new Set(["ar", "auto", "bg", "crop", "dpr", "fit", "fm", "format", "h", "height", "ixid", "ixlib", "lossless", "q", "quality", "raw", "resize", "w", "width"]);
const paramValue = /^[a-z0-9_.:+,-]{1,120}$/i;

export function publicAssessmentRasterUrl(raw: string, appOrigin: string): string | null {
  if (!raw.startsWith("https://") || raw.length > 2048 || /[\\\u0000-\u0020\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash ||
      !hostname.test(url.hostname) || localDomain.test(url.hostname) || /%(?:00|2e|2f|5c|25)/i.test(url.pathname)) return null;
    if (url.origin === appOrigin && !/^\/(?:images|assets)\/[A-Za-z0-9_./%-]+$/.test(url.pathname)) return null;
    const keys = new Set<string>();
    for (const [key, value] of url.searchParams) {
      if (keys.has(key) || keys.size >= 12 || !renditionParams.has(key) || !paramValue.test(value)) return null;
      keys.add(key);
    }
    return url.href;
  } catch { return null; }
}

type RasterResponse = Pick<Response, "url" | "status" | "redirected" | "type" | "headers" | "body">;
export type PublicAssessmentRasterFetch = (url: string, init: RequestInit) => Promise<RasterResponse>;

export async function fetchPublicAssessmentRaster(
  input: string, origin: string, fetcher: PublicAssessmentRasterFetch, signal: AbortSignal,
): Promise<RasterResponse> {
  let url = publicAssessmentRasterUrl(input, origin);
  for (let redirects = 0; url && redirects <= 2 && !signal.aborted; redirects++) {
    const response = await fetcher(url, {
      method: "GET", credentials: "omit", redirect: "manual", signal,
      headers: { Accept: assessmentRasterTypes.join(", "), "Cache-Control": "no-store" },
    });
    if (!signal.aborted && !response.redirected && response.type !== "opaqueredirect" && (!response.url || response.url === url)) {
      if (response.status === 200) return response;
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const target = response.headers.get("location");
        void response.body?.cancel().catch(() => {});
        if (!target) break;
        url = publicAssessmentRasterUrl(new URL(target, url).href, origin);
        continue;
      }
    }
    void response.body?.cancel().catch(() => {});
    break;
  }
  throw new Error("Public assessment image unavailable.");
}

export function createAssessmentRasterQueue(maxActive = 4, maxWaiting = 24) {
  let active = 0;
  const waiting: Array<() => void> = [];
  function release() {
    const next = waiting.shift();
    if (next) next(); else active -= 1;
  }
  return {
    acquire(signal: AbortSignal): Promise<() => void> {
      if (signal.aborted) return Promise.reject(new Error("Image request cancelled."));
      if (active < maxActive) {
        active += 1;
        return Promise.resolve(release);
      }
      if (waiting.length >= maxWaiting) return Promise.reject(new Error("Image request limit reached."));
      return new Promise((resolve, reject) => {
        const next = () => {
          signal.removeEventListener("abort", abort);
          resolve(release);
        };
        const abort = () => {
          const index = waiting.indexOf(next);
          if (index !== -1) waiting.splice(index, 1);
          reject(new Error("Image request cancelled."));
        };
        waiting.push(next);
        signal.addEventListener("abort", abort, { once: true });
      });
    },
  };
}

function jpegSize(bytes: Uint8Array, view: DataView) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const kind = bytes[offset++];
    if (kind === 0xda || kind === 0xd9 || offset + 1 >= bytes.length) return null;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(kind)) {
      return length >= 8 ? [view.getUint16(offset + 5), view.getUint16(offset + 3)] : null;
    }
    offset += length;
  }
  return null;
}

function rasterDimensions(bytes: Uint8Array, type: string) {
  if (bytes.length < 10) return null;
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === "image/jpeg") return jpegSize(bytes, view);
  if (type === "image/gif") return ["GIF87a", "GIF89a"].includes(text(0, 6)) ? [view.getUint16(6, true), view.getUint16(8, true)] : null;
  if (type === "image/png") {
    if (bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) ||
      view.getUint32(8) !== 13 || text(12, 16) !== "IHDR") return null;
    return [view.getUint32(16), view.getUint32(20)];
  }
  if (type !== "image/webp" || bytes.length < 30 || text(0, 4) !== "RIFF" || text(8, 12) !== "WEBP") return null;
  const format = text(12, 16);
  const uint24 = (offset: number) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
  if (format === "VP8X") return [1 + uint24(24), 1 + uint24(27)];
  if (format === "VP8L" && bytes[20] === 0x2f) {
    const packed = view.getUint32(21, true);
    return [1 + (packed & 0x3fff), 1 + ((packed >>> 14) & 0x3fff)];
  }
  if (format === "VP8 " && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
    return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
  }
  return null;
}

export function boundedAssessmentRaster(bytes: Uint8Array, type: string) {
  const dimensions = rasterDimensions(bytes, type);
  if (!dimensions) return false;
  const [width, height] = dimensions;
  return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 12_000_000;
}

export function inlineAssessmentRaster(value: string) {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/]+={0,2})$/i.exec(value);
  if (!match || value.length > 350_000) return null;
  try {
    const prefix = atob(match[2].slice(0, Math.ceil(rasterPrefixLimit / 3) * 4));
    const bytes = Uint8Array.from(prefix, character => character.charCodeAt(0));
    return boundedAssessmentRaster(bytes, match[1].toLowerCase()) ? value : null;
  } catch { return null; }
}
