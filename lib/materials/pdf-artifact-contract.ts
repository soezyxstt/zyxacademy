import { z } from "zod";
import type { DiagnosticIssue } from "./quality-policy";

export const pdfArtifactStatusSchema = z.enum(["pending", "ready", "failed", "stale"]);
export type PdfArtifactStatus = z.infer<typeof pdfArtifactStatusSchema>;

export const SAFE_FAILURE_CODES = [
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
] as const;
export const safeFailureCodeSchema = z.enum(SAFE_FAILURE_CODES);
export type SafeFailureCode = z.infer<typeof safeFailureCodeSchema>;

export const pdfArtifactEvidenceSchema = z
  .object({
    id: z.string().trim().min(1),
    imporBundleId: z.string().trim().min(1),
    productId: z.string().trim().min(1),
    articleVersion: z.number().int().positive(),
    articleHash: z.string().regex(/^[a-f0-9]{64}$/i),
    diktatHash: z.string().regex(/^[a-f0-9]{64}$/i),
    rendererVersion: z.string().trim().min(1),
    printProfile: z.string().trim().min(1),
    status: pdfArtifactStatusSchema,
    storageKey: z.string().trim().min(1).optional(),
    pageCount: z.number().int().optional(),
    failureCode: safeFailureCodeSchema.optional(),
    createdAt: z.date().or(z.string().datetime({ offset: true })).optional(),
    updatedAt: z.date().or(z.string().datetime({ offset: true })).optional(),
  })
  .strict()
  .superRefine((evidence, ctx) => {
    if (evidence.status === "ready") {
      if (!evidence.storageKey || !evidence.storageKey.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ready PDF artifact must specify an object storage key",
          path: ["storageKey"],
        });
      }
      if (evidence.pageCount === undefined || evidence.pageCount === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ready PDF artifact must specify pageCount",
          path: ["pageCount"],
        });
      } else if (evidence.pageCount < 2 || evidence.pageCount > 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Ready PDF artifact page count must be between 2 and 4, got ${evidence.pageCount}`,
          path: ["pageCount"],
        });
      }
      if (evidence.failureCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ready PDF artifact cannot have a failureCode",
          path: ["failureCode"],
        });
      }
    }

    if (evidence.status === "failed") {
      if (!evidence.failureCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Failed PDF artifact must have a valid failureCode",
          path: ["failureCode"],
        });
      }
    }

    if (evidence.status === "pending" || evidence.status === "stale") {
      if (evidence.failureCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${evidence.status} PDF artifact cannot specify a failureCode`,
          path: ["failureCode"],
        });
      }
    }
  });
export type PdfArtifactEvidence = z.infer<typeof pdfArtifactEvidenceSchema>;

export function validatePdfArtifactEvidence(
  evidence: PdfArtifactEvidence,
): { valid: boolean; issues: DiagnosticIssue[] } {
  const issues: DiagnosticIssue[] = [];
  const target = { targetType: "pdf" as const, targetId: evidence.productId };

  if (!evidence.rendererVersion.trim()) {
    issues.push({
      code: "PDF_RENDERER_METADATA_MISSING",
      severity: "blocking",
      target,
      reason: "PDF artifact is missing renderer version metadata",
      remediation: "Specify an explicit rendererVersion",
    });
  }

  if (!evidence.printProfile.trim()) {
    issues.push({
      code: "PDF_PROFILE_METADATA_MISSING",
      severity: "blocking",
      target,
      reason: "PDF artifact is missing print profile metadata",
      remediation: "Specify an explicit printProfile (e.g., 'a4_standard')",
    });
  }

  if (evidence.status === "ready") {
    if (!evidence.storageKey || !evidence.storageKey.trim()) {
      issues.push({
        code: "PDF_READY_STORAGE_KEY_MISSING",
        severity: "blocking",
        target,
        reason: "Ready PDF artifact must specify an object storage key",
        remediation: "Upload generated PDF to object storage and record the storage key",
      });
    }

    if (evidence.pageCount === undefined || evidence.pageCount === null) {
      issues.push({
        code: "PDF_PAGE_COUNT_MISSING",
        severity: "blocking",
        target,
        reason: "Ready PDF artifact must specify a verified page count",
        remediation: "Record the measured page count from the rendered PDF",
      });
    } else if (evidence.pageCount < 2 || evidence.pageCount > 4) {
      issues.push({
        code: "PDF_PAGE_COUNT_OUT_OF_BOUNDS",
        severity: "blocking",
        target,
        reason: `Ready PDF artifact has ${evidence.pageCount} pages; required range is 2 to 4 pages`,
        remediation: "Adjust diktat compression or layout to produce exactly 2 to 4 pages per chapter",
      });
    }

    if (evidence.failureCode) {
      issues.push({
        code: "PDF_READY_WITH_FAILURE_CODE",
        severity: "blocking",
        target,
        reason: "Ready PDF artifact cannot retain a failure code",
        remediation: "Clear the failure code when rendering succeeds",
      });
    }
  }

  if (evidence.status === "failed") {
    if (!evidence.failureCode) {
      issues.push({
        code: "PDF_FAILURE_CODE_MISSING",
        severity: "blocking",
        target,
        reason: "Failed PDF artifact must provide a safe diagnostic failure code",
        remediation: "Provide a standard safe failure code describing the rendering error",
      });
    }
  }

  if (evidence.status === "pending" || evidence.status === "stale") {
    if (evidence.failureCode) {
      issues.push({
        code: "PDF_NON_FAILED_WITH_FAILURE_CODE",
        severity: "blocking",
        target,
        reason: `${evidence.status} PDF artifact cannot retain a failure code`,
        remediation: "Remove failure code unless artifact status is failed",
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
