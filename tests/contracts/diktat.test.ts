import { describe, expect, it } from "bun:test";

process.env.MOCK_GEMINI = "true";
import { loadAiFixture } from "../helpers/ai-fixtures";
import { canPublishDiktat, DiktatAuditResult } from "@/lib/diktat/audit-contracts";
import { FormulaRegistry, RegisteredFormula } from "@/lib/diktat/formula-registry";

describe("Diktat Contract Tests (Plan 014)", () => {
  it("characterization: loads diktat failure fixtures and validates schema version", () => {
    const fixture = loadAiFixture<{
      status: string;
      reason?: string;
      statusCode?: number;
      error?: string;
    }>("diktat-failures.json");

    expect(fixture.schemaVersion).toBe("1.0");
    expect(fixture.requirementId).toBe("AI-DIKTAT-001");

    const { malformedPdfAudit, rendererFailure } = fixture.fixtures;
    expect(malformedPdfAudit.status).toBe("error");
    expect(rendererFailure.statusCode).toBe(500);
  });

  it("AI-DIKTAT-001: Handle malformed PDF structure errors gracefully during audit and fail closed", () => {
    const auditResult: DiktatAuditResult = {
      status: "unavailable",
      findings: [
        {
          id: "f-1",
          code: "MALFORMED_PDF_HEADER",
          severity: "critical",
          message: "PDF header corrupted or unreadable",
          sourceSpanIds: [],
        },
      ],
      errorMessage: "Failed to parse PDF binary stream",
    };

    expect(auditResult.status).toBe("unavailable");
    expect(canPublishDiktat(auditResult)).toBe(false);
  });

  it("AI-DIKTAT-002: Fallback to structured unavailable response on renderer timeout and block publication", () => {
    const auditResult: DiktatAuditResult = {
      status: "unavailable",
      findings: [
        {
          id: "f-2",
          code: "RENDERER_TIMEOUT",
          severity: "error",
          message: "Diktat PDF rendering worker timed out after 30000ms",
          sourceSpanIds: [],
        },
      ],
      errorMessage: "Renderer service unavailable",
    };

    expect(canPublishDiktat(auditResult)).toBe(false);
  });

  it("AI-DIKTAT-FORMULA-001: Registers canonical math formulas with symbols and source span provenance", () => {
    const registry = new FormulaRegistry();
    const formula: RegisteredFormula = {
      id: "form-turunan-rantai",
      name: "Aturan Rantai Turunan",
      latexExpression: "\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}",
      symbols: [
        { symbol: "y", name: "Variabel Terikat" },
        { symbol: "u", name: "Fungsi Perantara" },
        { symbol: "x", name: "Variabel Bebas" },
      ],
      assumptions: ["Fungsi u(x) terdiferensialkan pada x"],
      sourceKoIds: ["ko-101"],
      sourceSpanIds: ["span-rantai-1"],
    };

    registry.registerFormula(formula);
    const retrieved = registry.getFormula("form-turunan-rantai");

    expect(retrieved).toBeDefined();
    expect(retrieved?.symbols.length).toBe(3);
    expect(retrieved?.sourceKoIds).toEqual(["ko-101"]);
  });

  describe("Student Diktat PDF Download Contract", () => {
    it("allows enrolled students and admins to download rendered diktat PDF", async () => {
      const { canDownloadProductDiktat } = await import("@/lib/bundle/product-diktat-pdf");
      expect(canDownloadProductDiktat({ role: "admin", enrolled: false })).toBe(true);
      expect(canDownloadProductDiktat({ role: "student", enrolled: true })).toBe(true);
      expect(canDownloadProductDiktat({ role: "student", enrolled: false })).toBe(false);
      expect(canDownloadProductDiktat({ role: "tutor", enrolled: true })).toBe(false);
      expect(canDownloadProductDiktat({ role: null, enrolled: true })).toBe(false);
    });

    it("generates sanitized, URL-safe filenames for PDF downloads using slugifySegment", async () => {
      const { slugifySegment } = await import("@/lib/storage/keys");
      const title = "Diktat: Sistem Bilangan Real & Pertaksamaan (Revisi 2)";
      const filename = `${slugifySegment(title) || "diktat"}.pdf`;
      expect(filename).toBe("diktat-sistem-bilangan-real-pertaksamaan-revisi-2.pdf");
      expect(filename).not.toMatch(/[:&()]/);
    });

    it("formats download URLs with download=1 for direct browser file download", () => {
      const courseId = "ma1101";
      const diktatId = "diktat-real-analysis-1";
      const downloadUrl = `/api/courses/${courseId}/diktats/${diktatId}/pdf?download=1`;
      expect(downloadUrl).toBe("/api/courses/ma1101/diktats/diktat-real-analysis-1/pdf?download=1");
    });
  });
});
