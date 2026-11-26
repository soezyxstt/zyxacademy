import { randomBytes } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { assertFixtureRunner, fixtureDatabase } from "./scope";

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

export async function seedBrowserSession() {
  assertFixtureRunner();
  const [{ auth }, { db }, { session: sessions }] = await Promise.all([
    import("@/lib/auth"), import("@/db"), import("@/db/schema"),
  ]);
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser({
    name: "Expo Preview Student",
    email: `expo-preview-${randomBytes(8).toString("hex")}@example.test`,
    emailVerified: true,
  });
  const session = await context.internalAdapter.createSession(user.id);
  const expiresIn = 300;
  await db.update(sessions).set({ expiresAt: new Date(Date.now() + expiresIn * 1000) }).where(eq(sessions.id, session.id));
  const signature = await makeSignature(session.token, context.secret);
  const cookie = context.authCookies.sessionToken.name + "=" + encodeURIComponent(session.token + "." + signature);
  return { accountId: user.id, sessionId: session.id, cookie: `${cookie}; Path=/; Max-Age=${expiresIn}; Secure; HttpOnly; SameSite=Lax` };
}
