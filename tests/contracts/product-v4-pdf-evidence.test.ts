import { expect, test } from "bun:test";
import { deriveProductV4PdfEvidence } from "@/lib/compute/product-v4-pdf-evidence";
import { recordProductV4VerificationReport, runProductV4Verification } from "@/lib/bundle/product-v4-verification";
import { fixture, hash, authority, attemptId } from "../fixtures/product-learning/pdf-verification-receipt";

test("promotes the exact verified PDF artifact with existing lineage/profile metadata", async () => {
  const input = await fixture();
  const rows = deriveProductV4PdfEvidence(input);
  expect(rows).toHaveLength(1);
  expect(rows[0].productId).toBe("diktat");
  expect(rows[0].articleHash).toBe(hash);
  expect(rows[0].pageCount).toBe(1);
  expect(rows[0].storageKey).toContain(`/artifact-${attemptId}-`);
  expect(rows[0].storageKey!.endsWith(".pdf")).toBe(true);
});

test("rejects stale attempts, untrusted reports, failed checks, wrong targets and changed bytes", async () => {
  const input = await fixture();
  expect(() => deriveProductV4PdfEvidence({ ...input, attemptId: "00000000-0000-4000-8000-000000000002" })).toThrow("STALE");
  const local = recordProductV4VerificationReport(input.plan, input.checks, authority);
  expect(() => deriveProductV4PdfEvidence({ ...input, receipt: local })).toThrow("VERIFICATION_REQUIRED");
  const failed = await runProductV4Verification(input.plan, authority, async (required) => ({ ...input.checks.find((check) => check.checkId === required.id)!, status: "FAIL" }));
  expect(() => deriveProductV4PdfEvidence({ ...input, receipt: failed })).toThrow("VERIFICATION_REQUIRED");
  const wrongTarget = structuredClone(input.plan);
  wrongTarget.requirements.find((check) => check.artifactType === "application/pdf")!.target = "other-diktat";
  expect(() => deriveProductV4PdfEvidence({ ...input, plan: wrongTarget })).toThrow();
  const changed = new Map(input.artifactBytes);
  const pdfId = input.receipt.results.flatMap((result) => result.artifacts).find((artifact) => artifact.mediaType === "application/pdf")!.id;
  changed.set(pdfId, Buffer.from("%PDF-1.7 changed"));
  expect(() => deriveProductV4PdfEvidence({ ...input, artifactBytes: changed })).toThrow("ARTIFACT_MISMATCH");
});

test("rejects PDF page counts that disagree with captured pages", async () => {
  const input = await fixture();
  const receipt = await runProductV4Verification(input.plan, authority, async (required) => {
    const original = input.checks.find((check) => check.checkId === required.id)!;
    return { ...original, ...(required.artifactType === "application/pdf" ? { pageCount: 2 } : {}) };
  });
  expect(() => deriveProductV4PdfEvidence({ ...input, receipt })).toThrow("VERIFICATION_REQUIRED");
});
