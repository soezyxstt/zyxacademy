import { expect, test } from "bun:test";
import { evaluateProductBundleReviewAndPdfGate } from "@/lib/bundle/product-review-gate";
import { resolveProductV4PdfBinding, selectProductPdfEvidence } from "@/lib/bundle/product-pdf-selection";
import { deriveProductV4PdfEvidence } from "@/lib/compute/product-v4-pdf-evidence";
import type { PdfArtifactEvidence } from "@/lib/materials/pdf-artifact-contract";
import { fixture, hash, attemptId } from "../fixtures/product-learning/pdf-verification-receipt";

const base: PdfArtifactEvidence = {
  id: "pdf-b", imporBundleId: "import", productId: "diktat", articleVersion: 1,
  articleHash: hash, diktatHash: hash, rendererVersion: "renderer", printProfile: "profile-b",
  status: "ready", storageKey: "current.pdf", pageCount: 1,
};
const gateInput = {
  imporBundleId: "import", hasArticle: true, articleId: "article", diktatId: "diktat",
  contentFingerprint: "", articleVersion: 1, articleGenerationHash: hash, diktatGenerationHash: hash,
};

function selected(rows: PdfArtifactEvidence[]) {
  return evaluateProductBundleReviewAndPdfGate({ ...gateInput, pdfEvidenceRows: rows });
}

test("duplicate profiles select the same current-lineage row regardless of query order", () => {
  const wrongArticle = { ...base, id: "old", printProfile: "profile-a", articleHash: "b".repeat(64), storageKey: "wrong.pdf" };
  const currentOtherProfile = { ...base, id: "pdf-a", printProfile: "profile-a", storageKey: "selected.pdf" };
  for (const rows of [[wrongArticle, base, currentOtherProfile], [currentOtherProfile, base, wrongArticle]]) {
    const result = selected(rows);
    expect(result.selectedPdfEvidence?.storageKey).toBe("selected.pdf");
    expect(selectProductPdfEvidence({ rows, imporBundleId: "import", articleId: "article", diktatId: "diktat", articleVersion: 1, articleHash: hash, diktatHash: hash })).toEqual(result.selectedPdfEvidence);
  }
  const pending = { ...base, id: "pending", status: "pending" as const, printProfile: "profile-0" };
  expect(selected([pending, base]).selectedPdfEvidence).toEqual(base);
  expect(selected([pending, wrongArticle]).selectedPdfEvidence).toBeNull();
  const stale = selected([wrongArticle]);
  expect(stale.selectedPdfEvidence).toBeNull();
  expect(stale.issues.map(issue => issue.code)).toContain("PDF_LINEAGE_HASH_MISMATCH");
  expect(selected([{ ...base, articleVersion: 2 }]).selectedPdfEvidence).toBeNull();
});

test("legacy Article-owned fallback is the same selectable row for review and publication", () => {
  const legacy = { ...base, id: "legacy", productId: "article" };
  expect(selected([legacy]).selectedPdfEvidence).toEqual(legacy);
  const staleOwned = { ...base, id: "owned", articleHash: "b".repeat(64) };
  expect(selected([legacy, staleOwned]).selectedPdfEvidence).toBeNull();
  expect(selected([legacy, base]).selectedPdfEvidence).toEqual(base);
  expect(evaluateProductBundleReviewAndPdfGate({ ...gateInput, pdfEvidenceRows: [legacy], v4PdfBinding: null }).selectedPdfEvidence).toBeNull();
});

test("Article-only requires self-lineage and an old Diktat fallback cannot mask pending or failed retries", () => {
  const old = { ...base, id: "historical", productId: "article", diktatHash: "b".repeat(64), printProfile: "a4-self-study-readable-v3" };
  const input = { ...gateInput, diktatId: null, diktatGenerationHash: null };
  expect(evaluateProductBundleReviewAndPdfGate({ ...input, pdfEvidenceRows: [old] }).selectedPdfEvidence).toBeNull();
  expect(selectProductPdfEvidence({ rows: [{ ...old, diktatHash: hash }], articleId: "article" })).toBeNull();
  for (const status of ["pending", "failed", "ready"] as const) {
    const self = { ...old, id: "self", diktatHash: hash, status };
    for (const rows of [[old, self], [self, old]]) expect(evaluateProductBundleReviewAndPdfGate({ ...input, pdfEvidenceRows: rows }).pdfEvidenceStatus).toBe(status);
  }
});

test("V4 accepts only the PDF key, profile and pages from the current attached receipt", async () => {
  const input = await fixture();
  const row = deriveProductV4PdfEvidence(input)[0] as unknown as PdfArtifactEvidence;
  const verification = { plan: input.plan, attemptId, stagingAuditId: "stage-a", receipt: input.receipt, evaluation: { ready: true } };
  const attachment = { planHash: input.plan.planHash, attemptId, receiptSignature: input.receipt.signature };
  const report = { productV4Verification: { runId: input.plan.binding.runId, stagingAuditId: "stage-a", planHash: input.plan.planHash, attemptId }, productV4PdfEvidence: attachment };
  const resolve = (validationReport: Record<string, unknown>) => resolveProductV4PdfBinding({ importId: "import", diktatId: "diktat", validationReport, verification });
  const binding = resolve(report);
  expect(binding?.storageKey).toBe(row.storageKey);
  const evaluate = (rows: PdfArtifactEvidence[], v4PdfBinding = binding) => evaluateProductBundleReviewAndPdfGate({ ...gateInput, pdfEvidenceRows: rows, v4PdfBinding });
  const old = { ...row, id: "old", printProfile: "a-old-profile", storageKey: row.storageKey!.replace(attemptId, "00000000-0000-4000-8000-000000000002") };
  expect(evaluate([old]).selectedPdfEvidence).toBeNull();
  expect(evaluate([old, row]).selectedPdfEvidence?.storageKey).toBe(binding?.storageKey);
  expect(evaluate([{ ...row, pageCount: 2 }]).selectedPdfEvidence).toBeNull();
  for (const changed of [
    { ...attachment, planHash: "b".repeat(64) },
    { ...attachment, attemptId: "00000000-0000-4000-8000-000000000002" },
    { ...attachment, receiptSignature: "b".repeat(64) },
  ]) {
    expect(resolve({ ...report, productV4PdfEvidence: changed })).toBeNull();
    expect(evaluate([row], resolve({ ...report, productV4PdfEvidence: changed })).selectedPdfEvidence).toBeNull();
  }
  expect(resolve({ ...report, productV4PdfEvidence: undefined })).toBeNull();
  expect(resolve({ ...report, productV4Verification: { ...report.productV4Verification, stagingAuditId: "stage-b" } })).toBeNull();
});

test("admin status selects the requested Diktat and refuses stale or unbound evidence", async () => {
  const { selectDiktatPdfStatus } = await import("@/lib/bundle/product-diktat-evidence");
  const bundle = { manifest: { schemaVersion: "product-bundle.v3" }, products: [
    { id: "article", productType: "article", version: 1, generationHash: hash },
    { id: "diktat", productType: "diktat", sourceArticleId: "article", generationHash: hash },
    { id: "second", productType: "diktat", sourceArticleId: "article", generationHash: "c".repeat(64) },
  ] } as any;
  const row = (value: Partial<PdfArtifactEvidence>) => ({ ...base, createdAt: new Date(), updatedAt: new Date(), failureCode: null, ...value }) as any;
  const legacy = row({ id: "legacy", productId: "article" });
  const second = row({ id: "second", productId: "second", diktatHash: "c".repeat(64), storageKey: "second.pdf" });
  const choose = (productId: string, rows: any[], selectedBundle = bundle) => selectDiktatPdfStatus({ importId: "import", revision: hash, bundle: selectedBundle, productId, rows, validationReport: {}, verification: null });
  expect(choose("diktat", [legacy, second])).toMatchObject({ productId: "diktat", status: "ready", evidence: { id: "legacy" } });
  expect(choose("second", [legacy, second])).toMatchObject({ productId: "second", status: "ready", evidence: { id: "second" } });
  expect(choose("diktat", [legacy, row({ id: "owned-stale", articleHash: "e".repeat(64) })]).status).toBe("stale");
  expect(choose("diktat", [legacy], { ...bundle, manifest: { schemaVersion: "product-bundle.v4" } }).status).toBe("missing");
  expect(choose("diktat", [row({})], { ...bundle, manifest: { schemaVersion: "product-bundle.v4" } }).status).toBe("stale");
  expect(() => choose("unknown", [legacy, second])).toThrow("PRODUCT_DIKTAT_NOT_FOUND");
});

test("current legacy print profile exposes queued, failed and ready retries instead of an older profile", () => {
  const older = { ...base, id: "a-old", printProfile: "a-old-profile" };
  for (const status of ["pending", "failed", "ready"] as const) {
    const current = { ...base, id: "z-current", printProfile: "a4-self-study-readable-v3", status, storageKey: status === "ready" ? "new.pdf" : undefined, pageCount: status === "ready" ? 1 : undefined };
    for (const rows of [[older, current], [current, older]]) {
      expect(selectProductPdfEvidence({ rows, imporBundleId: "import", articleId: "article", diktatId: "diktat", articleVersion: 1, articleHash: hash, diktatHash: hash })?.id).toBe(current.id);
      const result = selected(rows);
      expect(result.pdfEvidenceStatus).toBe(status);
      expect(result.selectedPdfEvidence?.id).toBe(status === "ready" ? current.id : undefined);
    }
  }
  expect(selected([older]).selectedPdfEvidence?.id).toBe(older.id);
  expect(selected([older, { ...base, printProfile: "a4-self-study-readable-v3", articleHash: "e".repeat(64) }]).selectedPdfEvidence?.id).toBe(older.id);
});
