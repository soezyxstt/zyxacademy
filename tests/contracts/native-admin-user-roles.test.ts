import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as tables from "@/db/schema";
import { handleNativeUserStatus } from "@/lib/native/academic/administration/user-status-handler";
import { createPostgresTestDb } from "../helpers/postgres";

const { testDb, client } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidatePath() {} }));
const { saveNativeUserRoles } = await import("@/lib/native/academic/administration/user-roles-service");
const { lockAdminUserRoles } = await import("@/lib/admin/user-roles");
const admin = "roles-admin", target = "roles-target";
const origin = "https://roles.example.test";
beforeAll(async () => {
  await testDb.insert(tables.user).values([
    { id: admin, name: "Admin", email: "admin@example.test", role: "admin" },
    { id: target, name: "Target", email: "target@example.test", role: "teacher" },
  ]);
  await testDb.insert(tables.peran).values({ id: "roles-admin-nonstandard", code: "admin" }).onConflictDoNothing();
  const [seed] = await testDb.select().from(tables.peran).where(eq(tables.peran.code, "admin"));
  await testDb.insert(tables.pengguna).values([{ id: admin }, { id: target, status: "suspended" }]);
  await testDb.insert(tables.penggunaPeran).values({ id: "roles-membership", penggunaId: admin, peranId: seed.id, source: "test" });
  await testDb.insert(tables.session).values([admin, target].map((id) => ({
    id: id + "-session", userId: id, token: id + "-token", expiresAt: new Date(Date.now() + 300000),
  })));
});
afterAll(() => client.close());

function patch(id: string, data: object, key = crypto.randomUUID(), actorId = admin, sessionId = actorId + "-session") {
  return handleNativeUserStatus(new Request(origin, {
    method: "PATCH", headers: { origin, "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ accountId: actorId, confirmed: true, ...data }),
  }), ["users", id, "roles"], origin, {
    session: async () => ({ user: { id: actorId }, session: { id: sessionId } }),
    hasAdmin: async () => true, saveRoles: saveNativeUserRoles,
    save: async () => { throw new Error("Unexpected status write"); },
  });
}

test("confirmed role replacement preserves suspension, synchronizes legacy role and replays once", async () => {
  const current = await testDb.transaction(tx => lockAdminUserRoles(tx as unknown as Parameters<typeof lockAdminUserRoles>[0], target));
  expect(current.roles).toEqual([]);
  const draft = { expectedRevision: current.revision, roles: ["admin", "tutor"] };
  const key = crypto.randomUUID();
  expect((await patch(target, { ...draft, confirmed: false }, key)).status).toBe(422);
  expect((await patch(target, { ...draft, roles: ["admin", "admin"] }, key)).status).toBe(422);
  const saved = await patch(target, draft, key);
  expect(saved.status).toBe(200);
  expect(await (await patch(target, draft, key)).json()).toEqual(await saved.json());
  expect((await patch(target, { ...draft, roles: ["murid"] }, key)).status).toBe(409);
  expect((await patch(target, draft)).status).toBe(409);
  expect((await testDb.transaction(tx => lockAdminUserRoles(tx as unknown as Parameters<typeof lockAdminUserRoles>[0], target))).roles).toEqual(["admin", "tutor"]);
  const [account] = await testDb.select({ role: tables.user.role, status: tables.pengguna.status })
    .from(tables.user).innerJoin(tables.pengguna, eq(tables.user.id, tables.pengguna.id)).where(eq(tables.user.id, target));
  expect(account).toEqual({ role: "admin", status: "suspended" });
  expect(await testDb.select().from(tables.auditMutasi).where(eq(tables.auditMutasi.entityType, "native_user_roles"))).toHaveLength(1);
});

test("checks live Admin authority, session, account binding and self-demotion before writing", async () => {
  const { revision } = await testDb.transaction(tx => lockAdminUserRoles(tx as unknown as Parameters<typeof lockAdminUserRoles>[0], admin));
  const draft = { expectedRevision: revision, roles: ["murid"] };
  expect((await patch(admin, draft)).status).toBe(422);
  expect((await patch(admin, draft, crypto.randomUUID(), target)).status).toBe(403);
  expect((await patch(target, draft, crypto.randomUUID(), admin, "missing")).status).toBe(401);
  expect((await patch(admin, { ...draft, accountId: target })).status).toBe(403);
  expect((await testDb.transaction(tx => lockAdminUserRoles(tx as unknown as Parameters<typeof lockAdminUserRoles>[0], admin))).roles).toEqual(["admin"]);
});
