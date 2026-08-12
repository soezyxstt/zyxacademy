import { describe, expect, test } from "bun:test";
import { buildMediaKey, isMediaKey } from "@/lib/storage/keys";
import { kindFromKey } from "@/lib/media";

describe("Media Library keys and previews", () => {
  test("MEDIA-001: builds nested media keys with a human-readable filename", () => {
    expect(
      buildMediaKey({ folderPath: "Brand Assets/Logo Utama", filename: "Logo Zyx Academy.PNG" })
    ).toBe("media/brand-assets/logo-utama/logo_zyx_academy.png");
  });

  test("MEDIA-002: rejects unsafe parent traversal", () => {
    expect(() => buildMediaKey({ folderPath: "logo/../rahasia", filename: "x.png" })).toThrow(
      "INVALID_OBJECT_KEY"
    );
  });

  test("MEDIA-003: classifies supported preview types", () => {
    expect(kindFromKey("media/logo.svg")).toBe("image");
    expect(kindFromKey("media/video.webm")).toBe("video");
    expect(kindFromKey("media/audio.flac")).toBe("audio");
    expect(kindFromKey("media/panduan.pdf")).toBe("pdf");
    expect(kindFromKey("media/catatan.md")).toBe("markdown");
    expect(kindFromKey("media/readme.txt")).toBe("text");
    expect(isMediaKey("media/logo.svg")).toBe(true);
  });
});
