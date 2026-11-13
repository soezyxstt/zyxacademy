import { afterAll, expect, mock, test } from "bun:test";
import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { unzipSync, zipSync } from "fflate";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { computeProductBundleChecksum, deterministicProductSerialization, validateProductBundle } from "@/lib/bundle/product-validator";
import { nextMonotonicTimestamp } from "@/lib/date-utils";
const { client } = await createPostgresTestDb();
const queries: string[] = [];
const testDb = drizzle(client, { schema, logger: { logQuery(query) { queries.push(query); } } });
let beforeTransaction: (() => Promise<void>) | undefined;
const wrapped = new Proxy(testDb, { get(target, key) {
  if (key === "transaction") return async (callback: any) => { const hook = beforeTransaction; beforeTransaction = undefined; await hook?.(); return target.transaction(callback); };
  const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
} });
const objects = new Map<string, Uint8Array>();
mock.module("@/db", () => ({ db: wrapped }));
mock.module("@/lib/storage", () => ({ storage: { upload: async (bytes: Uint8Array, _filename: string, _mime: string, options: { key: string }) => { objects.set(options.key, bytes); }, download: async (key: string) => objects.get(key)! } }));
const { stageProductBundle, adoptProductDraftRun, discardProductBundleDraft } = await import("@/lib/bundle/product-staging");
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
afterAll(async () => { await client.close(); });

test("restage preserves the latest section decision committed before the import lock", async () => {
  const firstBytes = buildLocalVerificationFixture().bytes;
  const first = validateProductBundle(firstBytes);
  if (!first.success) throw new Error("FIXTURE_INVALID");
  const bundle = first.data;
  for (const id of new Set([bundle.manifest.creatorId, bundle.manifest.curatorId!])) {
    await testDb.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role: "admin" });
    await provisionPenggunaForNewUser({ id, role: "admin" });
  }
  await testDb.insert(schema.courses).values({ id: bundle.manifest.courseId, title: "Course", category: "Math" });
  const stage = (bytes: Uint8Array, parsed: typeof bundle, expectedPreviousChecksum?: string) => stageProductBundle({ bytes, bundle: parsed, checksum: parsed.checksum, bundleId: parsed.manifest.bundleId, courseId: parsed.manifest.courseId, requestedBy: bundle.manifest.curatorId!, runId: "fixture", expectedPreviousChecksum, preserveUnchangedItemReviews: true });
  const staged = await stage(firstBytes, bundle);
  const article = bundle.products.find(product => product.productType === "article")!;
  if (article.productType !== "article") throw new Error("ARTICLE_REQUIRED");
  await testDb.insert(schema.reviewItemBundle).values({ id: "section-review", imporBundleId: staged.importId, reviewerId: bundle.manifest.curatorId!, targetType: "article_section", targetId: article.sections[0].id, productId: article.id, status: "approved", notes: "First review" });
  const files = new Map(Object.entries(unzipSync(firstBytes)));
  const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")!));
  manifest.createdAt = "2026-11-12T00:00:00Z";
  manifest.bundleChecksum = computeProductBundleChecksum(manifest, files);
  files.set("manifest.json", new TextEncoder().encode(deterministicProductSerialization(manifest)));
  const nextBytes = zipSync(Object.fromEntries(files), { level: 0 });
  const next = validateProductBundle(nextBytes);
  if (!next.success) throw new Error(JSON.stringify(next.issues));
  expect(next.data.checksum).not.toBe(bundle.checksum);
  beforeTransaction = async () => { await testDb.update(schema.reviewItemBundle).set({ status: "changes_requested", notes: "Latest decision" }).where(eq(schema.reviewItemBundle.id, "section-review")); };
  expect((await stage(nextBytes, next.data, bundle.checksum)).replaced).toBe(true);
  const [review] = await testDb.select().from(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.id, "section-review"));
  expect(review).toMatchObject({ status: "changes_requested", notes: "Latest decision" });
});

test("staging and adoption audit order survives equal and backward process clocks", async () => {
  const future = new Date("2050-01-01T00:00:00Z");
  expect(nextMonotonicTimestamp(future, future).getTime()).toBe(future.getTime() + 1);
  expect(nextMonotonicTimestamp(future, new Date(0)).getTime()).toBe(future.getTime() + 1);
  const fixture = await adoptionFixture("monotonic-staging-audits");
  const latest = async () => (await testDb.select().from(schema.auditMutasi).where(and(eq(schema.auditMutasi.entityType, "product_bundle"), eq(schema.auditMutasi.entityId, fixture.row.id), inArray(schema.auditMutasi.action, ["draft_created", "draft_replaced"]))).orderBy(desc(schema.auditMutasi.createdAt), desc(schema.auditMutasi.id)).limit(1))[0];
  const original = await latest();
  await testDb.update(schema.auditMutasi).set({ createdAt: future }).where(eq(schema.auditMutasi.id, original.id));
  expect((await adoptProductDraftRun(fixture.input)).adopted).toBe(true);
  const adoption = await latest();
  expect(adoption.correlationId).toBe(fixture.input.runId);
  expect(adoption.createdAt.getTime()).toBeGreaterThan(future.getTime());
  const files = new Map(Object.entries(unzipSync(fixture.bytes)));
  const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")!));
  manifest.createdAt = "2026-11-13T04:00:00Z";
  manifest.bundleChecksum = computeProductBundleChecksum(manifest, files);
  files.set("manifest.json", new TextEncoder().encode(deterministicProductSerialization(manifest)));
  const bytes = zipSync(Object.fromEntries(files), { level: 0 });
  const parsed = validateProductBundle(bytes);
  if (!parsed.success) throw new Error("FIXTURE_INVALID");
  await stageProductBundle({ bytes, bundle: parsed.data, checksum: parsed.data.checksum, bundleId: parsed.data.manifest.bundleId, courseId: parsed.data.manifest.courseId, requestedBy: fixture.actorId, runId: "restage-after-future-audit", expectedPreviousChecksum: fixture.row.checksum });
  const staged = await latest();
  expect(staged.correlationId).toBe("restage-after-future-audit");
  expect(staged.afterSnapshot?.checksum).toBe(parsed.data.checksum);
  expect(staged.createdAt.getTime()).toBeGreaterThan(adoption.createdAt.getTime());
  const [current] = await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, fixture.row.id));
  const next = { ...fixture.input, expectedRevision: current.checksum, expectedSourceUriOrKey: current.sourceUriOrKey, expectedStagingRunId: "restage-after-future-audit", runId: "mcp-run-33333333-3333-4333-8333-333333333333" };
  expect((await adoptProductDraftRun(next)).adopted).toBe(true);
  expect((await latest()).createdAt.getTime()).toBeGreaterThan(staged.createdAt.getTime());
  expect((await adoptProductDraftRun(next)).adopted).toBe(false);
});

async function adoptionFixture(bundleId: string) {
  const files = new Map(Object.entries(unzipSync(buildLocalVerificationFixture().bytes)));
  const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")!));
  manifest.bundleId = bundleId;
  manifest.bundleChecksum = computeProductBundleChecksum(manifest, files);
  files.set("manifest.json", new TextEncoder().encode(deterministicProductSerialization(manifest)));
  const bytes = zipSync(Object.fromEntries(files), { level: 0 });
  const parsed = validateProductBundle(bytes);
  if (!parsed.success) throw new Error("FIXTURE_INVALID");
  const bundle = parsed.data;
  const actorId = bundle.manifest.curatorId!;
  for (const id of new Set([bundle.manifest.creatorId, actorId])) {
    await testDb.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role: "admin" }).onConflictDoNothing();
    await provisionPenggunaForNewUser({ id, role: "admin" });
  }
  await testDb.insert(schema.courses).values({ id: bundle.manifest.courseId, title: "Course", category: "Math" }).onConflictDoNothing();
  const staged = await stageProductBundle({ bytes, bundle, checksum: bundle.checksum, bundleId, courseId: bundle.manifest.courseId, requestedBy: actorId, runId: "fixture" });
  const [row] = await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, staged.importId));
  return { bytes, bundle, row, actorId, input: { importId: staged.importId, actorId, expectedRevision: row.checksum, expectedStagingRunId: "fixture", runId: "mcp-run-11111111-1111-4111-8111-111111111111", expectedCourseId: row.courseId, expectedSourceUriOrKey: row.sourceUriOrKey, expectedVersion: row.version } };
}

test("adoption rejects an intervening restage without replacing its report or deleting its review", async () => {
  const fixture = await adoptionFixture("adoption-restage-race");
  const files = new Map(Object.entries(unzipSync(fixture.bytes)));
  const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")!));
  manifest.createdAt = "2026-11-13T01:00:00Z";
  manifest.bundleChecksum = computeProductBundleChecksum(manifest, files);
  files.set("manifest.json", new TextEncoder().encode(deterministicProductSerialization(manifest)));
  const bytes = zipSync(Object.fromEntries(files), { level: 0 });
  const parsed = validateProductBundle(bytes);
  if (!parsed.success) throw new Error("FIXTURE_INVALID");
  let newer: typeof fixture.row | undefined;
  beforeTransaction = async () => {
    await stageProductBundle({ bytes, bundle: parsed.data, checksum: parsed.data.checksum, bundleId: parsed.data.manifest.bundleId, courseId: parsed.data.manifest.courseId, requestedBy: fixture.actorId, runId: "newer-staging-run", expectedPreviousChecksum: fixture.row.checksum });
    [newer] = await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, fixture.row.id));
    await testDb.insert(schema.reviewBundle).values({ id: "review-after-intervening-restage", imporBundleId: fixture.row.id, reviewerId: fixture.actorId, status: "approved", notes: "New revision review" });
  };
  await expect(adoptProductDraftRun(fixture.input)).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
  expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, fixture.row.id)))[0]).toEqual(newer!);
  expect((await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, fixture.row.id)))[0].notes).toBe("New revision review");
});

test("adoption locks the import before its audit and cannot overwrite another adoption", async () => {
  const fixture = await adoptionFixture("adoption-adoption-race");
  const inner = { ...fixture.input, runId: "mcp-run-22222222-2222-4222-8222-222222222222" };
  queries.length = 0;
  beforeTransaction = async () => {
    expect((await adoptProductDraftRun(inner)).adopted).toBe(true);
    await testDb.insert(schema.reviewBundle).values({ id: "review-after-intervening-adoption", imporBundleId: fixture.row.id, reviewerId: fixture.actorId, status: "approved", notes: "New run review" });
  };
  await expect(adoptProductDraftRun(fixture.input)).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
  const [current] = await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, fixture.row.id));
  expect(current.validationReport.productRunAdoption).toMatchObject({ runId: inner.runId });
  expect((await adoptProductDraftRun(inner)).adopted).toBe(false);
  expect((await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, fixture.row.id)))[0].notes).toBe("New run review");
  const locked = queries.findIndex(query => query.includes('from "impor_bundle"') && query.endsWith("for update"));
  const stagingAudit = queries.findIndex(query => query.includes('from "audit_mutasi"') && query.includes('"action" in'));
  expect(locked).toBeGreaterThanOrEqual(0);
  expect(stagingAudit).toBeGreaterThan(locked);
});

function revisedArtifact(bytes: Uint8Array, createdAt: string) {
  const files = new Map(Object.entries(unzipSync(bytes)));
  const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")!));
  manifest.createdAt = createdAt;
  manifest.bundleChecksum = computeProductBundleChecksum(manifest, files);
  files.set("manifest.json", new TextEncoder().encode(deterministicProductSerialization(manifest)));
  const revisedBytes = zipSync(Object.fromEntries(files), { level: 0 });
  const parsed = validateProductBundle(revisedBytes);
  if (!parsed.success) throw new Error("FIXTURE_INVALID");
  return { bytes: revisedBytes, bundle: parsed.data };
}

for (const mutation of ["restage", "discard"] as const) test(`same-artifact staging retry rejects an intervening ${mutation}`, async () => {
  const fixture = await adoptionFixture(`same-retry-${mutation}`);
  const original = { bytes: fixture.bytes, bundle: fixture.bundle, checksum: fixture.bundle.checksum, bundleId: fixture.bundle.manifest.bundleId, courseId: fixture.bundle.manifest.courseId, requestedBy: fixture.actorId, runId: "fixture" };
  const same = await stageProductBundle(original);
  expect(same.created).toBe(false);
  expect(same.itemCount).toBe(fixture.bundle.products.length + fixture.bundle.dependencies.length);
  const next = revisedArtifact(fixture.bytes, "2030-01-01T00:00:00Z");
  beforeTransaction = async () => {
    if (mutation === "discard") await discardProductBundleDraft({ importId: fixture.row.id, actorId: fixture.actorId, expectedRevision: fixture.row.checksum });
    else await stageProductBundle({ ...original, ...next, checksum: next.bundle.checksum, expectedPreviousChecksum: fixture.row.checksum });
  };
  await expect(stageProductBundle(original)).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
  const [current] = await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, fixture.row.id));
  if (mutation === "discard") expect(current).toBeUndefined();
  else expect(current.checksum).toBe(next.bundle.checksum);
});

test("completed staging retry rechecks the row after a concurrent replacement wins", async () => {
  const fixture = await adoptionFixture("completed-retry-discard");
  const next = revisedArtifact(fixture.bytes, "2031-01-01T00:00:00Z");
  const input = { ...next, checksum: next.bundle.checksum, bundleId: next.bundle.manifest.bundleId, courseId: next.bundle.manifest.courseId, requestedBy: fixture.actorId, runId: "fixture", expectedPreviousChecksum: fixture.row.checksum };
  beforeTransaction = async () => {
    expect((await stageProductBundle(input)).replaced).toBe(true);
    beforeTransaction = async () => { await discardProductBundleDraft({ importId: fixture.row.id, actorId: fixture.actorId, expectedRevision: next.bundle.checksum }); };
  };
  await expect(stageProductBundle(input)).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
  expect(await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, fixture.row.id))).toHaveLength(0);
});
