import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { scanAuthoringContext, assertAuthoringContextSafe } from "@/lib/authoring/redaction";

describe("Plan 007 authoring redaction boundary", () => {
  test("finds nested secrets, murid fields, signed URLs, and holdout canaries", () => {
    const fixture = JSON.parse(readFileSync("tests/fixtures/authoring-context/adversarial.json", "utf8")) as unknown;
    const findings = scanAuthoringContext(fixture);
    expect(findings.some((finding) => finding.code === "FORBIDDEN_FIELD" && finding.path.includes("studentEmail"))).toBe(true);
    expect(findings.some((finding) => finding.code === "FORBIDDEN_VALUE" && finding.path.includes("apiKey"))).toBe(true);
    expect(findings.some((finding) => finding.code === "SIGNED_URL")).toBe(true);
    expect(findings.some((finding) => finding.code === "FORBIDDEN_VALUE" && finding.path.includes("questionSnapshot"))).toBe(true);
  });

  test("fails closed when a pack projection contains a forbidden value", () => {
    expect(() => assertAuthoringContextSafe({ safe: "ok", nested: { secret: "SECRET_CANARY" } })).toThrow("AUTHORING_CONTEXT_REDACTION_FAILED");
  });
});
