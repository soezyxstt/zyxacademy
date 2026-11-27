import { expect, test } from "bun:test";
import { productEntitySchema, productBundleManifestSchema } from "@/lib/bundle/product-validator";
import { deriveProductV4VerificationPlan, evaluateProductV4Verification, runProductV4Verification } from "@/lib/bundle/product-v4-verification";
import { computeProductV4SectionSemanticHash, validateProductV4ReviewContext } from "@/lib/bundle/product-v4-review";
import { PEDAGOGIC_CRITERION_IDS, QUALITY_POLICY_VERSION } from "@/lib/materials/quality-policy";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { claimProductReviewSnapshot } from "@/lib/bundle/product-review-snapshot";

const hash = "a".repeat(64);
const sourceRefs = [{ sourceId: "source", version: 1, checksum: hash, excerptIds: ["excerpt"] }];
const article = productEntitySchema.parse({ id: "article", productType: "article", courseId: "course", version: 1, status: "draft", schemaVersion: "article.v4", title: "Article", slug: "article", creatorId: "creator", sourceHash: hash, generationHash: hash, sourceRefs, ideaLinks: [{ id: "idea", version: 1, semanticHash: hash, weight: 1 }], sections: [{ id: "section", kind: "topic", title: "Topic", slug: "topic", orderIndex: 0, learningObjective: "Understand the topic.", ideaIds: ["idea"], sourceRefs, blocks: [{ id: "block", blockType: "explanation", orderIndex: 0, contentMarkdown: "Current explanation.", ideaIds: ["idea"], sourceRefs, parts: [{ id: "text", kind: "markdown", markdown: "Current explanation." }] }] }] });
if (article.productType !== "article") throw new Error("Article required");
const manifest = productBundleManifestSchema.parse({ bundleId: "bundle", bundleType: "product", schemaVersion: "product-bundle.v4", courseId: "course", creatorId: "creator", createdAt: "2026-10-21T00:00:00Z", entityFiles: ["products", "dependencies"].map(entityType => ({ entityType, path: `${entityType}.json`, checksum: hash, stableIds: [] })), bundleChecksum: hash });
const binding = { importId: "import", courseId: "course", runId: "run", revision: 1, logicChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash, assetChecksum: hash, policyRevision: "product-v4-verification.v2" };
const authority = { signingKey: "test-only-signing-authority-32-bytes", executorId: "test-application-owned-executor" };
const bundle = { manifest, products: [article], dependencies: [] };

test("trusted current evidence flows into explicit section approval; stale plans or receipt identities cannot", async () => {
  const plan = deriveProductV4VerificationPlan({ bundle, binding });
  // The executor is simulated here; this test does not claim browser or PDF verification.
  const receipt = await runProductV4Verification(plan, authority, async requirement => {
    expect(["structure", "model"]).toContain(requirement.layer);
    expect(requirement.artifactType).toBe("application/json");
    return { checkId: requirement.id, status: "PASS", expected: "Current content", observed: "Test executor observed current content", artifacts: [{ id: requirement.id, mediaType: requirement.artifactType, bytes: new TextEncoder().encode("{}") }] };
  });
  const evaluation = evaluateProductV4Verification(plan, [receipt], authority);
  expect(evaluation.ready).toBe(true);
  const review = { decision: "approved", expectedRevision: hash, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: hash, verificationPlanHash: plan.planHash, verificationReceiptSignature: receipt.signature, sectionDecisions: [{ sectionId: "section", semanticHash: computeProductV4SectionSemanticHash(article, "section"), decision: "approved" as const }], criteria: PEDAGOGIC_CRITERION_IDS.map(criterionId => ({ criterionId, status: "met" as const, contentAnchors: [{ targetType: "section" as const, targetId: "section" }], reason: "Reviewed the exact current section." })) };
  const context = { articles: [article], importId: "import", checksum: hash, fingerprint: hash, review, verification: { purpose: "logic" as const, ready: evaluation.ready, planHash: plan.planHash, importId: "import", receiptSignature: receipt.signature } };
  expect(validateProductV4ReviewContext(context)).toHaveLength(1);
  const revised = structuredClone(bundle);
  if (revised.products[0].productType !== "article") throw new Error("Article required");
  revised.products[0].sections[0].blocks[0].parts![0] = { id: "text", kind: "markdown", markdown: "Changed explanation." };
  const current = deriveProductV4VerificationPlan({ bundle: revised, binding });
  const stale = evaluateProductV4Verification(current, [receipt], authority);
  expect(stale.ready).toBe(false);
  expect(() => validateProductV4ReviewContext({ ...context, verification: { ...context.verification, ready: stale.ready, planHash: current.planHash } })).toThrow("VERIFICATION_REQUIRED");
  expect(() => validateProductV4ReviewContext({ ...context, verification: { ...context.verification, receiptSignature: "b".repeat(64) } })).toThrow("VERIFICATION_REQUIRED");
  expect(() => validateProductV4ReviewContext({ ...context, verification: { ...context.verification, purpose: "pdf" } })).toThrow("VERIFICATION_REQUIRED");
  expect(() => validateProductV4ReviewContext({ ...context, articles: [revised.products[0]] })).toThrow("SECTION_STALE");
});

test("V4 logic review tolerates only concurrent PDF refs; publication and legacy snapshots stay strict", async () => {
  const { client, testDb } = await createPostgresTestDb();
  const connection = testDb as unknown as Parameters<typeof claimProductReviewSnapshot>[0];
  const snapshot = { id: "approval-race", version: 4, status: "draft" as const, checksum: hash, sourceUriOrKey: "bundle.zip", validationReport: { valid: true, productV4Verification: { runId: "run", stagingAuditId: "stage", planHash: hash, attemptId: "11111111-1111-4111-8111-111111111111" }, revisionLineage: { rootImportId: "root" } } };
  const reset = async (version = 4) => {
    await testDb.delete(schema.imporBundle);
    await testDb.insert(schema.imporBundle).values({ ...snapshot, version, bundleId: "bundle", bundleType: "product", requestedBy: "reviewer" });
  };
  const pdf = { productV4PdfGeneration: { planHash: "b".repeat(64), attemptId: "22222222-2222-4222-8222-222222222222" }, productV4PdfEvidence: { receiptSignature: "c".repeat(64) } };
  const setReport = async (report: Record<string, unknown>) => testDb.update(schema.imporBundle).set({ validationReport: report }).where(eq(schema.imporBundle.id, snapshot.id));
  try {
    await testDb.insert(schema.user).values({ id: "reviewer", name: "Reviewer", email: "approval-race@example.test" });
    await testDb.insert(schema.pengguna).values({ id: "reviewer" });
    await reset();
    await setReport({ ...snapshot.validationReport, ...pdf });
    await claimProductReviewSnapshot(connection, snapshot, new Date(), { purpose: "logic" });
    expect((await testDb.select().from(schema.imporBundle))[0].validationReport).toEqual({ ...snapshot.validationReport, ...pdf });
    await expect(claimProductReviewSnapshot(connection, snapshot, new Date())).rejects.toThrow("STALE_CONTEXT");

    for (const mutation of [
      { valid: false },
      { unrelatedReportChange: true },
      { revisionLineage: { rootImportId: "other-root" } },
      ...["runId", "stagingAuditId", "planHash", "attemptId"].map(key => ({ productV4Verification: { ...snapshot.validationReport.productV4Verification, [key]: "changed" } })),
    ]) {
      await reset();
      await setReport({ ...snapshot.validationReport, ...pdf, ...mutation });
      await expect(claimProductReviewSnapshot(connection, snapshot, new Date(), { purpose: "logic" })).rejects.toThrow("STALE_CONTEXT");
    }
    for (const mutation of [{ checksum: "b".repeat(64) }, { sourceUriOrKey: "replacement.zip" }, { version: 3 }, { status: "published" as const }]) {
      await reset();
      await testDb.update(schema.imporBundle).set(mutation).where(eq(schema.imporBundle.id, snapshot.id));
      await expect(claimProductReviewSnapshot(connection, snapshot, new Date(), { purpose: "logic" })).rejects.toThrow("STALE_CONTEXT");
    }
    for (const version of [2, 3]) {
      await reset(version);
      await setReport({ ...snapshot.validationReport, ...pdf });
      await expect(claimProductReviewSnapshot(connection, { ...snapshot, version }, new Date())).rejects.toThrow("STALE_CONTEXT");
      await expect(claimProductReviewSnapshot(connection, { ...snapshot, version }, new Date(), { purpose: "logic" })).rejects.toThrow("STALE_CONTEXT");
    }
  } finally { await client.close(); }
});
