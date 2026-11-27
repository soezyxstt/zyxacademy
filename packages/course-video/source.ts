import { extractYouTubeVideoId } from "../../lib/video/youtube";

export type CourseVideoSource =
  | { kind: "youtube"; id: string }
  | { kind: "stream"; uri: string }
  | { kind: "storage"; path: string };

export function courseVideoSource(raw: unknown, origin: string): CourseVideoSource | null {
  if (typeof raw !== "string" || !raw || /[\\\u0000-\u0020\u007f]/.test(raw)) return null;
  const reference = /^youtube\/([A-Za-z0-9_-]{11})$/.exec(raw);
  if (reference) return { kind: "youtube", id: reference[1] };
  if (raw.startsWith("//") || (!raw.startsWith("/") && !raw.startsWith("https://"))) return null;
  if (/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(raw.split(/[?#]/, 1)[0])) return null;
  try {
    const url = new URL(raw, origin);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.origin === origin) {
      if (!url.pathname.startsWith("/api/storage/file/") || url.hash) return null;
      const parts = url.pathname.slice("/api/storage/file/".length).split("/").map(decodeURIComponent);
      if (parts.some(value => !value || value === "." || value === ".." || /[\\/\u0000-\u001f\u007f]/.test(value))) return null;
      return { kind: "storage", path: url.pathname + url.search };
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com", "youtu.be"].includes(host)) {
      const id = extractYouTubeVideoId(url.href);
      return id ? { kind: "youtube", id } : null;
    }
    return { kind: "stream", uri: url.href };
  } catch {
    return null;
  }
}
