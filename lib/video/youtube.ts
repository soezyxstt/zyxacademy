/**
 * Utility functions for YouTube video URL parsing, validation, and metadata extraction.
 */

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extracts an 11-character YouTube video ID from various YouTube URL formats or a raw ID.
 *
 * Supported formats:
 * - https://www.youtube.com/watch?v=dQw4w9WgXcQ
 * - https://www.youtube.com/watch?feature=shared&v=dQw4w9WgXcQ
 * - https://youtu.be/dQw4w9WgXcQ
 * - https://youtu.be/dQw4w9WgXcQ?t=120
 * - https://www.youtube.com/embed/dQw4w9WgXcQ
 * - https://www.youtube.com/shorts/dQw4w9WgXcQ
 * - https://www.youtube.com/live/dQw4w9WgXcQ
 * - https://m.youtube.com/watch?v=dQw4w9WgXcQ
 * - Raw 11-char ID (e.g. dQw4w9WgXcQ)
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // If already a clean 11-char video ID
  if (YOUTUBE_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  try {
    // If URL lacks protocol, prepend https://
    const urlString = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    // youtu.be/<id>
    if (host === "youtu.be") {
      const pathnameId = url.pathname.slice(1).split("/")[0]?.split("?")[0];
      if (pathnameId && YOUTUBE_ID_REGEX.test(pathnameId)) {
        return pathnameId;
      }
    }

    // youtube.com or m.youtube.com or youtube-nocookie.com
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      // /watch?v=<id>
      const vParam = url.searchParams.get("v");
      if (vParam && YOUTUBE_ID_REGEX.test(vParam)) {
        return vParam;
      }

      // /embed/<id>, /v/<id>, /shorts/<id>, /live/<id>
      const segments = url.pathname.split("/").filter(Boolean);
      const actionIndex = segments.findIndex((s) => ["embed", "v", "shorts", "live"].includes(s.toLowerCase()));
      if (actionIndex !== -1 && segments[actionIndex + 1]) {
        const potentialId = segments[actionIndex + 1];
        if (YOUTUBE_ID_REGEX.test(potentialId)) {
          return potentialId;
        }
      }
    }
  } catch {
    // Fallback regex matching in case of malformed URLs
    const match = trimmed.match(
      /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/
    );
    if (match?.[1] && YOUTUBE_ID_REGEX.test(match[1])) {
      return match[1];
    }
  }

  return null;
}

/**
 * Returns canonical YouTube watch URL (e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ).
 */
export function getCanonicalYouTubeUrl(idOrUrl: string): string {
  const id = extractYouTubeVideoId(idOrUrl);
  if (!id) return idOrUrl;
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * Returns YouTube embed URL.
 */
export function getYouTubeEmbedUrl(idOrUrl: string): string {
  const id = extractYouTubeVideoId(idOrUrl);
  if (!id) return idOrUrl;
  return `https://www.youtube.com/embed/${id}`;
}

/**
 * Returns high-quality YouTube thumbnail image URL.
 */
export function getYouTubeThumbnailUrl(
  idOrUrl: string,
  quality: "hq" | "maxres" = "hq"
): string {
  const id = extractYouTubeVideoId(idOrUrl);
  if (!id) return "";
  const filename = quality === "maxres" ? "maxresdefault.jpg" : "hqdefault.jpg";
  return `https://img.youtube.com/vi/${id}/${filename}`;
}

export type YouTubeMetadataResult =
  | {
      success: true;
      videoId: string;
      canonicalUrl: string;
      title: string;
      authorName: string;
      thumbnailUrl: string;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Fetches video metadata from YouTube's official oEmbed endpoint without requiring an API key.
 */
export async function fetchYouTubeVideoMetadata(urlOrId: string): Promise<YouTubeMetadataResult> {
  const videoId = extractYouTubeVideoId(urlOrId);
  if (!videoId) {
    return {
      success: false,
      error: "Tautan YouTube tidak valid. Mohon periksa kembali tautan yang dimasukkan.",
    };
  }

  const canonicalUrl = getCanonicalYouTubeUrl(videoId);
  const fallbackThumbnail = getYouTubeThumbnailUrl(videoId, "hq");

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "ZyxAcademy/1.0" },
    });

    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };

      return {
        success: true,
        videoId,
        canonicalUrl,
        title: data.title || "",
        authorName: data.author_name || "",
        thumbnailUrl: data.thumbnail_url || fallbackThumbnail,
      };
    }
  } catch (err: any) {
    console.warn("YouTube oEmbed request failed:", err?.message);
  }

  return {
    success: true,
    videoId,
    canonicalUrl,
    title: "",
    authorName: "",
    thumbnailUrl: fallbackThumbnail,
  };
}
