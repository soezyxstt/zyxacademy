import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Load only the module under test, without initializing auth, env, or a database.
function load(path: string, dependencies: Record<string, unknown>): any {
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(output, {
    exports,
    require(name: string) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const schema = {
  mataKuliah: { table: "canonical", id: "id", title: "title", status: "status", legacyCourseId: "legacyCourseId" },
  courses: { table: "legacy", id: "id", title: "title" },
  pengguna: { table: "identity", id: "id", status: "status" },
  penggunaPeran: { table: "membership", id: "id", penggunaId: "penggunaId" },
};
const operators = {
  eq: (key: string, value: unknown) => (row: any) => row[key] === value,
  and: (...filters: any[]) => (row: any) => filters.every((filter) => filter(row)),
  or: (...filters: any[]) => (row: any) => filters.some((filter) => filter(row)),
};
function database(tables: Record<string, any[]>, reads: string[]) {
  return {
    select(projection?: Record<string, string>) {
      return {
        from(table: { table: string }) {
          reads.push(table.table);
          return {
            where(filter: (row: any) => boolean) {
              return {
                limit(count: number) {
                  const rows = (tables[table.table] ?? []).filter(filter).slice(0, count);
                  return Promise.resolve(rows.map((row) => projection
                    ? Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[column]]))
                    : row));
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("navigation auth parity", () => {
  it("rechecks session and canonical access on each independent guard invocation", async () => {
    const reads: string[] = [];
    const tables = { identity: [{ id: "a" }], membership: [{ id: "m", penggunaId: "a" }] };
    let session: any = { user: { id: "a", role: "admin" } };
    let codes = ["admin"];
    let sessionReads = 0;
    const guards = load("lib/auth/admin-guards.ts", {
      "drizzle-orm": operators,
      "@/db": { db: database(tables, reads) },
      "@/db/schema": schema,
      "@/lib/auth-session": { getAuthSession: async () => { sessionReads++; return session; } },
      "@/lib/auth/authorization": {
        getPeranCodes: async () => codes,
        hasPeranFromCodes: (values: string[], role: string) => values.includes(role),
        hasAnyPeranFromCodes: (values: string[], roles: string[]) => roles.some((role) => values.includes(role)),
      },
    });
    await guards.assertAdmin();
    // A disabled identity yields no active canonical codes, despite legacy admin.
    codes = [];
    await expect(guards.assertAdmin()).rejects.toThrow("Forbidden");
    await expect(guards.assertTutorOrAdmin()).rejects.toThrow("Forbidden");
    tables.identity = [];
    tables.membership = [];
    await guards.assertAdmin();
    session = { user: { id: "a", role: "teacher" } };
    await guards.assertTutorOrAdmin();
    await expect(guards.assertAdmin()).rejects.toThrow("Forbidden");
    session = null;
    await expect(guards.assertAdmin()).rejects.toThrow("Unauthorized");
    await expect(guards.assertTutorOrAdmin()).rejects.toThrow("Unauthorized");
    expect(sessionReads).toBe(8);
    expect(reads.length).toBe(12);
  });
});

describe("title-only metadata compatibility", () => {
  it("normalizes slugs, prefers active canonical rows and preserves legacy fallback", async () => {
    const reads: string[] = [];
    const tables = {
      canonical: [
        { id: "first", legacyCourseId: "collision", title: "First match", status: "active" },
        { id: "collision", legacyCourseId: null, title: "ID match", status: "active" },
        { id: "inactive", legacyCourseId: "old", title: "Hidden", status: "archived" },
      ],
      legacy: [{ id: "collision", title: "Legacy collision" }, { id: "old", title: "Legacy fallback" }],
    };
    let authorized = true;
    let checks = 0;
    const { getCourseTitleOnly } = load("app/(admin)/admin/(academic)/courses/[slug]/metadata.ts", {
      "server-only": {},
      "drizzle-orm": operators,
      "@/db": { db: database(tables, reads) },
      "@/db/schema": schema,
      "@/lib/auth/admin-guards": { assertAdmin: async () => {
        checks++;
        if (!authorized) throw new Error("Forbidden");
      } },
    });
    expect(await getCourseTitleOnly(" COLLISION ")).toEqual({ title: "First match" });
    expect(await getCourseTitleOnly("first")).toEqual({ title: "First match" });
    expect(await getCourseTitleOnly("old")).toEqual({ title: "Legacy fallback" });
    expect(await getCourseTitleOnly("inactive")).toBeNull();
    expect(await getCourseTitleOnly("missing")).toBeNull();
    expect(reads).toEqual(Array.from({ length: 5 }, () => ["canonical", "legacy"]).flat());
    authorized = false;
    await expect(getCourseTitleOnly("collision")).rejects.toThrow("Forbidden");
    expect(checks).toBe(6);
    expect(reads.length).toBe(10);
  });
});
