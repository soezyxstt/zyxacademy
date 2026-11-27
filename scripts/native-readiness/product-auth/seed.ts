import { randomBytes } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { assertFixtureRunner, fixtureDatabase, fixtureSessionSeconds } from "./scope";
import { staffRoles, type StaffRole } from "./staff-role";

export async function prepareFixtureDatabase() {
  assertFixtureRunner();
  const client = new Client({ connectionString: fixtureDatabase });
  try {
    await client.connect();
    const identity = await client.query("SELECT current_database() AS db, current_user AS role");
    const service = identity.rows[0];
    if (service?.db !== "native_preview" || service.role !== "native_preview") throw new Error("Wrong fixture database");
    await migrate(drizzle(client), { migrationsFolder: "drizzle-postgres" });
  } finally {
    await client.end();
  }
}

export async function seedBrowserSession(role?: StaffRole) {
  assertFixtureRunner();
  const { auth } = await import("@/lib/auth");
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser({
    name: "Expo Preview " + (role ? staffRoles[role].label : "Student"),
    email: `expo-preview-${randomBytes(8).toString("hex")}@example.test`,
    emailVerified: true,
  });
  if (role) await (await import("./staff-fixture")).seedStaffRole(user.id, role);
  const session = await context.internalAdapter.createSession(user.id);
  if (session.expiresAt.getTime() > Date.now() + fixtureSessionSeconds * 1000) throw new Error("Fixture session exceeds its lease");
  const signature = await makeSignature(session.token, context.secret);
  const cookie = context.authCookies.sessionToken.name + "=" + encodeURIComponent(session.token + "." + signature);
  return { accountId: user.id, sessionId: session.id, cookie: `${cookie}; Path=/; Max-Age=${fixtureSessionSeconds}; Secure; HttpOnly; SameSite=Lax` };
}
