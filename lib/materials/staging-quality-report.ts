import { join } from "node:path";
import type { ArticleDocument } from "./article-contract";
import type { DiktatCompressionReport, DiktatDocument } from "./diktat-contract";
import type { QualityGateResult } from "./quality-gates";

export const PLAN009_REPORT_SCHEMA = "plan-009-material-quality.v1";

export type Plan009QualityReport = {
  schemaVersion: typeof PLAN009_REPORT_SCHEMA;
  plan: "009";
  runId: string;
  courseId: string;
  canonicalCourseId: string | null;
  status: "passed" | "blocked";
  fixtureMode: "canonical_idea_source" | "canonical_idea_source_fallback" | "product_bundle" | "none";
  productCount: number;
  article: {
    document: ArticleDocument | null;
    markdown: string;
    astHash: string;
    quality: QualityGateResult;
  };
  diktat: {
    document: DiktatDocument | null;
    compression: DiktatCompressionReport | null;
    quality: QualityGateResult;
  };
  deterministic: {
    hashesMatch: boolean;
    markdownMatch: boolean;
    astMatch: boolean;
  };
  readOnly: {
    mutationStatus: "read_only";
    writesAttempted: number;
    rowsChanged: number;
  };
  failureCodes: string[];
};

export function plan009ArtifactPath(runId: string, cwd = process.cwd()): string {
  return join(cwd, "artifacts", "staging-overhaul", runId, "plan-009-result.json");
}

export function validatePlan009Report(report: Plan009QualityReport): string[] {
  const failures = new Set<string>(report.failureCodes);
  if (report.status !== "passed") failures.add("QUALITY_REPORT_BLOCKED");
  if (report.productCount < 1) failures.add("QUALITY_PRODUCT_COUNT_ZERO");
  if (report.fixtureMode === "none") failures.add("QUALITY_FIXTURE_MISSING");
  if (report.article.document === null) failures.add("QUALITY_ARTICLE_MISSING");
  if (report.diktat.document === null) failures.add("QUALITY_DIKTAT_MISSING");
  if (report.article.quality.score !== 100 || report.article.quality.metrics.requiredCoveragePercent !== 100 || report.article.quality.metrics.traceableBlockPercent !== 100) failures.add("QUALITY_ARTICLE_NOT_100_PERCENT");
  if (report.diktat.quality.score !== 100 || report.diktat.quality.metrics.ideaCoveragePercent !== 100 || report.diktat.quality.metrics.compressionLossFreePercent !== 100) failures.add("QUALITY_DIKTAT_NOT_100_PERCENT");
  if (!report.deterministic.hashesMatch || !report.deterministic.markdownMatch || !report.deterministic.astMatch) failures.add("QUALITY_NON_DETERMINISTIC_OUTPUT");
  if (report.readOnly.mutationStatus !== "read_only" || report.readOnly.writesAttempted !== 0 || report.readOnly.rowsChanged !== 0) failures.add("QUALITY_READ_ONLY_VIOLATION");
  return [...failures].sort();
}
