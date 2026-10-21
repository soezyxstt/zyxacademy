import { PRODUCT_DIKTAT_PRINT_PROFILE } from "@/lib/bundle/product-diktat-pdf";
import { productBundleManifestSchema, productEntitySchema } from "@/lib/bundle/product-validator";
import { deriveProductV4VerificationPlan, runProductV4Verification, type ProductV4ObservedCheck } from "@/lib/bundle/product-v4-verification";
import type { ProductV4VerificationSnapshot } from "@/lib/bundle/product-v4-verification-service";
export const hash = "a".repeat(64);
export const authority = { signingKey: "a-test-only-secret-longer-than-thirty-two-bytes", executorId: "zyx-product-v4-server-runner.v1" };
export const attemptId = "00000000-0000-4000-8000-000000000001";
export async function fixture() {
  const common = { courseId: "course", version: 1, status: "draft", ideaLinks: [{ id: "idea", version: 1, semanticHash: hash, weight: 1 }], sourceRefs: [{ sourceId: "source", version: 1, checksum: hash, excerptIds: ["excerpt"] }], sourceHash: hash, generationHash: hash, creatorId: "creator" };
  const article = productEntitySchema.parse({ ...common, id: "article", productType: "article", schemaVersion: "article.v4", title: "Article", slug: "article" });
  const diktat = productEntitySchema.parse({ ...common, id: "diktat", productType: "diktat", schemaVersion: "diktat.v4", title: "Diktat", contentMarkdown: "Summary", sourceArticleId: "article", sourceArticleVersion: 1, sourceArticleHash: hash });
  const manifest = productBundleManifestSchema.parse({ bundleId: "bundle", bundleType: "product", schemaVersion: "product-bundle.v4", courseId: "course", creatorId: "creator", createdAt: "2026-10-21T00:00:00.000Z", entityFiles: ["products", "dependencies"].map((entityType) => ({ entityType, path: entityType, checksum: hash, stableIds: [] })), bundleChecksum: hash });
  const binding = { importId: "import", courseId: "course", runId: "run", revision: 1, rendererChecksum: hash, dependencyChecksum: hash, contractChecksum: hash, playbookChecksum: hash, fontChecksum: hash, assetChecksum: hash, printProfile: PRODUCT_DIKTAT_PRINT_PROFILE, policyRevision: "v1" };
  const bundle = { manifest, products: [article, diktat], dependencies: [] };
  const plan = deriveProductV4VerificationPlan({ bundle, binding });
  const snapshot: ProductV4VerificationSnapshot = { importId: "import", checksum: hash, sourceUriOrKey: "bundle.zip", bundle, binding, verificationAttemptId: attemptId, verificationPlanHash: plan.planHash };
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const artifactBytes = new Map<string, Uint8Array>();
  const checks: ProductV4ObservedCheck[] = [];
  const receipt = await runProductV4Verification(plan, authority, async (required) => {
    const extension = required.artifactType === "application/pdf" ? "pdf" : required.artifactType === "image/png" ? "png" : "json";
    const id = `artifact-${attemptId}-${required.id}-0.${extension}`;
    const bytes = extension === "pdf" ? Buffer.from("%PDF-1.7\n%%EOF") : extension === "png" ? png : Buffer.from("{}");
    artifactBytes.set(id, bytes);
    const check: ProductV4ObservedCheck = { checkId: required.id, status: "PASS", expected: "Expected result", observed: "Observed result", artifacts: [{ id, bytes, mediaType: required.artifactType, ...(required.layer === "print" && extension === "png" ? { pageNumber: 1 } : {}) }], ...(required.layer === "print" ? { pageCount: 1 } : {}) };
    checks.push(check);
    return check;
  });
  return { snapshot, plan, attemptId, receipt, authority, artifactBytes, checks };
}

