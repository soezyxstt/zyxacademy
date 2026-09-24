import { describe, expect, test } from "bun:test";
import {
  SAFE_FAILURE_CODES,
  pdfArtifactEvidenceSchema,
  safeFailureCodeSchema,
  validatePdfArtifactEvidence,
  type PdfArtifactEvidence,
} from "@/lib/materials/pdf-artifact-contract";

describe("pdf artifact evidence contract", () => {
  test("maintains static enum of safe failure codes", () => {
    expect(SAFE_FAILURE_CODES).toHaveLength(11);
    expect(SAFE_FAILURE_CODES).toEqual([
      "RENDER_TIMEOUT",
      "RENDER_UNAVAILABLE",
      "LAYOUT_OVERFLOW",
      "FONT_MISSING",
      "FORMULA_RENDER_ERROR",
      "STORAGE_UNAVAILABLE",
      "INVALID_SOURCE_MARKDOWN",
      "PAGE_BUDGET_EXCEEDED",
      "RENDERER_CONFIG_MISSING",
      "RENDERER_REJECTED",
      "INVALID_PDF_OUTPUT",
    ]);
  });

  test("rejects arbitrary failure codes and stack traces", () => {
    expect(() => safeFailureCodeSchema.parse("FATAL_MEMORY_LEAK")).toThrow();
    expect(() =>
      safeFailureCodeSchema.parse(
        "Error at /app/node_modules/puppeteer: Connection timed out",
      ),
    ).toThrow();
  });

  describe("ready status validation", () => {
    const validReady: PdfArtifactEvidence = {
      id: "pdf-limit-01",
      imporBundleId: "bundle-limit-v1",
      productId: "article-limit-definition",
      articleVersion: 1,
      articleHash: "aa".repeat(32),
      diktatHash: "bb".repeat(32),
      rendererVersion: "v2026.1-typst",
      printProfile: "a4_compact_two_column",
      status: "ready",
      storageKey: "pdf/bundle-limit-v1/article-limit-definition/a4_compact_two_column.pdf",
      pageCount: 3,
    };

    test("accepts ready artifact within 2 to 4 page bounds", () => {
      const parsed = pdfArtifactEvidenceSchema.parse(validReady);
      const validation = validatePdfArtifactEvidence(parsed);
      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);

      // 2 pages
      expect(
        validatePdfArtifactEvidence(
          pdfArtifactEvidenceSchema.parse({ ...validReady, pageCount: 2 }),
        ).valid,
      ).toBe(true);

      // 4 pages
      expect(
        validatePdfArtifactEvidence(
          pdfArtifactEvidenceSchema.parse({ ...validReady, pageCount: 4 }),
        ).valid,
      ).toBe(true);
    });

    test("rejects ready artifact with pageCount less than 2", () => {
      expect(() =>
        pdfArtifactEvidenceSchema.parse({
          ...validReady,
          pageCount: 1,
        }),
      ).toThrow("Ready PDF artifact page count must be between 2 and 4");
    });

    test("rejects ready artifact with pageCount greater than 4", () => {
      expect(() =>
        pdfArtifactEvidenceSchema.parse({
          ...validReady,
          pageCount: 5,
        }),
      ).toThrow("Ready PDF artifact page count must be between 2 and 4");
    });

    test("rejects ready artifact without storageKey", () => {
      expect(() =>
        pdfArtifactEvidenceSchema.parse({
          ...validReady,
          storageKey: undefined,
        }),
      ).toThrow("Ready PDF artifact must specify an object storage key");
    });

    test("rejects ready artifact retaining a failureCode", () => {
      expect(() =>
        pdfArtifactEvidenceSchema.parse({
          ...validReady,
          failureCode: "RENDER_TIMEOUT",
        }),
      ).toThrow("Ready PDF artifact cannot have a failureCode");
    });
  });

  describe("failed status validation", () => {
    const validFailed: PdfArtifactEvidence = {
      id: "pdf-limit-02",
      imporBundleId: "bundle-limit-v1",
      productId: "article-limit-definition",
      articleVersion: 1,
      articleHash: "aa".repeat(32),
      diktatHash: "bb".repeat(32),
      rendererVersion: "v2026.1-typst",
      printProfile: "a4_compact_two_column",
      status: "failed",
      failureCode: "LAYOUT_OVERFLOW",
    };

    test("accepts failed artifact with safe failure code", () => {
      const parsed = pdfArtifactEvidenceSchema.parse(validFailed);
      const validation = validatePdfArtifactEvidence(parsed);
      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    test("rejects failed artifact missing failure code", () => {
      expect(() =>
        pdfArtifactEvidenceSchema.parse({
          ...validFailed,
          failureCode: undefined,
        }),
      ).toThrow("Failed PDF artifact must have a valid failureCode");
    });
  });

  describe("pending and stale status validation", () => {
    test("accepts pending artifact without storageKey and failureCode", () => {
      const pending: PdfArtifactEvidence = {
        id: "pdf-pending-01",
        imporBundleId: "bundle-limit-v1",
        productId: "article-limit-definition",
        articleVersion: 1,
        articleHash: "aa".repeat(32),
        diktatHash: "bb".repeat(32),
        rendererVersion: "v2026.1-typst",
        printProfile: "a4_compact_two_column",
        status: "pending",
      };

      const parsed = pdfArtifactEvidenceSchema.parse(pending);
      const validation = validatePdfArtifactEvidence(parsed);
      expect(validation.valid).toBe(true);
    });

    test("rejects pending artifact with failureCode", () => {
      expect(() =>
        pdfArtifactEvidenceSchema.parse({
          id: "pdf-pending-02",
          imporBundleId: "bundle-limit-v1",
          productId: "article-limit-definition",
          articleVersion: 1,
          articleHash: "aa".repeat(32),
          diktatHash: "bb".repeat(32),
          rendererVersion: "v2026.1-typst",
          printProfile: "a4_compact_two_column",
          status: "pending",
          failureCode: "RENDER_TIMEOUT",
        }),
      ).toThrow("pending PDF artifact cannot specify a failureCode");
    });

    test("accepts stale artifact without failureCode", () => {
      const stale: PdfArtifactEvidence = {
        id: "pdf-stale-01",
        imporBundleId: "bundle-limit-v1",
        productId: "article-limit-definition",
        articleVersion: 1,
        articleHash: "aa".repeat(32),
        diktatHash: "bb".repeat(32),
        rendererVersion: "v2026.1-typst",
        printProfile: "a4_compact_two_column",
        status: "stale",
      };

      const parsed = pdfArtifactEvidenceSchema.parse(stale);
      const validation = validatePdfArtifactEvidence(parsed);
      expect(validation.valid).toBe(true);
    });
  });
});
