import { createHash, randomUUID } from "node:crypto";
import { ADMIN_MCP_SCOPES } from "@/lib/admin-mcp/registry";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { verification } from "@/db/schema";
import {
  MCP_AUTHORING_DEFAULT_SCOPES,
  MCP_AUTHORING_SCOPES,
  issueMcpClientId,
  issueMcpConnectionToken,
  readMcpClientId,
  type McpClientPayload,
} from "@/lib/authoring/mcp-workflows";

export const MCP_OAUTH_SCOPES: readonly string[] = [...MCP_AUTHORING_SCOPES, ...ADMIN_MCP_SCOPES];
export const MCP_OAUTH_RESOURCE_PATH = "/api/mcp/authoring";
export const MCP_OAUTH_CODE_TTL_MS = 5 * 60 * 1000;

export type McpAuthorizationCode = {
  clientId: string;
  redirectUri: string;
  userId: string;
  sessionId: string;
  codeChallenge: string;
  scope: string[];
  resource: string;
};

export function publicMcpOrigin(): string {
  return new URL(resolveAuthBaseUrl()).origin;
}

export function resourceUrl(): string {
  return `${publicMcpOrigin()}${MCP_OAUTH_RESOURCE_PATH}`;
}

/** MCP tool-level challenge for an authenticated client that needs additional consent. */
export function insufficientScopeChallenge(scope: string): string {
  if (!MCP_OAUTH_SCOPES.includes(scope)) throw new Error("invalid_scope");
  const metadata = `${publicMcpOrigin()}/.well-known/oauth-protected-resource/api/mcp/authoring`;
  return `Bearer resource_metadata="${metadata}", error="insufficient_scope", scope="${scope}"`;
}

export function isAllowedRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.hash || url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    if (url.protocol !== "http:") return false;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  } catch {
    return false;
  }
}

export function requestedScopes(raw: string | null): string[] {
  const scopes = (raw?.trim() || MCP_AUTHORING_DEFAULT_SCOPES.join(" ")).split(/\s+/).filter(Boolean);
  if (scopes.some((scope) => !MCP_OAUTH_SCOPES.includes(scope as typeof MCP_OAUTH_SCOPES[number]))) {
    throw new Error("invalid_scope");
  }
  return [...new Set(scopes)];
}

export function approvedScopes(raw: string | null, selected: FormDataEntryValue[]): string[] {
  const requested = requestedScopes(raw);
  if (selected.length === 0 || selected.some((scope) => typeof scope !== "string" || !requested.includes(scope))) {
    throw new Error("invalid_scope");
  }
  return MCP_OAUTH_SCOPES.filter((scope) => selected.includes(scope));
}

export function issueClientRegistration(input: { clientName?: string; redirectUris: string[] }) {
  return issueMcpClientId(input);
}

export function readClientRegistration(clientId: string): McpClientPayload {
  const client = readMcpClientId(clientId);
  if (client.redirectUris.length === 0 || client.redirectUris.some((uri) => !isAllowedRedirectUri(uri))) {
    throw new Error("invalid_client");
  }
  return client;
}

type ConsentRequest = Pick<McpAuthorizationCode, "userId" | "sessionId" | "clientId" | "resource"> & {
  scope: readonly string[];
};

function consentId({ userId, sessionId, clientId, resource }: ConsentRequest): string {
  const key = createHash("sha256").update(JSON.stringify([userId, sessionId, clientId, resource])).digest("hex");
  return `mcp:oauth:consent:${key}`;
}

export async function hasMcpOAuthConsent(input: ConsentRequest, client: Pick<typeof db, "select"> = db, options: { lock?: boolean } = {}): Promise<boolean> {
  const query = client.select({ value: verification.value }).from(verification)
    .where(and(eq(verification.id, consentId(input)), gt(verification.expiresAt, new Date())))
    .limit(1);
  const [grant] = await (options.lock ? query.for("share") : query);
  if (!grant) return false;
  const approved: unknown = JSON.parse(grant.value);
  return Array.isArray(approved) && input.scope.every((scope) => approved.includes(scope));
}

/** Only the interactive consent action supplies an approval expiry. Other callers must have a grant. */
export async function storeAuthorizationCode(input: McpAuthorizationCode, approvedUntil?: Date): Promise<string> {
  const code = randomUUID();
  await db.transaction(async (tx) => {
    const now = new Date();
    if (approvedUntil) {
      if (!(approvedUntil.getTime() > now.getTime())) throw new Error("AUTHORING_MCP_SESSION_INVALID");
      const id = consentId(input);
      const grant = { value: JSON.stringify(input.scope), expiresAt: approvedUntil, updatedAt: now };
      await tx.insert(verification).values({ id, identifier: id, ...grant, createdAt: now })
        .onConflictDoUpdate({ target: verification.id, set: grant });
    } else if (!(await hasMcpOAuthConsent(input, tx))) {
      throw new Error("consent_required");
    }
    await tx.insert(verification).values({
      id: `mcp-oauth-code-${code}`,
      identifier: `mcp:oauth:code:${code}`,
      value: JSON.stringify(input),
      expiresAt: new Date(now.getTime() + MCP_OAUTH_CODE_TTL_MS),
      createdAt: now,
      updatedAt: now,
    });
  });
  return code;
}

export async function consumeAuthorizationCode(code: string): Promise<McpAuthorizationCode> {
  const identifier = `mcp:oauth:code:${code}`;
  const record = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: verification.id, value: verification.value, expiresAt: verification.expiresAt })
      .from(verification)
      .where(and(eq(verification.identifier, identifier), gt(verification.expiresAt, new Date())))
      .limit(1);
    if (!row) throw new Error("invalid_grant");
    await tx.delete(verification).where(eq(verification.id, row.id));
    return row;
  });
  try {
    const parsed = JSON.parse(record.value) as McpAuthorizationCode;
    if (!parsed.clientId || !parsed.redirectUri || !parsed.userId || !parsed.sessionId || !parsed.codeChallenge || !Array.isArray(parsed.scope)) {
      throw new Error("invalid_grant");
    }
    if (!(await hasMcpOAuthConsent(parsed))) throw new Error("invalid_grant");
    return parsed;
  } catch {
    throw new Error("invalid_grant");
  }
}

export function issueAccessToken(input: McpAuthorizationCode): string {
  return issueMcpConnectionToken({
    userId: input.userId,
    sessionId: input.sessionId,
    clientId: input.clientId,
    resource: input.resource,
    scopes: input.scope,
  });
}
