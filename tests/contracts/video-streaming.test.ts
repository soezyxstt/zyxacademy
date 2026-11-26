import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  isCourseVideoKey,
  isCourseVideoThumbnailKey,
} from "@/lib/storage/keys";
import {
  isDirectStorageVideoKey,
  resolveCourseVideoPlaybackUrl,
  VIDEO_PLAYBACK_URL_TTL_SECONDS,
} from "@/lib/video/playback";

const storageRouteSource = readFileSync("app/api/storage/file/[...key]/route.ts", "utf8");
const playbackRouteSource = readFileSync("app/api/videos/[videoId]/playback-url/route.ts", "utf8");
const proxySource = readFileSync("proxy.ts", "utf8");
const schemaSource = readFileSync("db/schema.ts", "utf8");
const playerSource = readFileSync("components/course/video/zyx-video-player.tsx", "utf8");
const modalSource = readFileSync("components/course/video/video-player-modal.tsx", "utf8");

describe("video streaming optimization contracts", () => {
  test("classifies course video keys and thumbnail keys accurately", () => {
    expect(isCourseVideoKey("courses/kalkulus-1/videos/123-abcd1234-kuliah.mp4")).toBe(true);
    expect(isCourseVideoKey("courses/kalkulus-1/videos/thumbnails/123-abcd1234-thumb.jpg")).toBe(false);
    expect(isCourseVideoKey("courses/kalkulus-1/diktats/bab1.pdf")).toBe(false);

    expect(isCourseVideoThumbnailKey("courses/kalkulus-1/videos/thumbnails/123-abcd1234-thumb.jpg")).toBe(true);
    expect(isCourseVideoThumbnailKey("courses/kalkulus-1/videos/123-abcd1234-kuliah.mp4")).toBe(false);
  });

  test("presigns direct object storage video keys and preserves proxy fallback", async () => {
    const key = "courses/kalkulus-1/videos/1700000000-a1b2c3d4-lecture.mp4";
    const getSignedUrl = mock(async () => "https://storage.example.test/signed-video?X-Amz-Signature=abc");
    const storageProvider = {
      getUrl: (k: string) => `/api/storage/file/${k}`,
      getSignedUrl,
    };

    expect(isDirectStorageVideoKey(key)).toBe(true);
    expect(isDirectStorageVideoKey("youtube/dQw4w9WgXcQ")).toBe(false);
    expect(isDirectStorageVideoKey("https://cdn.example.test/video.mp4")).toBe(false);
    expect(isDirectStorageVideoKey("/api/storage/file/courses/a/videos/b.mp4")).toBe(false);
    expect(isDirectStorageVideoKey("../escape.mp4")).toBe(false);

    const resolved = await resolveCourseVideoPlaybackUrl(key, storageProvider);
    expect(resolved).toEqual({
      playbackUrl: "https://storage.example.test/signed-video?X-Amz-Signature=abc",
      fallbackUrl: `/api/storage/file/${key}`,
      isPresigned: true,
    });
    expect(getSignedUrl).toHaveBeenCalledWith(key, "get", undefined, VIDEO_PLAYBACK_URL_TTL_SECONDS);
  });

  test("falls back to storage proxy when presigning fails or is unavailable", async () => {
    const key = "courses/kalkulus-1/videos/1700000000-a1b2c3d4-lecture.mp4";
    const failingProvider = {
      getUrl: (k: string) => `/api/storage/file/${k}`,
      getSignedUrl: async () => {
        throw new Error("SIGNING_FAILED");
      },
    };
    const noSignProvider = {
      getUrl: (k: string) => `/api/storage/file/${k}`,
    };

    expect(await resolveCourseVideoPlaybackUrl(key, failingProvider)).toEqual({
      playbackUrl: `/api/storage/file/${key}`,
      fallbackUrl: `/api/storage/file/${key}`,
      isPresigned: false,
    });
    expect(await resolveCourseVideoPlaybackUrl(key, noSignProvider)).toEqual({
      playbackUrl: `/api/storage/file/${key}`,
      fallbackUrl: `/api/storage/file/${key}`,
      isPresigned: false,
    });
  });

  test("leaves YouTube and external URLs untouched without signing", async () => {
    const getSignedUrl = mock(async () => "https://should-not-be-called");
    const storageProvider = {
      getUrl: (k: string) => (k.startsWith("http") ? k : `/api/storage/file/${k}`),
      getSignedUrl,
    };

    expect(await resolveCourseVideoPlaybackUrl("youtube/dQw4w9WgXcQ", storageProvider)).toEqual({
      playbackUrl: "youtube/dQw4w9WgXcQ",
      fallbackUrl: "youtube/dQw4w9WgXcQ",
      isPresigned: false,
    });
    expect(await resolveCourseVideoPlaybackUrl("https://cdn.example.test/v.mp4", storageProvider)).toEqual({
      playbackUrl: "https://cdn.example.test/v.mp4",
      fallbackUrl: "https://cdn.example.test/v.mp4",
      isPresigned: false,
    });
    expect(await resolveCourseVideoPlaybackUrl("", storageProvider)).toEqual({
      playbackUrl: "",
      fallbackUrl: "",
      isPresigned: false,
    });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  test("storage proxy route optimizes video/thumbnail paths and supports HEAD, ETag, and 416", () => {
    expect(storageRouteSource).toContain("export async function HEAD(");
    expect(storageRouteSource).toContain("const isCourseVideoAsset = isCourseVideoKey(key) || isVideoThumbnail;");
    expect(storageRouteSource).toContain("isScopedFile || isCourseVideoAsset");
    expect(storageRouteSource).toContain("inArray(courseVideos.courseId, validCourseIdList)");
    expect(storageRouteSource).toContain('headers.set("ETag", s3Res.ETag)');
    expect(storageRouteSource).toContain('headers.set("Last-Modified", s3Res.LastModified.toUTCString())');
    expect(storageRouteSource).toContain('headers.set("Cache-Control", "public, max-age=31536000, immutable")');
    expect(storageRouteSource).toContain('err?.name === "InvalidRange" || err?.$metadata?.httpStatusCode === 416');
    expect(storageRouteSource).toContain("status: 416");
  });

  test("playback-url refresh endpoint enforces auth, course access, and no-store caching", () => {
    expect(playbackRouteSource).toContain("auth.api.getSession");
    expect(playbackRouteSource).toContain("resolveCourseAccess");
    expect(playbackRouteSource).toContain("access.hasFullContentAccess");
    expect(playbackRouteSource).toContain("resolveCourseVideoPlaybackUrl");
    expect(playbackRouteSource).toContain('"Cache-Control": "private, no-store"');
  });

  test("schema indexes course_videos.video_url and proxy bypasses /api/storage/file/", () => {
    expect(schemaSource).toContain('index("idx_course_videos_video_url").on(table.videoUrl)');
    expect(proxySource).toContain("api/storage/file/");
  });

  test("player omits crossOrigin for direct presigned URLs and modal recovers on media error", () => {
    expect(playerSource).toContain("crossOrigin={isSameOriginSrc ? true : undefined}");
    expect(playerSource).not.toContain("const [mounted, setMounted] = useState(false)");
    expect(modalSource).toContain("ssr: false");
    expect(modalSource).toContain("export function preloadVideoPlayer()");
    expect(modalSource).toContain("/api/videos/${encodeURIComponent(video.id)}/playback-url");
    expect(modalSource).toContain("video.fallbackVideoUrl");
  });
});
