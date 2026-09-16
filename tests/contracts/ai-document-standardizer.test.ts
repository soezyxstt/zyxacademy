import { describe, expect, it } from "bun:test";
import {
  sanitizeStandardTitle,
  buildDeterministicFallback,
  standardizeDocumentMetadataWithAi,
  batchStandardizeDocumentsWithAi,
} from "@/lib/academic/ai-document-standardizer";
import type { BatchChapterInfo } from "@/lib/course-batch-upload";

describe("AI Document Standardizer", () => {
  const sampleChapters: BatchChapterInfo[] = [
    { id: "chap-1", title: "Sistem Bilangan, Pertaksamaan, dan Fungsi", orderIndex: 1 },
    { id: "chap-2", title: "Limit dan Kekontinuan", orderIndex: 2 },
    { id: "chap-3", title: "Turunan", orderIndex: 3 },
    { id: "chap-4", title: "Aplikasi Turunan", orderIndex: 4 },
    { id: "chap-5", title: "Integral Tentu", orderIndex: 5 },
    { id: "chap-6", title: "Aplikasi Integral", orderIndex: 6 },
  ];

  describe("sanitizeStandardTitle", () => {
    it("removes em dashes and en dashes without violating durable rules", () => {
      expect(sanitizeStandardTitle("Bab 1 — Sistem Bilangan – Pertaksamaan")).toBe(
        "Bab 1, Sistem Bilangan, Pertaksamaan"
      );
    });

    it("removes exclamation marks and trims whitespace", () => {
      expect(sanitizeStandardTitle("  Kuis 1 MA1101 Penting!  ")).toBe("Kuis 1 MA1101 Penting");
    });
  });

  describe("buildDeterministicFallback", () => {
    it("correctly standardizes lecture material with matched chapter title", () => {
      const result = buildDeterministicFallback(
        "MA1101 Matematika 1A Limit.pdf",
        "MA1101",
        sampleChapters
      );

      expect(result.category).toBe("materi");
      expect(result.chapterIds).toContain("chap-2");
      expect(result.matchedChapterOrderIndex).toBe(2);
      expect(result.title).toBe("Bab 2: Limit dan Kekontinuan");
    });

    it("correctly formats UTS exam titles", () => {
      const result = buildDeterministicFallback(
        "UTS MA1101 2023.pdf",
        "MA1101",
        sampleChapters
      );

      expect(result.category).toBe("soal");
      expect(result.subcategory).toBe("uts");
      expect(result.title).toBe("UTS MA1101 2023");
    });

    it("correctly formats Pembahasan UTS titles", () => {
      const result = buildDeterministicFallback(
        "Pembahasan UTS MA1101 2023.pdf",
        "MA1101",
        sampleChapters
      );

      expect(result.category).toBe("pembahasan_soal");
      expect(result.subcategory).toBe("uts");
      expect(result.title).toBe("Pembahasan UTS MA1101 2023");
    });

    it("correctly formats SCL titles", () => {
      const result = buildDeterministicFallback(
        "SCL Turunan.pdf",
        "MA1101",
        sampleChapters
      );

      expect(result.category).toBe("materi");
      expect(result.subcategory).toBe("scl");
      expect(result.title).toBe("SCL Bab 3: Turunan");
    });

    it("resolves university Bab 0 vs Zyx Bab 1 offset by favoring semantic topic over raw number", () => {
      const result = buildDeterministicFallback(
        "MA1101 Matematika 1A Bab 01-Limit.pdf",
        "MA1101",
        sampleChapters
      );

      // Even though filename says "Bab 01", the topic "Limit" must map to Bab 2: Limit dan Kekontinuan
      expect(result.chapterIds).toContain("chap-2");
      expect(result.matchedChapterOrderIndex).toBe(2);
      expect(result.title).toBe("Bab 2: Limit dan Kekontinuan");
    });

    it("resolves university Bab 02-Turunan to Zyx Bab 3: Turunan", () => {
      const result = buildDeterministicFallback(
        "MA1101 Matematika 1A Bab 02-Turunan.pdf",
        "MA1101",
        sampleChapters
      );

      expect(result.chapterIds).toContain("chap-3");
      expect(result.matchedChapterOrderIndex).toBe(3);
      expect(result.title).toBe("Bab 3: Turunan");
    });
  });

  describe("standardizeDocumentMetadataWithAi", () => {
    it("handles fallback gracefully when offline or without real API call", async () => {
      const result = await standardizeDocumentMetadataWithAi({
        filename: "MA1101 Matematika 1A Bab 04-Integral tentu.pdf",
        courseCode: "MA1101",
        courseTitle: "Matematika 1A",
        chapters: sampleChapters,
      });

      expect(result.title).toBeDefined();
      expect(result.category).toBeDefined();
      // Should not contain em-dash or en-dash
      expect(result.title).not.toMatch(/[—–]/);
      expect(result.title).not.toContain("!");
    });
  });

  describe("batchStandardizeDocumentsWithAi", () => {
    it("processes multiple staged files and returns structured items", async () => {
      const files = [
        { id: "f1", filename: "MA1101 Matematika 1A Bab 01-Limit.pdf" },
        { id: "f2", filename: "MA1101 Matematika 1A Bab 02-Turunan.pdf" },
        { id: "f3", filename: "MA1101 Matematika 1A Bab 03-Aplikasi Turunan.pdf" },
        { id: "f4", filename: "MA1101 Matematika 1A Bab 04-Integral tentu.pdf" },
        { id: "f5", filename: "MA1101 Matematika 1A Bab 05-Aplikasi Integral.pdf" },
      ];

      const results = await batchStandardizeDocumentsWithAi({
        files,
        courseCode: "MA1101",
        courseTitle: "Matematika 1A",
        chapters: sampleChapters,
      });

      expect(results.length).toBe(5);
      for (const res of results) {
        expect(res.id).toBeDefined();
        expect(res.title).toBeDefined();
        expect(res.category).toBeDefined();
        expect(res.title).not.toMatch(/[—–]/);
      }
    });
  });
});
