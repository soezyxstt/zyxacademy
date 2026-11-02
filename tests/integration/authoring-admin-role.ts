// Run in a dedicated Bun process so the database mock cannot affect other tests.
import { expect, mock } from "bun:test";
import { randomBytes } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import * as schema from "@/db/schema";
import { PERAN_IDS } from "@/lib/auth/peran";
import { countLegacyAdminsWithoutActiveGrant } from "@/scripts/staging/check-authoring-admin-roles";
import { createPostgresTestDb } from "../helpers/postgres";

const origin = "http://localhost:3000";
const resource = `${origin}/api/mcp/authoring`;
const { client, testDb: db } = await createPostgresTestDb();

try {
  process.env.SKIP_ENV_VALIDATION = "1";
  process.env.BETTER_AUTH_URL = origin;
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  mock.module("@/db", () => ({ db }));
  mock.module("@/lib/db", () => ({ db }));

  const { auth } = await import("@/lib/auth");
  const { POST: connect } = await import("@/app/api/mcp/authoring/connection/route");
  const { principalFromConnectionToken } = await import("@/lib/authoring/mcp-auth");
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ name: "Original", email: "student@example.test" });
  const session = await ctx.internalAdapter.createSession(user.id);
  const signature = await makeSignature(session.token, ctx.secret);
  const cookie = `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`;

  const updateProfile = (body: Record<string, string>) => auth.handler(new Request(`${origin}/api/auth/update-user`, {
    method: "POST", headers: { cookie, origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const requestConnection = () => connect(new NextRequest(`${resource}/connection`, {
    method: "POST", headers: { cookie, origin },
  }));
  const storedUser = () => db.query.user.findFirst({ where: eq(schema.user.id, user.id) });

  expect((await updateProfile({ name: "Changed" })).status).toBe(200);
  expect((await updateProfile({ role: "admin" })).status).toBe(400);
  expect(await storedUser()).toMatchObject({ name: "Changed", role: "student" });
  expect((await requestConnection()).status).toBe(403);

  // Simulate a legacy row modified before the profile field was protected.
  await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, user.id));
  expect((await requestConnection()).status).toBe(403);
  expect(await countLegacyAdminsWithoutActiveGrant(client)).toBe(1);

  await db.insert(schema.penggunaPeran).values({
    id: "test-admin", penggunaId: user.id, peranId: PERAN_IDS.admin, source: "test",
  });
  expect(await countLegacyAdminsWithoutActiveGrant(client)).toBe(0);
  await db.update(schema.user).set({ role: "student" }).where(eq(schema.user.id, user.id));
  const connection = await requestConnection();
  expect(connection.status).toBe(200);
  const { access_token: token } = await connection.json();
  expect(await principalFromConnectionToken(token, resource)).toMatchObject({ userId: user.id });

  await db.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, user.id));
  expect((await requestConnection()).status).toBe(403);
  await expect(principalFromConnectionToken(token, resource)).rejects.toThrow("AUTHORING_MCP_ADMIN_REQUIRED");

  await db.delete(schema.pengguna).where(eq(schema.pengguna.id, user.id));
  await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, user.id));
  expect((await requestConnection()).status).toBe(403);
  expect(await countLegacyAdminsWithoutActiveGrant(client)).toBe(1);
} finally {
  await client.close();
}
