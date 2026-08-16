import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pengguna, session as authSession, user } from "@/db/schema";
import { hasPeran } from "@/lib/auth/authorization";
import { readMcpConnectionToken, type McpConnectionTokenPayload } from "@/lib/authoring/mcp-workflows";

export type McpPrincipal = {
  userId: string;
  actorId: string;
  sessionId: string;
  scopes: string[];
  authMethod: "session" | "oauth";
};

async function activeAdmin(userId: string): Promise<{ id: string } | null> {
  const [identity] = await db
    .select({ id: pengguna.id, role: user.role, status: pengguna.status })
    .from(pengguna)
    .innerJoin(user, eq(user.id, pengguna.id))
    .where(eq(pengguna.id, userId))
    .limit(1);
  if (!identity || identity.status !== "active") return null;
  if (identity.role === "admin" || await hasPeran(userId, "admin")) return { id: identity.id };
  return null;
}

async function liveSession(userId: string, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: authSession.id, expiresAt: authSession.expiresAt })
    .from(authSession)
    .where(and(eq(authSession.id, sessionId), eq(authSession.userId, userId)))
    .limit(1);
  return Boolean(row && row.expiresAt.getTime() > Date.now());
}

export async function resolveMcpAdmin(input: {
  userId: string;
  sessionId: string;
  scopes: readonly string[];
  authMethod: McpPrincipal["authMethod"];
}): Promise<McpPrincipal> {
  if (!(await liveSession(input.userId, input.sessionId))) throw new Error("AUTHORING_MCP_SESSION_INVALID");
  const identity = await activeAdmin(input.userId);
  if (!identity) throw new Error("AUTHORING_MCP_ADMIN_REQUIRED");
  return {
    userId: input.userId,
    actorId: identity.id,
    sessionId: input.sessionId,
    scopes: [...input.scopes],
    authMethod: input.authMethod,
  };
}

export async function principalFromConnectionToken(token: string): Promise<McpPrincipal> {
  const payload: McpConnectionTokenPayload = readMcpConnectionToken(token);
  return resolveMcpAdmin({
    userId: payload.userId,
    sessionId: payload.sessionId,
    scopes: payload.scopes,
    authMethod: "oauth",
  });
}

export function requireMcpScope(principal: McpPrincipal, scope: string): void {
  if (!principal.scopes.includes(scope)) throw new Error(`AUTHORING_MCP_SCOPE_REQUIRED:${scope}`);
}
