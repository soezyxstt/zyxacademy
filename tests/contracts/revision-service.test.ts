import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { zipSync } from "fflate";
import * as schema from "@/db/schema";
import { computeIdeaBundleChecksum, validateIdeaBundle, serializeDeterministically } from "@/lib/bundle/idea-bundle-v2";
import { computeProductBundleChecksum, parseProductBundle } from "@/lib/bundle/product-validator";
import { solutionCollectionFixture } from "@/app/visual-fixtures/solution-collection/fixture";
import { solutionItemHash } from "@/lib/solutions/review-contract";
import { createPostgresTestDb } from "../helpers/postgres";

// One isolated PostgreSQL fixture. Storage and job dispatch never leave the process.
const { client, testDb } = await createPostgresTestDb();
const objects = new Map<string, Uint8Array>();
let failRelease = false;
const originalDb = { ...await import("@/db") };
const originalStorage = { ...await import("@/lib/storage") };
const originalDispatch = { ...await import("@/lib/vector-sync-dispatch") };
const wrapped = new Proxy(testDb, { get(target, key) {
  if (key === "transaction") return async (callback: (tx: any) => Promise<unknown>) => target.transaction(async tx => {
    const wrappedTx = new Proxy(tx, { get(inner, property) {
      if (property === "insert") return (table: unknown) => {
        if (failRelease && table === schema.publikasiBundle) throw new Error("INJECTED_RELEASE_FAILURE");
        return inner.insert(table as never);
      };
      const value = Reflect.get(inner, property, inner);
      return typeof value === "function" ? value.bind(inner) : value;
    } });
    return callback(wrappedTx);
  });
  const value = Reflect.get(target, key, target);
  return typeof value === "function" ? value.bind(target) : value;
} });
mock.module("@/db", () => ({ db: wrapped }));
mock.module("@/lib/storage", () => ({ ...originalStorage, storage: {
  download: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw new Error("FIXTURE_OBJECT_MISSING"); return bytes; },
  upload: async (bytes: Uint8Array, _name: string, _mime: string, options: { key: string }) => { objects.set(options.key, bytes); return { key: options.key }; },
} }));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: async () => undefined }));
const service = await import("@/lib/authoring/revision-service");
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
const { publishIdeaBundle, getIdeaRevisionReviewContext, reviewIdeaBundleRevision } = await import("@/lib/bundle/publication");
const { stageProductBundle } = await import("@/lib/bundle/product-staging");
const { publishProductBundle } = await import("@/lib/bundle/product-publication");
const { getSolutionCollectionReviewContext, reviewSolutionCollection } = await import("@/lib/solutions/review");
afterAll(async () => {
  mock.module("@/db", () => originalDb);
  mock.module("@/lib/storage", () => originalStorage);
  mock.module("@/lib/vector-sync-dispatch", () => originalDispatch);
  await client.close();
});
const encode = (value: unknown) => new TextEncoder().encode(`${serializeDeterministically(value)}\n`);
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
function ideaArtifact() {
  const root = join(process.cwd(), "tests/fixtures/bundles/idea-v2");
  const paths = ["manifest.json", "sources/kinematika.md", "entities/source-materials.json", "entities/source-chunks.json", "entities/ideas.json", "entities/provenance.json", "entities/relations.json"];
  const files = new Map(paths.map(path => [path, new Uint8Array(readFileSync(join(root, path)))]));
  const read = (path: string) => JSON.parse(new TextDecoder().decode(files.get(path)!));
  const manifest = read("manifest.json"), first = read("entities/ideas.json")[0], proof = read("entities/provenance.json")[0];
  const section = { id: "section-motion", courseId: first.courseId, chapterId: first.chapterId, stableKey: "section-motion", title: "Gerak", slug: "gerak", orderIndex: 0, learningObjective: "Memahami gerak", primaryIdeaIds: [first.id], supportingIdeaIds: [], sourceChunkIds: [proof.sourceChunkId] };
  manifest.schemaVersion = "idea-bundle.v3";
  files.set("entities/learning-sections.json", encode([section]));
  manifest.entityFiles.push({ path: "entities/learning-sections.json", entityType: "learning_sections", checksum: hash(files.get("entities/learning-sections.json")!), stableIds: [section.id] });
  manifest.bundleChecksum = computeIdeaBundleChecksum(manifest, files);
  files.set("manifest.json", encode(manifest));
  const parsed = validateIdeaBundle(files);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
  return { data: parsed.data, bytes: zipSync(Object.fromEntries(files), { level: 0 }) };
}
const idea = ideaArtifact();
function collectionArtifact(id = "collection") {
  const first = idea.data.entities.ideas[0], source = idea.data.entities.sourceMaterials[0], chunk = idea.data.entities.sourceChunks[0];
  const collection = { ...solutionCollectionFixture, id, course: { id: first.courseId, title: "Fisika" }, chapter: { id: first.chapterId!, title: "Gerak" }, items: solutionCollectionFixture.items.slice(0, 2) };
  const body = { id, productType: "solution_collection", courseId: first.courseId, chapterId: first.chapterId, version: 1, status: "draft", schemaVersion: "solution_collection.v1", title: collection.title, sourceHash: source.checksum, creatorId: "admin", ideaLinks: [{ id: first.id, version: first.version, semanticHash: first.semanticHash, weight: 1, role: "primary" }], sourceRefs: [{ sourceId: source.id, version: source.version, checksum: source.checksum, excerptIds: [chunk.id] }], collection };
  const product = { ...body, generationHash: hash(encode(body).slice(0, -1)) };
  const dependencies = [
    { id: `${id}-idea`, upstreamEntityType: "idea", upstreamEntityId: first.id, upstreamVersion: first.version, upstreamHash: first.semanticHash },
    { id: `${id}-source`, upstreamEntityType: "source_material", upstreamEntityId: source.id, upstreamVersion: source.version, upstreamHash: source.checksum },
  ].map(edge => ({ ...edge, downstreamEntityType: "solution_collection", downstreamEntityId: product.id, downstreamVersion: product.version, downstreamHash: product.generationHash, freshness: "UP_TO_DATE" }));
  const files = new Map([["products.json", encode([product])], ["dependencies.json", encode(dependencies)]]);
  const manifest = { bundleId: `bundle-${id}`, bundleType: "product" as const, schemaVersion: "product-bundle.v5" as const, courseId: first.courseId, creatorId: "admin", createdAt: "2026-11-01T00:00:00Z", conflicts: [], entityFiles: [
    { path: "products.json", entityType: "products" as const, checksum: hash(files.get("products.json")!), stableIds: [id] },
    { path: "dependencies.json", entityType: "dependencies" as const, checksum: hash(files.get("dependencies.json")!), stableIds: dependencies.map(edge => edge.id) },
  ] };
  files.set("manifest.json", encode({ ...manifest, bundleChecksum: computeProductBundleChecksum(manifest, files) }));
  const parsed = parseProductBundle(files);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
  return { data: parsed.data, bytes: zipSync(Object.fromEntries(files), { level: 0 }) };
}
async function approveIdea(importId: string, revision: string) {
  const context = await getIdeaRevisionReviewContext({ importId, reviewerId: "admin", expectedRevision: revision });
  await reviewIdeaBundleRevision({ importId, reviewerId: "admin", expectedRevision: revision, decision: "approved", items: context.ideas.map(value => ({ ideaId: value.id, ideaHash: value.ideaHash!, status: "approved" as const })) });
}
async function approveCollection(importId: string, revision: string) {
  const context = await getSolutionCollectionReviewContext({ importId, reviewerId: "admin", expectedRevision: revision });
  await reviewSolutionCollection({ importId, reviewerId: "admin", expectedRevision: revision, expectedReviewVersion: context.reviewVersion, decision: "approved", items: context.collection.items.map(item => ({ itemId: item.id, itemHash: solutionItemHash(item), correctness: "approved", reasoning: "approved", problemProvenance: "approved", solutionProvenance: "approved", release: "approved" })) });
}
beforeEach(async () => {
  failRelease = false;
  objects.clear();
  await testDb.delete(schema.ketergantunganProduk);
  await client.exec('TRUNCATE TABLE "user", courses, mata_kuliah, peran CASCADE');
  for (const id of ["admin", "creator-1", "curator-1"]) {
    await testDb.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role: "admin" });
    await provisionPenggunaForNewUser({ id, role: "admin" });
  }
  await testDb.insert(schema.courses).values({ id: "legacy-physics", title: "Fisika", category: "Fisika" });
  await testDb.insert(schema.mataKuliah).values({ id: "course-physics", code: "PHY", title: "Fisika", legacyCourseId: "legacy-physics" });
  await testDb.insert(schema.bab).values({ id: "chapter-kinematics", mataKuliahId: "course-physics", code: "KIN", title: "Gerak", orderIndex: 0 });
  objects.set("idea.zip", idea.bytes);
  await testDb.insert(schema.imporBundle).values({ id: "idea-live", bundleId: idea.data.manifest.bundleId, bundleType: "idea", version: 3, checksum: idea.data.canonicalChecksum, courseId: "legacy-physics", sourceUriOrKey: "idea.zip", status: "validated", requestedBy: "admin", validationReport: { valid: true } });
  await approveIdea("idea-live", idea.data.canonicalChecksum);
  await publishIdeaBundle({ importId: "idea-live", publishedBy: "admin", expectedRevision: idea.data.canonicalChecksum });
});

test("Idea forks and stable-ID patches retain live content and immutable history, with exact CAS and explicit approval", async () => {
  const base = { actorId: "admin", kind: "idea" as const, baseImportId: "idea-live", expectedRevision: idea.data.canonicalChecksum };
  const fork = await service.createRevisionDraft(base);
  const first = idea.data.entities.ideas[0];
  expect(fork.status).toBe("validated");
  expect((await testDb.select().from(schema.ide))[0].version).toBe(first.version);
  const operations = [{ op: "set" as const, target: { entityType: "idea", entityId: first.id }, field: "conciseExplanation", value: "Penjelasan baru dengan alasan yang lebih jelas." }];
  const patched = await service.patchRevisionDraft({ actorId: "admin", kind: "idea", importId: fork.importId, expectedRevision: fork.revision, operations });
  expect(patched.importId).not.toBe(fork.importId);
  expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, fork.importId)))[0].status).toBe("withdrawn");
  expect((await testDb.select().from(schema.ide))[0].version).toBe(first.version);
  expect((await service.patchRevisionDraft({ actorId: "admin", kind: "idea", importId: fork.importId, expectedRevision: fork.revision, operations })).importId).toBe(patched.importId);
  await expect(service.patchRevisionDraft({ actorId: "admin", kind: "idea", importId: patched.importId, expectedRevision: fork.revision, operations })).rejects.toThrow("REVISION_STALE_CONTEXT");
  const entry = { importId: patched.importId, expectedRevision: patched.revision };
  expect((await service.planRevisionRelease({ actorId: "admin", entries: [entry] })).publicationReady).toBe(false);
  await approveIdea(patched.importId, patched.revision);
  const plan = await service.planRevisionRelease({ actorId: "admin", entries: [entry] });
  expect(plan.blockers).toEqual([]);
  failRelease = true;
  await expect(service.publishRevisionRelease({ actorId: "admin", entries: [entry], expectedPlanHash: plan.planHash })).rejects.toThrow("INJECTED_RELEASE_FAILURE");
  failRelease = false;
  expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, "idea-live")))[0].status).toBe("published");
  expect((await testDb.select().from(schema.ide))[0].version).toBe(first.version);
  expect((await service.publishRevisionRelease({ actorId: "admin", entries: [entry], expectedPlanHash: plan.planHash })).published).toBe(true);
  expect((await testDb.select().from(schema.ide))[0].version).toBe(first.version + 1);
  expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, "idea-live")))[0].status).toBe("withdrawn");
  expect((await service.publishRevisionRelease({ actorId: "admin", entries: [entry], expectedPlanHash: plan.planHash })).published).toBe(false);
  expect((await service.listRevisionHistory({ actorId: "admin", kind: "idea", ...entry })).revisions).toHaveLength(3);
  const secondFork = await service.createRevisionDraft({ actorId: "admin", kind: "idea", baseImportId: patched.importId, expectedRevision: patched.revision });
  expect(secondFork.draftLineage?.baseImportId).toBe(patched.importId);
  const second = await service.patchRevisionDraft({ actorId: "admin", kind: "idea", importId: secondFork.importId, expectedRevision: secondFork.revision, operations: [{ ...operations[0], value: "Revisi kedua tetap memakai head live yang paling baru." }] });
  await approveIdea(second.importId, second.revision);
  const secondEntries = [{ importId: second.importId, expectedRevision: second.revision }];
  const secondPlan = await service.planRevisionRelease({ actorId: "admin", entries: secondEntries });
  expect(secondPlan.blockers).toEqual([]);
  await service.publishRevisionRelease({ actorId: "admin", entries: secondEntries, expectedPlanHash: secondPlan.planHash });
  expect((await testDb.select().from(schema.ide))[0].version).toBe(first.version + 2);
  const restored = await service.restoreRevisionDraft({ actorId: "admin", kind: "idea", historicalImportId: "idea-live", expectedRevision: idea.data.canonicalChecksum, currentImportId: second.importId, currentRevision: second.revision });
  expect(restored.status).toBe("validated");
  expect((restored.bundle as any).entities.ideas[0].version).toBeGreaterThan(first.version + 2);
  expect((await testDb.select().from(schema.ide))[0].version).toBe(first.version + 2);
});

test("V5 replacements keep exact unchanged item evidence and atomically replace the live collection", async () => {
  const initial = collectionArtifact();
  const staged = await stageProductBundle({ runId: "fixture-run", bundleId: initial.data.manifest.bundleId, courseId: initial.data.manifest.courseId, checksum: initial.data.checksum, bytes: initial.bytes, bundle: initial.data, requestedBy: "admin" });
  await approveCollection(staged.importId, initial.data.checksum);
  await publishProductBundle({ importId: staged.importId, expectedRevision: initial.data.checksum, publishedBy: "admin" });
  const fork = await service.createRevisionDraft({ actorId: "admin", kind: "product", baseImportId: staged.importId, expectedRevision: initial.data.checksum });
  const product = initial.data.products[0];
  if (product.productType !== "solution_collection") throw new Error("FIXTURE_PROFILE");
  const item = product.collection.items[0];
  const patched = await service.patchRevisionDraft({ actorId: "admin", kind: "product", importId: fork.importId, expectedRevision: fork.revision, operations: [{ op: "set", target: { entityType: "solution_collection", entityId: product.id, itemId: item.id }, field: `steps[${item.steps[0].id}].reasonMarkdown`, value: "Alasan tiap langkah diperjelas untuk siswa." }] });
  expect((await testDb.select().from(schema.solutionCollections).where(eq(schema.solutionCollections.status, "published")))[0].version).toBe(1);
  expect(patched.reviewReuse?.solutionItems).toHaveLength(product.collection.items.length - 1);
  const context = await getSolutionCollectionReviewContext({ importId: patched.importId, reviewerId: "admin", expectedRevision: patched.revision });
  const changed = context.collection.items.find(value => value.id === item.id)!;
  await service.reviewRevisionDraft({ actorId: "admin", kind: "product", importId: patched.importId, expectedRevision: patched.revision, evidence: { reuseUnchanged: true, reuseToken: patched.reviewReuse!.token, expectedReviewVersion: context.reviewVersion, decision: "approved", items: [{ itemId: changed.id, itemHash: solutionItemHash(changed), correctness: "approved", reasoning: "approved", problemProvenance: "approved", solutionProvenance: "approved", release: "approved" }] } });
  const entry = { importId: patched.importId, expectedRevision: patched.revision };
  const plan = await service.planRevisionRelease({ actorId: "admin", entries: [entry] });
  expect(plan.blockers).toEqual([]);
  await service.publishRevisionRelease({ actorId: "admin", entries: [entry], expectedPlanHash: plan.planHash });
  const live = await testDb.select().from(schema.solutionCollections).where(eq(schema.solutionCollections.status, "published"));
  expect(live).toHaveLength(1);
  expect(live[0].version).toBe(2);
  expect(live[0].importId).toBe(patched.importId);
  expect((await testDb.select().from(schema.reviewBundle).where(and(eq(schema.reviewBundle.imporBundleId, staged.importId), eq(schema.reviewBundle.reviewerId, "admin"))))).toHaveLength(1);
});

test("a mixed Idea and V5 release validates exact future references and replaces both heads in one commit", async () => {
  const initial = collectionArtifact("mixed-collection");
  const staged = await stageProductBundle({ runId: "fixture-run", bundleId: initial.data.manifest.bundleId, courseId: initial.data.manifest.courseId, checksum: initial.data.checksum, bytes: initial.bytes, bundle: initial.data, requestedBy: "admin" });
  await approveCollection(staged.importId, initial.data.checksum);
  await publishProductBundle({ importId: staged.importId, expectedRevision: initial.data.checksum, publishedBy: "admin" });
  const ideaFork = await service.createRevisionDraft({ actorId: "admin", kind: "idea", baseImportId: "idea-live", expectedRevision: idea.data.canonicalChecksum });
  const oldIdea = idea.data.entities.ideas[0];
  const ideaNext = await service.patchRevisionDraft({ actorId: "admin", kind: "idea", importId: ideaFork.importId, expectedRevision: ideaFork.revision, operations: [{ op: "set", target: { entityType: "idea", entityId: oldIdea.id }, field: "conciseExplanation", value: "Penjelasan induk direvisi secara eksplisit." }] });
  await approveIdea(ideaNext.importId, ideaNext.revision);
  const ideaEntry = { importId: ideaNext.importId, expectedRevision: ideaNext.revision };
  expect((await service.planRevisionRelease({ actorId: "admin", entries: [ideaEntry] })).blockers.some(blocker => blocker.code === "REVISION_LIVE_DEPENDENT_REQUIRES_UPDATE")).toBe(true);
  const productFork = await service.createRevisionDraft({ actorId: "admin", kind: "product", baseImportId: staged.importId, expectedRevision: initial.data.checksum });
  const nextIdea = (ideaNext.bundle as any).entities.ideas[0];
  const oldProduct = initial.data.products[0];
  const productNext = await service.patchRevisionDraft({ actorId: "admin", kind: "product", importId: productFork.importId, expectedRevision: productFork.revision, operations: [
    { op: "set", target: { entityType: "solution_collection", entityId: oldProduct.id }, field: "ideaLinks", value: [{ ...oldProduct.ideaLinks[0], version: nextIdea.version, semanticHash: nextIdea.semanticHash }] },
    { op: "set", target: { entityType: "dependency", entityId: "mixed-collection-idea" }, field: "upstreamVersion", value: nextIdea.version },
    { op: "set", target: { entityType: "dependency", entityId: "mixed-collection-idea" }, field: "upstreamHash", value: nextIdea.semanticHash },
  ] });
  expect(productNext.reviewReuse?.solutionItems).toEqual([]);
  await approveCollection(productNext.importId, productNext.revision);
  const entries = [ideaEntry, { importId: productNext.importId, expectedRevision: productNext.revision }];
  const plan = await service.planRevisionRelease({ actorId: "admin", entries });
  expect(plan.blockers).toEqual([]);
  expect(plan.deferredChecks).toContainEqual(expect.objectContaining({ code: "PRODUCT_V5_LIVE_DEPENDENCY_MISMATCH", importId: productNext.importId }));
  expect((await testDb.select().from(schema.ide))[0].version).toBe(oldIdea.version);
  await service.publishRevisionRelease({ actorId: "admin", entries, expectedPlanHash: plan.planHash });
  expect((await testDb.select().from(schema.ide))[0].version).toBe(nextIdea.version);
  const live = await testDb.select().from(schema.solutionCollections).where(eq(schema.solutionCollections.status, "published"));
  expect(live).toHaveLength(1);
  expect(live[0].importId).toBe(productNext.importId);
  expect((live[0].trace.ideaLinks as any[])[0].version).toBe(nextIdea.version);
  expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, "idea-live")))[0].status).toBe("withdrawn");
  expect((await testDb.select().from(schema.vectorSyncQueue)).some(row => row.action === "delete" && row.namespace === "canonical_ideas" && row.payload.version === oldIdea.version)).toBe(true);
});

test("a dependency-only revision advances its Product and coalesces equivalent authored edge identities", async () => {
  const initial = collectionArtifact("dependency-collection");
  const staged = await stageProductBundle({ runId: "fixture-run", bundleId: initial.data.manifest.bundleId, courseId: initial.data.manifest.courseId, checksum: initial.data.checksum, bytes: initial.bytes, bundle: initial.data, requestedBy: "admin" });
  await approveCollection(staged.importId, initial.data.checksum);
  await publishProductBundle({ importId: staged.importId, expectedRevision: initial.data.checksum, publishedBy: "admin" });
  const fork = await service.createRevisionDraft({ actorId: "admin", kind: "product", baseImportId: staged.importId, expectedRevision: initial.data.checksum });
  const patched = await service.patchRevisionDraft({ actorId: "admin", kind: "product", importId: fork.importId, expectedRevision: fork.revision, operations: [{ op: "add", target: { entityType: "dependency", entityId: "another-idea-edge" }, value: { ...initial.data.dependencies[0], id: "another-idea-edge" } }] });
  expect((patched.bundle as any).products[0].version).toBe(2);
  await approveCollection(patched.importId, patched.revision);
  const entries = [{ importId: patched.importId, expectedRevision: patched.revision }];
  const plan = await service.planRevisionRelease({ actorId: "admin", entries });
  expect(plan.blockers).toEqual([]);
  await service.publishRevisionRelease({ actorId: "admin", entries, expectedPlanHash: plan.planHash });
  const edges = await testDb.select().from(schema.ketergantunganProduk).where(and(eq(schema.ketergantunganProduk.downstreamEntityId, "dependency-collection"), eq(schema.ketergantunganProduk.downstreamVersion, 2)));
  expect(edges).toHaveLength(2);
  expect(edges.every(edge => edge.downstreamHash === (patched.bundle as any).products[0].generationHash)).toBe(true);
});

test("a provenance span can be replaced by a new ID without leaving obsolete canonical evidence", async () => {
  const fork = await service.createRevisionDraft({ actorId: "admin", kind: "idea", baseImportId: "idea-live", expectedRevision: idea.data.canonicalChecksum });
  const previous = idea.data.entities.provenance[0];
  const replacement = { ...previous, id: `${previous.id}-revised` };
  const next = await service.patchRevisionDraft({ actorId: "admin", kind: "idea", importId: fork.importId, expectedRevision: fork.revision, operations: [
    { op: "remove", target: { entityType: "provenance", entityId: previous.id } },
    { op: "add", target: { entityType: "provenance", entityId: replacement.id }, value: replacement },
  ] });
  expect(next.reviewReuse?.ideaItems).toEqual([]);
  await approveIdea(next.importId, next.revision);
  const entries = [{ importId: next.importId, expectedRevision: next.revision }];
  const plan = await service.planRevisionRelease({ actorId: "admin", entries });
  expect(plan.blockers).toEqual([]);
  failRelease = true;
  await expect(service.publishRevisionRelease({ actorId: "admin", entries, expectedPlanHash: plan.planHash })).rejects.toThrow("INJECTED_RELEASE_FAILURE");
  failRelease = false;
  expect((await testDb.select().from(schema.asalIde)).map(row => row.id)).toContain(previous.id);
  await service.publishRevisionRelease({ actorId: "admin", entries, expectedPlanHash: plan.planHash });
  const canonical = await testDb.select().from(schema.asalIde);
  expect(canonical.map(row => row.id)).toEqual([replacement.id]);
  expect(objects.has("idea.zip")).toBe(true);
  expect((await testDb.select().from(schema.itemImporBundle).where(and(eq(schema.itemImporBundle.imporBundleId, "idea-live"), eq(schema.itemImporBundle.entityId, previous.id))))).toHaveLength(1);
});

test("restoring a removed Idea reactivates only an attested retired identity from the same history", async () => {
  const old = idea.data.entities.ideas[0], provenance = idea.data.entities.provenance[0], section = idea.data.entities.learningSections[0];
  const alternate = { ...old, id: `${old.id}-alternate`, stableKey: `${old.stableKey}:alternate`, code: `${old.code}-ALT` };
  const alternateProof = { ...provenance, id: `${provenance.id}-alternate`, ideaId: alternate.id };
  async function release(draft: { importId: string; revision: string }) {
    await approveIdea(draft.importId, draft.revision);
    const entries = [{ importId: draft.importId, expectedRevision: draft.revision }];
    const plan = await service.planRevisionRelease({ actorId: "admin", entries });
    expect(plan.blockers).toEqual([]);
    await service.publishRevisionRelease({ actorId: "admin", entries, expectedPlanHash: plan.planHash });
  }
  const fork = await service.createRevisionDraft({ actorId: "admin", kind: "idea", baseImportId: "idea-live", expectedRevision: idea.data.canonicalChecksum });
  const expanded = await service.patchRevisionDraft({ actorId: "admin", kind: "idea", importId: fork.importId, expectedRevision: fork.revision, operations: [
    { op: "add", target: { entityType: "idea", entityId: alternate.id }, value: alternate },
    { op: "add", target: { entityType: "provenance", entityId: alternateProof.id }, value: alternateProof },
    { op: "set", target: { entityType: "learning_section", entityId: section.id }, field: "primaryIdeaIds", value: [old.id, alternate.id] },
  ] });
  await release(expanded);
  const removing = await service.createRevisionDraft({ actorId: "admin", kind: "idea", baseImportId: expanded.importId, expectedRevision: expanded.revision });
  const removed = await service.patchRevisionDraft({ actorId: "admin", kind: "idea", importId: removing.importId, expectedRevision: removing.revision, operations: [
    { op: "remove", target: { entityType: "idea", entityId: old.id } },
    { op: "remove", target: { entityType: "provenance", entityId: provenance.id } },
    { op: "set", target: { entityType: "learning_section", entityId: section.id }, field: "primaryIdeaIds", value: [alternate.id] },
  ] });
  await release(removed);
  expect((await testDb.select().from(schema.ide).where(eq(schema.ide.id, old.id)))[0].status).toBe("withdrawn");
  const restore = await service.restoreRevisionDraft({ actorId: "admin", kind: "idea", historicalImportId: "idea-live", expectedRevision: idea.data.canonicalChecksum, currentImportId: removed.importId, currentRevision: removed.revision });
  await release(restore);
  expect((await testDb.select().from(schema.ide).where(eq(schema.ide.id, old.id)))[0]).toMatchObject({ status: "published", version: old.version + 1 });
  expect((await testDb.select().from(schema.ide).where(eq(schema.ide.id, alternate.id)))[0].status).toBe("withdrawn");
  expect((await testDb.select().from(schema.asalIde)).map(value=>value.id)).toEqual([provenance.id]);
});
