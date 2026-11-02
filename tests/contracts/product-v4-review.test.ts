import { expect, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { assertProductV4ReviewCardinality, computeProductV4SectionSemanticHash, validateProductV4ReviewContext } from "@/lib/bundle/product-v4-review";
import { claimProductReviewSnapshot } from "@/lib/bundle/product-review-snapshot";
import { PEDAGOGIC_CRITERION_IDS, QUALITY_POLICY_VERSION } from "@/lib/materials/quality-policy";

const hash = "a".repeat(64);
const article = { sections: [{ id: "section", blocks: [{ id: "block", parts: [{ id: "ref", kind: "visual_ref", visualId: "graph" }] }] }], visuals: [{ id: "graph", title: "Current graph" }, { id: "unbound", title: "Other graph" }] } as unknown as Parameters<typeof computeProductV4SectionSemanticHash>[0];
const valid = () => ({ article, importId: "import", checksum: hash, fingerprint: hash, review: { decision: "approved", expectedRevision: hash, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: hash, verificationPlanHash: hash, verificationReceiptSignature: hash, sectionDecisions: [{ sectionId: "section", semanticHash: computeProductV4SectionSemanticHash(article, "section"), decision: "approved" as const }], criteria: PEDAGOGIC_CRITERION_IDS.map(criterionId => ({ criterionId, status: "met" as const, contentAnchors: [{ targetType: "section" as const, targetId: "section" }], reason: "Reviewed current content" })) }, verification: { ready: true, planHash: hash, importId: "import", receiptSignature: hash } });

test("V4 review cannot silently certify multiple articles or diktats", () => {
  // Cardinality validation only reads productType, so these intentionally partial records isolate it.
  const products = [{ productType: "article" }, { productType: "article" }] as unknown as Parameters<typeof assertProductV4ReviewCardinality>[0];
  expect(() => assertProductV4ReviewCardinality(products)).toThrow("SINGLE_ARTICLE_REQUIRED");
  expect(() => assertProductV4ReviewCardinality([{ productType: "article" }, { productType: "diktat" }, { productType: "diktat" }] as unknown as Parameters<typeof assertProductV4ReviewCardinality>[0])).toThrow("SINGLE_ARTICLE_REQUIRED");
});

test("V4 requires explicit current decisions for every section and all criteria", () => {
  expect(validateProductV4ReviewContext(valid())).toHaveLength(1);
  for (const mutate of [
    (input: ReturnType<typeof valid>) => { input.review.sectionDecisions = []; },
    (input: ReturnType<typeof valid>) => { input.review.sectionDecisions[0].semanticHash = "b".repeat(64); },
    (input: ReturnType<typeof valid>) => { input.review.expectedRevision = "4"; },
    (input: ReturnType<typeof valid>) => { input.verification.ready = false; },
    (input: ReturnType<typeof valid>) => { input.verification.importId = "foreign"; },
    (input: ReturnType<typeof valid>) => { input.review.criteria = input.review.criteria.slice(1); },
    (input: ReturnType<typeof valid>) => { input.review.sectionDecisions.push({ ...input.review.sectionDecisions[0] }); },
    (input: ReturnType<typeof valid>) => { input.review.contentFingerprint = "b".repeat(64); },
    (input: ReturnType<typeof valid>) => { input.review.verificationPlanHash = "b".repeat(64); },
    (input: ReturnType<typeof valid>) => { input.verification.receiptSignature = "b".repeat(64); },
  ]) { const input = valid(); mutate(input); expect(() => validateProductV4ReviewContext(input)).toThrow(); }
  const rejected = valid(); rejected.review.decision = "changes_requested"; rejected.verification.ready = false;
  expect(validateProductV4ReviewContext(rejected)).toHaveLength(1);
});

test("section semantic hashes include bound visual closure but ignore unrelated registry entries", () => {
  const previous = computeProductV4SectionSemanticHash(article, "section");
  const unrelated = structuredClone(article); (unrelated.visuals![1] as unknown as { title: string }).title = "Changed unrelated";
  expect(computeProductV4SectionSemanticHash(unrelated, "section")).toBe(previous);
  const bound = structuredClone(article); (bound.visuals![0] as unknown as { title: string }).title = "Changed bound";
  expect(computeProductV4SectionSemanticHash(bound, "section")).not.toBe(previous);
});

test("review snapshot CAS rejects concurrent publication, replacement, and evidence mutation", async () => {
  const { client, testDb } = await createPostgresTestDb();
  const connection = testDb as unknown as Parameters<typeof claimProductReviewSnapshot>[0];
  const row = { id: "import", status: "draft", checksum: hash, sourceUriOrKey: "bundle.zip", validationReport: { valid: true } } as Parameters<typeof claimProductReviewSnapshot>[1];
  const reset = async () => {
    await testDb.delete(schema.imporBundle);
    await testDb.insert(schema.imporBundle).values({ ...row, bundleId: "bundle", bundleType: "product", requestedBy: "reviewer", updatedAt: new Date(0) });
  };
  try {
    await testDb.insert(schema.user).values({ id: "reviewer", name: "Reviewer", email: "reviewer@example.test" });
    await testDb.insert(schema.pengguna).values({ id: "reviewer" });
    await reset(); await claimProductReviewSnapshot(connection, row, new Date(1));
    for (const mutation of [
      { status: "published" as const },
      { checksum: "changed" },
      { sourceUriOrKey: "replacement.zip" },
      { validationReport: {} },
    ]) {
      await reset(); await testDb.update(schema.imporBundle).set(mutation).where(eq(schema.imporBundle.id, row.id));
      await expect(claimProductReviewSnapshot(connection, row, new Date(2))).rejects.toThrow("STALE_CONTEXT");
      const [actual] = await testDb.select({ status: schema.imporBundle.status }).from(schema.imporBundle);
      expect(actual).toEqual({ status: "status" in mutation ? "published" : "draft" });
    }
    const [actual] = await testDb.select({ status: schema.imporBundle.status }).from(schema.imporBundle);
    expect(actual).toEqual({ status: "draft" });
  } finally { await client.close(); }
});
