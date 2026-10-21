import { expect, test } from "bun:test";
import { productEntitySchema, productBundleManifestSchema } from "@/lib/bundle/product-validator";
import { deriveProductV4VerificationPlan, evaluateProductV4Verification, runProductV4Verification } from "@/lib/bundle/product-v4-verification";
import { computeProductV4SectionSemanticHash, validateProductV4ReviewContext } from "@/lib/bundle/product-v4-review";
import { PEDAGOGIC_CRITERION_IDS, QUALITY_POLICY_VERSION } from "@/lib/materials/quality-policy";

const hash = "a".repeat(64);
const sourceRefs = [{ sourceId: "source", version: 1, checksum: hash, excerptIds: ["excerpt"] }];
const article = productEntitySchema.parse({ id: "article", productType: "article", courseId: "course", version: 1, status: "draft", schemaVersion: "article.v4", title: "Article", slug: "article", creatorId: "creator", sourceHash: hash, generationHash: hash, sourceRefs, ideaLinks: [{ id: "idea", version: 1, semanticHash: hash, weight: 1 }], sections: [{ id: "section", kind: "topic", title: "Topic", slug: "topic", orderIndex: 0, learningObjective: "Understand the topic.", ideaIds: ["idea"], sourceRefs, blocks: [{ id: "block", blockType: "explanation", orderIndex: 0, contentMarkdown: "Current explanation.", ideaIds: ["idea"], sourceRefs, parts: [{ id: "text", kind: "markdown", markdown: "Current explanation." }] }] }] });
if (article.productType !== "article") throw new Error("Article required");
const manifest = productBundleManifestSchema.parse({ bundleId: "bundle", bundleType: "product", schemaVersion: "product-bundle.v4", courseId: "course", creatorId: "creator", createdAt: "2026-10-21T00:00:00Z", entityFiles: ["products", "dependencies"].map(entityType => ({ entityType, path: `${entityType}.json`, checksum: hash, stableIds: [] })), bundleChecksum: hash });
const binding = { importId: "import", courseId: "course", runId: "run", revision: 1, rendererChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash, fontChecksum: hash, assetChecksum: hash, printProfile: "a4", policyRevision: "product-v4-verification.v1" };
const authority = { signingKey: "test-only-signing-authority-32-bytes", executorId: "test-application-owned-executor" };
const bundle = { manifest, products: [article], dependencies: [] };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");

test("trusted current evidence flows into explicit section approval; stale plans or receipt identities cannot", async () => {
  const plan = deriveProductV4VerificationPlan({ bundle, binding });
  // The executor is simulated here; this test does not claim browser or PDF verification.
  const receipt = await runProductV4Verification(plan, authority, async requirement => ({ checkId: requirement.id, status: "PASS", expected: "Current content", observed: "Test executor observed current content", artifacts: [{ id: requirement.id, mediaType: requirement.artifactType, bytes: requirement.artifactType === "image/png" ? png : new TextEncoder().encode("{}") }] }));
  const evaluation = evaluateProductV4Verification(plan, [receipt], authority);
  expect(evaluation.ready).toBe(true);
  const review = { decision: "approved", expectedRevision: hash, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: hash, verificationPlanHash: plan.planHash, verificationReceiptSignature: receipt.signature, sectionDecisions: [{ sectionId: "section", semanticHash: computeProductV4SectionSemanticHash(article, "section"), decision: "approved" as const }], criteria: PEDAGOGIC_CRITERION_IDS.map(criterionId => ({ criterionId, status: "met" as const, contentAnchors: [{ targetType: "section" as const, targetId: "section" }], reason: "Reviewed the exact current section." })) };
  const context = { article, importId: "import", checksum: hash, fingerprint: hash, review, verification: { ready: evaluation.ready, planHash: plan.planHash, importId: "import", receiptSignature: receipt.signature } };
  expect(validateProductV4ReviewContext(context)).toHaveLength(1);
  const revised = structuredClone(bundle);
  if (revised.products[0].productType !== "article") throw new Error("Article required");
  revised.products[0].sections[0].blocks[0].parts![0] = { id: "text", kind: "markdown", markdown: "Changed explanation." };
  const current = deriveProductV4VerificationPlan({ bundle: revised, binding });
  const stale = evaluateProductV4Verification(current, [receipt], authority);
  expect(stale.ready).toBe(false);
  expect(() => validateProductV4ReviewContext({ ...context, verification: { ...context.verification, ready: stale.ready, planHash: current.planHash } })).toThrow("VERIFICATION_REQUIRED");
  expect(() => validateProductV4ReviewContext({ ...context, verification: { ...context.verification, receiptSignature: "b".repeat(64) } })).toThrow("VERIFICATION_REQUIRED");
  expect(() => validateProductV4ReviewContext({ ...context, article: revised.products[0] })).toThrow("SECTION_STALE");
});
