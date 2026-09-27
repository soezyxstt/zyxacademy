import { describe, expect, test, mock } from "bun:test";

mock.module("server-only", () => ({}));

import {
  buildCourseVideoKey,
  buildCourseVideoThumbnailKey,
} from "@/lib/storage/keys";

const { getAdminCourseNavItems } = await import("@/components/admin-sidebar");
const { getRouteTitle } = await import("@/components/mobile-navbar");

describe("Course Video Playlists Contract", () => {
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
      } = await import("@/app/api/videos/upload/route");

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
      expect(getRouteTitle("/admin/courses/kalkulus-1/videos")).toBe("Video");
      expect(getRouteTitle("/courses/kalkulus-1/video")).toBe("Video");
      expect(getRouteTitle("/tutor/kalkulus-1/videos")).toBe("Video");
    });
  });
});
