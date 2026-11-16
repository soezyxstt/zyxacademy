import { beforeEach, expect, mock, test } from "bun:test";
import { getTableName } from "drizzle-orm";

let roles: string[] = [], writes = 0;
const db = {
 select: () => {
  let table = "";
  const query = {
   from(value: never) { table = getTableName(value); return this; },
   where() { return this; }, innerJoin() { return this; }, limit() { return this; },
   then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
    const rows = table === "user" ? [{ id: "legacy-admin", role: "admin" }]
     : table === "pengguna" ? [{ id: "legacy-admin", status: "active" }]
     : table === "pengguna_peran" ? roles.map(code => ({ code })) : [];
    return Promise.resolve(rows).then(resolve, reject);
   },
  };
  return query;
 },
 transaction: async () => { writes++; throw new Error("unexpected identity repair"); },
};
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/auth-session", () => ({ getAuthSession: async () => ({ user: { id: "legacy-admin" } }) }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => ({}), resolveCourseEntitlementsBatch: async () => new Map() }));
const { getSessionDiscussionActor } = await import("@/lib/discussions/session");

beforeEach(() => { roles = []; writes = 0; });

test("a roleless legacy identity with unknown provisioning provenance is denied", async () => {
 await expect(getSessionDiscussionActor()).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 expect(writes).toBe(0);
});

test("a deliberately removed last role is not restored from the legacy admin field", async () => {
 roles = ["admin"];
 expect(await getSessionDiscussionActor()).toEqual({ id: "legacy-admin", role: "admin" });
 roles = [];
 await expect(getSessionDiscussionActor()).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 expect(writes).toBe(0);
 roles = ["murid"];
 expect(await getSessionDiscussionActor()).toEqual({ id: "legacy-admin", role: "student" });
});
