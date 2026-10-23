import { readFileSync } from "node:fs";
import { zipSync } from "fflate";
import { computeIdeaBundleChecksum, type IdeaBundleManifest } from "@/lib/bundle/idea-bundle-v2";
import { computeProductBundleChecksum, type ProductBundleManifest } from "@/lib/bundle/product-validator";
import { sha256 } from "@/lib/authoring/transfer/contracts";

export function ideaTransferFixture(): Uint8Array {
  const paths = ["manifest.json", "sources/kinematika.md", "entities/source-materials.json", "entities/source-chunks.json", "entities/ideas.json", "entities/provenance.json", "entities/relations.json"];
  const files = new Map(paths.map(path => [path, new Uint8Array(readFileSync(`tests/fixtures/bundles/idea-v2/${path}`))]));
  const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json"))) as IdeaBundleManifest;
  manifest.schemaVersion = "idea-bundle.v3";
  const sections = [{ id: "section-motion", courseId: manifest.courseId, chapterId: "chapter-kinematics", stableKey: "course-physics:motion:section", title: "Kecepatan", slug: "kecepatan", orderIndex: 0,
    learningObjective: "Menjelaskan kecepatan", primaryIdeaIds: ["idea-velocity"], supportingIdeaIds: [], sourceChunkIds: ["chunk-motion-1"] }];
  files.set("entities/learning-sections.json", new TextEncoder().encode(JSON.stringify(sections)));
  manifest.entityFiles.push({ path: "entities/learning-sections.json", entityType: "learning_sections", checksum: sha256(files.get("entities/learning-sections.json")!), stableIds: ["section-motion"] });
  for (const entity of manifest.entityFiles) entity.checksum = sha256(files.get(entity.path)!);
  manifest.bundleChecksum = computeIdeaBundleChecksum(manifest, files);
  files.set("manifest.json", new TextEncoder().encode(JSON.stringify(manifest)));
  return zipSync(Object.fromEntries(files));
}
export function productTransferFixture(version: "v3" | "v4" = "v3"): Uint8Array {
  const common = { courseId: "course-physics", chapterId: "chapter-kinematics", version: 1, status: "draft", schemaVersion: "1.0", sourceHash: "b".repeat(64), generationHash: "c".repeat(64), creatorId: "creator-1",
    ideaLinks: [{ id: "idea-velocity", version: 1, semanticHash: "a".repeat(64), weight: 1, role: "primary" }],
    sourceRefs: [{ sourceId: "source-motion", version: 1, checksum: "0fd6c09372721f38ecadf7d9494dde1e2699d9de379e116d817701f5af4599fc", excerptIds: ["chunk-motion-1"] }] };
  const products = [{ ...common, productType: "flashcard_set", id: "set-motion", title: "Kecepatan", cards: ["card-motion"] },
    { ...common, productType: "flashcard", id: "card-motion", setId: "set-motion", front: "Apa yang dimaksud kecepatan?", back: "Perubahan posisi terhadap waktu.", atomic: true }];
  const files = new Map([["entities/products.json", new TextEncoder().encode(JSON.stringify(products))], ["entities/dependencies.json", new TextEncoder().encode("[]")]]);
  const base = { bundleId: `transfer-motion-${version}`, bundleType: "product" as const, schemaVersion: `product-bundle.${version}` as const, courseId: "course-physics", creatorId: "creator-1", createdAt: "2026-10-23T00:00:00.000Z", conflicts: [],
    entityFiles: [{ path: "entities/products.json", entityType: "products" as const, checksum: sha256(files.get("entities/products.json")!), stableIds: products.map(p => p.id) },
      { path: "entities/dependencies.json", entityType: "dependencies" as const, checksum: sha256(files.get("entities/dependencies.json")!), stableIds: [] }] };
  const manifest: ProductBundleManifest = { ...base, bundleChecksum: computeProductBundleChecksum(base, files) };
  files.set("manifest.json", new TextEncoder().encode(JSON.stringify(manifest)));
  return zipSync(Object.fromEntries(files));
}
