import { peran, pengguna, penggunaPeran, session, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { membershipIdFor, PERAN_SEEDS, peranIdFor } from "@/lib/auth/peran";
import { mcpEnvironmentIdentity } from "@/lib/authoring/mcp-environment";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";

type Database = Awaited<ReturnType<typeof import("./postgres").createPostgresTestDb>>["testDb"];
/** Real fixture authority, not a production authorization bypass. */
export function adminMcpTestPrincipal(input: McpPrincipal): McpPrincipal {
  return { ...input, ...(input.authMethod === "oauth" ? { clientId: input.clientId ?? "admin-mcp-test-client", resource: input.resource ?? mcpEnvironmentIdentity().resource } : {}) };
}
export async function seedAdminMcpAuthority(database: Database, principal: McpPrincipal, grantScopes: readonly string[] = principal.scopes) {
  await database.insert(peran).values([...PERAN_SEEDS]).onConflictDoNothing();
  await database.update(user).set({ role: "admin" }).where(eq(user.id, principal.userId));
  await database.insert(pengguna).values({ id: principal.userId, status: "active" }).onConflictDoUpdate({ target: pengguna.id, set: { status: "active" } });
  await database.insert(penggunaPeran).values({ id: membershipIdFor(principal.userId, "admin"), penggunaId: principal.userId, peranId: peranIdFor("admin"), source: "admin_mcp_test_fixture" }).onConflictDoNothing();
  await database.insert(session).values({ id: principal.sessionId, userId: principal.userId, token: `fixture-${principal.userId}-${principal.sessionId}`, expiresAt: new Date("2099-01-01T00:00:00Z") }).onConflictDoNothing();
  if (principal.authMethod === "oauth" && principal.clientId && principal.resource) {
    const { storeAuthorizationCode } = await import("@/lib/authoring/mcp-oauth");
    await storeAuthorizationCode({ userId: principal.userId, sessionId: principal.sessionId, clientId: principal.clientId, resource: principal.resource, scope: [...grantScopes], redirectUri: "https://client.example.test/callback", codeChallenge: "local-authority-fixture" }, new Date("2099-01-01T00:00:00Z"));
  }
}
