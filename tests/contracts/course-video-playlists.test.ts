import { describe, expect, test, mock } from "bun:test";

mock.module("server-only", () => ({}));

import {
  buildCourseVideoKey,
  buildCourseVideoThumbnailKey,
} from "@/lib/storage/keys";
import {
  extractYouTubeVideoId,
  getCanonicalYouTubeUrl,
  getYouTubeThumbnailUrl,
} from "@/lib/video/youtube";

const { getAdminCourseNavItems } = await import("@/components/admin-sidebar");
const { getRouteTitle } = await import("@/components/mobile-navbar");

describe("Course Video Playlists Contract", () => {
  describe("YouTube URL and Metadata Contract", () => {
    test("extracts YouTube ID from various URL formats and raw ID", () => {
      const sampleId = "dQw4w9WgXcQ";
      expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(sampleId);
      expect(extractYouTubeVideoId("https://www.youtube.com/watch?feature=shared&v=dQw4w9WgXcQ&t=42s")).toBe(sampleId);
      expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?si=abcdef123")).toBe(sampleId);
      expect(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(sampleId);
      expect(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(sampleId);
      expect(extractYouTubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe(sampleId);
      expect(extractYouTubeVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(sampleId);
      expect(extractYouTubeVideoId("dQw4w9WgXcQ")).toBe(sampleId);

      // Rejects invalid strings
      expect(extractYouTubeVideoId("https://not-youtube.com/watch?v=123")).toBeNull();
      expect(extractYouTubeVideoId("random-text-too-long-to-be-id")).toBeNull();
      expect(extractYouTubeVideoId("")).toBeNull();
    });

    test("generates canonical YouTube URLs and thumbnail endpoints", () => {
      const sampleId = "dQw4w9WgXcQ";
      expect(getCanonicalYouTubeUrl(sampleId)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(getYouTubeThumbnailUrl(sampleId, "hq")).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    });
  });
  describe("Storage Keys Contract", () => {
    test("buildCourseVideoKey creates structured course video key", () => {
      const key = buildCourseVideoKey({
        courseSlug: "kalkulus-1",
        filename: "pembahasan-uts.mp4",
      });
      expect(key).toMatch(/^courses\/kalkulus-1\/videos\/\d+-[a-f0-9]{8}-pembahasan-uts\.mp4$/);
    });

    test("buildCourseVideoThumbnailKey creates structured video thumbnail key", () => {
      const key = buildCourseVideoThumbnailKey({
        courseSlug: "fisika-dasar-1",
        filename: "custom-thumb.jpg",
      });
      expect(key).toMatch(/^courses\/fisika-dasar-1\/videos\/thumbnails\/\d+-[a-f0-9]{8}-custom-thumb\.jpg$/);
    });
  });

  describe("Upload Validation Allowlist Contract", () => {
    test("video and image allowlists strictly define permitted types", async () => {
      const {
        ALLOWED_VIDEO_EXTENSIONS,
        ALLOWED_IMAGE_EXTENSIONS,
        ALLOWED_VIDEO_MIME_TYPES,
        ALLOWED_IMAGE_MIME_TYPES,
      } = await import("@/lib/video/upload-policy");

      expect(ALLOWED_VIDEO_EXTENSIONS).toContain(".mp4");
      expect(ALLOWED_VIDEO_EXTENSIONS).toContain(".webm");
      expect(ALLOWED_VIDEO_MIME_TYPES).toContain("video/mp4");
      expect(ALLOWED_VIDEO_MIME_TYPES).toContain("video/webm");

      expect(ALLOWED_IMAGE_EXTENSIONS).toContain(".jpg");
      expect(ALLOWED_IMAGE_EXTENSIONS).toContain(".png");
      expect(ALLOWED_IMAGE_MIME_TYPES).toContain("image/jpeg");
      expect(ALLOWED_IMAGE_MIME_TYPES).toContain("image/png");

      // Verify dangerous executable or active web MIME types are excluded
      expect(ALLOWED_VIDEO_MIME_TYPES as readonly string[]).not.toContain("text/html");
      expect(ALLOWED_VIDEO_MIME_TYPES as readonly string[]).not.toContain("application/javascript");
      expect(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).not.toContain("text/html");
    });
  });

  describe("Admin Navigation Contract", () => {
    test("Video is placed immediately under Dokumen in admin course nav", () => {
      const items = getAdminCourseNavItems("kalkulus-1");
      const docIndex = items.findIndex((i) => i.id === "documents");
      const videoIndex = items.findIndex((i) => i.id === "videos");

      expect(docIndex).toBeGreaterThanOrEqual(0);
      expect(videoIndex).toBe(docIndex + 1);
      expect(items[videoIndex].label).toBe("Video");
      expect(items[videoIndex].href).toBe("/admin/courses/kalkulus-1/videos");
    });
  });

  describe("Mobile Route Title Contract", () => {
    test("resolves Video title for admin and student course video routes", () => {
      expect(getRouteTitle("/admin/courses/kalkulus-1/videos", "admin", (key) => key)).toBe("admin.routeTitles.videos");
      expect(getRouteTitle("/courses/kalkulus-1/video", "student", (key) => key)).toBe("routeTitles.video");
      expect(getRouteTitle("/tutor/kalkulus-1/videos", "tutor", (key) => key)).toBe("tutor.routeTitles.videos");
    });
  });
});
