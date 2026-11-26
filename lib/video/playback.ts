import type { StorageProvider } from "@/lib/storage";
import { isSafeKey } from "@/lib/storage/keys";

export const VIDEO_PLAYBACK_URL_TTL_SECONDS = 3600;

export type ResolvedVideoPlaybackUrl = {
  playbackUrl: string;
  fallbackUrl: string;
  isPresigned: boolean;
};

/**
 * Returns true when a stored `videoUrl` is a relative object-storage key
 * (not an external HTTP(S) URL, YouTube reference, or already-proxied path).
 */
export function isDirectStorageVideoKey(rawVideoUrl: string | null | undefined): boolean {
  if (!rawVideoUrl) return false;
  const trimmed = rawVideoUrl.trim();
  if (!trimmed) return false;
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("youtube/") ||
    trimmed.startsWith("/")
  ) {
    return false;
  }
  return isSafeKey(trimmed);
}

/**
 * Resolves the best playback URL for an authorized course video.
 * Prefers a short-lived presigned GET URL directly against object storage
 * (eliminating serverless byte proxying and per-Range DB checks), and falls
 * back safely to the storage proxy URL if presigning is unavailable.
 */
export async function resolveCourseVideoPlaybackUrl(
  rawVideoUrl: string | null | undefined,
  storageProvider: Pick<StorageProvider, "getUrl" | "getSignedUrl">,
  ttlSeconds = VIDEO_PLAYBACK_URL_TTL_SECONDS,
): Promise<ResolvedVideoPlaybackUrl> {
  const trimmed = rawVideoUrl?.trim() ?? "";
  if (!trimmed) {
    return { playbackUrl: "", fallbackUrl: "", isPresigned: false };
  }
  if (trimmed.startsWith("youtube/")) {
    return { playbackUrl: trimmed, fallbackUrl: trimmed, isPresigned: false };
  }

  if (trimmed.startsWith("/")) {
    return { playbackUrl: trimmed, fallbackUrl: trimmed, isPresigned: false };
  }

  const fallbackUrl = storageProvider.getUrl(trimmed);
  if (isDirectStorageVideoKey(trimmed) && typeof storageProvider.getSignedUrl === "function") {
    try {
      const signedUrl = await storageProvider.getSignedUrl(trimmed, "get", undefined, ttlSeconds);
      if (signedUrl) {
        return {
          playbackUrl: signedUrl,
          fallbackUrl,
          isPresigned: true,
        };
      }
    } catch {
      // Fall back to the authenticated proxy route if presigning fails.
    }
  }

  return {
    playbackUrl: fallbackUrl,
    fallbackUrl,
    isPresigned: false,
  };
}
