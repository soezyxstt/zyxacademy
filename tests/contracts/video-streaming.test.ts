import { afterEach, describe, expect, mock, test } from "bun:test";
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
  test("classifies course video keys and thumbnail keys accurately and rejects adversarial paths", () => {
    expect(isCourseVideoKey("courses/kalkulus-1/videos/123-abcd1234-kuliah.mp4")).toBe(true);
    expect(isCourseVideoKey("courses/kalkulus-1/videos/thumbnails/123-abcd1234-thumb.jpg")).toBe(false);
    expect(isCourseVideoKey("courses/kalkulus-1/diktats/bab1.pdf")).toBe(false);
    expect(isCourseVideoKey("courses/kalkulus-1/diktats/videos/bab1.pdf")).toBe(false);
    expect(isCourseVideoKey("courses/kalkulus-1/videos/nested/bab1.mp4")).toBe(false);
    expect(isCourseVideoKey("courses/kalkulus-1/videos/../diktats/bab1.pdf")).toBe(false);
    expect(isCourseVideoKey("/courses/kalkulus-1/videos/bab1.mp4")).toBe(false);
    expect(isCourseVideoKey("courses\\kalkulus-1\\videos\\bab1.mp4")).toBe(false);

    expect(isCourseVideoThumbnailKey("courses/kalkulus-1/videos/thumbnails/123-abcd1234-thumb.jpg")).toBe(true);
    expect(isCourseVideoThumbnailKey("courses/kalkulus-1/videos/123-abcd1234-kuliah.mp4")).toBe(false);
    expect(isCourseVideoThumbnailKey("courses/kalkulus-1/diktats/videos/thumbnails/bab1.pdf")).toBe(false);
    expect(isCourseVideoThumbnailKey("courses/kalkulus-1/videos/thumbnails/../../diktats/secret.pdf")).toBe(false);
    expect(isCourseVideoThumbnailKey("/courses/kalkulus-1/videos/thumbnails/thumb.jpg")).toBe(false);
    expect(isCourseVideoThumbnailKey("courses/kalkulus-1/videos/thumbnails/sub\\thumb.jpg")).toBe(false);
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

  test("leaves YouTube, external, and relative proxy URLs untouched without signing", async () => {
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
    expect(await resolveCourseVideoPlaybackUrl("/api/storage/file/courses/a/videos/b.mp4", storageProvider)).toEqual({
      playbackUrl: "/api/storage/file/courses/a/videos/b.mp4",
      fallbackUrl: "/api/storage/file/courses/a/videos/b.mp4",
      isPresigned: false,
    });
    expect(await resolveCourseVideoPlaybackUrl("", storageProvider)).toEqual({
      playbackUrl: "",
      fallbackUrl: "",
      isPresigned: false,
    });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  test("storage proxy route optimizes video/thumbnail paths and supports HEAD, ETag, staff bypass, and 416", () => {
    expect(storageRouteSource).toContain("export async function HEAD(");
    expect(storageRouteSource).toContain("const isCourseVideoAsset = isCourseVideoKey(key) || isVideoThumbnail;");
    expect(storageRouteSource).toContain("isScopedFile || isCourseVideoAsset");
    expect(storageRouteSource).toContain("inArray(courseVideos.courseId, validCourseIdList)");
    expect(storageRouteSource).toContain('access.tier === "staff" ||');
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

  test("player preserves playback time on error recovery and modal uses AbortController + videoId-keyed state", () => {
    expect(playerSource).toContain("crossOrigin={isSameOriginSrc ? true : undefined}");
    expect(playerSource).not.toContain("const [mounted, setMounted] = useState(false)");
    expect(playerSource).toContain("persistCurrentTime();");
    expect(playerSource).toContain("restoredForVideoRef.current = null;");
    expect(modalSource).toContain("ssr: false");
    expect(modalSource).toContain("export function preloadVideoPlayer()");
    expect(modalSource).toContain("new AbortController()");
    expect(modalSource).toContain('currentRecovery?.stage === "refreshing"');
    expect(modalSource).toContain("/api/videos/${encodeURIComponent(targetVideoId)}/playback-url");
    expect(modalSource).toContain("video.fallbackVideoUrl");
  });
});

describe("GET /api/videos/[videoId]/playback-url behavioral authorization", () => {
  let mockSession: { user: { id: string; role?: string | null } } | null = null;
  let mockVideoRow: {
    id: string;
    courseId: string;
    chapterId: string | null;
    videoUrl: string;
  } | null = null;
  let mockAccess: {
    hasFullContentAccess: boolean;
    tier: "free" | "enrolled" | "staff";
    scopedChapterIds: string[];
  } = {
    hasFullContentAccess: false,
    tier: "free",
    scopedChapterIds: [],
  };
  let mockSignedUrl = "https://storage.example.test/signed-refresh?sig=1";

  mock.module("next/headers", () => ({
    headers: async () => new Headers(),
  }));
  mock.module("@/lib/auth", () => ({
    auth: {
      api: {
        getSession: async () => mockSession,
      },
    },
  }));
  mock.module("@/db", () => ({
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => (mockVideoRow ? [mockVideoRow] : []),
          }),
        }),
      }),
    },
  }));
  mock.module("@/lib/student/course-access", () => ({
    resolveCourseAccess: async () => mockAccess,
  }));
  mock.module("@/lib/storage", () => ({
    storage: {
      getUrl: (k: string) => `/api/storage/file/${k}`,
      getSignedUrl: async () => mockSignedUrl,
    },
  }));

  afterEach(() => {
    mockSession = null;
    mockVideoRow = null;
    mockAccess = { hasFullContentAccess: false, tier: "free", scopedChapterIds: [] };
    mockSignedUrl = "https://storage.example.test/signed-refresh?sig=1";
  });

  test("returns 400 for empty videoId and 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/videos/[videoId]/playback-url/route");

    const badRes = await GET(new Request("http://localhost/api/videos/%20/playback-url"), {
      params: Promise.resolve({ videoId: "   " }),
    });
    expect(badRes.status).toBe(400);
    expect(badRes.headers.get("Cache-Control")).toBe("private, no-store");

    const unauthRes = await GET(new Request("http://localhost/api/videos/v1/playback-url"), {
      params: Promise.resolve({ videoId: "v1" }),
    });
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.headers.get("Cache-Control")).toBe("private, no-store");
  });

  test("returns 404 when video does not exist", async () => {
    const { GET } = await import("@/app/api/videos/[videoId]/playback-url/route");
    mockSession = { user: { id: "u1", role: "murid" } };
    mockVideoRow = null;

    const res = await GET(new Request("http://localhost/api/videos/missing/playback-url"), {
      params: Promise.resolve({ videoId: "missing" }),
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  test("returns 403 for unenrolled/free users or out-of-scope chapters", async () => {
    const { GET } = await import("@/app/api/videos/[videoId]/playback-url/route");
    mockSession = { user: { id: "u1", role: "murid" } };
    mockVideoRow = {
      id: "v1",
      courseId: "c1",
      chapterId: "ch-2",
      videoUrl: "courses/kalkulus/videos/123-abcd1234-lec.mp4",
    };

    mockAccess = { hasFullContentAccess: false, tier: "free", scopedChapterIds: ["ch-1"] };
    const freeRes = await GET(new Request("http://localhost/api/videos/v1/playback-url"), {
      params: Promise.resolve({ videoId: "v1" }),
    });
    expect(freeRes.status).toBe(403);

    mockAccess = { hasFullContentAccess: true, tier: "enrolled", scopedChapterIds: ["ch-1"] };
    const outOfScopeRes = await GET(new Request("http://localhost/api/videos/v1/playback-url"), {
      params: Promise.resolve({ videoId: "v1" }),
    });
    expect(outOfScopeRes.status).toBe(403);
  });

  test("returns 200 with presigned URL and no-store header for enrolled student and staff on draft chapter", async () => {
    const { GET } = await import("@/app/api/videos/[videoId]/playback-url/route");
    mockVideoRow = {
      id: "v1",
      courseId: "c1",
      chapterId: "ch-draft",
      videoUrl: "courses/kalkulus/videos/123-abcd1234-lec.mp4",
    };

    // Enrolled student with chapter in scope
    mockSession = { user: { id: "u1", role: "murid" } };
    mockAccess = { hasFullContentAccess: true, tier: "enrolled", scopedChapterIds: ["ch-draft"] };
    const enrolledRes = await GET(new Request("http://localhost/api/videos/v1/playback-url"), {
      params: Promise.resolve({ videoId: "v1" }),
    });
    expect(enrolledRes.status).toBe(200);
    expect(enrolledRes.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await enrolledRes.json()).toEqual({
      url: mockSignedUrl,
      fallbackUrl: "/api/storage/file/courses/kalkulus/videos/123-abcd1234-lec.mp4",
      isPresigned: true,
      expiresIn: VIDEO_PLAYBACK_URL_TTL_SECONDS,
    });

    // Staff can access draft chapter even if not in scopedChapterIds
    mockSession = { user: { id: "admin-1", role: "admin" } };
    mockAccess = { hasFullContentAccess: true, tier: "staff", scopedChapterIds: [] };
    const staffRes = await GET(new Request("http://localhost/api/videos/v1/playback-url"), {
      params: Promise.resolve({ videoId: "v1" }),
    });
    expect(staffRes.status).toBe(200);
    expect(staffRes.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
