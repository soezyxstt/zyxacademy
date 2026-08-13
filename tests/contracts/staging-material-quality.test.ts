import { describe, expect, it } from "bun:test";
import { plan009ArtifactPath, validatePlan009Report, type Plan009QualityReport } from "@/lib/materials/staging-quality-report";

function report(): Plan009QualityReport {
  return {
    schemaVersion: "plan-009-material-quality.v1",
    plan: "009",
    runId: "20260803-plan009-article-v1",
    courseId: "tutorial-pka",
    canonicalCourseId: "tutorial-pka",
    status: "passed",
    fixtureMode: "canonical_idea_source",
    productCount: 1,
    article: { document: {} as never, markdown: "# Article", astHash: "hash", quality: { passed: true, score: 100, issues: [], metrics: { requiredCoveragePercent: 100, traceableBlockPercent: 100 } } },
    diktat: { document: {} as never, compression: null, quality: { passed: true, score: 100, issues: [], metrics: { ideaCoveragePercent: 100, compressionLossFreePercent: 100 } } },
    deterministic: { hashesMatch: true, markdownMatch: true, astMatch: true },
    readOnly: { mutationStatus: "read_only", writesAttempted: 0, rowsChanged: 0 },
    failureCodes: [],
  };
}

describe("Plan 009 staging quality report contract", () => {
  it("resolves the default report path from the exact run ID", () => {
    expect(plan009ArtifactPath("20260803-plan009-article-v1", "C:\\workspace")).toBe("C:\\workspace\\artifacts\\staging-overhaul\\20260803-plan009-article-v1\\plan-009-result.json");
  });

  it("passes only a complete 100 percent read-only report", () => {
    expect(validatePlan009Report(report())).toEqual([]);
    const invalid = report();
    invalid.readOnly.rowsChanged = 1;
    expect(validatePlan009Report(invalid)).toContain("QUALITY_READ_ONLY_VIOLATION");
  });
});
