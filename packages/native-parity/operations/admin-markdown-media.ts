import { courseVideoSource } from "../../course-video/source";

export type MarkdownPreviewAudience = "blog" | "course";
export type MarkdownPreviewMedia =
  | { kind: "storage-image"; path: string }
  | { kind: "image"; uri: string }
  | { kind: "video" | "youtube"; url: string };

const filePath = "/api/storage/file/";
const publicAssets = /^\/(?:images|assets)\/[A-Za-z0-9_./%-]+$/;
const signedQuery = /^(?:x-amz-|x-goog-|signature$|token$|access_token$)/i;
const videoSuffix = /\.(?:mp4|webm|ogg|mov)$/i;
const storageRoots: Record<MarkdownPreviewAudience, readonly string[]> = {
  blog: ["blog", "media"],
  course: ["blog", "media", "courses", "overhaul", "materials", "contents"],
};

function safeUrl(value: string, origin: string) {
  if (!value || value.length > 2_048 || /[\\\u0000-\u0020\u007f]/.test(value) || value.startsWith("//")) return null;
  if (!value.startsWith("/") && !value.startsWith("https://")) return null;
  try {
    const rawPath = value.split(/[?#]/, 1)[0];
    if (/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)|%(?:2f|5c|25)/i.test(rawPath)) return null;
    const url = new URL(value, origin);
    if (url.username || url.password || (url.origin !== origin && url.protocol !== "https:") ||
      /[\\\u0000-\u001f\u007f]/.test(decodeURIComponent(url.pathname)) || [...url.searchParams.keys()].some(key => signedQuery.test(key))) return null;
    return url;
  } catch {
    return null;
  }
}

export function previewStoragePath(raw: string, origin: string, audience: MarkdownPreviewAudience): string | null {
  const url = safeUrl(raw, origin);
  if (!url || url.origin !== origin || url.search || url.hash || !url.pathname.startsWith(filePath)) return null;
  const parts = url.pathname.slice(filePath.length).split("/").map(decodeURIComponent);
  if (parts.length < 2 || !storageRoots[audience].includes(parts[0]) ||
    parts.some(part => !part || /[\\/\u0000-\u0020\u007f]/.test(part) || part === "." || part === "..")) return null;
  return url.pathname;
}

export function previewMedia(raw: string, origin: string, audience: MarkdownPreviewAudience, imageOnly = false): MarkdownPreviewMedia | null {
  const value = raw.trim();
  if (value.length <= 350_000 && /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return { kind: "image", uri: value };
  const candidate = /^(?:blog|media|courses|overhaul|materials|contents)\//.test(value) ? filePath + value : value;
  const url = safeUrl(candidate, origin);
  if (!url) return null;
  const youtube = courseVideoSource(url.href, origin);
  if (youtube?.kind === "youtube") return imageOnly ? null : { kind: "youtube", url: `https://www.youtube.com/watch?v=${youtube.id}` };
  if (["youtube.com", "m.youtube.com", "youtube-nocookie.com", "youtu.be"].includes(url.hostname.replace(/^www\./, ""))) return null;
  const video = videoSuffix.test(url.pathname);
  if (imageOnly && video) return null;
  if (url.origin !== origin) return video ? { kind: "video", url: url.href } : { kind: "image", uri: url.href };
  const storage = previewStoragePath(candidate, origin, audience);
  if (storage) return video ? { kind: "video", url: storage } : { kind: "storage-image", path: storage };
  return !video && publicAssets.test(url.pathname) ? { kind: "image", uri: url.href } : null;
}

export function previewExternalHref(raw: string, origin: string) {
  const url = safeUrl(raw.trim(), origin);
  if (!url || url.protocol !== "https:" || /^\/api(?:\/|$)/i.test(decodeURIComponent(url.pathname))) return null;
  return url.href;
}
