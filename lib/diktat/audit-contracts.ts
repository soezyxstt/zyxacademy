import { z } from "zod";

/**
 * Plan 014: Diktat Audit & PDF QA Contracts
 * Enforces structured audit outcomes and fail-closed publication rules.
 */

export const DiktatAuditStatusSchema = z.enum([
  "pass",
  "warn",
  "fail",
  "unavailable",
  "needs_review",
]);
export type DiktatAuditStatus = z.infer<typeof DiktatAuditStatusSchema>;

export const DiktatAuditFindingSchema = z.object({
  id: z.string(),
  code: z.string(),
  severity: z.enum(["info", "warning", "error", "critical"]),
  message: z.string(),
  location: z.string().optional(),
  sourceSpanIds: z.array(z.string()).optional().default([]),
});
export type DiktatAuditFinding = z.infer<typeof DiktatAuditFindingSchema>;

export interface DiktatAuditResult {
  status: DiktatAuditStatus;
  findings: DiktatAuditFinding[];
  auditedPageCount?: number;
  pdfHash?: string;
  errorMessage?: string;
}

/**
 * Evaluates whether a diktat artifact can be published.
 * FAIL-CLOSED INVARIANT: Only 'pass' or allowlisted 'warn' can be published.
 * 'fail', 'unavailable', or 'needs_review' MUST block publication.
 */
export function canPublishDiktat(result: DiktatAuditResult, allowlistedWarnCodes: string[] = []): boolean {
  if (result.status === "pass") {
    return true;
  }
  if (result.status === "warn") {
    const unapprovedWarnings = result.findings.filter(
      (f) => f.severity === "warning" && !allowlistedWarnCodes.includes(f.code)
    );
    return unapprovedWarnings.length === 0;
  }
  return false;
}
