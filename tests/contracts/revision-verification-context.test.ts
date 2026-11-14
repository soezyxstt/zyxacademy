import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { zipSync } from "fflate";
import * as schema from "@/db/schema";
import { computeIdeaBundleChecksum, serializeDeterministically, validateIdeaBundle, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { finalizeProductBundleDraft } from "@/lib/bundle/product-draft";
import { buildRevisionArtifact, type ValidRevisionProductBundle } from "@/lib/authoring/revision-artifact";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { buildProductV4RuntimeBinding, productV4DependencyChecksum, type ProductV4LiveDependency } from "@/lib/compute/product-v4-runtime-binding";
import { createPostgresTestDb } from "../helpers/postgres";

// Isolated PostgreSQL constraints and in-memory archive storage. No providers,
// browser, trusted receipt, hosted jobs, or deployment are exercised here.
const { client, testDb } = await createPostgresTestDb();
const objects = new Map<string, Uint8Array>();
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/storage", () => ({ storage: { download: async (key: string) => {
  const value = objects.get(key); if (!value) throw new Error("FIXTURE_ARCHIVE_MISSING"); return value;
} } }));
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
const service = await import("@/lib/authoring/revision-verification-context");
afterAll(async () => { await client.close(); });
const encode = (value: unknown) => new TextEncoder().encode(`${serializeDeterministically(value)}\n`);
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

function ideaArtifact() {
  const directory = join(process.cwd(), "tests/fixtures/bundles/idea-v2");
  const paths = ["manifest.json", "sources/kinematika.md", "entities/source-materials.json", "entities/source-chunks.json", "entities/ideas.json", "entities/provenance.json", "entities/relations.json"];
  const files = new Map(paths.map(path => [path, new Uint8Array(readFileSync(join(directory, path)))]));
  const read = (path: string) => JSON.parse(new TextDecoder().decode(files.get(path)!));
  const manifest = read("manifest.json"), first = read("entities/ideas.json")[0], proof = read("entities/provenance.json")[0];
  const section = { id: "section-motion", courseId: first.courseId, chapterId: first.chapterId, stableKey: "section-motion", title: "Gerak", slug: "gerak", orderIndex: 0, learningObjective: "Memahami gerak", primaryIdeaIds: [first.id], supportingIdeaIds: [], sourceChunkIds: [proof.sourceChunkId] };
  manifest.schemaVersion = "idea-bundle.v3";
  files.set("entities/learning-sections.json", encode([section]));
  manifest.entityFiles.push({ path: "entities/learning-sections.json", entityType: "learning_sections", checksum: sha(files.get("entities/learning-sections.json")!), stableIds: [section.id] });
  manifest.bundleChecksum = computeIdeaBundleChecksum(manifest, files);
  files.set("manifest.json", encode(manifest));
  const parsed = validateIdeaBundle(files);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
  return { bundle: parsed.data, bytes: zipSync(Object.fromEntries(files), { level: 0 }) };
}
const baseIdea = ideaArtifact();
const ideaId = baseIdea.bundle.entities.ideas[0].id;
const changedIdea = buildRevisionArtifact({ kind: "idea", original: baseIdea.bundle, bundleId: "idea-candidate", operations: [{ op: "set", target: { entityType: "idea", entityId: ideaId }, field: "conciseExplanation", value: "Perubahan posisi dibagi selang waktu menentukan kecepatan rata-rata." }] });
if (!("entities" in changedIdea.bundle)) throw new Error("FIXTURE_IDEA_REQUIRED");
const candidateIdea = changedIdea.bundle;

function productArtifact(ideas: ValidatedIdeaBundle, version: number, bundleId: string) {
  const original = buildLocalVerificationFixture().bundle;
  const idea = ideas.entities.ideas[0], source = ideas.entities.sourceMaterials[0], chunk = ideas.entities.sourceChunks[0];
  const sourceRefs = [{ sourceId: source.id, version: source.version, checksum: source.checksum, excerptIds: [chunk.id] }];
  const rewrite = (value: unknown): any => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      key === "courseId" ? idea.courseId : key === "chapterId" ? idea.chapterId : key === "ideaIds" ? [idea.id] : key === "sourceRefs" ? sourceRefs : key === "sourceHash" ? source.checksum : key === "ideaLinks" ? [{ id: idea.id, version: idea.version, semanticHash: idea.semanticHash, weight: 1, role: "primary" }] : rewrite(item)]));
  };
  const products = original.products.map(product => ({ ...rewrite(product), version, ...(product.productType === "diktat" ? { sourceArticleVersion: version } : {}) }));
  const dependencies = original.dependencies.map(dependency => ({ ...dependency, upstreamVersion: version, downstreamVersion: version }));
  const remapped = { ...original, manifest: { ...original.manifest, bundleId, courseId: idea.courseId }, products, dependencies } as ValidRevisionProductBundle;
  return finalizeProductBundleDraft(remapped, { products });
}
const baseProduct = productArtifact(baseIdea.bundle, 1, "product-live");
const candidateProduct = productArtifact(candidateIdea, 2, "product-candidate");
const entries = [{ importId: "idea-candidate", expectedRevision: candidateIdea.canonicalChecksum }, { importId: "product-candidate", expectedRevision: candidateProduct.bundle.checksum }];
const currentProduct = async () => (await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, "product-candidate")))[0];
async function addImport(id: string, kind: "idea" | "product", artifact: typeof baseIdea | typeof baseProduct, baseId?: string) {
  const bundle = artifact.bundle;
  const revision = "canonicalChecksum" in bundle ? bundle.canonicalChecksum : bundle.checksum;
  const key = `${id}.zip`; objects.set(key, artifact.bytes);
  const baseRevision = kind === "idea" ? baseIdea.bundle.canonicalChecksum : baseProduct.bundle.checksum;
  await testDb.insert(schema.imporBundle).values({ id, bundleId: bundle.manifest.bundleId, bundleType: kind, version: kind === "idea" ? 3 : 4, checksum: revision, courseId: "legacy-physics", sourceUriOrKey: key, status: baseId ? kind === "idea" ? "validated" : "draft" : "published", requestedBy: "admin", validationReport: { valid: true, ...(baseId ? { revisionLineage: { schema: "authoring-revision.v1", baseImportId: baseId, baseRevision } } : {}) } });
}
beforeEach(async () => {
  objects.clear();
  await client.exec('TRUNCATE TABLE "user", courses, mata_kuliah, peran CASCADE');
  for (const id of ["admin", "creator-1"]) {
    await testDb.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role: "admin" });
    await provisionPenggunaForNewUser({ id, role: "admin" });
  }
  await testDb.insert(schema.courses).values({ id: "legacy-physics", title: "Fisika", category: "Fisika" });
  await testDb.insert(schema.mataKuliah).values({ id: "course-physics", code: "PHY", title: "Fisika", legacyCourseId: "legacy-physics" });
  await testDb.insert(schema.bab).values({ id: "chapter-kinematics", mataKuliahId: "course-physics", code: "KIN", title: "Gerak", orderIndex: 0 });
  const source = baseIdea.bundle.entities.sourceMaterials[0], chunk = baseIdea.bundle.entities.sourceChunks[0], idea = baseIdea.bundle.entities.ideas[0];
  await testDb.insert(schema.sumberMateri).values({ id: source.id, mataKuliahId: source.courseId, babId: source.chapterId, title: source.title, sourceType: source.sourceType, canonicalUriOrR2Key: source.canonicalUriOrR2Key, version: source.version, checksum: source.checksum, status: "active", creatorId: "creator-1" });
  await testDb.insert(schema.potonganSumber).values({ id: chunk.id, sumberMateriId: chunk.sourceMaterialId, sourceVersion: chunk.sourceVersion, content: chunk.content, startOffset: chunk.startOffset, endOffset: chunk.endOffset, checksum: chunk.checksum });
  await testDb.insert(schema.ide).values({ id: idea.id, mataKuliahId: idea.courseId, babId: idea.chapterId, stableKey: idea.stableKey, code: idea.code, canonicalStatement: idea.canonicalStatement, conciseExplanation: idea.conciseExplanation, version: idea.version, semanticHash: idea.semanticHash, generationHash: idea.generationHash, creatorId: "creator-1", status: "published" });
  await addImport("idea-live", "idea", baseIdea);
  await addImport("product-live", "product", baseProduct);
  await addImport("idea-candidate", "idea", { bundle: candidateIdea, bytes: changedIdea.bytes }, "idea-live");
  await addImport("product-candidate", "product", candidateProduct, "product-live");
});

test("prospective graph is exact and covers each Idea, source, excerpt and dependency", async () => {
  const graph = await service.assertProspectiveReleaseDependencies({ productBundle: candidateProduct.bundle, ideaDrafts: [candidateIdea], scope: { courseId: "course-physics" } });
  expect(graph.dependencies.find(row => row.type === "idea")).toMatchObject({ id: ideaId, version: 2, hash: candidateIdea.entities.ideas[0].semanticHash });
  expect(() => productV4DependencyChecksum(candidateProduct.bundle, graph.dependencies)).not.toThrow();
  expect(() => service.assertProspectiveDependencyGraph({ productBundle: candidateProduct.bundle, ideaDrafts: [], courseId: "course-physics", rows: graph.dependencies.filter(row => row.type !== "idea") })).toThrow("DEPENDENCY_CHANGED");
  expect(() => service.assertProspectiveDependencyGraph({ productBundle: candidateProduct.bundle, ideaDrafts: [candidateIdea], courseId: "course-physics", rows: graph.dependencies.map(row => row.type === "source_material" ? { ...row, courseId: "other" } : row) })).toThrow("DEPENDENCY_CHANGED");
  const wrongIdea = { ...candidateIdea, entities: { ...candidateIdea.entities, ideas: candidateIdea.entities.ideas.map(idea => ({ ...idea, version: 3 })) } };
  expect(() => service.assertProspectiveDependencyGraph({ productBundle: candidateProduct.bundle, ideaDrafts: [wrongIdea], courseId: "course-physics", rows: graph.dependencies })).toThrow("DEPENDENCY_CHANGED");
  expect(() => service.assertProspectiveDependencyGraph({ productBundle: candidateProduct.bundle, ideaDrafts: [candidateIdea, candidateIdea], courseId: "course-physics", rows: graph.dependencies })).not.toThrow();
});

test("prepare writes an immutable attestation, invalidates old applicability, and is idempotent", async () => {
  const row = await currentProduct();
  await testDb.update(schema.imporBundle).set({ validationReport: { ...row.validationReport, productV4Verification: { attemptId: "old" }, productV4PdfEvidence: { attemptId: "old" } } }).where(eq(schema.imporBundle.id, row.id));
  const first = await service.prepareRevisionVerification({ actorId: "admin", entries });
  expect(first.invalidated).toBe(true);
  expect((await currentProduct()).validationReport.productV4Verification).toBeUndefined();
  const resolved = await service.resolveRevisionVerificationContext({ row: await currentProduct(), bundle: candidateProduct.bundle, rows: [] });
  expect(resolved.contextDigest).toBe(first.digest);
  expect(resolved.rows.find(row => row.type === "idea")?.version).toBe(2);
  const second = await service.prepareRevisionVerification({ actorId: "admin", entries });
  expect(second.contextId).toBe(first.contextId);
  expect(second.invalidated).toBe(false);
  const rows = await testDb.select().from(schema.imporBundle);
  await service.assertRevisionVerificationReleaseContext({ entries: rows.filter(row => entries.some(entry => entry.importId === row.id)).map(row => ({ row, bundle: row.bundleType === "idea" ? candidateIdea : candidateProduct.bundle })), connection: testDb });
});

test("forged pointer, changed draft, removed candidate and changed live head are rejected", async () => {
  await service.prepareRevisionVerification({ actorId: "admin", entries });
  const row = await currentProduct();
  const resolve = () => service.resolveRevisionVerificationContext({ row, bundle: candidateProduct.bundle, rows: [] });
  await testDb.update(schema.ide).set({ version: 9 }).where(eq(schema.ide.id, ideaId));
  await expect(resolve()).rejects.toThrow("CANONICAL_HEAD_CHANGED");
  await testDb.update(schema.ide).set({ version: 1 }).where(eq(schema.ide.id, ideaId));
  await testDb.update(schema.imporBundle).set({ status: "withdrawn" }).where(eq(schema.imporBundle.id, "idea-candidate"));
  await expect(resolve()).rejects.toThrow("DRAFT_CHANGED");
  await testDb.update(schema.imporBundle).set({ status: "validated", checksum: "c".repeat(64) }).where(eq(schema.imporBundle.id, "idea-candidate"));
  await expect(resolve()).rejects.toThrow("DRAFT_CHANGED");
  await testDb.update(schema.imporBundle).set({ checksum: candidateIdea.canonicalChecksum }).where(eq(schema.imporBundle.id, "idea-candidate"));
  const pointer = row.validationReport.revisionVerificationContext as { digest: string };
  await testDb.update(schema.imporBundle).set({ validationReport: { ...row.validationReport, revisionVerificationContext: { ...pointer, digest: "d".repeat(64) } } }).where(eq(schema.imporBundle.id, row.id));
  await expect(resolve()).rejects.toThrow("CONTEXT_FORGED");
});

test("base snapshot, source mutation, inactive actor and cross-course draft fail closed", async () => {
  await service.prepareRevisionVerification({ actorId: "admin", entries });
  const row = await currentProduct();
  const resolve = () => service.resolveRevisionVerificationContext({ row, bundle: candidateProduct.bundle, rows: [] });
  await testDb.update(schema.imporBundle).set({ checksum: "e".repeat(64) }).where(eq(schema.imporBundle.id, "idea-live"));
  await expect(resolve()).rejects.toThrow("BASE_CHANGED");
  await testDb.update(schema.imporBundle).set({ checksum: baseIdea.bundle.canonicalChecksum }).where(eq(schema.imporBundle.id, "idea-live"));
  await testDb.update(schema.sumberMateri).set({ status: "withdrawn" });
  await expect(resolve()).rejects.toThrow("DEPENDENCY_CHANGED");
  await testDb.update(schema.sumberMateri).set({ status: "active" });
  await testDb.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, "admin"));
  await expect(resolve()).rejects.toThrow("ACTOR_INACTIVE");
  await testDb.update(schema.pengguna).set({ status: "active" }).where(eq(schema.pengguna.id, "admin"));
  const wrong = { ...candidateIdea, manifest: { ...candidateIdea.manifest, courseId: "other" } };
  await expect(service.assertProspectiveReleaseDependencies({ productBundle: candidateProduct.bundle, ideaDrafts: [wrong], scope: { courseId: "course-physics" } })).rejects.toThrow("SCOPE_MISMATCH");
});

test("runtime plan binds context digest while the ordinary live path remains unchanged", async () => {
  const graph = await service.assertProspectiveReleaseDependencies({ productBundle: baseProduct.bundle, ideaDrafts: [], scope: { courseId: "course-physics" } });
  const fingerprint = { rendererChecksum: "a".repeat(64), fontChecksum: "a".repeat(64), contractChecksum: "a".repeat(64), playbookChecksum: "a".repeat(64), printProfile: "fixed-a4" };
  const ports = { async course() { return { id: "course-physics", legacyCourseId: "legacy-physics" }; }, async figure(): Promise<never> { throw new Error("NO_SOURCE_FIGURES"); }, async download(): Promise<never> { throw new Error("NO_ASSETS"); }, async dependencies() { return graph.dependencies; }, async runtime() { return fingerprint; } };
  const row = { id: "product-candidate", bundleType: "product", bundleId: baseProduct.bundle.manifest.bundleId, courseId: "legacy-physics", checksum: baseProduct.bundle.checksum };
  const live = await buildProductV4RuntimeBinding({ row, bundle: baseProduct.bundle, runId: "run" }, ports);
  expect(live.dependencyChecksum).toBe(productV4DependencyChecksum(baseProduct.bundle, graph.dependencies));
  const first = await buildProductV4RuntimeBinding({ row, bundle: baseProduct.bundle, runId: "run" }, { ...ports, async revisionDependencies({ rows }: { rows: readonly ProductV4LiveDependency[] }) { return { rows: [...rows], contextDigest: "b".repeat(64) }; } });
  const second = await buildProductV4RuntimeBinding({ row, bundle: baseProduct.bundle, runId: "run" }, { ...ports, async revisionDependencies({ rows }: { rows: readonly ProductV4LiveDependency[] }) { return { rows: [...rows], contextDigest: "c".repeat(64) }; } });
  expect(first.dependencyChecksum).not.toBe(live.dependencyChecksum);
  expect(second.dependencyChecksum).not.toBe(first.dependencyChecksum);
});

test("published readiness requires the exact immutable release audit, not published status", async () => {
  const prepared = await service.prepareRevisionVerification({ actorId: "admin", entries });
  const context = (await currentProduct()).validationReport.revisionVerificationContext;
  await testDb.update(schema.imporBundle).set({ status: "published" }).where(eq(schema.imporBundle.id, "idea-candidate"));
  await testDb.update(schema.imporBundle).set({ status: "published" }).where(eq(schema.imporBundle.id, "product-candidate"));
  const resolve = () => service.resolveRevisionVerificationContext({ row: { id: "product-candidate", bundleId: candidateProduct.bundle.manifest.bundleId, checksum: candidateProduct.bundle.checksum }, bundle: candidateProduct.bundle, rows: [] });
  await expect(resolve()).rejects.toThrow("DRAFT_CHANGED");
  await testDb.insert(schema.auditMutasi).values({ id: "release", actorId: "admin", entityType: "authoring_release", entityId: "plan", action: "release_published", afterSnapshot: { entries, verificationContexts: [{ importId: "product-candidate", context }] } });
  const idea = candidateIdea.entities.ideas[0];
  await testDb.update(schema.ide).set({ version: idea.version, semanticHash: idea.semanticHash, generationHash: idea.generationHash }).where(eq(schema.ide.id, idea.id));
  expect((await resolve()).contextDigest).toBe(prepared.digest);
});
