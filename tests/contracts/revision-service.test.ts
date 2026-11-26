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
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { buildRevisionArtifact, type ValidRevisionProductBundle } from "@/lib/authoring/revision-artifact";

// One isolated PostgreSQL fixture. Storage and job dispatch never leave the process.
const { client, testDb } = await createPostgresTestDb();
const objects = new Map<string, Uint8Array>();
let failRelease = false;
let artifactDownloads = 0;
let databaseSelects = 0;
let afterUpload: (() => Promise<void>) | undefined;
let printReuse: "verified" | "proof_missing" = "proof_missing";
const printReuseCalls: Array<{ sourceId: string; originalChecksum: string; candidateChecksum: string }> = [];
const originalDb = { ...await import("@/db") };
const originalStorage = { ...await import("@/lib/storage") };
const originalDispatch = { ...await import("@/lib/vector-sync-dispatch") };
const originalPrintReuse = { ...await import("@/lib/bundle/product-v4-revision-reuse") };
const wrapped = new Proxy(testDb, { get(target, key) {
  if (key === "select") return (fields?: any) => { databaseSelects++; return target.select(fields); };
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
  download: async (key: string) => { artifactDownloads++; const bytes = objects.get(key); if (!bytes) throw new Error("FIXTURE_OBJECT_MISSING"); return bytes; },
  upload: async (bytes: Uint8Array, _name: string, _mime: string, options: { key: string }) => { objects.set(options.key, bytes); await afterUpload?.(); return { key: options.key }; },
} }));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: async () => undefined }));
mock.module("@/lib/bundle/product-v4-revision-reuse", () => ({ ...originalPrintReuse, selectProductV4ReusableDiktatVersions: async (input: Parameters<typeof originalPrintReuse.selectProductV4ReusableDiktatVersions>[0]) => {
  printReuseCalls.push({ sourceId: input.source.id, originalChecksum: input.original.checksum, candidateChecksum: input.candidate.checksum });
  return { preserveUnchangedDiktatIds: printReuse === "verified" ? input.candidate.products.filter(product => product.productType === "diktat").map(product => product.id) : [], reason: printReuse };
} }));
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
  mock.module("@/lib/bundle/product-v4-revision-reuse", () => originalPrintReuse);
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
async function productV4Draft(options: { withCard?: boolean; selectArticle?: boolean; withUnrelatedDiktat?: boolean } = {}) {
  const fixture = buildLocalVerificationFixture();
  let bundle = fixture.bundle as ValidRevisionProductBundle;
  if (options.withCard) {
    const article = bundle.products.find(product => product.productType === "article")!;
    const shared = { courseId: article.courseId, chapterId: article.chapterId, version: 1, status: "draft", schemaVersion: "1.0",
      sourceHash: article.sourceHash, generationHash: article.generationHash, creatorId: "admin", ideaLinks: article.ideaLinks, sourceRefs: article.sourceRefs };
    bundle = buildRevisionArtifact({ kind: "product", original: bundle, bundleId: "v4-with-card", operations: [
      { op: "add", target: { entityType: "flashcard_set", entityId: "test-set" }, value: { ...shared, id: "test-set", productType: "flashcard_set", title: "Kartu limit", cards: ["test-card"] } },
      { op: "add", target: { entityType: "flashcard", entityId: "test-card" }, value: { ...shared, id: "test-card", productType: "flashcard", setId: "test-set", front: "Toleransi keluaran", back: "Epsilon", atomic: true } },
    ] }).bundle as ValidRevisionProductBundle;
  }
  if (options.withUnrelatedDiktat) {
    const article = bundle.products.find(product => product.productType === "article")!;
    const diktat = bundle.products.find(product => product.productType === "diktat")!;
    if (article.productType !== "article" || diktat.productType !== "diktat") throw new Error("FIXTURE_TYPE");
    bundle = buildRevisionArtifact({ kind: "product", original: bundle, bundleId: "v4-unrelated-diktat", operations: [{
      op: "add", target: { entityType: "diktat", entityId: "unrelated-diktat" }, value: JSON.parse(JSON.stringify({ ...diktat, id: "unrelated-diktat", title: "Ringkasan mandiri",
        sourceArticleId: undefined, sourceArticleVersion: undefined, sourceArticleHash: undefined, visuals: article.visuals,
        units: diktat.units!.map(unit => ({ ...unit, sourceElementRefs: undefined })),
      })),
    }] }).bundle as ValidRevisionProductBundle;
  }
  await testDb.insert(schema.courses).values({ id: "legacy-limit", title: "Limit", category: "Matematika" });
  await testDb.insert(schema.mataKuliah).values({ id: bundle.manifest.courseId, code: "LIM", title: "Limit", legacyCourseId: "legacy-limit" });
  await testDb.insert(schema.bab).values({ id: "chapter-limit", mataKuliahId: bundle.manifest.courseId, code: "LIM", title: "Limit", orderIndex: 0 });
  objects.set("v4-initial.zip", zipSync(Object.fromEntries(bundle.files), { level: 0 }));
  await testDb.insert(schema.imporBundle).values({ id: "v4-initial", bundleId: bundle.manifest.bundleId, bundleType: "product", version: 4,
    checksum: bundle.checksum, courseId: "legacy-limit", sourceUriOrKey: "v4-initial.zip", status: "draft", requestedBy: "admin", validationReport: { valid: true } });
  const fork = await service.createRevisionDraft({ actorId: "admin", kind: "product", baseImportId: "v4-initial", expectedRevision: bundle.checksum, responseMode: "compact",
    ...(options.selectArticle ? { entityIds: [bundle.products.find(product => product.productType === "article")!.id] } : {}) });
  return { bundle, fork };
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
  artifactDownloads = 0;
  databaseSelects = 0;
  afterUpload = undefined;
  printReuse = "proof_missing";
  printReuseCalls.length = 0;
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

test("compact and targeted reads retain exact guards but skip review artifact work, including patch replay", async () => {
  artifactDownloads = 0;
  const fork = await service.createRevisionDraft({ actorId: "admin", kind: "idea", baseImportId: "idea-live", expectedRevision: idea.data.canonicalChecksum, responseMode: "compact" });
  expect(artifactDownloads).toBe(1);
  expect(fork.reviewContext).toBeNull();
  expect(fork.reviewReuse).toBeNull();
  const selector = { actorId: "admin", kind: "idea" as const, importId: fork.importId, expectedRevision: fork.revision };
  artifactDownloads = 0;
  const compact = await service.getRevisionContext({ ...selector, responseMode: "compact" });
  expect(artifactDownloads).toBe(1);
  expect(compact.reviewContext).toBeNull();
  const first = idea.data.entities.ideas[0];
  artifactDownloads = 0;
  const selected = await service.getRevisionContext({ ...selector, target: { entityType: "idea", entityId: first.id } });
  expect(artifactDownloads).toBe(1);
  expect(selected.selection?.content).toMatchObject({ id: first.id });
  expect(selected.reviewContext).toBeNull();
  const full = await service.getRevisionContext(selector);
  expect(full.reviewContext).not.toBeNull();
  expect(full.reviewReuse).not.toBeNull();
  const patch = { ...selector, responseMode: "compact" as const, operations: [{ op: "set" as const, target: { entityType: "idea", entityId: first.id }, field: "conciseExplanation", value: "Penjelasan singkat dengan syarat yang jelas." }] };
  artifactDownloads = 0;
  const successor = await service.patchRevisionDraft(patch);
  expect(artifactDownloads).toBe(1);
  artifactDownloads = 0;
  const replay = await service.patchRevisionDraft(patch);
  expect(artifactDownloads).toBe(1);
  expect(replay.importId).toBe(successor.importId);
  expect(replay.revision).toBe(successor.revision);
  expect(replay.reviewContext).toBeNull();
  await expect(service.getRevisionContext({ ...selector, expectedRevision: "f".repeat(64), responseMode: "compact" })).rejects.toThrow("REVISION_STALE_CONTEXT");
  await expect(service.getRevisionContext({ ...selector, target: { entityType: "idea", entityId: "missing" } })).rejects.toThrow("REVISION_TARGET_NOT_FOUND");
});

test("an initial draft directs the agent to create a revision before patch or release", async () => {
  const initial = collectionArtifact("initial-draft");
  const staged = await stageProductBundle({ runId: "initial-run", bundleId: initial.data.manifest.bundleId, courseId: initial.data.manifest.courseId, checksum: initial.data.checksum, bytes: initial.bytes, bundle: initial.data, requestedBy: "admin" });
  const selector = { actorId: "admin", kind: "product" as const, importId: staged.importId, expectedRevision: initial.data.checksum, responseMode: "compact" as const };
  const context = await service.getRevisionContext(selector);
  expect(context.status).toBe("draft");
  expect(context.draftLineage).toBeNull();
  expect(context.nextActions).toContain("authoring.create_revision");
  expect(context.nextActions).not.toContain("authoring.patch_revision");
  expect(context.nextActions).not.toContain("authoring.plan_release");
  await expect(service.patchRevisionDraft({ ...selector, operations: [{ op: "set", target: { entityType: "solution_collection", entityId: initial.data.products[0].id }, field: "title", value: "Judul baru" }] })).rejects.toThrow("REVISION_DRAFT_REQUIRED");
  const fork = await service.createRevisionDraft({ actorId: "admin", kind: "product", baseImportId: staged.importId, expectedRevision: initial.data.checksum, responseMode: "compact" });
  expect(fork.nextActions).toContain("authoring.patch_revision");
  expect(fork.nextActions).not.toContain("authoring.create_revision");
});

test("one-load patches still reject a concurrent source change under the write lock", async () => {
  const fork = await service.createRevisionDraft({ actorId: "admin", kind: "idea", baseImportId: "idea-live", expectedRevision: idea.data.canonicalChecksum, responseMode: "compact" });
  const before = await testDb.select().from(schema.imporBundle);
  const row = before.find(value => value.id === fork.importId)!;
  afterUpload = async () => {
    afterUpload = undefined;
    await testDb.update(schema.imporBundle).set({ validationReport: { ...row.validationReport, concurrentUpdate: true } }).where(eq(schema.imporBundle.id, row.id));
  };
  artifactDownloads = 0;
  await expect(service.patchRevisionDraft({ actorId: "admin", kind: "idea", importId: fork.importId, expectedRevision: fork.revision, responseMode: "compact", operations: [{ op: "set", target: { entityType: "idea", entityId: idea.data.entities.ideas[0].id }, field: "conciseExplanation", value: "Perubahan yang kalah dalam konflik." }] })).rejects.toThrow("REVISION_STALE_CONTEXT");
  expect(artifactDownloads).toBe(1);
  expect(await testDb.select().from(schema.imporBundle)).toHaveLength(before.length);
  expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, "idea-live")))[0].status).toBe("published");
});

test("derived reviews persist actor, exact source hashes, immutable successors and idempotent replay", async () => {
  const { bundle, fork } = await productV4Draft({ selectArticle: true, withUnrelatedDiktat: true });
  const article = bundle.products.find(product => product.productType === "article")!;
  if (article.productType !== "article") throw new Error("FIXTURE_ARTICLE_REQUIRED");
  const section = article.sections.find(value => value.blocks.some(block => block.id === "block-ed-exp-def"))!;
  const changed = await service.patchRevisionDraft({ actorId: "admin", kind: "product", importId: fork.importId, expectedRevision: fork.revision, responseMode: "compact", operations: [{
    op: "set", target: { entityType: "article", entityId: article.id, sectionId: section.id, blockId: "block-ed-exp-def" }, field: "parts[block-ed-exp-def-prose].markdown", value: "Toleransi keluaran ditetapkan sebelum batas jarak masukan." }],
  });
  const source = (changed.bundle as any).products.find((product: any) => product.id === article.id);
  const review = { entityId: "local-diktat", sourceArticleId: article.id, expectedArticleHash: source.generationHash, unitIds: ["local-summary"], notes: "Rumus dan syarat ringkasan tetap benar setelah saya memeriksa perubahan sumber ini." };
  const patch = { actorId: "admin", kind: "product" as const, importId: changed.importId, expectedRevision: changed.revision, responseMode: "compact" as const, operations: [], derivedContentReviews: [review] };
  const before = await testDb.select().from(schema.imporBundle);
  await expect(service.patchRevisionDraft({ ...patch, derivedContentReviews: [{ ...review, entityId: "unrelated-diktat" }] })).rejects.toThrow("REVISION_PATCH_OUTSIDE_SELECTION");
  await expect(service.patchRevisionDraft({ ...patch, derivedContentReviews: undefined, operations: [{ op: "set", target: { entityType: "diktat", entityId: "local-diktat" }, field: "title", value: "Not selected" }] })).rejects.toThrow("REVISION_PATCH_OUTSIDE_SELECTION");
  await expect(service.patchRevisionDraft({ ...patch, derivedContentReviews: [{ ...review, expectedArticleHash: article.generationHash }] })).rejects.toThrow("REVISION_DERIVED_REVIEW_STALE");
  expect(await testDb.select().from(schema.imporBundle)).toHaveLength(before.length);
  artifactDownloads = 0;
  const reviewed = await service.patchRevisionDraft(patch);
  expect(artifactDownloads).toBe(1);
  expect((reviewed.bundle as any).dependencies.find((edge: any) => edge.id === "local-lineage").freshness).toBe("UP_TO_DATE");
  expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, changed.importId)))[0].status).toBe("withdrawn");
  const events = await testDb.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.action, "derived_content_reviewed"));
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ actorId: "admin", entityId: reviewed.importId, afterSnapshot: { revision: reviewed.revision, reviews: [{ ...review, previousArticleHash: article.generationHash }] } });
  const replay = await service.patchRevisionDraft(patch);
  expect(replay.importId).toBe(reviewed.importId);
  expect(await testDb.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.action, "derived_content_reviewed"))).toHaveLength(1);
});

test("only authenticated print reuse preserves an unchanged Diktat version with one archive read", async () => {
  const { bundle, fork } = await productV4Draft({ withCard: true });
  const original = bundle.products.find(product => product.productType === "diktat")!;
  const patch = (importId: string, revision: string, value: string) => ({ actorId: "admin", kind: "product" as const, importId, expectedRevision: revision, responseMode: "compact" as const,
    operations: [{ op: "set" as const, target: { entityType: "flashcard", entityId: "test-card" }, field: "back", value }] });
  artifactDownloads = 0;
  const cold = await service.patchRevisionDraft(patch(fork.importId, fork.revision, "Epsilon ialah batas jarak keluaran."));
  const coldDiktat = (cold.bundle as any).products.find((product: any) => product.id === original.id);
  expect(coldDiktat.version).toBe(original.version + 1);
  expect(cold.draftLineage?.impact).toHaveProperty("printVersionReuse", { preservedEntityIds: [], advancedEntityIds: [original.id], reason: "proof_missing" });
  expect(artifactDownloads).toBe(1);
  printReuse = "verified";
  artifactDownloads = 0;
  const warm = await service.patchRevisionDraft(patch(cold.importId, cold.revision, "Epsilon membatasi jarak keluaran dari nilai limit."));
  expect((warm.bundle as any).products.find((product: any) => product.id === original.id)).toEqual(coldDiktat);
  expect(warm.draftLineage?.impact).toHaveProperty("printVersionReuse", { preservedEntityIds: [original.id], advancedEntityIds: [], reason: "verified" });
  expect(artifactDownloads).toBe(1);
  expect(printReuseCalls).toHaveLength(2);
  expect(printReuseCalls[1]).toMatchObject({ sourceId: cold.importId, originalChecksum: cold.revision, candidateChecksum: warm.revision });
  const row = (await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, warm.importId)))[0];
  expect(row.validationReport.bundleTitle).toBe((warm.bundle as any).products.find((product: any) => product.productType === "article").title);
});

test("print recovery is scoped, no-ops on valid proof, and replays an immutable evidence version", async () => {
  const { bundle, fork } = await productV4Draft({ selectArticle: true, withUnrelatedDiktat: true });
  const summary = bundle.products.find(product => product.id === "local-diktat")!;
  const unrelated = bundle.products.find(product => product.id === "unrelated-diktat")!;
  const request = { actorId: "admin", kind: "product" as const, importId: fork.importId, expectedRevision: fork.revision,
    operations: [], refreshPrintEvidence: true, responseMode: "compact" as const };
  printReuse = "verified";
  const noOp = await service.patchRevisionDraft(request);
  expect(noOp.importId).toBe(fork.importId);
  expect(noOp.revision).toBe(fork.revision);
  printReuse = "proof_missing";
  artifactDownloads = 0;
  const refreshed = await service.patchRevisionDraft(request);
  expect(artifactDownloads).toBe(1);
  expect(refreshed.importId).not.toBe(fork.importId);
  expect((refreshed.bundle as any).products.find((product: any) => product.id === summary.id)).toMatchObject({ version: summary.version + 1, units: (summary as any).units });
  expect((refreshed.bundle as any).products.find((product: any) => product.id === unrelated.id)).toEqual(unrelated);
  expect(refreshed.draftLineage?.impact).toHaveProperty("printVersionReuse", { preservedEntityIds: [], advancedEntityIds: [summary.id], reason: "proof_missing" });
  const replay = await service.patchRevisionDraft(request);
  expect(replay.importId).toBe(refreshed.importId);
  await expect(service.patchRevisionDraft({ ...request, importId: refreshed.importId, expectedRevision: refreshed.revision, operations: [{ op: "set", target: { entityType: "article", entityId: bundle.products[0].id }, field: "title", value: "Changed" }] })).rejects.toThrow("REVISION_PRINT_REFRESH_CONTENT_PATCH_NOT_ALLOWED");
  await expect(service.patchRevisionDraft({ ...request, kind: "idea", importId: "idea-live", expectedRevision: idea.data.canonicalChecksum })).rejects.toThrow("REVISION_PRINT_REFRESH_V4_REQUIRED");
});

test("section review reuse scopes visual changes to the sections that reference them", async () => {
  const { bundle, fork } = await productV4Draft();
  const article = bundle.products.find(product => product.productType === "article")!;
  if (article.productType !== "article") throw new Error("FIXTURE_TYPE");
  const extraVisual = { ...article.visuals![0], id: "unreferenced-visual", label: "Grafik tambahan" };
  const withVisual = await service.patchRevisionDraft({ actorId: "admin", kind: "product", importId: fork.importId, expectedRevision: fork.revision, responseMode: "compact", operations: [{
    op: "set", target: { entityType: "article", entityId: article.id }, field: "visuals", value: [...article.visuals!, extraVisual],
  }] });
  for (const section of article.sections) await testDb.insert(schema.reviewItemBundle).values({ id: `section-review-${section.id}`, imporBundleId: withVisual.importId,
    reviewerId: "admin", productId: article.id, targetType: "article_section", targetId: section.id, status: "approved", notes: "Bagian ini sudah saya periksa." });
  const changed = await service.patchRevisionDraft({ actorId: "admin", kind: "product", importId: withVisual.importId, expectedRevision: withVisual.revision, responseMode: "compact", operations: [{
    op: "set", target: { entityType: "article", entityId: article.id }, field: "visuals[unreferenced-visual].label", value: "Label baru untuk grafik tambahan",
  }] });
  const unusedContext = await service.getRevisionContext({ actorId: "admin", kind: "product", importId: changed.importId, expectedRevision: changed.revision });
  expect(unusedContext.reviewReuse?.sectionDecisions.map(value => value.sectionId).sort()).toEqual(article.sections.map(section => section.id).sort());
  const referenced = await service.patchRevisionDraft({ actorId: "admin", kind: "product", importId: changed.importId, expectedRevision: changed.revision, responseMode: "compact", operations: [{
    op: "set", target: { entityType: "article", entityId: article.id }, field: `visuals[${article.visuals![0].id}].label`, value: "Label grafik sumber yang berubah",
  }] });
  const context = await service.getRevisionContext({ actorId: "admin", kind: "product", importId: referenced.importId, expectedRevision: referenced.revision });
  const affected = article.sections.find(section => section.blocks.some(block => block.id === "block-ed-exp-def"))!;
  expect(context.reviewReuse?.sectionDecisions.some(value => value.sectionId === affected.id)).toBe(false);
  expect(context.reviewReuse?.sectionDecisions.some(value => value.sectionId === article.sections[0].id)).toBe(true);
});

test("release planning reports an oversized dependency closure without suggesting partial publication", async () => {
  const first = idea.data.entities.ideas[0];
  const fork = await service.createRevisionDraft({ actorId: "admin", kind: "idea", baseImportId: "idea-live", expectedRevision: idea.data.canonicalChecksum, responseMode: "compact" });
  const revised = await service.patchRevisionDraft({ actorId: "admin", kind: "idea", importId: fork.importId, expectedRevision: fork.revision, responseMode: "compact", operations: [{
    op: "set", target: { entityType: "idea", entityId: first.id }, field: "conciseExplanation", value: "Perubahan posisi terhadap selang waktu menentukan kecepatan rata-rata." }],
  });
  for (let index = 0; index < 17; index++) {
    const importId = `dependent-owner-${index}`, entityId = `dependent-card-${index}`;
    await testDb.insert(schema.imporBundle).values({ id: importId, bundleId: importId, bundleType: "product", version: 3, checksum: "a".repeat(64), courseId: "legacy-physics", sourceUriOrKey: `${importId}.zip`, status: "published", requestedBy: "admin", validationReport: { valid: true } });
    await testDb.insert(schema.itemImporBundle).values({ id: `${importId}-item`, imporBundleId: importId, entityType: "flashcard", entityId, entityVersion: 1, entityHash: "a".repeat(64), status: "published" });
    await testDb.insert(schema.ketergantunganProduk).values({ id: `${importId}-edge`, upstreamEntityType: "idea", upstreamEntityId: first.id, upstreamVersion: first.version, upstreamHash: first.semanticHash,
      downstreamEntityType: "flashcard", downstreamEntityId: entityId, downstreamVersion: 1, downstreamHash: "a".repeat(64), freshness: "UP_TO_DATE" });
  }
  const plan = await service.planRevisionRelease({ actorId: "admin", entries: [{ importId: revised.importId, expectedRevision: revised.revision }] });
  expect(plan.capacity).toEqual({ maxEntries: 16, selectedEntryCount: 1, requiredEntryCount: 18, missingOwnerCount: 17, fits: false });
  expect(plan.blockers).toContainEqual(expect.objectContaining({ code: "REVISION_RELEASE_CAPACITY_EXCEEDED", action: expect.stringContaining("Do not split") }));
  expect(plan.publicationReady).toBe(false);
  expect(plan.nextActions).toEqual([]);
  await expect(service.publishRevisionRelease({ actorId: "admin", entries: [{ importId: revised.importId, expectedRevision: revised.revision }], expectedPlanHash: plan.planHash })).rejects.toThrow("REVISION_RELEASE_BLOCKED");
  expect((await testDb.select().from(schema.ide).where(eq(schema.ide.id, first.id)))[0].version).toBe(first.version);
});

test("review lookup follows exact ancestry in a fixed query budget", async () => {
  let fork = await service.createRevisionDraft({ actorId: "admin", kind: "idea", baseImportId: "idea-live", expectedRevision: idea.data.canonicalChecksum, responseMode: "compact" });
  databaseSelects = 0;
  const first = await service.getRevisionContext({ actorId: "admin", kind: "idea", importId: fork.importId, expectedRevision: fork.revision });
  const shallowReads = databaseSelects;
  expect(first.reviewReuse?.sourceImportId).toBe("idea-live");
  for (let i = 0; i < 5; i++) fork = await service.createRevisionDraft({ actorId: "admin", kind: "idea", baseImportId: fork.importId, expectedRevision: fork.revision, responseMode: "compact" });
  databaseSelects = 0;
  const deep = await service.getRevisionContext({ actorId: "admin", kind: "idea", importId: fork.importId, expectedRevision: fork.revision });
  expect(databaseSelects).toBe(shallowReads);
  expect(deep.reviewReuse?.sourceImportId).toBe("idea-live");
  expect(deep.reviewReuse?.ideaItems).toEqual(first.reviewReuse?.ideaItems);
  const [row] = await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, fork.importId));
  await testDb.update(schema.imporBundle).set({ validationReport: { ...row.validationReport, revisionLineage: { ...(row.validationReport.revisionLineage as Record<string, unknown>), previousRevision: "f".repeat(64) } } }).where(eq(schema.imporBundle.id, row.id));
  const broken = await service.getRevisionContext({ actorId: "admin", kind: "idea", importId: fork.importId, expectedRevision: fork.revision });
  expect(broken.reviewReuse?.sourceImportId).toBeNull();
  expect(broken.reviewReuse?.ideaItems).toEqual([]);
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
  expect(live[0].trace).toMatchObject({ ideaLinks: [{ version: nextIdea.version }] });
  expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, "idea-live")))[0].status).toBe("withdrawn");
  expect(await testDb.select().from(schema.vectorSyncQueue)).toContainEqual(expect.objectContaining({ action: "delete", namespace: "canonical_ideas", payload: expect.objectContaining({ version: oldIdea.version }) }));
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
