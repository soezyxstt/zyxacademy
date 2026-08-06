import { describe, expect, test } from "bun:test";
import {
  assertSafeKey,
  buildFormStorageKey,
  formatQuestionFolder,
  isSafeKey,
  joinKey,
  leafFilename,
  sanitizeFilename,
  slugifyFormTitle,
  slugifySegment,
  userFileLeaf,
} from "@/lib/storage/keys";

describe("storage key slugify helpers", () => {
  test("slugifySegment produces kebab-case from any input", () => {
    expect(slugifySegment("Matematika Dasar")).toBe("matematika-dasar");
    expect(slugifySegment("Kalkulus (Teknik 1) !")).toBe("kalkulus-teknik-1");
    expect(slugifySegment("Éléments")).toBe("elements");
    expect(slugifySegment("")).toBe("untitled");
    expect(slugifySegment(null, "course")).toBe("course");
  });

  test("sanitizeFilename lowercases and keeps the extension", () => {
    expect(sanitizeFilename("Pas Foto Siswa.JPG")).toBe("pas_foto_siswa.jpg");
    expect(sanitizeFilename("materi-kelas.PDF")).toBe("materi-kelas.pdf");
    expect(sanitizeFilename("  a  b (1).png ")).toBe("a_b_1.png");
    expect(sanitizeFilename("noext")).toBe("noext");
  });
});

describe("storage key leaf helpers", () => {
  test("userFileLeaf is a timestamp-shorthash-filename leaf", () => {
    const leaf = userFileLeaf("Dokumen Materi.PDF");
    expect(leaf).toMatch(/^\d+-[a-f0-9]{8}-dokumen_materi\.pdf$/);
  });

  test("two leaves for the same name differ (no overwrite)", () => {
    const a = userFileLeaf("a.pdf");
    const b = userFileLeaf("a.pdf");
    expect(a).not.toBe(b);
  });

  test("leafFilename strips the timestamp-hash prefix and returns the real name", () => {
    expect(leafFilename("courses/mat-i/materials/1719000000000-a1b2c3d4-materi.pdf")).toBe("materi.pdf");
    expect(leafFilename("blog/1719000000000-a1b2c3d4-foto.jpg")).toBe("foto.jpg");
    expect(leafFilename("courses/mat-i/diktats/kalkulus-1.pdf")).toBe("kalkulus-1.pdf");
  });
});

describe("storage key safety", () => {
  test("assertSafeKey accepts structured keys", () => {
    expect(() => assertSafeKey("courses/mat-i/materials/1-a1b2c3d4-materi.pdf")).not.toThrow();
    expect(isSafeKey("pka/u-1/proofs/1-a1b2c3d4-bukti.jpg")).toBe(true);
  });

  test("assertSafeKey rejects traversal, absolute, and backslash keys", () => {
    expect(() => assertSafeKey("../secret")).toThrow("INVALID_OBJECT_KEY");
    expect(() => assertSafeKey("a/../b")).toThrow("INVALID_OBJECT_KEY");
    expect(() => assertSafeKey("/etc/passwd")).toThrow("INVALID_OBJECT_KEY");
    expect(() => assertSafeKey("a\\b")).toThrow("INVALID_OBJECT_KEY");
    expect(() => assertSafeKey("")).toThrow("INVALID_OBJECT_KEY");
  });

  test("joinKey builds domain-prefixed keys and rejects unsafe segments", () => {
    expect(joinKey("courses", "mat-i", "materials", "1-a1b2c3d4-materi.pdf")).toBe(
      "courses/mat-i/materials/1-a1b2c3d4-materi.pdf"
    );
    expect(() => joinKey("courses", "..", "materials", "x.pdf")).toThrow("INVALID_OBJECT_KEY");
  });
});

describe("form storage helpers (migrated to keys.ts)", () => {
  test("slugifyFormTitle matches legacy behavior", () => {
    expect(slugifyFormTitle("Formulir Pendaftaran Siswa 2026")).toBe("formulir-pendaftaran-siswa-2026");
    expect(slugifyFormTitle("")).toBe("unnamed-form");
    expect(slugifyFormTitle(null)).toBe("unnamed-form");
  });

  test("formatQuestionFolder matches legacy behavior", () => {
    expect(formatQuestionFolder(1)).toBe("question-1");
    expect(formatQuestionFolder("q2")).toBe("question-2");
    expect(formatQuestionFolder(null)).toBe("general");
  });

  test("buildFormStorageKey matches the canonical form prefix", () => {
    const key = buildFormStorageKey({
      formTitle: "Formulir Pendaftaran Siswa 2026",
      questionNumber: 1,
      filename: "Pas Foto Siswa.JPG",
    });
    expect(key).toMatch(/^forms\/formulir-pendaftaran-siswa-2026\/question-1\/\d+-[a-f0-9]{8}-pas_foto_siswa\.jpg$/);
  });
});
