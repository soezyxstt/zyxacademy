import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { buildRevisionArtifact, type ValidRevisionProductBundle, type RevisionPatchOperation } from "@/lib/authoring/revision-artifact";
import { computeIdeaBundleChecksum, serializeDeterministically, validateIdeaBundle, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { computeProductBundleChecksum, parseProductBundle, productEntitySchema, type ProductEntity, type ProductDependency } from "@/lib/bundle/product-validator";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";

const encode = (value: unknown) => new TextEncoder().encode(`${serializeDeterministically(value)}\n`);
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const contentHash = (product: ProductEntity) => {
  const { generationHash: _hash, ...content } = product;
  return sha(new TextEncoder().encode(serializeDeterministically(content)));
};

function ideas(): ValidatedIdeaBundle {
  const root = join(process.cwd(), "tests/fixtures/bundles/idea-v2");
  const paths = ["manifest.json", "sources/kinematika.md", "entities/source-materials.json", "entities/source-chunks.json", "entities/ideas.json", "entities/provenance.json", "entities/relations.json"];
  const files = new Map(paths.map(path => [path, new Uint8Array(readFileSync(join(root, path)))]));
  const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")!));
  const first = JSON.parse(new TextDecoder().decode(files.get("entities/ideas.json")!))[0];
  const proof = JSON.parse(new TextDecoder().decode(files.get("entities/provenance.json")!))[0];
  const section = { id: "section-motion", courseId: first.courseId, chapterId: first.chapterId, stableKey: "section-motion", title: "Gerak", slug: "gerak", orderIndex: 0, learningObjective: "Memahami gerak", primaryIdeaIds: [first.id], supportingIdeaIds: [], sourceChunkIds: [proof.sourceChunkId] };
  manifest.schemaVersion = "idea-bundle.v3";
  files.set("entities/learning-sections.json", encode([section]));
  manifest.entityFiles.push({ path: "entities/learning-sections.json", entityType: "learning_sections", checksum: sha(files.get("entities/learning-sections.json")!), stableIds: [section.id] });
  manifest.bundleChecksum = computeIdeaBundleChecksum(manifest, files);
  files.set("manifest.json", encode(manifest));
  const parsed = validateIdeaBundle(files);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
  return parsed.data;
}

function products(profile: "product-bundle.v3" | "product-bundle.v5", entities: ProductEntity[], dependencies: ProductDependency[] = []): ValidRevisionProductBundle {
  const files = new Map([["products.json", encode(entities)], ["dependencies.json", encode(dependencies)]]);
  const manifest = { bundleId: "revision-fixture", bundleType: "product" as const, schemaVersion: profile, courseId: "course", creatorId: "author", createdAt: "2026-11-01T00:00:00.000Z", conflicts: [], entityFiles: [
    { path: "products.json", entityType: "products" as const, checksum: sha(files.get("products.json")!), stableIds: entities.map(value => value.id) },
    { path: "dependencies.json", entityType: "dependencies" as const, checksum: sha(files.get("dependencies.json")!), stableIds: dependencies.map(value => value.id) },
  ] };
  files.set("manifest.json", encode({ ...manifest, bundleChecksum: computeProductBundleChecksum(manifest, files) }));
  const parsed = parseProductBundle(files);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
  return parsed.data;
}

const common = { courseId: "course", chapterId: "chapter", version: 1, status: "draft", schemaVersion: "1.0", sourceHash: "a".repeat(64), generationHash: "b".repeat(64), creatorId: "author", ideaLinks: [{ id: "idea", version: 1, semanticHash: "a".repeat(64), weight: 1, role: "primary" }], sourceRefs: [{ sourceId: "source", version: 1, checksum: "a".repeat(64), excerptIds: ["chunk"] }] };
function cards() {
  return products("product-bundle.v3", [
    productEntitySchema.parse({ ...common, id: "set", productType: "flashcard_set", title: "Kartu", cards: ["card"] }),
    productEntitySchema.parse({ ...common, id: "card", productType: "flashcard", setId: "set", front: "Satu", back: "Dua", atomic: true }),
  ]);
}

function collection(): ValidRevisionProductBundle {
  const part = (id: string, markdown: string) => [{ id, kind: "markdown", markdown }];
  const entity = productEntitySchema.parse({ ...common, id: "collection", productType: "solution_collection", schemaVersion: "solution_collection.v1", title: "Pembahasan", collection: {
    schemaVersion: "solution_collection.v1", productType: "solution_collection", release: "released_learning_content", id: "collection", title: "Pembahasan", course: { id: "course", title: "Mata kuliah" }, chapter: { id: "chapter", title: "Bab" }, items: [{
      id: "item", title: "Jumlah", questionType: "numeric", discipline: "mathematics", template: "calculation", prompt: part("prompt", "Hitung 1 + 1."), options: [], answer: { parts: part("answer", "2"), optionIds: [] }, strategy: part("strategy", "Gunakan penjumlahan."), steps: [{ id: "step", operationMarkdown: "1 + 1 = 2", reasonMarkdown: "Gabungkan kedua satuan." }], verification: part("verification", "2 - 1 = 1"), visuals: [], provenance: { problem: { kind: "original", attribution: "Penulis", sources: [] }, solution: { kind: "original", attribution: "Penulis", sources: [] } },
    }],
  } });
  entity.generationHash = contentHash(entity);
  const dependencies: ProductDependency[] = [
    { id: "idea-edge", upstreamEntityType: "idea", upstreamEntityId: "idea", upstreamVersion: 1, upstreamHash: "a".repeat(64), downstreamEntityType: "solution_collection", downstreamEntityId: entity.id, downstreamVersion: 1, downstreamHash: entity.generationHash, freshness: "UP_TO_DATE" },
    { id: "source-edge", upstreamEntityType: "source_material", upstreamEntityId: "source", upstreamVersion: 1, upstreamHash: "a".repeat(64), downstreamEntityType: "solution_collection", downstreamEntityId: entity.id, downstreamVersion: 1, downstreamHash: entity.generationHash, freshness: "UP_TO_DATE" },
  ];
  return products("product-bundle.v5", [entity], dependencies);
}

test("metadata-only forks preserve all entity bytes, versions and hashes", () => {
  for (const original of [cards(), collection(), buildLocalVerificationFixture().bundle]) {
    const result = buildRevisionArtifact({ kind: "product", original, bundleId: "fork", operations: [] });
    const bundle = result.bundle as ValidRevisionProductBundle;
    expect(bundle.products).toEqual(original.products);
    expect(bundle.files.get(original.manifest.entityFiles[0].path)).toEqual(original.files.get(original.manifest.entityFiles[0].path));
    expect(result.impact.changed).toBe(false);
    expect(bundle.checksum).not.toBe(original.checksum);
  }
  const original = ideas();
  const result = buildRevisionArtifact({ kind: "idea", original, bundleId: "fork", operations: [] });
  expect((result.bundle as ValidatedIdeaBundle).entities).toEqual(original.entities);
  expect(result.impact.changed).toBe(false);
});

test("an exact semantic no-op retains the existing checksum and version", () => {
  const original = cards();
  const result = buildRevisionArtifact({ kind: "product", original, bundleId: original.manifest.bundleId, operations: [{ op: "set", target: { entityType: "flashcard", entityId: "card" }, field: "front", value: "Satu" }] });
  expect((result.bundle as ValidRevisionProductBundle).checksum).toBe(original.checksum);
  expect(result.impact.changed).toBe(false);
});

test("remove-and-add of an existing identity cannot rewrite managed attribution or stable keys", () => {
  const original = ideas();
  const first = original.entities.ideas[0];
  for (const replacement of [{ ...first, stableKey: `${first.stableKey}-forged` }, { ...first, creatorId: "another-admin" }]) {
    expect(() => buildRevisionArtifact({ kind: "idea", original, bundleId: "revision", operations: [
      { op: "remove", target: { entityType: "idea", entityId: first.id } },
      { op: "add", target: { entityType: "idea", entityId: first.id }, value: replacement },
    ] })).toThrow("REVISION_MANAGED_FIELD");
  }
  const productOriginal = cards();
  const product = productOriginal.products[1];
  expect(() => buildRevisionArtifact({ kind: "product", original: productOriginal, bundleId: "revision", operations: [
    { op: "remove", target: { entityType: "flashcard", entityId: product.id } },
    { op: "add", target: { entityType: "flashcard", entityId: product.id }, value: { ...product, curatorId: "another-admin" } },
  ] })).toThrow("REVISION_MANAGED_FIELD");
});

test("dependency-only changes create a downstream revision while preserving its authored content", () => {
  const original = collection();
  const result = buildRevisionArtifact({ kind: "product", original, bundleId: "revision", operations: [{ op: "set", target: { entityType: "dependency", entityId: "idea-edge" }, field: "freshness", value: "STALE" }] });
  expect(result.impact.changed).toBe(true);
  expect(result.impact.changedEntities.some(value => value.entityId === "collection")).toBe(true);
  expect(result.impact.dependentEntityIds).toContain("collection");
  expect(result.impact.reviewInvalidations).toContainEqual({ entityId: "collection", unitIds: [], reason: "DEPENDENCY_CONTEXT_CHANGED" });
  expect((result.bundle as ValidRevisionProductBundle).dependencies.find(edge => edge.id === "idea-edge")?.freshness).toBe("STALE");
  const product = (result.bundle as ValidRevisionProductBundle).products[0];
  expect(product.version).toBe(original.products[0].version + 1);
  if (product.productType !== "solution_collection" || original.products[0].productType !== "solution_collection") throw new Error("FIXTURE_TYPE");
  expect(product.collection).toEqual(original.products[0].collection);
});

test("a V3 product patch changes only its own independent version and leaves the original immutable", () => {
  const original = cards();
  const result = buildRevisionArtifact({ kind: "product", original, bundleId: "revision", operations: [{ op: "set", target: { entityType: "flashcard", entityId: "card" }, field: "front", value: "Berapa satu tambah satu?" }] });
  const revised = result.bundle as ValidRevisionProductBundle;
  expect(revised.products[0]).toEqual(original.products[0]);
  expect(revised.products[1].version).toBe(2);
  expect(original.products[1].version).toBe(1);
  expect(result.impact.unchangedEntityIds).toContain("set");
  expect(result.impact.structureChanged).toBe(false);
});

test("stable-ID fields edit an individual worked step and bind V5 dependencies to the new version", () => {
  const original = collection();
  const result = buildRevisionArtifact({ kind: "product", original, bundleId: "revision", operations: [{ op: "set", target: { entityType: "solution_collection", entityId: "collection", itemId: "item" }, field: "steps[step].reasonMarkdown", value: "Setiap kelompok menyumbang satu satuan." }] });
  const revised = result.bundle as ValidRevisionProductBundle;
  const product = revised.products[0];
  if (product.productType !== "solution_collection") throw new Error("FIXTURE_TYPE");
  expect(product.collection.items[0].steps[0].reasonMarkdown).toBe("Setiap kelompok menyumbang satu satuan.");
  expect(product.version).toBe(2);
  expect(revised.dependencies.every(edge => edge.downstreamHash === product.generationHash && edge.downstreamVersion === 2)).toBe(true);
  expect(result.impact.changedUnits).toContainEqual({ entityId: "collection", unitType: "item", unitId: "item", change: "changed" });
  expect(result.impact.structureChanged).toBe(false);
  expect(result.impact.evidenceInvalidations).toEqual([]);
});

test("collection steps can be added, reordered and removed by stable ID", () => {
  const original = collection();
  const result = buildRevisionArtifact({ kind: "product", original, bundleId: "revision", operations: [
    { op: "add", target: { entityType: "solution_collection", entityId: "collection", itemId: "item" }, field: "steps[new-step]", value: { id: "new-step", operationMarkdown: "Periksa hasil.", reasonMarkdown: "Gunakan operasi invers." } },
    { op: "move", target: { entityType: "solution_collection", entityId: "collection", itemId: "item" }, field: "steps[new-step]", beforeId: "step" },
    { op: "remove", target: { entityType: "solution_collection", entityId: "collection", itemId: "item" }, field: "steps[step]" },
  ] });
  const product = (result.bundle as ValidRevisionProductBundle).products[0];
  if (product.productType !== "solution_collection") throw new Error("FIXTURE_TYPE");
  expect(product.collection.items[0].steps.map(step => step.id)).toEqual(["new-step"]);
});

test("collection title changes synchronize the enclosing identity instead of silently disappearing", () => {
  const result = buildRevisionArtifact({ kind: "product", original: collection(), bundleId: "revision", operations: [{ op: "set", target: { entityType: "solution_collection", entityId: "collection" }, field: "title", value: "Pembahasan baru" }] });
  const product = (result.bundle as ValidRevisionProductBundle).products[0];
  if (product.productType !== "solution_collection") throw new Error("FIXTURE_TYPE");
  expect(product.title).toBe("Pembahasan baru");
  expect(product.collection.title).toBe("Pembahasan baru");
});

test("V4 Article edits explicitly stale a derived Diktat, and authored regeneration closes the recovery loop", () => {
  const original = buildLocalVerificationFixture().bundle;
  const article = original.products.find(product => product.productType === "article")!;
  if (article.productType !== "article") throw new Error("FIXTURE_TYPE");
  const section = article.sections[0], block = section.blocks[0];
  const changed = buildRevisionArtifact({ kind: "product", original, bundleId: "revision", operations: [{ op: "set", target: { entityType: "article", entityId: article.id, sectionId: section.id, blockId: block.id }, field: `parts[${block.id}-prose].markdown`, value: "Penjelasan revisi tentang limit dan toleransi." }] });
  const changedBundle = changed.bundle as ValidRevisionProductBundle;
  expect(changedBundle.dependencies.find(edge => edge.id === "local-lineage")?.freshness).toBe("STALE");
  expect(changed.impact.blockers.some(blocker => blocker.entityId === "local-diktat")).toBe(true);
  const derived = changedBundle.products.find(product => product.productType === "diktat")!;
  if (derived.productType !== "diktat") throw new Error("FIXTURE_TYPE");
  const originalDerived = original.products.find(product => product.productType === "diktat")!;
  expect(derived.contentMarkdown).toBe(originalDerived.productType === "diktat" ? originalDerived.contentMarkdown : "");
  expect(() => buildRevisionArtifact({ kind: "product", original: changedBundle, bundleId: "revision", operations: [{ op: "set", target: { entityType: "dependency", entityId: "local-lineage" }, field: "freshness", value: "UP_TO_DATE" }] })).toThrow("REVISION_DERIVED_CONTENT_UPDATE_REQUIRED");
  const recovered = buildRevisionArtifact({ kind: "product", original: changedBundle, bundleId: "revision", operations: [{ op: "set", target: { entityType: "diktat", entityId: "local-diktat" }, field: "units[local-summary].parts[summary-heading].markdown", value: "## Ringkasan limit yang ditinjau ulang" }] });
  const recoveredBundle = recovered.bundle as ValidRevisionProductBundle;
  expect(recoveredBundle.dependencies.find(edge => edge.id === "local-lineage")?.freshness).toBe("UP_TO_DATE");
  expect(recovered.impact.evidenceInvalidations).toContainEqual({ entityId: "local-diktat", reason: "PRINT_SOURCE_CHANGED" });
  expect(recovered.impact.reviewInvalidations.some(value => value.entityId === "local-diktat")).toBe(true);
});

test("an unrelated card edit advances only the Diktat evidence identity needed for its new PDF", () => {
  const original = buildLocalVerificationFixture().bundle;
  const article = original.products.find(product => product.productType === "article")!;
  const shared = { ...common, courseId: article.courseId, chapterId: article.chapterId, ideaLinks: article.ideaLinks, sourceRefs: article.sourceRefs };
  const withCards = buildRevisionArtifact({ kind: "product", original, bundleId: "with-cards", operations: [
    { op: "add", target: { entityType: "flashcard_set", entityId: "set" }, value: { ...shared, id: "set", productType: "flashcard_set", title: "Kartu", cards: ["card"] } },
    { op: "add", target: { entityType: "flashcard", entityId: "card" }, value: { ...shared, id: "card", productType: "flashcard", setId: "set", front: "Satu", back: "Dua", atomic: true } },
  ] }).bundle as ValidRevisionProductBundle;
  const before = withCards.products.find(product => product.productType === "diktat")!;
  const revised = buildRevisionArtifact({ kind: "product", original: withCards, bundleId: "card-edit", operations: [{ op: "set", target: { entityType: "flashcard", entityId: "card" }, field: "back", value: "Penjelasan jawaban diperbaiki." }] });
  const bundle = revised.bundle as ValidRevisionProductBundle;
  const after = bundle.products.find(product => product.productType === "diktat")!;
  expect(after.version).toBe(before.version + 1);
  if (before.productType !== "diktat" || after.productType !== "diktat") throw new Error("FIXTURE_TYPE");
  expect(after.contentMarkdown).toBe(before.contentMarkdown);
  expect(after.units).toEqual(before.units);
  expect(bundle.products.find(product => product.id === article.id)).toEqual(article);
  expect(bundle.dependencies.find(edge => edge.downstreamEntityId === after.id)?.downstreamVersion).toBe(after.version);
  expect(revised.impact.evidenceInvalidations).toContainEqual({ entityId: after.id, reason: "PRINT_CONTEXT_CHANGED" });
});

test("a V4 block can be added structurally without dropping the archive or original asset bytes", () => {
  const original = buildLocalVerificationFixture().bundle;
  const article = original.products.find(product => product.productType === "article")!;
  if (article.productType !== "article") throw new Error("FIXTURE_TYPE");
  const section = article.sections[0];
  const result = buildRevisionArtifact({ kind: "product", original, bundleId: "revision", operations: [{ op: "add", target: { entityType: "article", entityId: article.id, sectionId: section.id, blockId: "extra-block" }, value: { ...section.blocks[0], id: "extra-block", blockType: "explanation", parts: [{ id: "extra-part", kind: "markdown", markdown: "Penjelasan tambahan." }], contentMarkdown: "", visualIds: [] } }] });
  const revised = (result.bundle as ValidRevisionProductBundle).products.find(product => product.productType === "article")!;
  if (revised.productType !== "article") throw new Error("FIXTURE_TYPE");
  expect(revised.sections[0].blocks.at(-1)?.id).toBe("extra-block");
  expect(result.impact.structureChanged).toBe(true);
  for (const [path, bytes] of original.files) if (!original.manifest.entityFiles.some(file => file.path === path) && path !== "manifest.json") expect(result.bundle.files.get(path)).toEqual(bytes);
});

test("Idea revisions update meaning and retain valid source provenance without changing the source", () => {
  const original = ideas();
  const result = buildRevisionArtifact({ kind: "idea", original, bundleId: "revision", operations: [{ op: "set", target: { entityType: "idea", entityId: original.entities.ideas[0].id }, field: "conciseExplanation", value: "Kecepatan menyatakan perubahan posisi per satuan waktu." }] });
  const revised = result.bundle as ValidatedIdeaBundle;
  expect(revised.entities.ideas[0].version).toBe(2);
  expect(revised.entities.ideas[0].semanticHash).not.toBe(original.entities.ideas[0].semanticHash);
  expect(revised.entities.provenance).toEqual(original.entities.provenance);
  expect(revised.entities.sourceMaterials).toEqual(original.entities.sourceMaterials);
  expect(original.entities.ideas[0].version).toBe(1);
});

test("provenance-only changes invalidate the associated Idea while preserving its meaning hash", () => {
  const original = ideas();
  const result = buildRevisionArtifact({ kind: "idea", original, bundleId: "revision", operations: [{ op: "set", target: { entityType: "provenance", entityId: original.entities.provenance[0].id }, field: "note", value: "Rentang sumber ditinjau kembali." }] });
  const revised = result.bundle as ValidatedIdeaBundle;
  expect(revised.entities.ideas[0].version).toBe(2);
  expect(revised.entities.ideas[0].semanticHash).toBe(original.entities.ideas[0].semanticHash);
  expect(result.impact.provenanceChanged).toBe(true);
});

test("a new Idea, its provenance and section membership are validated as one structural patch", () => {
  const original = ideas(), first = original.entities.ideas[0], proof = original.entities.provenance[0];
  const result = buildRevisionArtifact({ kind: "idea", original, bundleId: "revision", operations: [
    { op: "add", target: { entityType: "idea", entityId: "idea-position" }, value: { ...first, id: "idea-position", stableKey: "position", code: "KIN-POSITION", canonicalStatement: "Posisi menunjukkan letak benda." } },
    { op: "add", target: { entityType: "provenance", entityId: "proof-position" }, value: { ...proof, id: "proof-position", ideaId: "idea-position" } },
    { op: "set", target: { entityType: "learning_section", entityId: "section-motion" }, field: "primaryIdeaIds", value: [first.id, "idea-position"] },
  ] });
  expect((result.bundle as ValidatedIdeaBundle).entities.ideas).toHaveLength(2);
  expect(result.impact.addedEntities.some(value => value.entityId === "idea-position")).toBe(true);
  expect(result.impact.structureChanged).toBe(true);
  expect(() => buildRevisionArtifact({ kind: "idea", original, bundleId: "invalid", operations: [{ op: "remove", target: { entityType: "idea", entityId: first.id } }] })).toThrow("REVISION_ARTIFACT_INVALID");
});

test("restoration rebases content versions without changing a stable identity or old artifact", () => {
  const original = cards();
  const result = buildRevisionArtifact({ kind: "product", original, bundleId: "restored", operations: [], versionOverrides: { card: 8 } });
  const revised = result.bundle as ValidRevisionProductBundle;
  expect(revised.products[1].id).toBe("card");
  expect(revised.products[1].version).toBe(8);
  expect(revised.products[1].generationHash).not.toBe(original.products[1].generationHash);
  expect(original.products[1].version).toBe(1);
  expect(() => buildRevisionArtifact({ kind: "product", original: revised, bundleId: "bad", operations: [], versionOverrides: { card: 1 } })).toThrow("REVISION_VERSION_OVERRIDE_INVALID");
});

test("protected fields, array positions, unsafe objects, invalid references and V2 fail closed", () => {
  const original = collection();
  for (const field of ["generationHash", "collection.course.id", "collection.items.0.title", "collection.items[0].title", "constructor.prototype", "collection.__proto__"]) {
    expect(() => buildRevisionArtifact({ kind: "product", original, bundleId: "invalid", operations: [{ op: "set", target: { entityType: "solution_collection", entityId: "collection" }, field, value: "changed" }] })).toThrow("REVISION_MANAGED_FIELD");
  }
  const unsafe = JSON.parse('{"__proto__":{"polluted":true}}');
  expect(() => buildRevisionArtifact({ kind: "product", original, bundleId: "invalid", operations: [{ op: "set", target: { entityType: "solution_collection", entityId: "collection" }, field: "title", value: unsafe }] })).toThrow("REVISION_UNSAFE_FIELD");
  expect(() => buildRevisionArtifact({ kind: "product", original, bundleId: "invalid", operations: [{ op: "remove", target: { entityType: "solution_collection", entityId: "collection", itemId: "item" } }] })).toThrow("REVISION_ARTIFACT_INVALID");
  const v2 = { ...cards(), manifest: { ...cards().manifest, schemaVersion: "product-bundle.v2" as const } };
  expect(() => buildRevisionArtifact({ kind: "product", original: v2, bundleId: "invalid", operations: [] })).toThrow("REVISION_PROFILE_UNSUPPORTED");
});

test("unknown target IDs and conflicting insertion identities are rejected instead of silently ignored", () => {
  const original = cards();
  const operations: RevisionPatchOperation[] = [{ op: "set", target: { entityType: "flashcard", entityId: "missing" }, field: "front", value: "Changed" }];
  expect(() => buildRevisionArtifact({ kind: "product", original, bundleId: "invalid", operations })).toThrow("REVISION_TARGET_NOT_FOUND");
  expect(() => buildRevisionArtifact({ kind: "product", original, bundleId: "invalid", operations: [{ op: "add", target: { entityType: "flashcard", entityId: "different-id" }, value: original.products[1] }] })).toThrow("REVISION_ID_CONFLICT");
});


test("artifact operation bounds match the advertised 128-operation MCP contract", () => {
  const original = cards();
  const operation: RevisionPatchOperation = { op: "set", target: { entityType: "flashcard", entityId: "card" }, field: "front", value: "Updated front" };
  const operations = Array.from({ length: 128 }, () => operation);
  const result = buildRevisionArtifact({ kind: "product", original, bundleId: "bounded", operations });
  expect(result.impact.changedEntities.map(item => item.entityId)).toEqual(["card"]);
  expect(() => buildRevisionArtifact({ kind: "product", original, bundleId: "too-many", operations: [...operations, operation] })).toThrow("REVISION_INPUT_INVALID");
});

test("an ambiguous logical Product identity cannot be silently rebased", () => {
  const original = cards();
  const card = original.products.find(product => product.productType === "flashcard")!;
  const ambiguous = { ...original, products: [...original.products, { ...card, version: 2 }] };
  expect(() => buildRevisionArtifact({ kind: "product", original: ambiguous, bundleId: "ambiguous", operations: [] })).toThrow("REVISION_AMBIGUOUS_ENTITY_ID");
});
