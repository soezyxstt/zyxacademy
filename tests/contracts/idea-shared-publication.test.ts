import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { zipSync } from "fflate";
import * as schema from "@/db/schema";
import { computeIdeaBundleChecksum } from "@/lib/bundle/idea-bundle-v2";
import { sha256Bytes } from "@/lib/bundle/validator";
import { createPostgresTestDb } from "../helpers/postgres";

const priorAuthSecret = process.env.BETTER_AUTH_SECRET;
process.env.BETTER_AUTH_SECRET = "local-idea-review-reset-test-secret";

const root = join(process.cwd(), "tests/fixtures/bundles/idea-v2");
const paths = ["manifest.json", "sources/kinematika.md", "entities/source-materials.json", "entities/source-chunks.json", "entities/ideas.json", "entities/provenance.json", "entities/relations.json"];
const encoder = new TextEncoder();

function artifact(bundleId: string, createdAt?: string) {
  const files = new Map(paths.map((path) => [path, new Uint8Array(readFileSync(join(root, path)))]));
  const read = (path: string) => JSON.parse(new TextDecoder().decode(files.get(path)!));
  const write = (path: string, value: unknown) => files.set(path, encoder.encode(`${JSON.stringify(value, null, 2)}\n`));
  const manifest = read("manifest.json");
  const [first] = read("entities/ideas.json");
  const [proof] = read("entities/provenance.json");
  const second = { ...first, id: "idea-displacement", stableKey: "course-physics:chapter-kinematics:displacement", code: "KIN-DISPLACEMENT" };
  const relation = { id: "relation-motion", sourceIdeaId: first.id, targetIdeaId: second.id, relationType: "related", version: 1, status: "active", createdAt: first.createdAt, updatedAt: first.updatedAt };
  const sections = [{ id: "section-motion", courseId: manifest.courseId, chapterId: first.chapterId, stableKey: "course-physics:chapter-kinematics:section", title: "Gerak", slug: "gerak", orderIndex: 0, learningObjective: "Memahami gerak", primaryIdeaIds: [first.id, second.id], supportingIdeaIds: [], sourceChunkIds: [proof.sourceChunkId] }];
  write("entities/ideas.json", [first, second]);
  write("entities/provenance.json", [proof, { ...proof, id: "provenance-displacement", ideaId: second.id }]);
  write("entities/relations.json", [relation]);
  write("entities/learning-sections.json", sections);
  manifest.bundleId = bundleId;
  if (createdAt) manifest.createdAt = createdAt;
  manifest.schemaVersion = "idea-bundle.v3";
  manifest.entityFiles.find((file: any) => file.entityType === "ideas").stableIds = [first.id, second.id];
  manifest.entityFiles.find((file: any) => file.entityType === "provenance").stableIds = [proof.id, "provenance-displacement"];
  manifest.entityFiles.find((file: any) => file.entityType === "relations").stableIds = [relation.id];
  manifest.entityFiles.push({ path: "entities/learning-sections.json", entityType: "learning_sections", checksum: "", stableIds: [sections[0].id] });
  for (const file of manifest.entityFiles) file.checksum = sha256Bytes(files.get(file.path)!);
  manifest.bundleChecksum = computeIdeaBundleChecksum(manifest, files);
  write("manifest.json", manifest);
  return { manifest, bytes: zipSync(Object.fromEntries(files), { level: 0 }) };
}

function partialArtifact(bundleId: string) {
  const files = new Map(paths.map((path) => [path, new Uint8Array(readFileSync(join(root, path)))]));
  const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")!));
  manifest.bundleId = bundleId;
  manifest.bundleChecksum = computeIdeaBundleChecksum(manifest, files);
  files.set("manifest.json", encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`));
  return { manifest, bytes: zipSync(Object.fromEntries(files), { level: 0 }) };
}

const a = artifact("shared-a");
const b = artifact("shared-b");
const c = artifact("shared-c");
const d = partialArtifact("shared-d");
const replacement = artifact("shared-a", "2026-08-04T00:00:00.000Z");
const artifacts = new Map([["a.zip", a.bytes], ["b.zip", b.bytes], ["c.zip", c.bytes], ["d.zip", d.bytes]]);
const { client, testDb } = await createPostgresTestDb();
let beforeTransaction: (() => Promise<void>) | undefined;
const locks: string[][] = [];
const wrappedDb = new Proxy(testDb, {
  get(target, property) {
    if (property === "transaction") return async (callback: (tx: any) => Promise<unknown>) => {
      const hook = beforeTransaction;
      beforeTransaction = undefined;
      if (hook) await hook();
      return target.transaction(async (tx) => {
        const acquired: string[] = [];
        locks.push(acquired);
        const wrappedTx = new Proxy(tx, { get(inner, key) {
          if (key === "execute") return async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
            const statement = new PgDialect().sqlToQuery(query);
            if (statement.sql.includes("pg_advisory_xact_lock")) acquired.push(String(statement.params[0]));
            return inner.execute(query);
          };
          const value = Reflect.get(inner, key, inner);
          return typeof value === "function" ? value.bind(inner) : value;
        } });
        return callback(wrappedTx);
      });
    };
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
const originalDb = { ...await import("@/db") };
const originalStorage = { ...await import("@/lib/storage") };
const originalDispatch = { ...await import("@/lib/vector-sync-dispatch") };
mock.module("@/db", () => ({ db: wrappedDb }));
mock.module("@/lib/storage", () => ({ ...originalStorage, storage: { upload: async (bytes: Uint8Array, _name: string, _type: string, options: { key: string }) => { artifacts.set(options.key, bytes); }, download: async (key: string) => {
  const bytes = artifacts.get(key);
  if (!bytes) throw new Error("fixture artifact missing");
  return bytes;
} } }));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: async () => undefined }));
const { getIdeaRevisionReviewContext, reviewIdeaBundleRevision, publishIdeaBundle, withdrawIdeaBundle } = await import("@/lib/bundle/publication");
const { reviewIdeaBundle, hasIdeaRevisionReviewEvidence, upsertIdeaItemReview, discardIdeaBundleDraft, stageIdeaBundle, getIdeaReviewResetState } = await import("@/lib/bundle/staging");

afterAll(async () => {
  mock.module("@/db", () => originalDb);
  mock.module("@/lib/storage", () => originalStorage);
  mock.module("@/lib/vector-sync-dispatch", () => originalDispatch);
  await client.close();
  if (priorAuthSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = priorAuthSecret;
});

const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");

beforeEach(async () => {
  beforeTransaction = undefined;
  locks.length = 0;
  await client.exec('TRUNCATE TABLE "user", courses, mata_kuliah, peran CASCADE');
  for (const id of ["admin", "creator-1", "curator-1"]) {
    await testDb.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role: "admin" });
    await provisionPenggunaForNewUser({ id, role: "admin" });
  }
  await testDb.insert(schema.courses).values({ id: "legacy-physics", title: "Fisika", category: "Fisika" });
  await testDb.insert(schema.mataKuliah).values({ id: "course-physics", code: "PHY", title: "Fisika", legacyCourseId: "legacy-physics" });
  await testDb.insert(schema.bab).values({ id: "chapter-kinematics", mataKuliahId: "course-physics", code: "KIN", title: "Kinematika", orderIndex: 0 });
  for (const [id, data] of [["a", a], ["b", b], ["c", c], ["d", d]] as const) {
    const expectedRevision = data.manifest.bundleChecksum;
    await testDb.insert(schema.imporBundle).values({ id, bundleId: data.manifest.bundleId, bundleType: "idea", checksum: expectedRevision, courseId: "legacy-physics", sourceUriOrKey: `${id}.zip`, version: id === "d" ? 2 : 3, status: "validated", requestedBy: "admin", validationReport: { valid: true } });
    const context = await getIdeaRevisionReviewContext({ importId: id, reviewerId: "admin", expectedRevision });
    await reviewIdeaBundleRevision({ importId: id, reviewerId: "admin", expectedRevision, decision: "approved", items: context.ideas.map((idea) => ({ ideaId: idea.id, ideaHash: idea.ideaHash!, status: "approved" as const })) });
  }
  locks.length = 0;
});

test("Idea publication uses canonical retrieval scope when queue ownership uses a legacy course ID", async () => {
  await publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision: a.manifest.bundleChecksum });
  const { canonicalOutboxPayload } = await import("@/lib/vectorize/outbox");
  const rows = await testDb.select().from(schema.vectorSyncQueue);
  const upserts = rows.map(canonicalOutboxPayload).filter(payload => payload.operation === "upsert");
  expect(rows.every(row => row.courseId === "legacy-physics")).toBe(true);
  expect(upserts.every(payload => payload.metadata.courseId === "course-physics")).toBe(true);
  expect(upserts.filter(payload => payload.metadata.entityType === "idea").every(payload => payload.metadata.chapterId === "chapter-kinematics")).toBe(true);
  for (const idea of await testDb.select().from(schema.ide)) await testDb.update(schema.ide).set({ canonicalStatement: `\n${idea.canonicalStatement}` }).where(eq(schema.ide.id, idea.id));
  for (const chunk of await testDb.select().from(schema.potonganSumber)) await testDb.update(schema.potonganSumber).set({ content: `\n${chunk.content}\n` }).where(eq(schema.potonganSumber.id, chunk.id));
  const { vectorStore } = await import("@/lib/vector-store");
  const query = spyOn(vectorStore, "query").mockImplementation(async (namespace, _question, options) => upserts.filter(payload => namespace === `${payload.metadata.courseId}_${payload.metadata.namespace}` && (!options?.filter?.chapterId || payload.metadata.chapterId === options.filter.chapterId)).map(payload => ({ id: payload.vectorId, score: 1, metadata: payload.metadata })));
  try {
    const { retrieveCanonicalEvidence } = await import("@/lib/zyra/canonical-runtime");
    const result = await retrieveCanonicalEvidence({ courseId: "legacy-physics", chapterId: "chapter-kinematics", isEnrolled: true }, "Gerak");
    expect(result.sources.filter(source => source.entityType === "idea")).toHaveLength(2);
    expect(result.sources.some(source => source.entityType === "source_material")).toBe(true);
    expect(result.rejected).toHaveLength(0);
  } finally { query.mockRestore(); }
});

test("shared canonical rows and vector entries survive until the last published import is withdrawn", async () => {
  await publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision: a.manifest.bundleChecksum });
  const firstJobs = await testDb.select().from(schema.vectorSyncQueue);
  await testDb.update(schema.vectorSyncQueue).set({ status: "failed", attempts: 10 });
  const secondPublication = await publishIdeaBundle({ importId: "b", publishedBy: "admin", expectedRevision: b.manifest.bundleChecksum });
  const newJobs = (await testDb.select().from(schema.vectorSyncQueue)).filter(row => !firstJobs.some(first => first.id === row.id));
  expect(newJobs).toHaveLength(3);
  expect(newJobs.every(row => row.status === "pending" && row.attempts === 0)).toBe(true);
  expect(secondPublication.vectorJobCount).toBe(newJobs.length);
  expect(locks[0]).toEqual([...locks[0]].sort());
  expect(locks[1]).toEqual(locks[0]);
  // Publication repairs an incomplete legacy inventory from the validated artifact.
  expect((await testDb.select().from(schema.itemImporBundle).where(eq(schema.itemImporBundle.imporBundleId, "b"))).length).toBe(8);
  await expect(withdrawIdeaBundle({ importId: "a", withdrawnBy: "admin", expectedRevision: "0".repeat(64) })).rejects.toThrow("IDEA_BUNDLE_STALE_CONTEXT");
  expect(await withdrawIdeaBundle({ importId: "a", withdrawnBy: "admin" })).toMatchObject({ withdrawn: true, vectorJobCount: 0 });
  expect(locks[2]).toEqual(locks[0]);
  expect((await testDb.select().from(schema.sumberMateri))[0].status).toBe("active");
  expect((await testDb.select().from(schema.ide)).every((row) => row.status === "published")).toBe(true);
  expect((await testDb.select().from(schema.relasiIde))[0].status).toBe("active");
  expect((await testDb.select().from(schema.bagianPembelajaran))[0].status).toBe("published");
  expect(await testDb.select().from(schema.asalIde)).toHaveLength(2);
  expect(await testDb.select().from(schema.bagianPembelajaranIde)).toHaveLength(2);
  expect((await testDb.select().from(schema.vectorSyncQueue)).filter((row) => row.action === "delete")).toHaveLength(0);
  expect(await withdrawIdeaBundle({ importId: "b", withdrawnBy: "admin" })).toMatchObject({ withdrawn: true, vectorJobCount: 3 });
  expect((await testDb.select().from(schema.sumberMateri))[0].status).toBe("withdrawn");
  expect((await testDb.select().from(schema.ide)).every((row) => row.status === "withdrawn")).toBe(true);
  expect((await testDb.select().from(schema.relasiIde))[0].status).toBe("withdrawn");
  expect((await testDb.select().from(schema.bagianPembelajaran))[0].status).toBe("withdrawn");
  expect((await testDb.select().from(schema.vectorSyncQueue)).filter((row) => row.action === "delete")).toHaveLength(3);
  await expect(publishIdeaBundle({ importId: "c", publishedBy: "admin", expectedRevision: c.manifest.bundleChecksum })).rejects.toThrow("IDEA_BUNDLE_ENTITY_RETIRED");
  expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, "c")))[0].status).toBe("approved");
}, 30000);

test("withdrawal retires only unshared entities when a smaller published bundle reuses part of the graph", async () => {
  await publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision: a.manifest.bundleChecksum });
  await publishIdeaBundle({ importId: "d", publishedBy: "admin", expectedRevision: d.manifest.bundleChecksum });
  expect(await withdrawIdeaBundle({ importId: "a", withdrawnBy: "admin" })).toMatchObject({ vectorJobCount: 1 });
  const ideas = await testDb.select().from(schema.ide);
  expect(ideas.find((row) => row.id === "idea-velocity")?.status).toBe("published");
  expect(ideas.find((row) => row.id === "idea-displacement")?.status).toBe("withdrawn");
  expect((await testDb.select().from(schema.sumberMateri))[0].status).toBe("active");
  expect((await testDb.select().from(schema.relasiIde))[0].status).toBe("withdrawn");
  expect((await testDb.select().from(schema.bagianPembelajaran))[0].status).toBe("withdrawn");
  const deletes = (await testDb.select().from(schema.vectorSyncQueue)).filter((row) => row.action === "delete");
  expect(deletes).toHaveLength(1);
  expect(deletes[0].payload).toMatchObject({ entityId: "idea-displacement" });
}, 30000);

test("a draft inventory does not keep an otherwise unreferenced canonical Idea active", async () => {
  await publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision: a.manifest.bundleChecksum });
  await testDb.insert(schema.itemImporBundle).values({ id: "draft-reference", imporBundleId: "b", entityType: "idea", entityId: "idea-velocity", entityVersion: 1, entityHash: "a".repeat(64), status: "published" });
  expect(await withdrawIdeaBundle({ importId: "a", withdrawnBy: "admin" })).toMatchObject({ vectorJobCount: 3 });
  expect((await testDb.select().from(schema.ide)).every((row) => row.status === "withdrawn")).toBe(true);
}, 30000);

test("retired relations and sections cannot be reused even when other shared rows remain active", async () => {
  await publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision: a.manifest.bundleChecksum });
  await testDb.update(schema.relasiIde).set({ status: "withdrawn" });
  await expect(publishIdeaBundle({ importId: "b", publishedBy: "admin", expectedRevision: b.manifest.bundleChecksum })).rejects.toThrow("IDEA_BUNDLE_ENTITY_RETIRED:relation:relation-motion");
  await testDb.update(schema.relasiIde).set({ status: "active" });
  await testDb.update(schema.bagianPembelajaran).set({ status: "superseded" });
  await expect(publishIdeaBundle({ importId: "b", publishedBy: "admin", expectedRevision: b.manifest.bundleChecksum })).rejects.toThrow("IDEA_BUNDLE_ENTITY_RETIRED:learning_section:section-motion");
}, 30000);

test("item review rechecks the locked import, final decision and snapshot before writing", async () => {
  await testDb.delete(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, "a"));
  await testDb.delete(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, "a"));
  await testDb.update(schema.imporBundle).set({ status: "validated" }).where(eq(schema.imporBundle.id, "a"));
  const input = { importId: "a", reviewerId: "admin", ideaId: "idea-velocity", status: "changes_requested" as const, notes: "late edit", expectedRevision: a.manifest.bundleChecksum };
  await testDb.insert(schema.reviewItemBundle).values({ id: "evidence", imporBundleId: "a", reviewerId: "admin", targetType: "idea", targetId: "idea-velocity", status: "approved", notes: "reviewed" });
  beforeTransaction = async () => { await testDb.insert(schema.reviewBundle).values({ id: "final-review", imporBundleId: "a", reviewerId: "admin", status: "approved" }); };
  await expect(upsertIdeaItemReview(input)).rejects.toThrow("IDEA_ITEM_REVIEW_IMMUTABLE");
  expect((await testDb.select().from(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, "a")))[0]).toMatchObject({ status: "approved", notes: "reviewed" });
  await testDb.delete(schema.reviewBundle).where(eq(schema.reviewBundle.id, "final-review"));
  beforeTransaction = async () => { await testDb.update(schema.imporBundle).set({ status: "published" }).where(eq(schema.imporBundle.id, "a")); };
  await expect(upsertIdeaItemReview(input)).rejects.toThrow("IDEA_ITEM_REVIEW_DRAFT_REQUIRED");
  expect((await testDb.select().from(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, "a")))[0]).toMatchObject({ status: "approved", notes: "reviewed" });
  await testDb.update(schema.imporBundle).set({ status: "validated" }).where(eq(schema.imporBundle.id, "a"));
  beforeTransaction = async () => { await testDb.update(schema.imporBundle).set({ checksum: "f".repeat(64) }).where(eq(schema.imporBundle.id, "a")); };
  await expect(upsertIdeaItemReview(input)).rejects.toThrow("IDEA_BUNDLE_STALE_CONTEXT");
  expect((await testDb.select().from(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, "a")))[0]).toMatchObject({ status: "approved", notes: "reviewed" });
}, 30000);

test("Admin decisions require the viewed revision and audited decisions for every Idea", async () => {
  await testDb.delete(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, "a"));
  await testDb.delete(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, "a"));
  await testDb.delete(schema.auditMutasi).where(eq(schema.auditMutasi.entityId, "a"));
  await testDb.update(schema.imporBundle).set({ status: "validated" }).where(eq(schema.imporBundle.id, "a"));
  const review = { importId: "a", reviewerId: "admin", decision: "approved" as const, expectedRevision: a.manifest.bundleChecksum };
  await expect(reviewIdeaBundle({ ...review, expectedRevision: undefined } as any)).rejects.toThrow("IDEA_BUNDLE_STALE_CONTEXT");
  await expect(reviewIdeaBundle({ ...review, expectedRevision: "f".repeat(64) })).rejects.toThrow("IDEA_BUNDLE_STALE_CONTEXT");
  await expect(upsertIdeaItemReview({ importId: "a", reviewerId: "admin", ideaId: "idea-velocity", status: "approved", expectedRevision: undefined } as any)).rejects.toThrow("IDEA_BUNDLE_STALE_CONTEXT");
  await expect(reviewIdeaBundle(review)).rejects.toThrow("IDEA_BUNDLE_ITEM_REVIEW_INCOMPLETE");
  // Rows from an older or unbound review cannot be turned into current evidence.
  await testDb.insert(schema.reviewItemBundle).values([
    { id: "old-1", imporBundleId: "a", reviewerId: "admin", targetType: "idea", targetId: "idea-velocity", status: "approved" },
    { id: "old-2", imporBundleId: "a", reviewerId: "admin", targetType: "idea", targetId: "idea-displacement", status: "approved" },
  ]);
  await expect(reviewIdeaBundle(review)).rejects.toThrow("IDEA_BUNDLE_ITEM_REVIEW_INCOMPLETE");
  for (const ideaId of ["idea-velocity", "idea-displacement"]) {
    await upsertIdeaItemReview({ importId: "a", reviewerId: "admin", ideaId, status: "approved", notes: "Checked source", expectedRevision: review.expectedRevision });
  }
  beforeTransaction = async () => { await testDb.update(schema.imporBundle).set({ checksum: "f".repeat(64) }).where(eq(schema.imporBundle.id, "a")); };
  await expect(reviewIdeaBundle(review)).rejects.toThrow("IDEA_BUNDLE_STALE_CONTEXT");
  expect(await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, "a"))).toHaveLength(0);
  await testDb.update(schema.imporBundle).set({ checksum: review.expectedRevision }).where(eq(schema.imporBundle.id, "a"));
  expect(await reviewIdeaBundle(review)).toMatchObject({ status: "approved" });
  expect(await reviewIdeaBundle(review)).toMatchObject({ status: "approved" });
  const revisionAudits = (await testDb.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.entityId, "a"))).filter((row) => row.action === "revision_reviewed");
  expect(revisionAudits).toHaveLength(1);
  expect(revisionAudits[0].afterSnapshot).toMatchObject({ revision: review.expectedRevision, decision: "approved", items: [{ ideaId: "idea-displacement", status: "approved" }, { ideaId: "idea-velocity", status: "approved" }] });
  await expect(publishIdeaBundle({ importId: "a", publishedBy: "admin" } as any)).rejects.toThrow("IDEA_BUNDLE_STALE_CONTEXT");
  await expect(publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision: "f".repeat(64) })).rejects.toThrow("IDEA_BUNDLE_STALE_CONTEXT");
  beforeTransaction = async () => { await testDb.update(schema.imporBundle).set({ checksum: "f".repeat(64) }).where(eq(schema.imporBundle.id, "a")); };
  await expect(publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision: review.expectedRevision })).rejects.toThrow("IDEA_BUNDLE_PUBLICATION_CONFLICT");
  expect(await testDb.select().from(schema.publikasiBundle).where(eq(schema.publikasiBundle.imporBundleId, "a"))).toHaveLength(0);
  await testDb.update(schema.imporBundle).set({ checksum: review.expectedRevision }).where(eq(schema.imporBundle.id, "a"));
  await testDb.insert(schema.user).values({ id: "other-admin", name: "Other", email: "other@example.test", role: "admin" });
  await provisionPenggunaForNewUser({ id: "other-admin", role: "admin" });
  await expect(publishIdeaBundle({ importId: "a", publishedBy: "other-admin", expectedRevision: review.expectedRevision })).rejects.toThrow("IDEA_BUNDLE_ADMIN_APPROVAL_REQUIRED");
  const transferred = await getIdeaRevisionReviewContext({ importId: "a", reviewerId: "other-admin", expectedRevision: review.expectedRevision });
  expect(await reviewIdeaBundleRevision({ importId: "a", reviewerId: "other-admin", expectedRevision: review.expectedRevision, decision: "approved", items: transferred.ideas.map(idea => ({ ideaId: idea.id, ideaHash: idea.ideaHash!, status: "approved" as const })) })).toMatchObject({ recorded: true, status: "approved" });
  expect(await publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision: review.expectedRevision })).toMatchObject({ published: true });
  expect(await publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision: review.expectedRevision })).toMatchObject({ published: false });
}, 30000);

test("replacing a viewed revision clears decisions and rejects its old review and publish requests", async () => {
  const oldRevision = a.manifest.bundleChecksum;
  const newRevision = replacement.manifest.bundleChecksum;
  expect(newRevision).not.toBe(oldRevision);
  expect(await testDb.select().from(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, "a"))).toHaveLength(2);
  await stageIdeaBundle({
    runId: "replacement", bundleId: replacement.manifest.bundleId, courseId: "course-physics", schemaVersion: 3,
    checksum: newRevision, bytes: replacement.bytes, requestedBy: "admin", replaceImportId: "a", expectedPreviousChecksum: oldRevision,
    reviewResetFingerprint: (await getIdeaReviewResetState("a", oldRevision)).fingerprint,
    items: [{ entityType: "idea", entityId: "idea-velocity", entityVersion: 1, entityHash: "a".repeat(64) }],
    validationReport: { valid: true, reasonCodes: [], fileCount: 0, entityCount: 1, sourceCount: 1, relationCount: 1, warnings: [] },
  });
  expect(await testDb.select().from(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, "a"))).toHaveLength(0);
  expect(await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, "a"))).toHaveLength(0);
  await expect(reviewIdeaBundle({ importId: "a", reviewerId: "admin", decision: "approved", expectedRevision: oldRevision })).rejects.toThrow("IDEA_BUNDLE_STALE_CONTEXT");
  await expect(publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision: oldRevision })).rejects.toThrow("IDEA_BUNDLE_STALE_CONTEXT");
  await expect(reviewIdeaBundle({ importId: "a", reviewerId: "admin", decision: "approved", expectedRevision: newRevision })).rejects.toThrow("IDEA_BUNDLE_ITEM_REVIEW_INCOMPLETE");
}, 30000);

test("a legacy bundle decision can be reaffirmed explicitly, then its item evidence is immutable", async () => {
  const expectedRevision = a.manifest.bundleChecksum;
  await testDb.delete(schema.auditMutasi).where(and(eq(schema.auditMutasi.entityId, "a"), eq(schema.auditMutasi.action, "revision_reviewed")));
  await testDb.delete(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, "a"));
  for (const ideaId of ["idea-velocity", "idea-displacement"]) {
    await upsertIdeaItemReview({ importId: "a", reviewerId: "admin", ideaId, status: "approved", expectedRevision });
  }
  await expect(reviewIdeaBundle({ importId: "a", reviewerId: "admin", decision: "rejected", expectedRevision })).rejects.toThrow("IDEA_BUNDLE_REVIEW_IMMUTABLE");
  expect(await reviewIdeaBundle({ importId: "a", reviewerId: "admin", decision: "approved", expectedRevision })).toMatchObject({ status: "approved" });
  await expect(upsertIdeaItemReview({ importId: "a", reviewerId: "admin", ideaId: "idea-velocity", status: "changes_requested", expectedRevision })).rejects.toThrow("IDEA_ITEM_REVIEW_IMMUTABLE");
  expect(await publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision })).toMatchObject({ published: true });
}, 30000);

test("revision-bound discard leaves a replacement draft and its review history intact", async () => {
  await expect(discardIdeaBundleDraft({ importId: "a", actorId: "admin", expectedRevision: "f".repeat(64) })).rejects.toThrow("IDEA_BUNDLE_STALE_CONTEXT");
  expect(await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, "a"))).toHaveLength(1);
  expect(await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, "a"))).toHaveLength(1);
  expect(await discardIdeaBundleDraft({ importId: "a", actorId: "admin", expectedRevision: a.manifest.bundleChecksum })).toMatchObject({ discarded: true });
}, 30000);


test("a publisher's exact approved review survives another reviewer's rejection", async () => {
  const expectedRevision = a.manifest.bundleChecksum;
  const second = await getIdeaRevisionReviewContext({ importId: "a", reviewerId: "curator-1", expectedRevision });
  await reviewIdeaBundleRevision({ importId: "a", reviewerId: "curator-1", expectedRevision, decision: "rejected", notes: "Different reviewer judgement", items: second.ideas.map(idea => ({ ideaId: idea.id, ideaHash: idea.ideaHash!, status: "changes_requested", notes: "Needs a different explanation" })) });
  expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, "a")))[0].status).toBe("rejected");
  const first = await getIdeaRevisionReviewContext({ importId: "a", reviewerId: "admin", expectedRevision });
  expect(await reviewIdeaBundleRevision({ importId: "a", reviewerId: "admin", expectedRevision, decision: "approved", items: first.ideas.map(idea => ({ ideaId: idea.id, ideaHash: idea.ideaHash!, status: "approved" })) })).toMatchObject({ recorded: false, status: "rejected" });
  await expect(publishIdeaBundle({ importId: "a", publishedBy: "curator-1", expectedRevision })).rejects.toThrow("IDEA_BUNDLE_ADMIN_APPROVAL_REQUIRED");
  expect(await publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision })).toMatchObject({ published: true });
  const saved = await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, "a"));
  expect(saved.find(review => review.reviewerId === "admin")?.status).toBe("approved");
  expect(saved.find(review => review.reviewerId === "curator-1")?.status).toBe("rejected");
}, 30000);

for (const surface of ["headless", "admin"] as const) {
  test(`legacy approval can be reaffirmed after another reviewer rejects through ${surface}`, async () => {
    const expectedRevision = a.manifest.bundleChecksum;
    await testDb.delete(schema.auditMutasi).where(and(eq(schema.auditMutasi.entityId, "a"), eq(schema.auditMutasi.actorId, "admin"), eq(schema.auditMutasi.action, "revision_reviewed")));
    await testDb.delete(schema.reviewItemBundle).where(and(eq(schema.reviewItemBundle.imporBundleId, "a"), eq(schema.reviewItemBundle.reviewerId, "admin")));
    const second = await getIdeaRevisionReviewContext({ importId: "a", reviewerId: "curator-1", expectedRevision });
    await reviewIdeaBundleRevision({ importId: "a", reviewerId: "curator-1", expectedRevision, decision: "rejected", items: second.ideas.map(idea => ({ ideaId: idea.id, ideaHash: idea.ideaHash!, status: "changes_requested", notes: "Other reviewer requests revision" })) });
    expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, "a")))[0].status).toBe("rejected");
    expect(await hasIdeaRevisionReviewEvidence({ importId: "a", reviewerId: "admin", expectedRevision })).toBe(false);
    const context = await getIdeaRevisionReviewContext({ importId: "a", reviewerId: "admin", expectedRevision });
    const items = context.ideas.map(idea => ({ ideaId: idea.id, ideaHash: idea.ideaHash!, status: "approved" as const }));
    for (const item of items) await upsertIdeaItemReview({ importId: "a", reviewerId: "admin", ideaId: item.ideaId, status: "approved", expectedRevision });
    if (surface === "headless") {
      await expect(reviewIdeaBundleRevision({ importId: "a", reviewerId: "admin", expectedRevision, decision: "approved", notes: "Changed legacy note", items })).rejects.toThrow("IDEA_BUNDLE_REVIEW_IMMUTABLE");
      expect(await reviewIdeaBundleRevision({ importId: "a", reviewerId: "admin", expectedRevision, decision: "approved", items })).toMatchObject({ recorded: true, status: "approved" });
    } else {
      await expect(reviewIdeaBundle({ importId: "a", reviewerId: "admin", expectedRevision, decision: "approved", notes: "Changed legacy note" })).rejects.toThrow("IDEA_BUNDLE_REVIEW_IMMUTABLE");
      expect(await reviewIdeaBundle({ importId: "a", reviewerId: "admin", expectedRevision, decision: "approved" })).toMatchObject({ status: "approved" });
    }
    expect(await hasIdeaRevisionReviewEvidence({ importId: "a", reviewerId: "admin", expectedRevision })).toBe(true);
    await expect(upsertIdeaItemReview({ importId: "a", reviewerId: "admin", ideaId: items[0].ideaId, status: "changes_requested", expectedRevision })).rejects.toThrow("IDEA_ITEM_REVIEW_IMMUTABLE");
    expect(await publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision })).toMatchObject({ published: true });
  }, 30000);
}

for (const surface of ["headless", "admin"] as const) {
  test(`legacy rejection can be reaffirmed after another reviewer approves through ${surface}`, async () => {
    const expectedRevision = a.manifest.bundleChecksum;
    await testDb.delete(schema.auditMutasi).where(and(eq(schema.auditMutasi.entityId, "a"), eq(schema.auditMutasi.actorId, "admin"), eq(schema.auditMutasi.action, "revision_reviewed")));
    await testDb.update(schema.reviewBundle).set({ status: "rejected", notes: "Original rejection" }).where(and(eq(schema.reviewBundle.imporBundleId, "a"), eq(schema.reviewBundle.reviewerId, "admin")));
    const second = await getIdeaRevisionReviewContext({ importId: "a", reviewerId: "curator-1", expectedRevision });
    await reviewIdeaBundleRevision({ importId: "a", reviewerId: "curator-1", expectedRevision, decision: "approved", items: second.ideas.map(idea => ({ ideaId: idea.id, ideaHash: idea.ideaHash!, status: "approved" })) });
    expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, "a")))[0].status).toBe("approved");
    expect(await hasIdeaRevisionReviewEvidence({ importId: "a", reviewerId: "admin", expectedRevision })).toBe(false);
    const items = second.ideas.map(idea => ({ ideaId: idea.id, ideaHash: idea.ideaHash!, status: "changes_requested" as const, notes: "Needs source correction" }));
    for (const item of items) await upsertIdeaItemReview({ importId: "a", reviewerId: "admin", ideaId: item.ideaId, status: item.status, notes: item.notes, expectedRevision });
    if (surface === "headless") {
      await expect(reviewIdeaBundleRevision({ importId: "a", reviewerId: "admin", expectedRevision, decision: "approved", items: items.map(item => ({ ...item, status: "approved" })) })).rejects.toThrow("IDEA_BUNDLE_REVIEW_IMMUTABLE");
      expect(await reviewIdeaBundleRevision({ importId: "a", reviewerId: "admin", expectedRevision, decision: "rejected", notes: "Original rejection", items })).toMatchObject({ status: "rejected" });
    } else {
      await expect(reviewIdeaBundle({ importId: "a", reviewerId: "admin", expectedRevision, decision: "approved" })).rejects.toThrow("IDEA_BUNDLE_REVIEW_IMMUTABLE");
      expect(await reviewIdeaBundle({ importId: "a", reviewerId: "admin", expectedRevision, decision: "rejected", notes: "Original rejection" })).toMatchObject({ status: "rejected" });
    }
    expect(await hasIdeaRevisionReviewEvidence({ importId: "a", reviewerId: "admin", expectedRevision })).toBe(true);
    await expect(publishIdeaBundle({ importId: "a", publishedBy: "admin", expectedRevision })).rejects.toThrow("IDEA_BUNDLE_ADMIN_APPROVAL_REQUIRED");
    expect(await publishIdeaBundle({ importId: "a", publishedBy: "curator-1", expectedRevision })).toMatchObject({ published: true });
  }, 30000);
}


test("replacement requires acknowledgement of every review and rejects a concurrent addition", async () => {
  const revision = a.manifest.bundleChecksum;
  const state = await getIdeaReviewResetState("a", revision);
  expect(state).toMatchObject({ revision, itemReviewCount: 2, bundleReviewCount: 1 });
  expect(JSON.stringify(state)).not.toContain("admin");
  const input = { runId: "replacement", bundleId: replacement.manifest.bundleId, courseId: "course-physics", schemaVersion: 3,
    checksum: replacement.manifest.bundleChecksum, bytes: replacement.bytes, requestedBy: "admin", replaceImportId: "a", expectedPreviousChecksum: revision,
    items: [{ entityType: "idea", entityId: "idea-velocity", entityVersion: 1, entityHash: "a".repeat(64) }],
    validationReport: { valid: true, reasonCodes: [], fileCount: 0, entityCount: 1, sourceCount: 1, relationCount: 1, warnings: [] } };
  await expect(stageIdeaBundle(input)).rejects.toThrow("IDEA_BUNDLE_REVIEW_RESET_REQUIRED");
  beforeTransaction = async () => { await testDb.insert(schema.reviewItemBundle).values({ id: "other-review", imporBundleId: "a", reviewerId: "curator-1", targetType: "idea", targetId: "idea-velocity", status: "pending", notes: "private note" }); };
  await expect(stageIdeaBundle({ ...input, reviewResetFingerprint: state.fingerprint })).rejects.toThrow("IDEA_BUNDLE_REVIEW_RESET_STALE");
  const refreshed = await getIdeaReviewResetState("a", revision);
  expect(refreshed.itemReviewCount).toBe(3);
  expect(JSON.stringify(refreshed)).not.toContain("private note");
  expect(refreshed.fingerprint).not.toBe(state.fingerprint);
  expect((await stageIdeaBundle({ ...input, reviewResetFingerprint: refreshed.fingerprint })).checksum).toBe(replacement.manifest.bundleChecksum);
}, 30000);

test("unchanged replacement does not require review reset acknowledgement", async () => {
  const revision = a.manifest.bundleChecksum;
  const result = await stageIdeaBundle({ runId: "same", bundleId: a.manifest.bundleId, courseId: "course-physics", schemaVersion: 3, checksum: revision, bytes: a.bytes, requestedBy: "admin", replaceImportId: "a", expectedPreviousChecksum: revision,
    items: [{ entityType: "idea", entityId: "idea-velocity", entityVersion: 1, entityHash: "a".repeat(64) }], validationReport: { valid: true, reasonCodes: [], fileCount: 0, entityCount: 1, sourceCount: 1, relationCount: 1, warnings: [] } });
  expect(result.status).toBe("existing");
  expect(await testDb.select().from(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, "a"))).toHaveLength(2);
}, 30000);

test("a review added after an empty summary still requires reset acknowledgement", async () => {
  await testDb.delete(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, "a"));
  await testDb.delete(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, "a"));
  const revision = a.manifest.bundleChecksum;
  const empty = await getIdeaReviewResetState("a", revision);
  expect(empty.itemReviewCount + empty.bundleReviewCount).toBe(0);
  beforeTransaction = async () => { await testDb.insert(schema.reviewItemBundle).values({ id: "late-item", imporBundleId: "a", reviewerId: "curator-1", targetType: "idea", targetId: "idea-velocity", status: "pending" }); };
  await expect(stageIdeaBundle({ runId: "replacement", bundleId: replacement.manifest.bundleId, courseId: "course-physics", schemaVersion: 3, checksum: replacement.manifest.bundleChecksum, bytes: replacement.bytes, requestedBy: "admin", replaceImportId: "a", expectedPreviousChecksum: revision,
    items: [{ entityType: "idea", entityId: "idea-velocity", entityVersion: 1, entityHash: "a".repeat(64) }], validationReport: { valid: true, reasonCodes: [], fileCount: 0, entityCount: 1, sourceCount: 1, relationCount: 1, warnings: [] } })).rejects.toThrow("IDEA_BUNDLE_REVIEW_RESET_REQUIRED");
  expect(await testDb.select().from(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, "a"))).toHaveLength(1);
}, 30000);
