import { describe, expect, it } from "bun:test";
import { getViewablePdfUrl, isMobileOrTablet } from "@/lib/pdf-utils";

describe("pdf-utils", () => {
  describe("getViewablePdfUrl", () => {
    it("returns empty string for null, undefined or empty input", () => {
      expect(getViewablePdfUrl(null)).toBe("");
      expect(getViewablePdfUrl(undefined)).toBe("");
      expect(getViewablePdfUrl("")).toBe("");
      expect(getViewablePdfUrl("   ")).toBe("");
    });

    it("strips download=1 query parameter to allow inline browser PDF viewing", () => {
      expect(getViewablePdfUrl("/api/storage/file/doc.pdf?download=1")).toBe("/api/storage/file/doc.pdf");
      expect(getViewablePdfUrl("/api/courses/calc-1/diktats/d1/pdf?download=1")).toBe("/api/courses/calc-1/diktats/d1/pdf");
      expect(getViewablePdfUrl("/api/courses/calc-1/diktats/d1/pdf?download=true")).toBe("/api/courses/calc-1/diktats/d1/pdf");
    });

    it("preserves other query parameters while stripping download=1", () => {
      expect(getViewablePdfUrl("/api/storage/file/doc.pdf?foo=bar&download=1")).toBe("/api/storage/file/doc.pdf?foo=bar");
      expect(getViewablePdfUrl("/api/storage/file/doc.pdf?download=1&foo=bar")).toBe("/api/storage/file/doc.pdf?foo=bar");
    });

    it("leaves clean URLs unchanged", () => {
      expect(getViewablePdfUrl("/api/storage/file/courses/kalkulus/doc.pdf")).toBe("/api/storage/file/courses/kalkulus/doc.pdf");
      expect(getViewablePdfUrl("https://example.com/file.pdf")).toBe("https://example.com/file.pdf");
    });
  });

  describe("isMobileOrTablet", () => {
    it("returns a boolean", () => {
      const result = isMobileOrTablet();
      expect(typeof result).toBe("boolean");
    });
  });
});
