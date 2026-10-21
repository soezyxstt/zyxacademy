import { expect, test } from "bun:test";
import { evaluateProductBundleQualityPolicy } from "@/lib/bundle/product-review-gate";
import { productBundleManifestSchema } from "@/lib/bundle/product-validator";

test("V4 publication restriction preserves deterministic draft validity", async () => {
  const manifest = productBundleManifestSchema.parse({
    bundleId: "pilot", bundleType: "product", schemaVersion: "product-bundle.v4", courseId: "course",
    entityFiles: ["products", "dependencies"].map((entityType) => ({ path: `${entityType}.json`, entityType, checksum: "a".repeat(64), stableIds: [] })),
    creatorId: "creator", curatorId: "curator", createdAt: "2026-10-21T00:00:00.000Z", conflicts: [], bundleChecksum: "b".repeat(64),
  });
  const pilot = await evaluateProductBundleQualityPolicy({ products: [], manifest });
  expect(pilot.valid).toBe(true);
  expect(pilot.publicationReady).toBe(false);
  expect(pilot.issues.some((issue) => issue.code === "PRODUCT_V4_VERIFICATION_REQUIRED")).toBe(true);
  const legacy = await evaluateProductBundleQualityPolicy({ products: [], manifest: { ...manifest, schemaVersion: "product-bundle.v3" } });
  expect(legacy.publicationReady).toBe(true);
});
