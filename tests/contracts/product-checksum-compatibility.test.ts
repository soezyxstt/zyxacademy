import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { zipSync } from "fflate";
import { computeProductBundleChecksum, validateProductBundle, type ProductBundleManifest } from "@/lib/bundle/product-validator";

type Profile = "product-bundle.v2" | "product-bundle.v3" | "product-bundle.v4";
const encode = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value)}\n`);
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

// Golden hashes use the serializer at c30b6b2, before 8f899a2 removed
// undefined fields. The tests do not regenerate that legacy hash algorithm.
const checksums = {
  "product-bundle.v2": { legacy: "a06882417658252ad232b72bd46e6d52376981617a459f51c0720076c98bded3", current: "b3417265a63dc488963095916084930d46c95aa4e0eb2dcfffd8e7a2bf8cdb96" },
  "product-bundle.v3": { legacy: "5a9a163b08acd2ee6c19d9e79722e8ec6bde096de0a80966b50dbb66d3299da7", current: "d4f633804315e63e1c2cb1baaebc3973bfdc38a18058c31fa48ca0cddc86d8d7" },
  "product-bundle.v4": { legacy: "2a46d1e459a5fb31b3e2039b8afdda5133526f4985a1033f26b0746ad4b2118d", current: "9cf832129b428b0570e476054c042b64e177739537289ff143d5c44450f81e94" },
} as const;

function fixture(schemaVersion: Profile, format: "legacy" | "current" = "legacy") {
  const common = {
    courseId: "course-legacy-checksum", chapterId: "chapter-legacy-checksum", version: 1, status: "draft",
    ideaLinks: [{ id: "idea-limit", version: 1, semanticHash: "a".repeat(64), weight: 1, role: "primary" }],
    sourceRefs: [{ sourceId: "source-limit", version: 1, checksum: "b".repeat(64), excerptIds: ["excerpt-limit"] }],
    schemaVersion: "1.0", sourceHash: "b".repeat(64), generationHash: "a".repeat(64), creatorId: "creator-legacy-checksum",
  };
  const products = [
    { ...common, id: "legacy-set", productType: "flashcard_set", title: "Limit", cards: ["legacy-card"] },
    { ...common, id: "legacy-card", productType: "flashcard", front: "Apa syarat limit dua sisi ada?", back: "Limit kiri dan kanan harus ada dan bernilai sama.", atomic: true },
  ];
  const files = new Map([
    ["entities/products.json", encode(products)],
    ["entities/dependencies.json", encode([])],
  ]);
  const manifest: ProductBundleManifest = {
    bundleId: "legacy-checksum-fixture", bundleType: "product", schemaVersion, courseId: common.courseId,
    entityFiles: [
      { path: "entities/products.json", entityType: "products", checksum: sha(files.get("entities/products.json")!), stableIds: products.map(product => product.id) },
      { path: "entities/dependencies.json", entityType: "dependencies", checksum: sha(files.get("entities/dependencies.json")!), stableIds: [] },
    ],
    creatorId: common.creatorId, createdAt: "2026-08-31T00:00:00.000Z", conflicts: [], bundleChecksum: checksums[schemaVersion][format],
  };
  files.set("manifest.json", encode(manifest));
  return { files, manifest, products };
}

function validate(files: Map<string, Uint8Array>) {
  return validateProductBundle(zipSync(Object.fromEntries(files)));
}

function expectFailure(files: Map<string, Uint8Array>, code: string) {
  const result = validate(files);
  expect(result.success).toBe(false);
  if (!result.success) expect(result.issues.map(issue => issue.code)).toContain(code);
}

describe("historical Product Bundle checksums", () => {
  for (const profile of ["product-bundle.v2", "product-bundle.v3"] as const) {
    test(`${profile} reads the historical hash without changing the archive or identity`, () => {
      const { files, manifest } = fixture(profile);
      const original = [...files].map(([path, bytes]) => [path, sha(bytes)]);
      expect(computeProductBundleChecksum(manifest, files)).toBe(checksums[profile].current);
      const result = validate(files);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.checksum).toBe(checksums[profile].legacy);
      expect(result.data.manifest.bundleChecksum).toBe(checksums[profile].legacy);
      expect([...result.data.files].map(([path, bytes]) => [path, sha(bytes)])).toEqual(original);
    });

    test(`${profile} rejects changed entity bytes before checksum compatibility`, () => {
      const { files, products } = fixture(profile);
      products[0].title = "Isi berubah";
      files.set("entities/products.json", encode(products));
      expectFailure(files, "PRODUCT_ENTITY_CHECKSUM_MISMATCH");
    });

    test(`${profile} rejects changed content even if its declared file hash is refreshed`, () => {
      const { files, manifest, products } = fixture(profile);
      products[0].title = "Isi berubah";
      const bytes = encode(products);
      files.set("entities/products.json", bytes);
      manifest.entityFiles[0].checksum = sha(bytes);
      files.set("manifest.json", encode(manifest));
      expectFailure(files, "PRODUCT_BUNDLE_CHECKSUM_MISMATCH");
    });

    test(`${profile} rejects changed manifest fields, extra files and arbitrary hashes`, () => {
      const changed = fixture(profile);
      changed.manifest.createdAt = "2026-09-01T00:00:00.000Z";
      changed.files.set("manifest.json", encode(changed.manifest));
      expectFailure(changed.files, "PRODUCT_BUNDLE_CHECKSUM_MISMATCH");
      const extra = fixture(profile);
      extra.files.set("notes.txt", new TextEncoder().encode("new bytes"));
      expectFailure(extra.files, "PRODUCT_BUNDLE_CHECKSUM_MISMATCH");
      const invalid = fixture(profile);
      invalid.manifest.bundleChecksum = "0".repeat(64);
      invalid.files.set("manifest.json", encode(invalid.manifest));
      expectFailure(invalid.files, "PRODUCT_BUNDLE_CHECKSUM_MISMATCH");
    });
  }

  for (const profile of ["product-bundle.v2", "product-bundle.v3", "product-bundle.v4"] as const) {
    test(`${profile} keeps the current writer checksum and accepts current archives`, () => {
      const { files, manifest } = fixture(profile, "current");
      expect(computeProductBundleChecksum(manifest, files)).toBe(checksums[profile].current);
      const result = validate(files);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.checksum).toBe(checksums[profile].current);
    });
  }

  test("V4 never accepts the historical V2/V3 checksum format", () => {
    expectFailure(fixture("product-bundle.v4").files, "PRODUCT_BUNDLE_CHECKSUM_MISMATCH");
  });
});
