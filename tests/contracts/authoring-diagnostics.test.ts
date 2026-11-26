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
