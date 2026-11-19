import { expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
const schema: Record<string, any> = Object.fromEntries(Object.entries(fields).map(([table, keys]) => [
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
 let queries = 0;
 const db = { select: (projection?: Record<string, Column>) => ({
  from: (table: { table: string }) => {
   const conditions: Predicate[] = [];
   let limit = Infinity;
   const query = {
    innerJoin: (_other: unknown, condition: Predicate) => { conditions.push(condition); return query; },
    where: (condition: Predicate) => { conditions.push(condition); return query; },
    limit: (count: number) => { limit = count; return query; },
    then: (resolve: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) => {
     try {
      queries++;
      const rows = (data[table.table] ?? []).filter(row => conditions.every(condition => condition(row))).slice(0, limit)
       .map(row => projection ? Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, value(row, column)])) : row.plain);
      return Promise.resolve(resolve(rows));
     } catch (error) { return Promise.resolve(reject(error)); }
    },
   };
   return query;
  },
 }) };
 const dependencies: Record<string, unknown> = {
  "drizzle-orm": orm, "@/db": { db }, "@/db/schema": schema, "@/lib/student/course-pricing": { isCourseFreeNow },
  "@/lib/pka-config": { PKA_COURSE_ID: "tutorial-pka" }, "./policy": { validDiscussionId },
 };
 const output = ts.transpileModule(readFileSync("lib/discussions/recipient-access.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText;
 const exports: Row = {};
 runInNewContext(output, { exports, process, require: (name: string) => {
  if (!(name in dependencies)) throw new Error(name);
  return dependencies[name];
 } });
 return { access: exports.getDiscussionRecipientAccess as (channel: string, ids: string[]) => Promise<Map<string, { id: string; role: string }>>, queries: () => queries };
}

function identity(id: string, role: string, status = "active") {
 return { ...record("pengguna", { id, status }), ...record("user", { id }), ...record("penggunaPeran", { penggunaId: id, peranId: role }), ...record("peran", { id: role, code: role }) };
}
function channel(plain: Row) { return { ...record("discussionChannels", plain), plain }; }

test("batched access preserves course scope, roles, enrollment and assignment revocation", async () => {
 const data: Record<string, Row[]> = {
  discussionChannels: [
   channel({ id: "course", kind: "course", courseId: "canonical", legacyCourseId: "legacy", requesterId: null }),
   channel({ id: "academic", kind: "academic", courseId: "canonical", legacyCourseId: "legacy", requesterId: "alice" }),
  ],
  pengguna: [identity("alice", "murid"), identity("bob", "murid"), identity("tutor", "tutor"), identity("admin", "admin"), identity("suspended", "admin", "suspended")],
  mataKuliah: [record("mataKuliah", { id: "canonical", legacyCourseId: "legacy", status: "active", pricingCategory: "premium", freeStartsAt: null, freeEndsAt: null })],
  courses: [record("courses", { id: "legacy" })],
  enrollments: [record("enrollments", { userId: "alice", courseId: "legacy", expiresAt: new Date("2099-01-01") })],
  penugasanTutor: [record("penugasanTutor", { penggunaId: "tutor", mataKuliahId: "canonical", status: "revoked", assignmentScope: "course" })],
  tutorCourses: [record("tutorCourses", { tutorId: "tutor", courseId: "legacy" })],
 };
 const { access } = harness(data);
 const ids = ["alice", "bob", "tutor", "admin", "suspended"];
 expect((await access("academic", ids)).size).toBe(0);
 expect([...await access("course", ids)].map(([id]) => id).sort()).toEqual(["admin", "alice"]);
 data.penugasanTutor = [];
 expect([...await access("course", ids)].map(([id]) => id).sort()).toEqual(["admin", "alice", "tutor"]);
 data.mataKuliah.push(record("mataKuliah", { id: "other", legacyCourseId: "legacy", status: "active" }));
 expect((await access("course", ids)).size).toBe(0);
});

test("global authorization performs two queries per bounded page for 100 and 500 users", async () => {
 const ids = Array.from({ length: 500 }, (_, i) => `member-${i}`);
 const data = { discussionChannels: [channel({ id: "global", kind: "global", courseId: null, legacyCourseId: null, requesterId: null })],
  pengguna: ids.map(id => identity(id, "murid")) };
 const { access, queries } = harness(data);
 expect((await access("global", ids.slice(0, 100))).size).toBe(100);
 expect(queries()).toBe(2);
 for (let i = 100; i < 500; i += 100) expect((await access("global", ids.slice(i, i + 100))).size).toBe(100);
 expect(queries()).toBe(10);
 await expect(access("global", ids)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
});

test("notification worker imports do not reach Next, server-only or Sharp", () => {
 const visited = new Set<string>();
 const violations: string[] = [];
 function visit(file: string) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  function follow(specifier: string) {
   if (/^(server-only|sharp|next(?:\/.*)?)$/.test(specifier)) violations.push(`${file}: ${specifier}`);
   const base = specifier.startsWith("@/") ? resolve(specifier.slice(2))
    : specifier.startsWith(".") ? resolve(dirname(file), specifier) : null;
   if (!base) return;
   const target = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`,
    resolve(base, "index.ts"), resolve(base, "index.tsx"), resolve(base, "index.js")]
    .find(path => existsSync(path) && statSync(path).isFile());
   if (target && !target.includes("node_modules")) visit(target);
  }
  function walk(node: ts.Node) {
   if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) follow(node.moduleSpecifier.text);
   if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) follow(node.moduleSpecifier.text);
   if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) follow(node.arguments[0].text);
   ts.forEachChild(node, walk);
  }
  walk(source);
 }
 visit(resolve("lib/discussions/notifications.ts"));
 expect(violations).toEqual([]);
});
