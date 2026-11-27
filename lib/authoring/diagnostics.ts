import type { DiagnosticIssue } from "@/lib/materials/quality-policy";

export type AuthoringFailureCategory = "content" | "conflict" | "runtime" | "permission";
export type AuthoringNextAction = {
  kind: "edit_content" | "read_context" | "refresh_bootstrap" | "request_access" | "check_status" | "inspect_runtime" | "request_verification" | "refresh_verification";
  tool?: "authoring.get_edit_context" | "authoring.get_import" | "authoring.patch_revision" | "workflow.get_playbook" | "authoring.verify_product_bundle";
  purpose?: "logic" | "pdf";
  instruction: string;
};
export type AuthoringDiagnostic = DiagnosticIssue & { category: AuthoringFailureCategory; retryable: boolean; path?: string };
export const AUTHORING_DIAGNOSTIC_LIMIT = 50;

const targetTypes = new Set(["document", "section", "block", "visual", "rubric", "pdf", "dependency", "idea"]);
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const safeCode = (value: unknown, fallback: string) => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{1,119}$/.test(value) ? value : fallback;
const purposeValue = (value: unknown): "logic" | "pdf" | undefined => value === "logic" || value === "pdf" ? value : undefined;
const pdfGenerationCodes = new Set([
  "PDF_EVIDENCE_MISSING", "PDF_EVIDENCE_PENDING", "PDF_EVIDENCE_FAILED", "PDF_EVIDENCE_STALE", "PDF_EVIDENCE_NOT_READY",
  "PDF_LINEAGE_HASH_MISMATCH", "PDF_LINEAGE_VERSION_MISMATCH", "PDF_RENDERER_METADATA_MISSING", "PDF_PROFILE_METADATA_MISSING",
  "PDF_STORAGE_KEY_MISSING", "PDF_PAGE_COUNT_MISSING", "PDF_FAILURE_CODE_UNEXPECTED", "PDF_FAILURE_CODE_MISSING", "PDF_REQUEST_PROCESSING",
]);
const v4PdfGenerationCodes = new Set([
  "PDF_V4_RECEIPT_MISMATCH", "PRODUCT_V4_PDF_EVIDENCE_REQUIRED", "PRODUCT_V4_PDF_ARTIFACT_REQUIRED",
  "PRODUCT_V4_PDF_VERIFICATION_REQUIRED", "PRODUCT_V4_PDF_LINEAGE_MISMATCH", "PRODUCT_V4_PDF_EVIDENCE_STALE", "PRODUCT_V4_PDF_EVIDENCE_CONFLICT",
]);

/** Only structured issue text is exposed. Raw provider/SQL Error messages never are. */
function safeText(value: unknown, limit = 600): string {
  if (typeof value !== "string") return "";
  return value.slice(0, 4096)
    .replace(/(?:https?:\/\/|postgres(?:ql)?:\/\/)[^\s"']+/gi, "[url-redacted]")
    .replace(/(?:overhaul|courses|uploads|blog|forms|pka|media|zyx-attachments)\/[^\s"']+/gi, "[storage-key-redacted]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g, "[token-redacted]")
    .replace(/\b(?:sk-|gh[pousr]_)[A-Za-z0-9_-]{8,}/g, "[credential-redacted]")
    .replace(/\b(password|secret|token|credential|authorization|api[_-]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[redacted]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .slice(0, limit);
}

function recovery(code: string, selectedPurpose?: "logic" | "pdf"): { category: AuthoringFailureCategory; retryable: boolean; nextAction: AuthoringNextAction } {
  const purpose = selectedPurpose ?? "logic";
  if (code === "PRODUCT_V4_VERIFICATION_JOB_NOT_FOUND") return { category: "runtime", retryable: false, nextAction: { kind: "request_verification", tool: "authoring.verify_product_bundle", purpose, instruction: `No attempt is attached to the current ${purpose} plan. Keep the content unchanged and request verification with purpose:'${purpose}' and the current content and plan hashes. Polling alone cannot start it.` } };
  if (code === "PRODUCT_V4_VERIFICATION_CONFLICT") return { category: "conflict", retryable: false, nextAction: { kind: "read_context", tool: "authoring.get_import", instruction: `Read the current import readiness and compare its content and ${purpose} plan hashes. Review any changed content before requesting verification for that exact purpose and plan.` } };
  if (code === "PRODUCT_V4_PRINT_REUSE_CHANGED") return { category: "conflict", retryable: false, nextAction: { kind: "refresh_verification", tool: "authoring.patch_revision", instruction: "The preserved PDF proof no longer matches the current runtime or artifacts. Create a new revision with refreshPrintEvidence:true and operations:[] so the server can advance its evidence version. Keep authored text unchanged, then run logic verification and semantic review. Request purpose:'pdf' for the final Diktat artifacts before publication." } };
  if (code === "PRODUCT_V4_VERIFICATION_CANCELLED") return { category: "runtime", retryable: false, nextAction: { kind: "request_verification", tool: "authoring.verify_product_bundle", purpose, instruction: `The prior ${purpose} attempt was revoked. To resume, request verification with purpose:'${purpose}', the current content and plan hashes, and retry:true.` } };
  if (code === "PRODUCT_V4_PDF_NOT_REQUIRED") return { category: "runtime", retryable: false, nextAction: { kind: "request_verification", tool: "authoring.verify_product_bundle", purpose: "logic", instruction: "This V4 bundle has no Diktat, so no PDF generation is required. Use purpose:'logic' and the current logic plan, then complete semantic review. Do not retry PDF generation or edit content to create a PDF target." } };
  if (["PRODUCT_V4_PDF_EVIDENCE_PERSIST_FAILED", "PRODUCT_V4_PDF_ARTIFACT_MISMATCH", "PRODUCT_V4_PDF_EVIDENCE_UNAVAILABLE"].includes(code)) return { category: "runtime", retryable: false, nextAction: { kind: "inspect_runtime", purpose: "pdf", instruction: "Inspect PDF artifact persistence for this exact PDF attempt. Keep the content unchanged and check its current status before retrying purpose:'pdf'." } };
  if (v4PdfGenerationCodes.has(code)) return { category: "runtime", retryable: false, nextAction: { kind: "request_verification", tool: "authoring.verify_product_bundle", purpose: "pdf", instruction: "Read the current PDF plan, then request final Diktat generation with purpose:'pdf' and its exact content and plan hashes. A logic receipt cannot supply the missing canonical PDF proof. Keep authored text unchanged." } };
  if (pdfGenerationCodes.has(code)) return { category: "runtime", retryable: false, nextAction: { kind: "read_context", tool: "authoring.get_import", instruction: "Read the current import profile and PDF readiness. For V4, request or recover final Diktat generation with purpose:'pdf' and its exact plan; use the existing PDF operation for legacy V2/V3. Keep authored text unchanged and check any active attempt before retrying." } };
  if (code === "PRODUCT_BUNDLE_PUBLICATION_BLOCKED") return { category: "conflict", retryable: false, nextAction: { kind: "read_context", tool: "authoring.get_import", instruction: "Read the current publication blockers and follow each gate's recovery. Complete missing verification, semantic review or final PDF generation for the matching profile; do not edit content merely to restart a gate." } };
  if (/BOOTSTRAP|LEGACY_RUN_RESTART|TOKEN_(?:INVALID|EXPIRED)|SESSION/.test(code)) return { category: "permission", retryable: false, nextAction: { kind: "refresh_bootstrap", tool: "workflow.get_playbook", instruction: "Read the matching stage playbook with the current account and session before retrying." } };
  if (/SCOPE_REQUIRED|NOT_IN_SCOPE|ADMIN_REQUIRED|FORBIDDEN|ACCESS_DENIED|UNAUTHORIZED|CONSENT/.test(code)) return { category: "permission", retryable: false, nextAction: { kind: "request_access", instruction: "Use the permitted scope and account. Request the missing grant when required; do not alter content to bypass access." } };
  if (!/_ID_CONFLICT$/.test(code) && /STALE|CONFLICT|PLAN_CHANGED|REVISION_NOT_FOUND/.test(code)) return { category: "conflict", retryable: false, nextAction: { kind: "read_context", tool: "authoring.get_edit_context", instruction: "Read current context and reconcile changes. Keep the observed revision; never substitute a newer checksum without review." } };
  if (/TIMEOUT|RATE_LIMIT|TEMPORAR|ECONNRESET|ETIMEDOUT/.test(code)) return { category: "runtime", retryable: true, nextAction: { kind: "check_status", instruction: "Check whether the previous operation completed before retrying the same request and identity. Keep the content unchanged." } };
  if (/RUNTIME|BROWSER|CHROMIUM|STORAGE|UNAVAILABLE|CONFIGURATION|REQUEST_FAILED|EXECUTION_FAILED|SERVICE_REJECTED/.test(code)) return { category: "runtime", retryable: false, nextAction: { kind: "inspect_runtime", instruction: "Inspect the service or local runtime failure. Do not rewrite learning content to fix infrastructure." } };
  return { category: "content", retryable: false, nextAction: { kind: "edit_content", instruction: "Correct the reported fields in the same draft, then validate again. Read full context before semantic review." } };
}

function issuePath(value: unknown): string | undefined {
  if (typeof value === "string") return safeText(value, 512) || undefined;
  if (!Array.isArray(value)) return undefined;
  const parts = value.slice(0, 16).flatMap(part => typeof part === "string" ? [safeText(part, 128)] : typeof part === "number" && Number.isInteger(part) ? [String(part)] : []);
  return parts.length ? parts.join(".").slice(0, 512) : undefined;
}

/** Additive MCP fields: callers retain their existing error code and OAuth challenge. */
export function authoringFailureDiagnostics(error: unknown, options: { code?: string; purpose?: "logic" | "pdf" } = {}) {
  const raw = record(error);
  const messageCode = error instanceof Error ? error.message.split(/[:\n]/, 1)[0] : undefined;
  const code = safeCode(options.code, safeCode(messageCode, "AUTHORING_REQUEST_FAILED"));
  const candidate = record(raw?.currentVerification);
  const purpose = options.purpose ?? purposeValue(candidate?.purpose);
  // Publication wraps one gate code; only its bounded identifier affects recovery.
  const blockingCode = code === "PRODUCT_BUNDLE_PUBLICATION_BLOCKED" && error instanceof Error
    ? safeCode(error.message.split(/[:\n]/)[1], "") || undefined : undefined;
  const top = recovery(blockingCode && (pdfGenerationCodes.has(blockingCode) || v4PdfGenerationCodes.has(blockingCode)) ? blockingCode : code, purpose);
  const issues = Array.isArray(raw?.issues) ? raw.issues : [];
  const diagnosticCount = typeof raw?.issueCount === "number" && Number.isSafeInteger(raw.issueCount) && raw.issueCount >= issues.length ? raw.issueCount : issues.length;
  const diagnostics: AuthoringDiagnostic[] = issues.slice(0, AUTHORING_DIAGNOSTIC_LIMIT).map(value => {
    const issue = record(value) ?? {};
    const target = record(issue.target);
    const path = issuePath(issue.path);
    const issueCode = safeCode(issue.code, code);
    const details = recovery(issueCode, purpose);
    return {
      code: issueCode,
      category: details.category,
      retryable: details.retryable,
      severity: issue.severity === "warning" ? "warning" : "blocking",
      target: {
        targetType: targetTypes.has(String(target?.targetType)) ? target!.targetType as DiagnosticIssue["target"]["targetType"] : "document",
        targetId: safeText(target?.targetId ?? path ?? "", 256),
      },
      ...(path ? { path } : {}),
      reason: safeText(issue.reason ?? issue.message) || "The field does not satisfy the authoring contract.",
      remediation: safeText(issue.remediation) || details.nextAction.instruction,
    };
  });
  const currentVerification = candidate && [candidate.contentHash, candidate.planHash].every(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))
    ? { contentHash: String(candidate.contentHash), planHash: String(candidate.planHash),
      ...(purposeValue(candidate.purpose) ? { purpose: purposeValue(candidate.purpose) } : {}),
      ...(typeof candidate.status === "string" && ["not_started", "pending", "running", "complete", "failed", "stale", "cancelled"].includes(candidate.status) ? { status: candidate.status } : {}) } : undefined;
  return { ...top, ...(blockingCode ? { blockingCode } : {}), ...(currentVerification ? { currentVerification } : {}), diagnostics, diagnosticsTruncated: diagnosticCount > diagnostics.length, diagnosticCount };
}
