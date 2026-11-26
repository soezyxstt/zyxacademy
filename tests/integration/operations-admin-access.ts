// Isolated process: only the session source is synthetic, canonical role checks use PostgreSQL.
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { eq } from "drizzle-orm";
import { createPostgresTestDb } from "../helpers/postgres";
import { PERAN_SEEDS } from "../../lib/auth/peran";
import { pengguna, penggunaPeran, peran, user } from "../../db/schema";

const { client, testDb } = await createPostgresTestDb();
type Role = "student" | "teacher" | "admin";
let current: { id: string; role: Role } | null = null;
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/auth-session", () => ({ getAuthSession: async () => current && ({ user: current }) }));

try {
  const { getNativeOperationsAdmin } = await import("../../lib/auth/native-operations-admin");
  assert.deepEqual(await getNativeOperationsAdmin(), { ok: false, status: 401 });
  await testDb.insert(peran).values([...PERAN_SEEDS]).onConflictDoNothing();
  for (const role of ["student", "teacher", "admin"] as const) {
    current = { id: `operations-${role}`, role };
    await testDb.insert(user).values({ ...current, name: role, email: role + "@example.invalid" });
    const result = await getNativeOperationsAdmin();
    if (role === "admin") assert.deepEqual(result, { ok: true, user: current });
    else assert.deepEqual(result, { ok: false, status: 403 });
  }
  // A logged-in legacy admin loses access immediately when canonical membership is removed.
  await testDb.delete(penggunaPeran).where(eq(penggunaPeran.penggunaId, current!.id));
  assert.deepEqual(await getNativeOperationsAdmin(), { ok: false, status: 403 });
  assert.deepEqual((await testDb.select().from(pengguna).where(eq(pengguna.id, current!.id))).length, 1);
  console.log("operations admin guard: anonymous, student, tutor, first-use admin and revoked access passed");
} finally {
  await client.close();
}
