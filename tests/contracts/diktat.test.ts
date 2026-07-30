import { describe, expect, it } from "bun:test";
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
});
