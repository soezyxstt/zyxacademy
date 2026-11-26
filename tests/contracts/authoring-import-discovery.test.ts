import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";

const { client, testDb } = await createPostgresTestDb();
const originalDb = { ...await import("@/lib/db") };
const originalStorage = { ...await import("@/lib/storage") };
let selects = 0, archiveReads = 0, readinessReads = 0;
const trackedDb = new Proxy(testDb, { get(target, key) {
  if (key === "select") return (...args: unknown[]) => { selects++; return Reflect.apply(target.select, target, args); };
  const value = Reflect.get(target, key, target);
  return typeof value === "function" ? value.bind(target) : value;
} });
mock.module("@/lib/db", () => ({ ...originalDb, db: trackedDb }));
mock.module("@/lib/storage", () => ({ ...originalStorage, storage: { ...originalStorage.storage, download: async () => { archiveReads++; throw new Error("DISCOVERY_MUST_NOT_READ_ARCHIVE"); } } }));
const { listImportMetadata, getCompactImport } = await import("@/lib/authoring/import-discovery");
afterAll(async () => { mock.module("@/lib/db", () => originalDb); mock.module("@/lib/storage", () => originalStorage); await client.close(); });
const stamp = new Date("2026-11-26T00:00:00Z");
const report = (title: string, root?: string) => ({ valid: true, bundleTitle: title, chapterId: "chapter", privateReport: "Not needed to find a bundle. ".repeat(350),
  ...(root ? { revisionLineage: { schema: "authoring-revision.v1", rootImportId: root } } : {}) });
const importRow = (id: string, status: typeof schema.imporBundle.$inferInsert.status, root?: string) => ({
  id, bundleId: `bundle-${id}`, checksum: "a".repeat(64), bundleType: "product" as const, courseId: "legacy-course", sourceUriOrKey: `private/${id}.zip`,
  version: 4, status, validationReport: report(id === "live" ? "100% aturan" : "Aturan pangkat", root), requestedBy: "author", createdAt: stamp, updatedAt: stamp,
});
const ready = async () => { readinessReads++; return { publicationReady: false, evaluatedAt: stamp.toISOString(), blockingIssueCodes: ["REVIEW_REQUIRED"] }; };
beforeAll(async () => {
  await testDb.insert(schema.user).values({ id: "author", name: "Author", email: "discovery@example.test", role: "admin" });
  await testDb.insert(schema.pengguna).values({ id: "author" });
  await testDb.insert(schema.courses).values({ id: "legacy-course", title: "Matematika", category: "Matematika" });
  await testDb.insert(schema.mataKuliah).values({ id: "course", legacyCourseId: "legacy-course", code: "MA1", title: "Matematika" });
  await testDb.insert(schema.bab).values({ id: "chapter", mataKuliahId: "course", code: "MA1-1", title: "Pangkat", orderIndex: 0 });
  for (const row of [importRow("live", "published"), importRow("history", "withdrawn", "live"), importRow("draft-old", "draft", "live"), importRow("draft-head", "draft", "live"),
    ...Array.from({ length: 20 }, (_, i) => importRow(`other-${i}`, "draft"))]) await testDb.insert(schema.imporBundle).values(row);
  await testDb.insert(schema.imporBundle).values({ ...importRow("source-pack", "validated"), bundleType: "source", courseId: null,
    validationReport: { valid: true, name: "Sumber pangkat", courseId: "course", chapterId: "chapter" } });
  await testDb.insert(schema.itemImporBundle).values([
    { id: "article-item", imporBundleId: "draft-head", entityType: "article", entityId: "article", entityVersion: 1, entityHash: "b".repeat(64), status: "draft" },
    ...Array.from({ length: 300 }, (_, i) => ({ id: `dep-${i}`, imporBundleId: "draft-head", entityType: "dependency", entityId: `dependency-${i}`, entityVersion: 1, entityHash: "c".repeat(64), status: "draft" as const })),
  ]);
});

test("compact metadata uses one bounded query, no archives/readiness or private report, with current status explicit", async () => {
  selects = archiveReads = readinessReads = 0;
  const result = await listImportMetadata({ bundleType: "product", responseMode: "compact", limit: 20 });
  expect(selects).toBe(1);
  expect(archiveReads).toBe(0);
  expect(readinessReads).toBe(0);
  expect(result.imports).toHaveLength(20);
  expect(result.pagination.nextCursor).toBeString();
  expect(result.evaluation).toEqual({ review: "not_requested", readiness: "not_requested" });
  expect(result.imports[0].validationSnapshot).toMatchObject({ valid: true, currentReadiness: "not_evaluated" });
  expect(JSON.stringify(result)).not.toContain("private/");
  expect(JSON.stringify(result)).not.toContain("privateReport");
  expect(JSON.stringify(result)).not.toContain("publicationReady");
  const stored = await testDb.select().from(schema.imporBundle);
  const bytes = Buffer.byteLength(JSON.stringify(result));
  const beforeBytes = Buffer.byteLength(JSON.stringify(stored.filter(row => row.bundleType === "product").slice(-20)));
  expect(bytes).toBeLessThan(25_000);
  expect(bytes).toBeLessThan(beforeBytes / 5);
  console.info(JSON.stringify({ fixture: "20-import-discovery", storedRowsBytes: beforeBytes, compactBytes: bytes, queryCount: 1, archiveReads }));
});

test("head discovery keeps current live and latest editable candidate, excluding historical and superseded drafts", async () => {
  const result = await listImportMetadata({ bundleType: "product", responseMode: "compact", headsOnly: true, courseId: "course", chapterId: "chapter", limit: 100 });
  const ids = result.imports.map(row => row.importId);
  expect(ids).toContain("live");
  expect(ids).toContain("draft-head");
  expect(ids).not.toContain("draft-old");
  expect(ids).not.toContain("history");
  const published = await listImportMetadata({ bundleType: "product", headsOnly: true, statuses: ["published"], courseId: "legacy-course" });
  expect(published.imports.map(row => row.importId)).toEqual(["live"]);
  const literal = await listImportMetadata({ bundleType: "product", query: "100%" });
  expect(literal.imports.map(row => row.importId)).toEqual(["live"]);
  expect((await listImportMetadata({ bundleType: "product", courseId: "foreign" })).imports).toEqual([]);
});

test("cursor pages survive identical timestamps and reject changed filters or malformed cursors", async () => {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await listImportMetadata({ bundleType: "product", limit: 5, cursor });
    ids.push(...page.imports.map(row => row.importId));
    cursor = page.pagination.nextCursor ?? undefined;
  } while (cursor);
  expect(ids).toHaveLength(24);
  expect(new Set(ids).size).toBe(ids.length);
  const first = await listImportMetadata({ bundleType: "product", limit: 1 });
  await expect(listImportMetadata({ bundleType: "idea", cursor: first.pagination.nextCursor! })).rejects.toThrow("IMPORT_CURSOR_INVALID");
  await expect(listImportMetadata({ bundleType: "product", cursor: "invalid" })).rejects.toThrow("IMPORT_CURSOR_INVALID");
});

test("stored source scope/name works without a legacy course foreign key", async () => {
  const result = await listImportMetadata({ bundleType: "source", courseId: "course", chapterId: "chapter", query: "Sumber" });
  expect(result.imports).toHaveLength(1);
  expect(result.imports[0]).toMatchObject({ title: "Sumber pangkat", scope: { courseId: "course", chapterId: "chapter" } });
});

test("compact get adds only requested inventory/current readiness and refuses another bundle type", async () => {
  selects = archiveReads = readinessReads = 0;
  const compact = await getCompactImport({ bundleType: "product", importId: "draft-head", projections: ["inventory"] }, ready);
  expect(selects).toBe(2);
  expect(archiveReads).toBe(0);
  expect(readinessReads).toBe(0);
  expect(compact.import.items).toHaveLength(1);
  expect(compact.import.inventory).toEqual({ limit: 256, truncated: false, dependencies: "omitted" });
  expect(compact.import).not.toHaveProperty("currentReadiness");
  const current = await getCompactImport({ bundleType: "product", importId: "draft-head", projections: ["inventory", "readiness"] }, async (id, snapshot) => {
    expect(id).toBe("draft-head");
    expect(snapshot).toEqual({ checksum: "a".repeat(64), status: "draft", version: 4, updatedAt: stamp.toISOString() });
    return ready();
  });
  expect(readinessReads).toBe(1);
  expect(current.import.currentReadiness).toMatchObject({ publicationReady: false });
  expect(current.import.evaluation.readiness).toBe("evaluated");
  await expect(getCompactImport({ bundleType: "idea", importId: "draft-head" }, ready)).rejects.toThrow("IDEA_BUNDLE_NOT_FOUND");
});

test("course identity collisions cannot duplicate cursor rows or select another course", async () => {
  await testDb.insert(schema.mataKuliah).values({ id: "legacy-course", code: "COLLISION", title: "Other course" });
  try {
    const all = await listImportMetadata({ bundleType: "product", limit: 100 });
    expect(all.imports).toHaveLength(24);
    expect(new Set(all.imports.map(row => row.importId)).size).toBe(24);
    expect(all.imports.every(row => row.scope.courseId === "course")).toBe(true);
    expect((await listImportMetadata({ bundleType: "product", courseId: "legacy-course" })).imports).toEqual([]);
    expect((await listImportMetadata({ bundleType: "product", courseId: "course", limit: 100 })).imports).toHaveLength(24);
  } finally {
    await testDb.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "legacy-course"));
  }
  await testDb.insert(schema.mataKuliah).values({ id: "duplicate-alias", legacyCourseId: "legacy-course", code: "ALIAS", title: "Other alias" });
  try {
    const all = await listImportMetadata({ bundleType: "product", limit: 100 });
    expect(all.imports).toHaveLength(24);
    expect(all.imports.every(row => row.scope.courseTitle === null)).toBe(true);
    expect((await listImportMetadata({ bundleType: "product", courseId: "legacy-course" })).imports).toEqual([]);
    expect((await listImportMetadata({ bundleType: "product", courseId: "course" })).imports).toEqual([]);
  } finally {
    await testDb.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "duplicate-alias"));
  }
});

test("inventory truncation is explicit and remains bounded for large admitted bundles", async () => {
  await testDb.insert(schema.itemImporBundle).values(Array.from({ length: 258 }, (_, i) => ({
    id: `bounded-card-${i}`, imporBundleId: "other-19", entityType: "flashcard", entityId: `card-${i}`,
    entityVersion: 1, entityHash: "d".repeat(64), status: "draft" as const,
  })));
  selects = archiveReads = readinessReads = 0;
  const result = await getCompactImport({ bundleType: "product", importId: "other-19", projections: ["inventory"] }, ready);
  expect(selects).toBe(2);
  expect(archiveReads).toBe(0);
  expect(readinessReads).toBe(0);
  expect(result.import.items).toHaveLength(256);
  expect(result.import.inventory).toMatchObject({ limit: 256, truncated: true });
});
