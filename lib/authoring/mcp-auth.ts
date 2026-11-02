import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { session as authSession } from "@/db/schema";
import { hasPeran } from "@/lib/auth/authorization";
import { readMcpConnectionToken, type McpConnectionTokenPayload } from "@/lib/authoring/mcp-workflows";
import { hasMcpOAuthConsent } from "@/lib/authoring/mcp-oauth";

export const MCP_MANUAL_CLIENT_ID = "zyx-admin-connection";

export type McpPrincipal = {
  userId: string;
  actorId: string;
  sessionId: string;
  scopes: string[];
  authMethod: "session" | "oauth";
};

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
  if (!(await hasPeran(input.userId, "admin"))) throw new Error("AUTHORING_MCP_ADMIN_REQUIRED");
  return {
    userId: input.userId,
    actorId: input.userId,
    sessionId: input.sessionId,
    scopes: [...input.scopes],
    authMethod: input.authMethod,
  };
}

export async function principalFromConnectionToken(token: string, expectedResource: string): Promise<McpPrincipal> {
  const payload: McpConnectionTokenPayload = readMcpConnectionToken(token);
  if (payload.resource !== expectedResource) throw new Error("AUTHORING_MCP_INVALID_RESOURCE");
  const principal = await resolveMcpAdmin({
    userId: payload.userId,
    sessionId: payload.sessionId,
    scopes: payload.scopes,
    authMethod: "oauth",
  });
  if (payload.clientId !== MCP_MANUAL_CLIENT_ID) {
    const approved = await hasMcpOAuthConsent({
      userId: payload.userId,
      sessionId: payload.sessionId,
      clientId: payload.clientId,
      resource: expectedResource,
      scope: payload.scopes,
    });
    if (!approved) throw new Error("AUTHORING_MCP_CONSENT_REQUIRED");
  }
  return principal;
}

export function requireMcpScope(principal: McpPrincipal, scope: string): void {
  if (!principal.scopes.includes(scope)) throw new Error(`AUTHORING_MCP_SCOPE_REQUIRED:${scope}`);
}
