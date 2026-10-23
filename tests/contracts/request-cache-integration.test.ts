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
function select() {
  queries++;
  const result = Object.assign(Promise.resolve([]), {
    from: () => result, where: () => result, limit: () => result, orderBy: () => result,
  });
  return result;
}
mock.module("@/db", () => ({ db: { select } }));

const { getAuthSession, getAuthUser, requireAuthUser } = await import("@/lib/auth-session");
const { getCourse, resolveStudentCourse, getCachedCourseAccess } = await import("@/lib/course-utils");

beforeEach(() => { store = new Map(); queries = 0; sessionCalls = 0; actor = "alice"; });
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
