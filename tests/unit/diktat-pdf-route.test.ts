import { describe, expect, test } from "bun:test";
import type { CourseAccessResult } from "@/lib/student/course-access";
import {
  buildDiktatPdfResponse,
  canAccessDiktatPdf,
  downloadDiktatPdfBytes,
  resolveDiktatPdfSource,
} from "@/lib/student/diktat-pdf";

function makeAccess(overrides: Partial<CourseAccessResult> = {}): CourseAccessResult {
  return {
    requestedCourseId: "ma1101",
    courseId: "mk-ma1101",
    publicCourseId: "ma1101",
    canonicalCourseId: "mk-ma1101",
    legacyCourseId: "ma1101",
    courseTitle: "Matematika 1A",
    isDemo: false,
    tier: "enrolled",
    role: "murid",
    roles: ["murid"],
    isAuthenticated: true,
    isEnrolled: true,
    hasCourseAccess: true,
    hasFullContentAccess: true,
    pricing: { category: "premium", startsAt: null, endsAt: null },
    isFreeNow: false,
    freeChapters: [],
    freeChapterIds: ["bab-1"],
    scopedChapterIds: ["bab-1", "bab-2"],
    capabilities: {
      canReadArticle: true,
      canReadDiktat: true,
      canDownloadDiktat: true,
      canStartQuiz: true,
      canReviewFlashcard: true,
      canAskZyra: true,
      zyraDailyQuestionLimit: null,
    },
    ...overrides,
  };
}

describe("diktat PDF route helpers", () => {
  describe("resolveDiktatPdfSource", () => {
    test("normalizes raw keys, leading slashes, and relative storage proxy paths", () => {
      expect(resolveDiktatPdfSource("courses/ma1101/diktats/bab-1.pdf")).toEqual({
        kind: "storage",
        key: "courses/ma1101/diktats/bab-1.pdf",
      });
      expect(resolveDiktatPdfSource("/courses/ma1101/diktats/bab-1.pdf")).toEqual({
        kind: "storage",
        key: "courses/ma1101/diktats/bab-1.pdf",
      });
      expect(resolveDiktatPdfSource("/api/storage/file/courses/ma1101/diktats/bab%201.pdf?v=2")).toEqual({
        kind: "storage",
        key: "courses/ma1101/diktats/bab 1.pdf",
      });
      expect(resolveDiktatPdfSource("/f/overhaul/run-1/diktat-pdf/abc.pdf")).toEqual({
        kind: "storage",
        key: "overhaul/run-1/diktat-pdf/abc.pdf",
      });
    });

    test("extracts key from absolute storage proxy URLs and R2_PUBLIC_URL", () => {
      expect(
        resolveDiktatPdfSource("https://staging.zyxacademy.id/api/storage/file/courses/ma1101/diktats/bab-1.pdf"),
      ).toEqual({
        kind: "storage",
        key: "courses/ma1101/diktats/bab-1.pdf",
      });

      const prevPublicUrl = process.env.R2_PUBLIC_URL;
      process.env.R2_PUBLIC_URL = "https://cdn.zyxacademy.id";
      try {
        expect(resolveDiktatPdfSource("https://cdn.zyxacademy.id/courses/ma1101/diktats/bab-1.pdf")).toEqual({
          kind: "storage",
          key: "courses/ma1101/diktats/bab-1.pdf",
        });
      } finally {
        if (prevPublicUrl === undefined) delete process.env.R2_PUBLIC_URL;
        else process.env.R2_PUBLIC_URL = prevPublicUrl;
      }
    });

    test("falls back to external-url for external HTTPS URLs and rejects unsafe or empty values", () => {
      expect(resolveDiktatPdfSource("https://utfs.io/f/example-diktat.pdf")).toEqual({
        kind: "external-url",
        url: "https://utfs.io/f/example-diktat.pdf",
      });
      expect(resolveDiktatPdfSource("http://insecure.example.com/diktat.pdf")).toBeNull();
      expect(resolveDiktatPdfSource("../secret/diktat.pdf")).toBeNull();
      expect(resolveDiktatPdfSource("")).toBeNull();
      expect(resolveDiktatPdfSource(null)).toBeNull();
    });
  });

  describe("canAccessDiktatPdf", () => {
    test("allows canonical diktat when only canonical or only legacy chapter ID is in scope", () => {
      const canonicalOnlyAccess = makeAccess({
        scopedChapterIds: ["bab-canonical-1"],
        freeChapterIds: ["bab-canonical-1"],
      });
      expect(
        canAccessDiktatPdf(canonicalOnlyAccess, {
          kind: "canonical",
          chapterIds: ["bab-canonical-1", "ch-legacy-1"],
        }),
      ).toBe(true);

      const legacyOnlyAccess = makeAccess({
        scopedChapterIds: ["ch-legacy-1"],
        freeChapterIds: ["ch-legacy-1"],
      });
      expect(
        canAccessDiktatPdf(legacyOnlyAccess, {
          kind: "canonical",
          chapterIds: ["bab-canonical-1", "ch-legacy-1"],
        }),
      ).toBe(true);
    });

    test("denies canonical diktat with empty chapter scope or locked free chapter", () => {
      const freeAccess = makeAccess({
        tier: "free",
        isEnrolled: false,
        hasFullContentAccess: false,
        freeChapterIds: ["bab-1"],
        scopedChapterIds: ["bab-1", "bab-2"],
        capabilities: {
          canReadArticle: true,
          canReadDiktat: true,
          canDownloadDiktat: false,
          canStartQuiz: true,
          canReviewFlashcard: true,
          canAskZyra: true,
          zyraDailyQuestionLimit: 5,
        },
      });
      expect(canAccessDiktatPdf(freeAccess, { kind: "canonical", chapterIds: ["bab-1", "ch-1"] })).toBe(true);
      expect(canAccessDiktatPdf(freeAccess, { kind: "canonical", chapterIds: ["bab-2", "ch-2"] })).toBe(false);
      expect(canAccessDiktatPdf(freeAccess, { kind: "canonical", chapterIds: [null, undefined] })).toBe(false);
    });

    test("requires every chapter in legacy multi-chapter diktat to be allowed", () => {
      const access = makeAccess({
        scopedChapterIds: ["ch-1"],
      });
      expect(canAccessDiktatPdf(access, { kind: "legacy", chapterIds: ["ch-1"] })).toBe(true);
      expect(canAccessDiktatPdf(access, { kind: "legacy", chapterIds: ["ch-1", "ch-2"] })).toBe(false);
    });
  });

  describe("downloadDiktatPdfBytes and buildDiktatPdfResponse", () => {
    test("downloads from storage or external URL and formats inline vs attachment headers", async () => {
      const storageBytes = await downloadDiktatPdfBytes(
        { kind: "storage", key: "courses/ma1101/diktats/bab-1.pdf" },
        {
          downloadFromStorage: async (key) => {
            expect(key).toBe("courses/ma1101/diktats/bab-1.pdf");
            return new Uint8Array([37, 80, 68, 70]);
          },
        },
      );
      expect(storageBytes).toEqual(new Uint8Array([37, 80, 68, 70]));

      const externalBytes = await downloadDiktatPdfBytes(
        { kind: "external-url", url: "https://utfs.io/f/diktat.pdf" },
        {
          fetchExternal: async (url) => {
            expect(url).toBe("https://utfs.io/f/diktat.pdf");
            return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
          },
        },
      );
      expect(externalBytes).toEqual(new Uint8Array([1, 2, 3]));

      const downloadResp = buildDiktatPdfResponse(storageBytes, "Diktat Bab 1: Limit & Kekontinuan", true);
      expect(downloadResp.headers.get("Content-Type")).toBe("application/pdf");
      expect(downloadResp.headers.get("Content-Disposition")).toBe(
        'attachment; filename="diktat-bab-1-limit-kekontinuan.pdf"',
      );
      expect(downloadResp.headers.get("Cache-Control")).toBe("private, no-store");

      const inlineResp = buildDiktatPdfResponse(storageBytes, "", false);
      expect(inlineResp.headers.get("Content-Disposition")).toBe('inline; filename="diktat.pdf"');
    });
  });
});
