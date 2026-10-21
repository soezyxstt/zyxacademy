import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { assertProductV4ReviewCardinality, computeProductV4SectionSemanticHash, validateProductV4ReviewContext } from "@/lib/bundle/product-v4-review";
import { claimProductReviewSnapshot } from "@/lib/bundle/product-review-snapshot";
import { PEDAGOGIC_CRITERION_IDS, QUALITY_POLICY_VERSION } from "@/lib/materials/quality-policy";

const hash = "a".repeat(64);
const article = { sections: [{ id: "section", blocks: [{ id: "block", parts: [{ id: "ref", kind: "visual_ref", visualId: "graph" }] }] }], visuals: [{ id: "graph", title: "Current graph" }, { id: "unbound", title: "Other graph" }] } as unknown as Parameters<typeof computeProductV4SectionSemanticHash>[0];
const valid = () => ({ article, importId: "import", checksum: hash, fingerprint: hash, review: { decision: "approved", expectedRevision: hash, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: hash, verificationPlanHash: hash, verificationReceiptSignature: hash, sectionDecisions: [{ sectionId: "section", semanticHash: computeProductV4SectionSemanticHash(article, "section"), decision: "approved" as const }], criteria: PEDAGOGIC_CRITERION_IDS.map(criterionId => ({ criterionId, status: "met" as const, contentAnchors: [{ targetType: "section" as const, targetId: "section" }], reason: "Reviewed current content" })) }, verification: { ready: true, planHash: hash, importId: "import", receiptSignature: hash } });

test("V4 review cannot silently certify multiple articles or diktats", () => {
  const products = [{ productType: "article" }, { productType: "article" }] as Parameters<typeof assertProductV4ReviewCardinality>[0];
  expect(() => assertProductV4ReviewCardinality(products)).toThrow("SINGLE_ARTICLE_REQUIRED");
  expect(() => assertProductV4ReviewCardinality([{ productType: "article" }, { productType: "diktat" }, { productType: "diktat" }] as Parameters<typeof assertProductV4ReviewCardinality>[0])).toThrow("SINGLE_ARTICLE_REQUIRED");
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
  const unrelated = structuredClone(article); unrelated.visuals![1].title = "Changed unrelated";
  expect(computeProductV4SectionSemanticHash(unrelated, "section")).toBe(previous);
  const bound = structuredClone(article); bound.visuals![0].title = "Changed bound";
  expect(computeProductV4SectionSemanticHash(bound, "section")).not.toBe(previous);
});

test("review snapshot CAS rejects concurrent publication, replacement, and evidence mutation", async () => {
  const sqlite = new Database(":memory:");
  sqlite.exec("CREATE TABLE impor_bundle (id TEXT PRIMARY KEY, status TEXT, checksum TEXT, source_uri_or_key TEXT, validation_report TEXT, updated_at INTEGER)");
  const connection = drizzle(sqlite) as unknown as Parameters<typeof claimProductReviewSnapshot>[0];
  const row = { id: "import", status: "draft", checksum: hash, sourceUriOrKey: "bundle.zip", validationReport: { valid: true } } as Parameters<typeof claimProductReviewSnapshot>[1];
  const reset = () => { sqlite.exec("DELETE FROM impor_bundle"); sqlite.query("INSERT INTO impor_bundle VALUES (?, ?, ?, ?, ?, ?)").run(row.id, row.status, row.checksum, row.sourceUriOrKey, JSON.stringify(row.validationReport), 0); };
  try {
    reset(); await claimProductReviewSnapshot(connection, row, new Date(1));
    for (const mutation of ["status = 'published'", "checksum = 'changed'", "source_uri_or_key = 'replacement.zip'", "validation_report = '{}'"]) {
      reset(); sqlite.exec(`UPDATE impor_bundle SET ${mutation}`);
      await expect(claimProductReviewSnapshot(connection, row, new Date(2))).rejects.toThrow("STALE_CONTEXT");
      expect(sqlite.query("SELECT status FROM impor_bundle").get()).toEqual({ status: mutation.startsWith("status") ? "published" : "draft" });
    }
    expect(sqlite.query("SELECT status FROM impor_bundle").get()).toEqual({ status: "draft" });
  } finally { sqlite.close(); }
});

