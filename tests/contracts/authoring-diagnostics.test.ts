import { expect, test } from "bun:test";
import { z } from "zod";
import { authoringFailureDiagnostics, AUTHORING_DIAGNOSTIC_LIMIT } from "@/lib/authoring/diagnostics";

test("authoring recovery separates stale content, access and transient runtime without authorizing blind retry", () => {
  expect(authoringFailureDiagnostics(new Error("REVISION_STALE_CONTEXT"))).toMatchObject({ category: "conflict", retryable: false, nextAction: { kind: "read_context", tool: "authoring.get_edit_context" } });
  expect(authoringFailureDiagnostics(new Error("AUTHORING_MCP_SCOPE_REQUIRED:authoring:stage"))).toMatchObject({ category: "permission", retryable: false, nextAction: { kind: "request_access" } });
  expect(authoringFailureDiagnostics(new Error("AUTHORING_MCP_TOKEN_EXPIRED"))).toMatchObject({ category: "permission", retryable: false, nextAction: { kind: "refresh_bootstrap" } });
  expect(authoringFailureDiagnostics(new Error("AUTHORING_MCP_LEGACY_RUN_RESTART_REQUIRED"))).toMatchObject({ category: "permission", retryable: false, nextAction: { kind: "refresh_bootstrap" } });
  expect(authoringFailureDiagnostics(new Error("PRODUCT_V4_BROWSER_TIMEOUT"))).toMatchObject({ category: "runtime", retryable: true, nextAction: { kind: "check_status" } });
  expect(authoringFailureDiagnostics(new Error("PRODUCT_V4_RUNTIME_ASSET_UNAVAILABLE"))).toMatchObject({ category: "runtime", retryable: false, nextAction: { kind: "inspect_runtime" } });
  expect(authoringFailureDiagnostics(new Error("PRODUCT_V4_VERIFICATION_JOB_NOT_FOUND"))).toMatchObject({ category: "runtime", retryable: false, nextAction: { kind: "request_verification", tool: "authoring.verify_product_bundle" }, diagnostics: [] });
});

test("already bounded validation errors retain the original issue count", () => {
  const error = Object.assign(new Error("REVISION_ARTIFACT_INVALID"), { issues: [{ code: "ARTICLE_INVALID", path: "parts", message: "Invalid part." }], issueCount: 120 });
  expect(authoringFailureDiagnostics(error)).toMatchObject({ diagnosticCount: 120, diagnosticsTruncated: true });
  expect(authoringFailureDiagnostics({ ...error, issueCount: -1 })).toMatchObject({ diagnosticCount: 1, diagnosticsTruncated: false });
});

test("PDF generation recovery preserves purpose without routing legacy gates through V4", () => {
  for (const code of ["PDF_V4_RECEIPT_MISMATCH", "PRODUCT_V4_PDF_EVIDENCE_REQUIRED"]) {
    const result = authoringFailureDiagnostics(new Error(code));
    expect(result).toMatchObject({ category: "runtime", retryable: false, nextAction: { kind: "request_verification", tool: "authoring.verify_product_bundle", purpose: "pdf" } });
    expect(result.nextAction.instruction).toContain("Keep authored text unchanged");
  }
  const legacyOrV4 = authoringFailureDiagnostics(new Error("PDF_EVIDENCE_MISSING"));
  expect(legacyOrV4).toMatchObject({ category: "runtime", nextAction: { kind: "read_context", tool: "authoring.get_import" } });
  expect(legacyOrV4.nextAction).not.toHaveProperty("purpose");
  expect(legacyOrV4.nextAction.instruction).toContain("purpose:'pdf'");
  expect(legacyOrV4.nextAction.instruction).toContain("legacy V2/V3");
  expect(authoringFailureDiagnostics(new Error("PRODUCT_V4_PDF_NOT_REQUIRED"))).toMatchObject({ nextAction: { kind: "request_verification", purpose: "logic" } });
  expect(authoringFailureDiagnostics(new Error("PRODUCT_V4_PDF_EVIDENCE_PERSIST_FAILED"))).toMatchObject({ category: "runtime", nextAction: { kind: "inspect_runtime", purpose: "pdf" } });
  // A genuine print-size finding still requires an authored content change.
  expect(authoringFailureDiagnostics(new Error("PDF_PAGE_BUDGET_EXCEEDED"))).toMatchObject({ category: "content", nextAction: { kind: "edit_content" } });
});

test("publication wrappers expose only safe gate codes and recover missing PDF without prose edits", () => {
  expect(authoringFailureDiagnostics(new Error("PRODUCT_BUNDLE_PUBLICATION_BLOCKED:PDF_V4_RECEIPT_MISMATCH"))).toMatchObject({ blockingCode: "PDF_V4_RECEIPT_MISMATCH", nextAction: { kind: "request_verification", purpose: "pdf" } });
  expect(authoringFailureDiagnostics(new Error("PRODUCT_BUNDLE_PUBLICATION_BLOCKED:PDF_EVIDENCE_MISSING"))).toMatchObject({ blockingCode: "PDF_EVIDENCE_MISSING", nextAction: { kind: "read_context", tool: "authoring.get_import" } });
  const unsafe = authoringFailureDiagnostics(new Error("PRODUCT_BUNDLE_PUBLICATION_BLOCKED:token=private-value"));
  expect(unsafe).toMatchObject({ nextAction: { kind: "read_context", tool: "authoring.get_import" } });
  expect(unsafe).not.toHaveProperty("blockingCode");
  expect(JSON.stringify(unsafe)).not.toContain("private-value");
});

test("verification recovery retains selected logic or PDF context", () => {
  for (const purpose of ["logic", "pdf"] as const) {
    for (const code of ["PRODUCT_V4_VERIFICATION_JOB_NOT_FOUND", "PRODUCT_V4_VERIFICATION_CANCELLED"]) {
      const result = authoringFailureDiagnostics(new Error(code), { purpose });
      expect(result.nextAction).toMatchObject({ kind: "request_verification", purpose });
      expect(result.nextAction.instruction).toContain(`purpose:'${purpose}'`);
    }
  }
  const currentVerification = { contentHash: "a".repeat(64), planHash: "b".repeat(64), purpose: "pdf" };
  const result = authoringFailureDiagnostics(Object.assign(new Error("PRODUCT_V4_VERIFICATION_CONFLICT"), { currentVerification }));
  expect(result.currentVerification).toEqual(currentVerification);
  expect(result.nextAction.instruction).toContain("pdf plan hashes");
  expect(authoringFailureDiagnostics(Object.assign(new Error("PRODUCT_V4_VERIFICATION_CONFLICT"), { currentVerification: { ...currentVerification, purpose: "untrusted" } })).currentVerification).not.toHaveProperty("purpose");
});

test("current verification context exposes only validated hashes and recovery avoids content edits", () => {
  const currentVerification = { contentHash: "a".repeat(64), planHash: "b".repeat(64), status: "not_started", secret: "must-not-leak" };
  const result = authoringFailureDiagnostics(Object.assign(new Error("PRODUCT_V4_VERIFICATION_CONFLICT"), { currentVerification }));
  expect(result).toMatchObject({ currentVerification: { contentHash: currentVerification.contentHash, planHash: currentVerification.planHash, status: "not_started" }, nextAction: { kind: "read_context", tool: "authoring.get_import" } });
  expect(JSON.stringify(result)).not.toContain("must-not-leak");
  expect(authoringFailureDiagnostics(Object.assign(new Error("PRODUCT_V4_VERIFICATION_CONFLICT"), { currentVerification: { ...currentVerification, planHash: "https://private.example/secret" } }))).not.toHaveProperty("currentVerification");
  expect(authoringFailureDiagnostics(new Error("PRODUCT_V4_PRINT_REUSE_CHANGED"))).toMatchObject({ category: "conflict", nextAction: { kind: "refresh_verification", tool: "authoring.patch_revision" } });
  expect(authoringFailureDiagnostics(new Error("PRODUCT_V4_VERIFICATION_CANCELLED"))).toMatchObject({ category: "runtime", nextAction: { kind: "request_verification" } });
});

test("all bounded deterministic findings keep their field paths and quality targets", () => {
  const error = Object.assign(new Error("PRODUCT_DRAFT_INVALID"), { issues: [
    { code: "ARTICLE_PART_ID_DUPLICATE", path: "products[0].sections[1].blocks[0].parts", message: "Part IDs must be unique." },
    { code: "ARTICLE_MATH_INVALID", severity: "warning", target: { targetType: "block", targetId: "block-force" }, reason: "The formula needs an explicit domain.", remediation: "Add the domain beside this formula." },
  ] });
  const result = authoringFailureDiagnostics(error);
  expect(result).toMatchObject({ category: "content", diagnosticCount: 2, diagnosticsTruncated: false });
  expect(result.diagnostics[0]).toMatchObject({ code: "ARTICLE_PART_ID_DUPLICATE", path: "products[0].sections[1].blocks[0].parts", category: "content" });
  expect(result.diagnostics[1]).toMatchObject({ severity: "warning", target: { targetType: "block", targetId: "block-force" }, remediation: "Add the domain beside this formula." });
  const invalid = z.object({ section: z.object({ title: z.string() }) }).safeParse({ section: { title: 3 } });
  if (invalid.success) throw new Error("Expected invalid fixture");
  expect(authoringFailureDiagnostics(invalid.error, { code: "REVISION_INPUT_INVALID" }).diagnostics[0].path).toBe("section.title");
});

test("diagnostics bound findings and redact credentials, provider URLs and storage paths", () => {
  const secret = "very-sensitive-value";
  const raw = new Error(`provider rejected postgres://user:${secret}@host/database`);
  expect(JSON.stringify(authoringFailureDiagnostics(raw))).not.toContain(secret);
  const error = Object.assign(new Error("PRODUCT_DRAFT_INVALID"), { issues: Array.from({ length: AUTHORING_DIAGNOSTIC_LIMIT + 1 }, () => ({ code: "ARTICLE_INVALID", path: ["products", 0, "title"], message: `token=${secret}; https://host.test/private?token=${secret} courses/private/key ${"x".repeat(1000)}` })) });
  const result = authoringFailureDiagnostics(error);
  expect(result.diagnostics).toHaveLength(AUTHORING_DIAGNOSTIC_LIMIT);
  expect(result.diagnosticsTruncated).toBe(true);
  expect(result.diagnosticCount).toBe(AUTHORING_DIAGNOSTIC_LIMIT + 1);
  expect(result.diagnostics.every(issue => issue.reason.length <= 600)).toBe(true);
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(JSON.stringify(result)).not.toContain("courses/private/key");
  expect(result.diagnostics[0].path).toBe("products.0.title");
});
