import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isCourseFreeNow } from "@/lib/student/course-pricing";
import { validDiscussionId } from "@/lib/discussions/policy";

type Row = Record<string, any>;
type Column = { table: string; key: string };
const fields: Record<string, string[]> = {
 courses: ["id"], discussionChannels: ["id", "kind", "courseId", "legacyCourseId", "requesterId"],
 enrollments: ["userId", "courseId", "expiresAt"],
 mataKuliah: ["id", "legacyCourseId", "status", "pricingCategory", "freeStartsAt", "freeEndsAt"],
 pendaftaranMurid: ["penggunaId", "mataKuliahId", "status", "endAt"],
 pengguna: ["id", "status"], penggunaPeran: ["penggunaId", "peranId"], penugasanTutor: ["penggunaId", "mataKuliahId", "status", "assignmentScope"],
 peran: ["id", "code"], tutorCourses: ["tutorId", "courseId"], user: ["id"],
};
const schema: Row = Object.fromEntries(Object.entries(fields).map(([table, keys]) => [
 table, { table, ...Object.fromEntries(keys.map(key => [key, { table, key }])) },
]));
const record = (table: string, values: Row) => Object.fromEntries(Object.entries(values).map(([key, value]) => [`${table}.${key}`, value]));
const value = (row: Row, item: unknown) => item && typeof item === "object" && "table" in item
 ? row[`${(item as Column).table}.${(item as Column).key}`] : item;
type Predicate = (row: Row) => boolean;
const orm = {
 eq: (a: unknown, b: unknown): Predicate => row => value(row, a) === value(row, b),
 gt: (a: unknown, b: unknown): Predicate => row => value(row, a) > value(row, b),
 isNull: (a: unknown): Predicate => row => value(row, a) == null,
 inArray: (a: unknown, list: unknown[]): Predicate => row => list.includes(value(row, a)),
 and: (...conditions: Predicate[]): Predicate => row => conditions.filter(Boolean).every(condition => condition(row)),
 or: (...conditions: Predicate[]): Predicate => row => conditions.filter(Boolean).some(condition => condition(row)),
};

function harness(data: Record<string, Row[]>) {
 const queries: Array<{ table: string; lock?: string }> = [];
 const db = { select: (projection?: Record<string, Column>) => ({ from: (table: { table: string }) => {
  const conditions: Predicate[] = [];
  let limit = Infinity, lock: string | undefined;
  const query = {
   innerJoin: (_other: unknown, condition: Predicate) => { conditions.push(condition); return query; },
   where: (condition: Predicate) => { conditions.push(condition); return query; },
   orderBy: () => query,
   limit: (count: number) => { limit = count; return query; },
   for: (mode: string) => { lock = mode; return query; },
   then: (resolve: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) => {
    try {
     queries.push({ table: table.table, lock });
     const rows = (data[table.table] ?? []).filter(row => conditions.every(condition => condition(row))).slice(0, limit)
      .map(row => projection ? Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, value(row, column)])) : row.plain);
     return Promise.resolve(resolve(rows));
    } catch (error) { return Promise.resolve(reject(error)); }
   },
  };
  return query;
 } }) };
 const dependencies: Row = {
  "drizzle-orm": orm, "@/db": { db }, "@/db/schema": schema, "@/lib/student/course-pricing": { isCourseFreeNow },
  "@/lib/student/course-access": {}, "@/lib/pka-config": { PKA_COURSE_ID: "tutorial-pka" }, "./policy": { validDiscussionId },
 };
 function load(file: string) {
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
   compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Row = {};
  runInNewContext(output, { exports, process, require: (name: string) => {
   if (!(name in dependencies)) throw new Error(name);
   return dependencies[name];
  } });
  return exports;
 }
 dependencies["./recipient-access"] = load("lib/discussions/recipient-access.ts");
 const access = load("lib/discussions/access.ts");
 return { validate: (channel: string, ids: string[]) => access.requireDiscussionMentionAccess(db, channel, ids), queries };
}

function identity(id: string, role: string, status = "active") {
 return { ...record("pengguna", { id, status }), ...record("user", { id }), ...record("penggunaPeran", { penggunaId: id, peranId: role }), ...record("peran", { id: role, code: role }) };
}
function channel(plain: Row) { return { ...record("discussionChannels", plain), plain }; }
function members(ids: string[]) {
 const rows = ids.map(id => identity(id, "murid"));
 return { user: rows, pengguna: rows, penggunaPeran: rows };
}

test("one and ten mentions use the same queries and retain all three share locks", async () => {
 const ids = Array.from({ length: 10 }, (_, i) => `member-${i}`);
 const data = { ...members(ids), discussionChannels: [channel({ id: "global", kind: "global", courseId: null, legacyCourseId: null, requesterId: null })] };
 const { validate, queries } = harness(data);
 await validate("global", ids.slice(0, 1));
 const one = [...queries];
 queries.length = 0;
 await validate("global", ids);
 expect(queries).toEqual(one);
 expect(queries).toHaveLength(5);
 expect(queries.filter(query => query.lock).map(query => [query.table, query.lock])).toEqual([
  ["user", "share"], ["pengguna", "share"], ["penggunaPeran", "share"],
 ]);
 data.pengguna[9]["pengguna.status"] = "suspended";
 await expect(validate("global", ids)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 await expect(validate("global", [...ids, "extra"])).rejects.toThrow("DISCUSSION_UNAVAILABLE");
});

test("mention batches fail closed on assignment revocation and ambiguous course identity", async () => {
 const rows = [identity("alice", "murid"), identity("tutor", "tutor"), identity("admin", "admin")];
 const data: Record<string, Row[]> = {
  user: rows, pengguna: rows, penggunaPeran: rows,
  discussionChannels: [channel({ id: "academic", kind: "academic", courseId: "canonical", legacyCourseId: "legacy", requesterId: "alice" })],
  mataKuliah: [record("mataKuliah", { id: "canonical", legacyCourseId: "legacy", status: "active", pricingCategory: "premium", freeStartsAt: null, freeEndsAt: null })],
  courses: [record("courses", { id: "legacy" })],
  enrollments: [record("enrollments", { userId: "alice", courseId: "legacy", expiresAt: new Date("2099-01-01") })],
  penugasanTutor: [record("penugasanTutor", { penggunaId: "tutor", mataKuliahId: "canonical", status: "active", assignmentScope: "course" })],
  tutorCourses: [record("tutorCourses", { tutorId: "tutor", courseId: "legacy" })],
 };
 const { validate } = harness(data);
 const ids = ["alice", "tutor", "admin"];
 await validate("academic", ids);
 data.penugasanTutor[0]["penugasanTutor.status"] = "revoked";
 await expect(validate("academic", ids)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 data.penugasanTutor = [];
 await validate("academic", ids);
 data.mataKuliah.push(record("mataKuliah", { id: "ambiguous", legacyCourseId: "legacy", status: "active" }));
 await expect(validate("academic", ids)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
});

test("course mentions stay bounded and PKA keeps student registration and tutor assignment rules", async () => {
 const ids = Array.from({ length: 10 }, (_, i) => `student-${i}`);
 const data: Record<string, Row[]> = {
  ...members(ids),
  discussionChannels: [channel({ id: "course", kind: "course", courseId: "canonical", legacyCourseId: "legacy", requesterId: null })],
  mataKuliah: [record("mataKuliah", { id: "canonical", legacyCourseId: "legacy", status: "active", pricingCategory: "free", freeStartsAt: null, freeEndsAt: null })],
  courses: [record("courses", { id: "legacy" })],
 };
 const { validate, queries } = harness(data);
 await validate("course", ids.slice(0, 1));
 const one = [...queries];
 queries.length = 0;
 await validate("course", ids);
 expect(queries).toEqual(one);

 const tutor = identity("tutor", "tutor"), admin = identity("admin", "admin");
 for (const table of ["user", "pengguna", "penggunaPeran"]) data[table].push(tutor, admin);
 data.discussionChannels = [channel({ id: "pka", kind: "course", courseId: "canonical", legacyCourseId: "tutorial-pka", requesterId: null })];
 data.mataKuliah = [record("mataKuliah", { id: "canonical", legacyCourseId: "tutorial-pka", status: "active", pricingCategory: "free", freeStartsAt: null, freeEndsAt: null })];
 data.courses = [record("courses", { id: "tutorial-pka" })];
 data.penugasanTutor = [record("penugasanTutor", { penggunaId: "tutor", mataKuliahId: "canonical", status: "active", assignmentScope: "course" })];
 const previous = process.env.FEATURE_PKA;
 try {
  process.env.FEATURE_PKA = "1";
  await validate("pka", ["admin", "tutor"]);
  await expect(validate("pka", [ids[0]])).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  data.enrollments = [record("enrollments", { userId: ids[0], courseId: "tutorial-pka", expiresAt: new Date("2000-01-01") })];
  await validate("pka", [ids[0], "admin", "tutor"]);
  data.penugasanTutor[0]["penugasanTutor.status"] = "revoked";
  await expect(validate("pka", ["tutor"])).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  process.env.FEATURE_PKA = "0";
  await expect(validate("pka", ["admin"])).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 } finally {
  if (previous === undefined) delete process.env.FEATURE_PKA; else process.env.FEATURE_PKA = previous;
 }
});
