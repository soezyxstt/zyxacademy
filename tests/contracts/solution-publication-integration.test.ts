import { afterAll, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { zipSync } from "fflate";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { solutionCollectionFixture as collection } from "@/app/visual-fixtures/solution-collection/fixture";
import { computeProductBundleChecksum, deterministicProductSerialization, parseProductBundle } from "@/lib/bundle/product-validator";
import { solutionItemHash } from "@/lib/solutions/review-contract";

// Isolated in-process PostgreSQL and memory objects. No application credentials are used.
const { client } = await createPostgresTestDb();
const publicationQueries: { sql: string; params: unknown[] }[] = [];
const testDb = drizzle(client, { schema, logger: { logQuery(sql, params) { publicationQueries.push({ sql, params }); } } });
const objects = new Map<string, Uint8Array>();
let beforeTransaction: (() => Promise<void>) | undefined;
const wrappedDb = new Proxy(testDb, { get(target, key) {
  if (key === "transaction") return async (callback: (tx: any) => Promise<unknown>) => {
    const hook = beforeTransaction;
    beforeTransaction = undefined;
    if (hook) await hook();
    return target.transaction(callback);
  };
  const value = Reflect.get(target, key, target);
  return typeof value === "function" ? value.bind(target) : value;
} });
mock.module("@/db", () => ({ db: wrappedDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("@/lib/storage", () => ({ storage: {
  upload: async (bytes: Uint8Array, _name: string, _mime: string, options: { key: string }) => { objects.set(options.key, bytes); return { key: options.key }; },
  download: async (key: string) => { const value = objects.get(key); if (!value) throw new Error("MISSING_FIXTURE_OBJECT"); return value; },
  delete: async (key: string) => { objects.delete(key); },
} }));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: () => { throw new Error("V5_MUST_NOT_INDEX"); } }));
const originalHeaders = { ...await import("next/headers") };
const originalAuth = { ...await import("@/lib/auth") };
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "admin", role: "admin" } }) } } }));
const { stageProductBundle, getProductBundleImport, discardProductBundleDraft } = await import("@/lib/bundle/product-staging");
const { publishProductBundle, withdrawProductBundle } = await import("@/lib/bundle/product-publication");
const { getSolutionCollectionReviewContext, reviewSolutionCollection } = await import("@/lib/solutions/review");
const { evaluateProductBundleQualityPolicy } = await import("@/lib/bundle/product-review-gate");
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
const solutionRoute = await import("@/app/api/admin/bundles/product/[id]/solution-review/route");
const publicationRoute = await import("@/app/api/admin/bundles/product/[id]/publish/route");
const withdrawalRoute = await import("@/app/api/admin/bundles/product/[id]/withdraw/route");
afterAll(async () => {
  mock.module("next/headers", () => originalHeaders);
  mock.module("@/lib/auth", () => originalAuth);
  await client.close();
});
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const ideaHash = "a".repeat(64), sourceHash = "b".repeat(64);
function bundle(reason = "Original strategy") {
  const body = { id: collection.id, productType: "solution_collection", courseId: collection.course.id, chapterId: collection.chapter.id,
    version: 1, status: "draft", schemaVersion: "solution_collection.v1", title: collection.title, sourceHash, creatorId: "admin",
    ideaLinks: [{ id: "idea", version: 1, semanticHash: ideaHash, weight: 1, role: "primary" }],
    sourceRefs: [{ sourceId: "source", version: 1, checksum: sourceHash, excerptIds: ["excerpt"] }],
    collection: { ...collection, items: [{ ...collection.items[0], steps: [{ ...collection.items[0].steps[0], reasonMarkdown: reason }, ...collection.items[0].steps.slice(1)] }] } };
  const product = { ...body, generationHash: hash(deterministicProductSerialization(body)) };
  const dependencies = [
    { id: "idea-edge", upstreamEntityType: "idea", upstreamEntityId: "idea", upstreamVersion: 1, upstreamHash: ideaHash },
    { id: "source-edge", upstreamEntityType: "source_material", upstreamEntityId: "source", upstreamVersion: 1, upstreamHash: sourceHash },
  ].map(edge => ({ ...edge, downstreamEntityType: "solution_collection", downstreamEntityId: product.id, downstreamVersion: 1, downstreamHash: product.generationHash, freshness: "UP_TO_DATE" }));
  const encode = (value: unknown) => new TextEncoder().encode(deterministicProductSerialization(value));
  const files = new Map([["products.json", encode([product])], ["dependencies.json", encode(dependencies)]]);
  const manifest = { bundleId: "fixture-solution-bundle", bundleType: "product" as const, schemaVersion: "product-bundle.v5" as const, courseId: collection.course.id, creatorId: "admin", createdAt: "2026-01-01T00:00:00Z", conflicts: [],
    entityFiles: [...files].map(([path, bytes]) => ({ path, checksum: hash(bytes), entityType: path === "products.json" ? "products" as const : "dependencies" as const, stableIds: path === "products.json" ? [product.id] : dependencies.map(edge => edge.id) })) };
  files.set("manifest.json", encode({ ...manifest, bundleChecksum: computeProductBundleChecksum(manifest, files) }));
  const parsed = parseProductBundle(files);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
  return { data: parsed.data, bytes: zipSync(Object.fromEntries(files), { level: 0 }) };
}
async function stage(value: ReturnType<typeof bundle>, expectedPreviousChecksum?: string) {
  return stageProductBundle({ bundle: value.data, bytes: value.bytes, runId: "synthetic-local", bundleId: value.data.manifest.bundleId,
    courseId: collection.course.id, checksum: value.data.checksum, requestedBy: "admin", expectedPreviousChecksum });
}

test("V5 authorization and lifecycle: active session, revocation, transaction boundary, revision and release", async () => {
  await testDb.insert(schema.courses).values({ id: collection.course.id, title: collection.course.title, category: "Matematika" });
  await testDb.insert(schema.mataKuliah).values({ id: collection.course.id, code: "V5", title: collection.course.title, status: "active", legacyCourseId: collection.course.id });
  await testDb.insert(schema.user).values({ id: "admin", name: "Fixture", email: "fixture@example.test", role: "admin" });
  await provisionPenggunaForNewUser({ id: "admin", role: "admin" });
  await testDb.insert(schema.bab).values({ id: collection.chapter.id, mataKuliahId: collection.course.id, code: "B1", title: collection.chapter.title, orderIndex: 0, status: "active" });
  await testDb.insert(schema.ide).values({ id: "idea", mataKuliahId: collection.course.id, babId: collection.chapter.id, stableKey: "idea", code: "I1", canonicalStatement: "Area", conciseExplanation: "Area of a triangle", knowledgeKind: "definition", instructionalRole: "core", difficultyMetadata: {}, version: 1, status: "published", sourcePolicy: "source_grounded", schemaVersion: "1.0", semanticHash: ideaHash, generationHash: ideaHash, creatorId: "admin" });
  await testDb.insert(schema.sumberMateri).values({ id: "source", mataKuliahId: collection.course.id, babId: collection.chapter.id, sourceType: "markdown", title: "Fixture source", canonicalUriOrR2Key: "local-fixture.md", version: 1, checksum: sourceHash, status: "active", creatorId: "admin" });
  await testDb.insert(schema.potonganSumber).values({ id: "excerpt", sumberMateriId: "source", sourceVersion: 1, content: "Triangle area", startOffset: 0, endOffset: 13, checksum: sourceHash, embeddingEligible: false });
  const first = bundle(), next = bundle("A changed explanation");
  const staged = await stage(first);
  const input = { importId: staged.importId, publishedBy: "admin", expectedRevision: first.data.checksum };
  await expect(publishProductBundle(input)).rejects.toThrow("PRODUCT_BUNDLE_ADMIN_APPROVAL_REQUIRED");
  await expect(stage(next)).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
  await stage(next, first.data.checksum);
  expect(objects.has((await getProductBundleImport(staged.importId))!.sourceUriOrKey)).toBe(true);
  await expect(publishProductBundle(input)).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
  const current = (await getProductBundleImport(staged.importId))!;
  const scope = { revision: next.data.checksum, bundleId: current.bundleId, sourceUriOrKey: current.sourceUriOrKey, storedCourseId: current.courseId, courseId: collection.course.id, chapterId: collection.chapter.id };
  await expect(getSolutionCollectionReviewContext({ importId: staged.importId, reviewerId: "admin", expectedRevision: first.data.checksum, scope })).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
  await expect(getSolutionCollectionReviewContext({ importId: staged.importId, reviewerId: "admin", expectedRevision: scope.revision, scope: { ...scope, chapterId: "other" } })).rejects.toThrow("AUTHORING_MCP_IMPORT_SCOPE_MISMATCH");
  beforeTransaction = async () => { await testDb.update(schema.imporBundle).set({ sourceUriOrKey: "raced-object" }).where(eq(schema.imporBundle.id, staged.importId)); };
  await expect(getSolutionCollectionReviewContext({ importId: staged.importId, reviewerId: "admin", expectedRevision: scope.revision, scope })).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
  await testDb.update(schema.imporBundle).set({ sourceUriOrKey: scope.sourceUriOrKey }).where(eq(schema.imporBundle.id, staged.importId));
  const context = await getSolutionCollectionReviewContext({ importId: staged.importId, reviewerId: "admin", expectedRevision: scope.revision, scope });
  const approvedItems = context.collection.items.map(item => ({ itemId: item.id, itemHash: solutionItemHash(item), correctness: "approved" as const, reasoning: "approved" as const, problemProvenance: "approved" as const, solutionProvenance: "approved" as const, release: "approved" as const }));
  const firstSave = { importId: staged.importId, reviewerId: "admin", expectedRevision: context.revision, expectedReviewVersion: context.reviewVersion, decision: "approved" as const, items: approvedItems };
  const routeContext = { params: Promise.resolve({ id: staged.importId }) };
  const reviewUrl = "https://example.test/admin/solution-review";
  const reviewRequest = () => new Request(reviewUrl, { method: "POST", body: JSON.stringify(firstSave) });
  const publicationRequest = () => new Request("https://example.test/admin/publish", { method: "POST", body: JSON.stringify({ expectedRevision: context.revision }) });
  // The GET contract keeps the displayed checksum requirement and conflict behavior.
  expect((await solutionRoute.GET(new Request(reviewUrl), routeContext)).status).toBe(400);
  expect((await solutionRoute.GET(new Request(`${reviewUrl}?expectedRevision=${"f".repeat(64)}`), routeContext)).status).toBe(409);
  expect((await solutionRoute.GET(new Request(`${reviewUrl}?expectedRevision=${context.revision}`), routeContext)).status).toBe(200);
  await testDb.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, "admin"));
  expect((await solutionRoute.GET(new Request(`${reviewUrl}?expectedRevision=${context.revision}`), routeContext)).status).toBe(403);
  expect((await solutionRoute.POST(reviewRequest(), routeContext)).status).toBe(403);
  expect((await publicationRoute.POST(publicationRequest(), routeContext)).status).toBe(403);
  await expect(reviewSolutionCollection(firstSave)).rejects.toThrow("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");
  await expect(publishProductBundle({ ...input, expectedRevision: context.revision })).rejects.toThrow("PRODUCT_BUNDLE_PUBLISH_FORBIDDEN");
  await testDb.update(schema.pengguna).set({ status: "active" }).where(eq(schema.pengguna.id, "admin"));
  await testDb.delete(schema.penggunaPeran).where(eq(schema.penggunaPeran.penggunaId, "admin"));
  expect((await solutionRoute.GET(new Request(`${reviewUrl}?expectedRevision=${context.revision}`), routeContext)).status).toBe(403);
  expect((await publicationRoute.POST(publicationRequest(), routeContext)).status).toBe(403);
  await expect(reviewSolutionCollection(firstSave)).rejects.toThrow("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");
  await expect(publishProductBundle({ ...input, expectedRevision: context.revision })).rejects.toThrow("PRODUCT_BUNDLE_PUBLISH_FORBIDDEN");
  await provisionPenggunaForNewUser({ id: "admin", role: "admin" });
  // This fixture hook commits suspension after preflight and before the write transaction.
  beforeTransaction = async () => { await testDb.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, "admin")); };
  await expect(reviewSolutionCollection(firstSave)).rejects.toThrow("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");
  expect(await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, staged.importId))).toHaveLength(0);
  await testDb.update(schema.pengguna).set({ status: "active" }).where(eq(schema.pengguna.id, "admin"));
  beforeTransaction = async () => { await testDb.delete(schema.penggunaPeran).where(eq(schema.penggunaPeran.penggunaId, "admin")); };
  await expect(reviewSolutionCollection(firstSave)).rejects.toThrow("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");
  expect(await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, staged.importId))).toHaveLength(0);
  await provisionPenggunaForNewUser({ id: "admin", role: "admin" });

  beforeTransaction = async () => { await testDb.update(schema.imporBundle).set({ sourceUriOrKey: "raced-object" }).where(eq(schema.imporBundle.id, staged.importId)); };
  await expect(reviewSolutionCollection({ ...firstSave, scope })).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
  await testDb.update(schema.imporBundle).set({ sourceUriOrKey: scope.sourceUriOrKey }).where(eq(schema.imporBundle.id, staged.importId));
  await reviewSolutionCollection({ ...firstSave, scope });
  const activeReviewRequest = new Request(reviewUrl, { method: "POST", body: JSON.stringify({ expectedRevision: firstSave.expectedRevision, expectedReviewVersion: firstSave.expectedReviewVersion, decision: firstSave.decision, items: firstSave.items }) });
  expect((await solutionRoute.POST(activeReviewRequest, routeContext)).status).toBe(200);
  expect((await reviewSolutionCollection(firstSave)).created).toBe(false);
  const beforeOtherTab = await getSolutionCollectionReviewContext({ importId: staged.importId, reviewerId: "admin" });
  const newer = await reviewSolutionCollection({ ...firstSave, expectedReviewVersion: beforeOtherTab.reviewVersion, decision: "rejected", items: approvedItems.map(item => ({ ...item, reasoning: "changes_requested" })) });
  expect(newer.reviewVersion).not.toBe(beforeOtherTab.reviewVersion);
  await expect(reviewSolutionCollection({ ...firstSave, expectedReviewVersion: beforeOtherTab.reviewVersion })).rejects.toThrow("PRODUCT_V5_REVIEW_STALE");
  expect((await getSolutionCollectionReviewContext({ importId: staged.importId, reviewerId: "admin" })).savedReview?.decision).toBe("rejected");
  await reviewSolutionCollection({ ...firstSave, expectedReviewVersion: newer.reviewVersion });
  expect((await evaluateProductBundleQualityPolicy({ bundle: next.data }, { imporBundleId: staged.importId, publisherId: "admin" })).publicationReady).toBe(true);
  await testDb.update(schema.ide).set({ semanticHash: "c".repeat(64) }).where(eq(schema.ide.id, "idea"));
  expect((await evaluateProductBundleQualityPolicy({ bundle: next.data }, { imporBundleId: staged.importId, publisherId: "admin" })).publicationReady).toBe(false);
  await expect(publishProductBundle({ ...input, expectedRevision: context.revision })).rejects.toThrow("PRODUCT_BUNDLE_IDEA_VERSION_MISMATCH");
  expect(await testDb.select().from(schema.solutionCollections)).toHaveLength(0);
  await testDb.update(schema.ide).set({ semanticHash: ideaHash }).where(eq(schema.ide.id, "idea"));
  beforeTransaction = async () => { await testDb.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, "admin")); };
  await expect(publishProductBundle({ ...input, expectedRevision: context.revision })).rejects.toThrow("PRODUCT_BUNDLE_PUBLISH_FORBIDDEN");
  expect(await testDb.select().from(schema.solutionCollections)).toHaveLength(0);
  expect(await testDb.select().from(schema.publikasiBundle)).toHaveLength(0);
  await testDb.update(schema.pengguna).set({ status: "active" }).where(eq(schema.pengguna.id, "admin"));
  const approvedBeforeRevocation = await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, staged.importId));
  beforeTransaction = async () => { await testDb.delete(schema.penggunaPeran).where(eq(schema.penggunaPeran.penggunaId, "admin")); };
  await expect(publishProductBundle({ ...input, expectedRevision: context.revision })).rejects.toThrow("PRODUCT_BUNDLE_PUBLISH_FORBIDDEN");
  expect(await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, staged.importId))).toEqual(approvedBeforeRevocation);
  expect(await testDb.select().from(schema.publikasiBundle)).toHaveLength(0);
  await provisionPenggunaForNewUser({ id: "admin", role: "admin" });

  beforeTransaction = async () => { await testDb.update(schema.imporBundle).set({ sourceUriOrKey: "raced-object" }).where(eq(schema.imporBundle.id, staged.importId)); };
  await expect(publishProductBundle({ ...input, expectedRevision: context.revision, solutionScope: scope })).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
  await testDb.update(schema.imporBundle).set({ sourceUriOrKey: scope.sourceUriOrKey }).where(eq(schema.imporBundle.id, staged.importId));
  await expect(publishProductBundle({ ...input, expectedRevision: context.revision, testFailureAfter: "outbox" })).rejects.toThrow("PRODUCT_BUNDLE_TEST_FAILURE");
  expect(await testDb.select().from(schema.solutionCollections)).toHaveLength(0);
  publicationQueries.length = 0;
  const activePublication = await publicationRoute.POST(publicationRequest(), routeContext);
  expect(activePublication.status).toBe(200);
  const dependencyLocks = publicationQueries.map((query, index) => ({ ...query, index })).filter(query => query.sql.includes("pg_advisory_xact_lock") && String(query.params[0]).startsWith("zyx:idea-canonical:"));
  expect(dependencyLocks.map(query => query.params[0])).toEqual([
    'zyx:idea-canonical:["idea","idea"]', 'zyx:idea-canonical:["source_chunk","excerpt"]', 'zyx:idea-canonical:["source_material","source"]',
  ]);
  const firstDependencyShare = publicationQueries.findIndex(query => /from "(ide|sumber_materi|potongan_sumber)"/.test(query.sql) && query.sql.includes("for share"));
  expect(firstDependencyShare).toBeGreaterThan(Math.max(...dependencyLocks.map(query => query.index)));
  expect((await activePublication.json()).result.vectorJobCount).toBe(0);
  expect((await publishProductBundle({ ...input, expectedRevision: context.revision })).published).toBe(false);
  await testDb.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, "admin"));
  await expect(publishProductBundle({ ...input, expectedRevision: context.revision })).rejects.toThrow("PRODUCT_BUNDLE_PUBLISH_FORBIDDEN");
  await expect(reviewSolutionCollection(firstSave)).rejects.toThrow("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");
  await testDb.update(schema.pengguna).set({ status: "active" }).where(eq(schema.pengguna.id, "admin"));
  expect(await testDb.select().from(schema.artikel)).toHaveLength(0);
  expect(await testDb.select().from(schema.soal)).toHaveLength(0);
  expect(await testDb.select().from(schema.vectorSyncQueue)).toHaveLength(0);
  await expect(withdrawProductBundle({ importId: staged.importId, withdrawnBy: "admin", expectedRevision: first.data.checksum })).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
  beforeTransaction = async () => { await testDb.update(schema.imporBundle).set({ sourceUriOrKey: "withdrawal-race" }).where(eq(schema.imporBundle.id, staged.importId)); };
  await expect(withdrawProductBundle({ importId: staged.importId, withdrawnBy: "admin", expectedRevision: context.revision })).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
  expect((await testDb.select().from(schema.solutionCollections))[0].status).toBe("published");
  await testDb.update(schema.imporBundle).set({ sourceUriOrKey: scope.sourceUriOrKey }).where(eq(schema.imporBundle.id, staged.importId));
  expect((await withdrawalRoute.POST(new Request("https://example.test/withdraw", { method: "POST" }), routeContext)).status).toBe(409);
  const withdrawn = await withdrawalRoute.POST(new Request("https://example.test/withdraw", { method: "POST", body: JSON.stringify({ expectedRevision: context.revision }) }), routeContext);
  expect(withdrawn.status).toBe(200);
  expect((await withdrawn.json()).result.vectorJobCount).toBe(0);
  expect((await testDb.select().from(schema.solutionCollections))[0].status).toBe("withdrawn");
  expect((await withdrawProductBundle({ importId: staged.importId, withdrawnBy: "admin", expectedRevision: context.revision })).withdrawn).toBe(false);
  await expect(discardProductBundleDraft({ importId: staged.importId, actorId: "admin" })).rejects.toThrow("PRODUCT_BUNDLE_DRAFT_REQUIRED");
  expect((await testDb.select().from(schema.auditMutasi)).some(row => (row.afterSnapshot as any)?.review?.items?.length === 1)).toBe(true);
}, 30_000);
