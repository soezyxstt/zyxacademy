import { beforeEach, expect, mock, test } from "bun:test";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let reads: Array<{ table: string; rows: number }>;
let mutations = 0;
let maxBindings = 0;
class Query {
 table = "";
 from(table: Parameters<typeof getTableName>[0]) { this.table = getTableName(table); return this; }
 where(condition: never) { maxBindings = Math.max(maxBindings, new PgDialect().sqlToQuery(condition).params.length); return this; }
 innerJoin() { return this; }
 orderBy() { return this; }
 limit() { return this; }
 for() { return Promise.resolve(tables[this.table] ?? []); }
 then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
  const rows = tables[this.table] ?? [];
  reads.push({ table: this.table, rows: rows.length });
  return Promise.resolve(rows).then(resolve, reject);
 }
}
const executor = { select: () => new Query(), selectDistinct: () => new Query(), insert: () => { mutations++; throw new Error("unexpected identity mutation"); } };
mock.module("@/db", () => ({ db: executor }));
const { resolveCourseAccessBatch, resolveCourseEntitlementsBatch } = await import("@/lib/student/course-access");
const { getDiscussionChannelVisibility, requireDiscussionCourse, resolveDiscussionCourses } = await import("@/lib/discussions/access");

beforeEach(() => {
 reads = []; mutations = 0; maxBindings = 0;
 tables = {
  pengguna: [{ id: "student", status: "active" }],
  user: [{ id: "student", role: "student", createdAt: new Date(), updatedAt: new Date() }],
  pengguna_peran: [{ code: "murid" }],
  mata_kuliah: [{ id: "canonical", title: "Course", status: "active", legacyCourseId: "legacy", isDemo: false,
   pricingCategory: "premium", freeStartsAt: null, freeEndsAt: null }],
  courses: [{ id: "legacy", title: "Course" }],
  pendaftaran_murid: [], enrollments: [{ id: "legacy" }],
  bab: [{ courseId: "canonical", id: "chapter", title: "Chapter", orderIndex: 1, legacyId: null, status: "active" }],
  chapters: [], penugasan_tutor: [], tutor_courses: [],
  discussion_channels: [{ courseId: null, legacyCourseId: null }, { courseId: "canonical", legacyCourseId: "legacy" }],
 };
});

test("metadata entitlement preserves the default decision without reading chapter rows", async () => {
 const metadata = await resolveCourseEntitlementsBatch("student", ["canonical", "legacy"], { executor });
 expect(metadata.get("canonical")?.hasFullContentAccess).toBe(true);
 expect(metadata.get("canonical")).toMatchObject({ hasCourseAccess: true, tier: "enrolled", capabilities: { canAskZyra: true } });
 expect(metadata.get("legacy")?.legacyCourseId).toBe("legacy");
 expect(reads.filter(row => row.table === "bab" || row.table === "chapters")).toEqual([]);
 reads = [];
 const full = await resolveCourseAccessBatch("student", ["canonical", "legacy"], { executor });
 expect(full.get("canonical")?.hasFullContentAccess).toBe(metadata.get("canonical")?.hasFullContentAccess);
 expect(full.get("canonical")?.scopedChapterIds).toEqual(["chapter"]);
 expect(reads.filter(row => row.table === "bab").reduce((sum, row) => sum + row.rows, 0)).toBe(1);
});

test("metadata entitlement denies preview and ambiguous aliases", async () => {
 tables.enrollments = [];
 let result = await resolveCourseEntitlementsBatch("student", ["canonical", "legacy"], { executor });
 expect(result.get("canonical")?.hasFullContentAccess).toBe(false);
 tables.mata_kuliah.push({ ...tables.mata_kuliah[0], id: "other" });
 result = await resolveCourseEntitlementsBatch("student", ["legacy"], { executor });
 expect(result.get("legacy")?.reason).toBe("COURSE_MAPPING_AMBIGUOUS");
 expect(result.get("legacy")?.hasFullContentAccess).toBe(false);
});

test("metadata and discussion resolution reject a missing role without attempting legacy repair", async () => {
 tables.pengguna_peran = [];
 const metadata = await resolveCourseEntitlementsBatch("student", ["canonical"], { executor });
 expect(metadata.get("canonical")?.hasFullContentAccess).toBe(false);
 expect(metadata.get("canonical")?.reason).toBe("USER_INACTIVE");
 expect(metadata.get("canonical")).toMatchObject({ hasCourseAccess: false, tier: "anonymous", capabilities: { canAskZyra: false } });
 expect(mutations).toBe(0);
 await expect(resolveDiscussionCourses({ id: "student", role: "admin" }, ["canonical"], executor as never)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 expect(mutations).toBe(0);
});

test("tutor batch denies legacy fallback when any canonical assignment was revoked", async () => {
 tables.pengguna_peran = [{ code: "tutor" }];
 tables.penugasan_tutor = [{ id: "canonical", status: "revoked", scope: "course" }];
 tables.tutor_courses = [{ id: "legacy" }];
 const tutor = { id: "student", role: "tutor" as const };
 let result = await resolveDiscussionCourses(tutor, ["canonical", "legacy"], executor as never);
 expect(result.get("canonical")?.hasFullContentAccess).toBe(false);
 await expect(requireDiscussionCourse(tutor, "canonical", "legacy", executor as never)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 tables.penugasan_tutor = [];
 result = await resolveDiscussionCourses(tutor, ["canonical", "legacy"], executor as never);
 expect(result.get("canonical")?.hasFullContentAccess).toBe(true);
 expect(result.get("legacy")?.hasFullContentAccess).toBe(true);
 await expect(requireDiscussionCourse(tutor, "canonical", "legacy", executor as never)).resolves.toMatchObject({ hasFullContentAccess: true });
 expect(reads.some(row => row.table === "bab" || row.table === "chapters")).toBe(false);
});

test("a thousand course aliases resolve linearly with bounded SQL bindings", async () => {
 tables.pengguna_peran = [{ code: "tutor" }];
 let idReads = 0;
 tables.mata_kuliah = Array.from({ length: 1000 }, (_, n) => ({
  get id() { idReads++; return `canonical-${n}`; }, legacyCourseId: `legacy-${n}`, title: `Course ${n}`, status: "active",
 }));
 tables.courses = Array.from({ length: 1000 }, (_, n) => ({ id: `legacy-${n}` }));
 tables.penugasan_tutor = []; tables.tutor_courses = [];
 const ids = Array.from({ length: 1000 }, (_, n) => [`canonical-${n}`, `legacy-${n}`]).flat();
 const resolved = await resolveDiscussionCourses({ id: "student", role: "tutor" }, ids, executor as never);
 expect(resolved.size).toBe(2000);
 expect([...resolved.values()].every(scope => !scope.hasFullContentAccess)).toBe(true);
 expect(idReads).toBeLessThan(50_000);
 expect(maxBindings).toBeLessThan(5000);
});

test("aggregate visibility uses authorized distinct scopes and excludes revoked course access", async () => {
 const dialect = new PgDialect();
 let compiled = dialect.sqlToQuery((await getDiscussionChannelVisibility("student")).predicate);
 expect(compiled.params).toContain(JSON.stringify([{ course_id: "canonical", legacy_course_id: "legacy" }]));
 expect(reads.filter(row => row.table === "discussion_channels").map(row => row.rows)).toEqual([2]);
 expect(reads.some(row => row.table === "bab" || row.table === "chapters")).toBe(false);
 tables.enrollments = [];
 compiled = dialect.sqlToQuery((await getDiscussionChannelVisibility("student")).predicate);
 expect(compiled.params).not.toContain(JSON.stringify([{ course_id: "canonical", legacy_course_id: "legacy" }]));
});

test("free PKA still requires the campaign flag and registration", async () => {
 const previous = process.env.FEATURE_PKA;
 tables.mata_kuliah = [{ ...tables.mata_kuliah[0], legacyCourseId: "tutorial-pka", pricingCategory: "free" }];
 tables.courses = [{ id: "tutorial-pka", title: "Tutorial PKA" }];
 const actor = { id: "student", role: "student" as const };
 try {
  process.env.FEATURE_PKA = "0";
  tables.enrollments = [{ id: "tutorial-pka" }];
  expect((await resolveDiscussionCourses(actor, ["canonical", "tutorial-pka"], executor as never)).get("canonical")?.hasFullContentAccess).toBe(false);
  process.env.FEATURE_PKA = "1";
  tables.enrollments = [];
  expect((await resolveDiscussionCourses(actor, ["canonical", "tutorial-pka"], executor as never)).get("canonical")?.hasFullContentAccess).toBe(false);
  await expect(requireDiscussionCourse(actor, "canonical", "tutorial-pka", executor as never)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  tables.enrollments = [{ id: "tutorial-pka" }];
  expect((await resolveDiscussionCourses(actor, ["canonical", "tutorial-pka"], executor as never)).get("canonical")?.hasFullContentAccess).toBe(true);
  await expect(requireDiscussionCourse(actor, "canonical", "tutorial-pka", executor as never)).resolves.toMatchObject({ hasFullContentAccess: true });
 } finally {
  if (previous === undefined) delete process.env.FEATURE_PKA; else process.env.FEATURE_PKA = previous;
 }
});
