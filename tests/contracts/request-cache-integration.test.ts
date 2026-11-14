import { beforeEach, afterAll, expect, mock, test } from "bun:test";
import * as React from "react";
import path from "node:path";

// Use React's installed server cache, with a fresh dispatcher store per request.
const serverReact = require(path.resolve("node_modules/react/react.react-server.js"));
const internals = serverReact.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
const previousDispatcher = internals.A;
let store = new Map();
internals.A = { getCacheForType(factory: () => unknown) {
  if (!store.has(factory)) store.set(factory, factory());
  return store.get(factory);
} };
mock.module("react", () => ({ ...React, cache: serverReact.cache }));
mock.module("server-only", () => ({}));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));

let sessionCalls = 0;
let actor = "alice";
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => {
  sessionCalls++;
  return { user: { id: actor } };
} } } }));

let queries = 0;
let rowsByTable = new Map<unknown, unknown[]>();
function select() {
  queries++;
  let rows: unknown[] = [];
  const result = {
    from: (table: unknown) => { rows = rowsByTable.get(table) ?? []; return result; },
    innerJoin: () => result, where: () => result, limit: () => result, orderBy: () => result,
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return result;
}
mock.module("@/db", () => ({ db: { select } }));

const { getAuthSession, getAuthUser, requireAuthUser } = await import("@/lib/auth-session");
const { getPeranCodes: readPeranCodes } = await import("@/lib/auth/authorization");
const { getPeranCodes, hasPeran, hasAnyPeran, resolveTutorCourseAccess, listTutorAccessibleCourses } = await import("@/lib/auth/request-cache");
const { assertAdmin } = await import("@/lib/auth/admin-guards-server");
const { verifyTutorAccess } = await import("@/lib/auth/tutor-session-access");
const { getCourse, resolveStudentCourse, getCachedCourseAccess } = await import("@/lib/course-utils");
const schema = await import("@/db/schema");

beforeEach(() => { store = new Map(); rowsByTable = new Map(); queries = 0; sessionCalls = 0; actor = "alice"; });
afterAll(() => { internals.A = previousDispatcher; mock.restore(); });

test("layout and page session helpers share in-flight work only in one request", async () => {
  const [session, user, required] = await Promise.all([getAuthSession(), getAuthUser(), requireAuthUser()]);
  expect([session?.user.id, user?.id, required.id]).toEqual(["alice", "alice", "alice"]);
  expect(sessionCalls).toBe(1);
  actor = "bob";
  store = new Map();
  expect((await getAuthSession())?.user.id).toBe("bob");
  expect(sessionCalls).toBe(2);
});

test("production course helpers deduplicate normalized IDs and reset per request", async () => {
  await Promise.all([getCourse("missing"), getCourse("missing"), resolveStudentCourse(" missing ")]);
  expect(queries).toBe(2);
  store = new Map();
  await getCourse("missing");
  expect(queries).toBe(4);
});

test("access cache keys include user, course, role, and explicit time", async () => {
  const input = { courseId: "missing", userId: "alice" };
  await Promise.all([getCachedCourseAccess(input), getCachedCourseAccess({ ...input })]);
  const first = queries;
  expect(first).toBeGreaterThan(0);
  await getCachedCourseAccess({ ...input });
  expect(queries).toBe(first);
  for (const change of [{ userId: "bob" }, { courseId: "another" }, { roleHint: "admin" }, { now: new Date(0) }, { now: new Date(-86400000) }]) {
    const before = queries;
    await getCachedCourseAccess({ ...input, ...change });
    expect(queries).toBeGreaterThan(before);
  }
  const before = queries;
  store = new Map();
  await getCachedCourseAccess(input);
  expect(queries).toBeGreaterThan(before);
});

test("role and tutor reads deduplicate per render and isolate access keys and executors", async () => {
  await Promise.all([getPeranCodes("alice"), getPeranCodes("alice")]);
  expect(queries).toBe(1);
  await getPeranCodes("bob");
  expect(queries).toBe(2);

  const input = { penggunaId: "alice", courseId: "course", allowAdmin: false };
  await Promise.all([resolveTutorCourseAccess(input), resolveTutorCourseAccess({ ...input })]);
  expect(queries).toBe(3);
  await resolveTutorCourseAccess({ ...input, allowAdmin: true });
  await resolveTutorCourseAccess({ ...input, courseId: "other" });
  await resolveTutorCourseAccess({ ...input, penggunaId: "bob" });
  expect(queries).toBe(6);
  await Promise.all([listTutorAccessibleCourses("alice"), listTutorAccessibleCourses("alice")]);
  expect(queries).toBe(7);
  await listTutorAccessibleCourses("alice", { allowAdmin: true });
  expect(queries).toBe(8);

  let customQueries = 0;
  const executor = { select: () => {
    customQueries++;
    const result = Object.assign(Promise.resolve([]), { from: () => result, where: () => result, limit: () => result });
    return result;
  } };
  await resolveTutorCourseAccess(input, executor);
  await resolveTutorCourseAccess(input, executor);
  await listTutorAccessibleCourses("alice", undefined, executor);
  expect(customQueries).toBe(3);
  store = new Map();
  await getPeranCodes("alice");
  await resolveTutorCourseAccess(input);
  await listTutorAccessibleCourses("alice");
  expect(queries).toBe(11);
});

test("layout roles are shared with tutor reads and core role reads stay uncached", async () => {
  rowsByTable.set(schema.pengguna, [{ id: "alice", status: "active" }]);
  rowsByTable.set(schema.penggunaPeran, [{ code: "tutor" }]);
  rowsByTable.set(schema.mataKuliah, [{ id: "course", status: "active", legacyCourseId: null }]);
  rowsByTable.set(schema.penugasanTutor, [{ id: "assignment", mataKuliahId: "course", status: "active", assignmentScope: "course", legacyCourseId: null }]);

  expect(await hasAnyPeran("alice", ["tutor"])).toBe(true);
  expect(queries).toBe(1);
  expect(await listTutorAccessibleCourses("alice")).toHaveLength(1);
  expect(queries).toBe(4);
  expect((await resolveTutorCourseAccess({ penggunaId: "alice", courseId: "course" })).hasAccess).toBe(true);
  expect(queries).toBe(7);

  rowsByTable.set(schema.penggunaPeran, [{ code: "admin" }]);
  expect(await hasAnyPeran("bob", ["admin"])).toBe(true);
  expect(await hasAnyPeran("alice", ["tutor"])).toBe(true);
  expect(await readPeranCodes("alice")).toEqual(["admin"]);
  expect(await readPeranCodes("alice")).toEqual(["admin"]);
  expect(queries).toBe(10);
  store = new Map();
  expect(await hasAnyPeran("alice", ["tutor"])).toBe(false);
  expect(queries).toBe(11);
});

test("explicit executors read their own roles even after a render cache is warm", async () => {
  rowsByTable.set(schema.penggunaPeran, [{ code: "tutor" }]);
  expect(await hasAnyPeran("alice", ["tutor"])).toBe(true);

  const transactionRows = new Map<unknown, unknown[]>([
    [schema.pengguna, [{ id: "alice", status: "active" }]],
    [schema.mataKuliah, [{ id: "course", status: "active", legacyCourseId: null }]],
    [schema.penggunaPeran, [{ code: "admin" }]],
  ]);
  let transactionQueries = 0;
  const executor = { select: () => {
    transactionQueries++;
    let rows: unknown[] = [];
    const result = {
      from: (table: unknown) => { rows = transactionRows.get(table) ?? []; return result; },
      innerJoin: () => result, where: () => result, limit: () => result,
      then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return result;
  } };
  const input = { penggunaId: "alice", courseId: "course", allowAdmin: true };
  expect((await resolveTutorCourseAccess(input, executor)).source).toBe("admin_override");
  expect((await resolveTutorCourseAccess(input, executor)).source).toBe("admin_override");
  expect((await listTutorAccessibleCourses("alice", { allowAdmin: true }, executor))[0]?.source).toBe("admin_override");
  expect(transactionQueries).toBe(9);
  expect(queries).toBe(1);
});

test("RSC guards share role and course reads with the layout", async () => {
  rowsByTable.set(schema.pengguna, [{ id: "alice", status: "active" }]);
  rowsByTable.set(schema.penggunaPeran, [{ id: "membership", code: "admin" }]);
  expect(await hasPeran("alice", "admin")).toBe(true);
  await assertAdmin();
  expect(queries).toBe(3);

  store = new Map();
  rowsByTable.set(schema.penggunaPeran, [{ id: "membership", code: "tutor" }]);
  rowsByTable.set(schema.mataKuliah, [{ id: "course", status: "active", legacyCourseId: null }]);
  rowsByTable.set(schema.penugasanTutor, [{ id: "assignment", status: "active", assignmentScope: "course" }]);
  expect(await hasAnyPeran("alice", ["tutor"])).toBe(true);
  expect((await verifyTutorAccess("course")).access.hasAccess).toBe(true);
  expect((await verifyTutorAccess("course")).access.hasAccess).toBe(true);
  expect(queries).toBe(7);
  expect(sessionCalls).toBe(2);
});
