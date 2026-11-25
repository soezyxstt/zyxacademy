import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { resolveAuthSecret } from "@/lib/auth-secret";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { ADMIN_MCP_SCOPES } from "@/lib/admin-mcp/registry";
import { and, eq, gt, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { session, verification } from "@/db/schema";
import {
  MCP_AUTHORING_DEFAULT_SCOPES,
  MCP_AUTHORING_SCOPES,
  issueMcpClientId,
  issueMcpConnectionToken,
  readMcpClientId,
  readMcpConnectionToken,
  type McpClientPayload,
} from "@/lib/authoring/mcp-workflows";

export const MCP_OAUTH_SCOPES: readonly string[] = [...MCP_AUTHORING_SCOPES, ...ADMIN_MCP_SCOPES];
// Fresh OAuth connections offer every supported permission without granting it.
export const MCP_OAUTH_INITIAL_SCOPES: readonly string[] = [...MCP_OAUTH_SCOPES];
export const MCP_OAUTH_RESOURCE_PATH = "/api/mcp/authoring";
export const MCP_OAUTH_CODE_TTL_MS = 5 * 60 * 1000;
export const MCP_OAUTH_ACCESS_TTL_SECONDS = 60 * 60;
export const MCP_OAUTH_REFRESH_IDLE_MS = 90 * 24 * 60 * 60 * 1000;
export const MCP_OAUTH_GRANT_MAX_MS = 180 * 24 * 60 * 60 * 1000;
// Permit an immediate retry after a lost response or parallel client refresh.
const REFRESH_RETRY_MS = 10_000;
const GRANT_PREFIX = "mcp:oauth:grant:";
const refreshPrefix = "zyx_mcp_rt_v1";

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
  const scopes = (raw?.trim() || MCP_OAUTH_INITIAL_SCOPES.join(" ")).split(/\s+/).filter(Boolean);
  if (scopes.some((scope) => !MCP_OAUTH_SCOPES.includes(scope as typeof MCP_OAUTH_SCOPES[number]))) {
    throw new Error("invalid_scope");
  }
  return [...new Set(scopes)];
}

export function defaultConsentScopes(requested: readonly string[]): string[] {
  const isInitialScopeSet = requested.length === MCP_OAUTH_INITIAL_SCOPES.length
    && MCP_OAUTH_INITIAL_SCOPES.every((scope) => requested.includes(scope));
  return isInitialScopeSet ? [...MCP_AUTHORING_DEFAULT_SCOPES] : [...requested];
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
type SelectClient = Pick<typeof db, "select">;
const grantSchema = z.object({
  userId: z.string().min(1),
  browserSessionId: z.string().min(1),
  clientId: z.string().min(1),
  resource: z.string().min(1),
  scope: z.array(z.string()).min(1),
  sequence: z.number().int().positive(),
  rotatedAt: z.number().int().nonnegative(),
  absoluteExpiry: z.number().int().positive(),
});
type OAuthGrant = z.infer<typeof grantSchema>;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function consentId({ userId, sessionId, clientId, resource }: ConsentRequest): string {
  return "mcp:oauth:consent:" + hash(JSON.stringify([userId, sessionId, clientId, resource]));
}

function grantIdentifierPrefix(input: ConsentRequest): string {
  return GRANT_PREFIX + hash(input.userId) + ":" + consentId(input).split(":").at(-1) + ":";
}

export function isMcpOAuthGrantSessionId(id: string): boolean {
  return /^mcp:oauth:grant:[0-9a-f-]{36}$/.test(id);
}

function parseGrant(value: string): OAuthGrant {
  return grantSchema.parse(JSON.parse(value));
}

function binding(grant: OAuthGrant): ConsentRequest {
  return { userId: grant.userId, sessionId: grant.browserSessionId, clientId: grant.clientId, resource: grant.resource, scope: grant.scope };
}

async function readConsent(input: ConsentRequest, client: SelectClient, lock: boolean = false) {
  const query = client.select({ value: verification.value, expiresAt: verification.expiresAt }).from(verification)
    .where(and(eq(verification.id, consentId(input)), gt(verification.expiresAt, new Date()))).limit(1);
  const [row] = await (lock ? query.for("share") : query);
  if (!row) return null;
  const scopes = z.array(z.string()).parse(JSON.parse(row.value));
  return { scopes, expiresAt: row.expiresAt };
}

async function readGrant(id: string, client: SelectClient = db, lock?: "share" | "update") {
  const query = client.select({ value: verification.value, expiresAt: verification.expiresAt }).from(verification)
    .where(and(eq(verification.id, id), gt(verification.expiresAt, new Date()))).limit(1);
  const [row] = await (lock ? query.for(lock) : query);
  if (!row) return null;
  const grant = parseGrant(row.value);
  if (grant.absoluteExpiry <= Date.now() || row.expiresAt.getTime() <= Date.now()) return null;
  return { grant, expiresAt: row.expiresAt };
}

function permits(grant: OAuthGrant, input: ConsentRequest): boolean {
  return grant.userId === input.userId && grant.clientId === input.clientId && grant.resource === input.resource
    && grant.resource === resourceUrl() && input.scope.every(scope => grant.scope.includes(scope));
}

/** For durable connections lock consent before the grant, matching refresh and scope changes. */
export async function hasMcpOAuthConsent(input: ConsentRequest, client: SelectClient = db, options: { lock?: boolean } = {}): Promise<boolean> {
  if (!isMcpOAuthGrantSessionId(input.sessionId)) {
    const consent = await readConsent(input, client, options.lock);
    return Boolean(consent && input.scope.every(scope => consent.scopes.includes(scope)));
  }
  const initial = await readGrant(input.sessionId, client);
  if (!initial || !permits(initial.grant, input)) return false;
  const consent = await readConsent(binding(initial.grant), client, options.lock);
  if (!consent || !input.scope.every(scope => consent.scopes.includes(scope))) return false;
  const current = options.lock ? await readGrant(input.sessionId, client, "share") : initial;
  return Boolean(current && permits(current.grant, input));
}

/** Interactive approval creates a durable consent boundary; silent approval still requires a live browser session. */
export async function storeAuthorizationCode(input: McpAuthorizationCode, approvedUntil?: Date): Promise<string> {
  const code = randomUUID();
  await db.transaction(async (tx) => {
    const now = new Date();
    if (approvedUntil) {
      if (!(approvedUntil.getTime() > now.getTime())) throw new Error("AUTHORING_MCP_SESSION_INVALID");
      const id = consentId(input);
      const [previous] = await tx.select({ expiresAt: verification.expiresAt }).from(verification)
        .where(eq(verification.id, id)).limit(1).for("update");
      const grant = { value: JSON.stringify(input.scope), expiresAt: new Date(now.getTime() + MCP_OAUTH_GRANT_MAX_MS), updatedAt: now };
      await tx.insert(verification).values({ id, identifier: id, ...grant, createdAt: now })
        .onConflictDoUpdate({ target: verification.id, set: grant });
      // Revoking or narrowing consent permanently invalidates incompatible families.
      const rows = await tx.select({ id: verification.id, value: verification.value, expiresAt: verification.expiresAt })
        .from(verification).where(like(verification.identifier, grantIdentifierPrefix(input) + "%"));
      for (const row of rows) {
        if (!previous || previous.expiresAt <= now || row.expiresAt <= now
          || !parseGrant(row.value).scope.every(scope => input.scope.includes(scope))) {
          await tx.delete(verification).where(eq(verification.id, row.id));
        }
      }
    } else if (!(await hasMcpOAuthConsent(input, tx, { lock: true }))) {
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
  // DELETE ... RETURNING consumes the code exactly once even across instances.
  const [record] = await db.delete(verification)
    .where(and(eq(verification.id, `mcp-oauth-code-${code}`), gt(verification.expiresAt, new Date())))
    .returning({ value: verification.value });
  if (!record) throw new Error("invalid_grant");
  let parsed: McpAuthorizationCode;
  try {
    parsed = JSON.parse(record.value) as McpAuthorizationCode;
    if (!parsed.clientId || !parsed.redirectUri || !parsed.userId || !parsed.sessionId || !parsed.codeChallenge || !Array.isArray(parsed.scope)) {
      throw new Error("invalid_grant");
    }
  } catch {
    throw new Error("invalid_grant");
  }
  if (!(await hasMcpOAuthConsent(parsed))) throw new Error("invalid_grant");
  return parsed;
}

// A refresh credential is derived from a random grant ID and monotonic sequence.
// Only the grant and sequence are stored; the HMAC secret is never in the database.
function makeRefreshToken(id: string, sequence: number): string {
  const body = [refreshPrefix, id.slice(GRANT_PREFIX.length), sequence].join(".");
  const signature = createHmac("sha256", resolveAuthSecret()).update("zyx-mcp-refresh.v1:" + resourceUrl() + ":" + body).digest("base64url");
  return body + "." + signature;
}

function readRefreshToken(token: string): { id: string; sequence: number } | null {
  const [prefix, uuid, rawSequence, signature, extra] = token.split(".");
  if (prefix !== refreshPrefix || !uuid || !rawSequence || !signature || extra !== undefined) return null;
  const id = GRANT_PREFIX + uuid;
  const sequence = Number(rawSequence);
  if (!isMcpOAuthGrantSessionId(id) || !Number.isSafeInteger(sequence) || sequence < 1 || String(sequence) !== rawSequence) return null;
  const expected = Buffer.from(makeRefreshToken(id, sequence));
  const actual = Buffer.from(token);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { id, sequence };
}

function tokenPair(id: string, grant: OAuthGrant, expiresAt: Date) {
  const ttl = Math.min(MCP_OAUTH_ACCESS_TTL_SECONDS, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  if (ttl <= 0) throw new Error("invalid_grant");
  return {
    access_token: issueMcpConnectionToken({ userId: grant.userId, sessionId: id, clientId: grant.clientId, resource: grant.resource, scopes: grant.scope, ttlSeconds: ttl }),
    refresh_token: makeRefreshToken(id, grant.sequence),
    token_type: "Bearer" as const,
    expires_in: ttl,
    scope: grant.scope.join(" "),
  };
}

export async function createOAuthTokenPair(input: McpAuthorizationCode) {
  return db.transaction(async tx => {
    await assertAuthoringActor(tx, input.userId, { roles: ["admin"], lock: true, error: "AUTHORING_MCP_ADMIN_REQUIRED" });
    const [active] = await tx.select({ id: session.id }).from(session)
      .where(and(eq(session.id, input.sessionId), eq(session.userId, input.userId), gt(session.expiresAt, new Date()))).limit(1).for("share");
    if (!active) throw new Error("invalid_grant");
    const consent = await readConsent(input, tx, true);
    if (!consent || !input.scope.every(scope => consent.scopes.includes(scope))) throw new Error("invalid_grant");
    if (input.resource !== resourceUrl()) throw new Error("invalid_target");
    const now = new Date();
    const uuid = randomUUID();
    const id = GRANT_PREFIX + uuid;
    const grant: OAuthGrant = {
      userId: input.userId, browserSessionId: input.sessionId, clientId: input.clientId,
      resource: input.resource, scope: input.scope, sequence: 1, rotatedAt: 0,
      absoluteExpiry: Math.min(consent.expiresAt.getTime(), now.getTime() + MCP_OAUTH_GRANT_MAX_MS),
    };
    const expiresAt = new Date(Math.min(grant.absoluteExpiry, now.getTime() + MCP_OAUTH_REFRESH_IDLE_MS));
    await tx.insert(verification).values({ id, identifier: grantIdentifierPrefix(input) + uuid, value: JSON.stringify(grant), expiresAt, createdAt: now, updatedAt: now });
    return tokenPair(id, grant, expiresAt);
  });
}

export async function refreshOAuthTokenPair(input: { token: string; clientId: string; resource: string; scope?: string }) {
  const credential = readRefreshToken(input.token);
  if (!credential) throw new Error("invalid_grant");
  const initial = await readGrant(credential.id);
  if (!initial || initial.grant.clientId !== input.clientId || initial.grant.resource !== input.resource) throw new Error("invalid_grant");
  const pair = await db.transaction(async tx => {
    await assertAuthoringActor(tx, initial.grant.userId, { roles: ["admin"], lock: true, error: "invalid_grant" });
    const consent = await readConsent(binding(initial.grant), tx, true);
    const current = await readGrant(credential.id, tx, "update");
    if (!consent || !current || current.grant.clientId !== input.clientId || current.grant.resource !== input.resource
      || !current.grant.scope.every(scope => consent.scopes.includes(scope))) return null;
    const { grant, expiresAt } = current;
    const now = Date.now();
    // A valid older credential is evidence of reuse. Revoke its family, including access tokens.
    if (credential.sequence < grant.sequence && !(credential.sequence === grant.sequence - 1 && now - grant.rotatedAt <= REFRESH_RETRY_MS)) {
      await tx.delete(verification).where(eq(verification.id, credential.id));
      return null;
    }
    if (credential.sequence > grant.sequence) return null;
    const requested = input.scope === undefined ? grant.scope : [...new Set(input.scope.trim().split(/\s+/).filter(Boolean))];
    if (requested.length === 0 || !requested.every(scope => grant.scope.includes(scope))) throw new Error("invalid_scope");
    if (credential.sequence === grant.sequence - 1) {
      if (requested.length !== grant.scope.length) throw new Error("invalid_scope");
      return tokenPair(credential.id, grant, expiresAt);
    }
    const next = { ...grant, scope: requested, sequence: grant.sequence + 1, rotatedAt: now };
    const nextExpiry = new Date(Math.min(next.absoluteExpiry, consent.expiresAt.getTime(), now + MCP_OAUTH_REFRESH_IDLE_MS));
    await tx.update(verification).set({ value: JSON.stringify(next), expiresAt: nextExpiry, updatedAt: new Date(now) }).where(eq(verification.id, credential.id));
    return tokenPair(credential.id, next, nextExpiry);
  });
  if (!pair) throw new Error("invalid_grant");
  return pair;
}

/** RFC 7009: either credential revokes its family, not other clients' connections. */
export async function revokeOAuthToken(token: string, clientId: string): Promise<void> {
  const credential = readRefreshToken(token);
  let id = credential?.id;
  if (!id) {
    try {
      const access = readMcpConnectionToken(token);
      if (access.clientId === clientId && access.resource === resourceUrl() && isMcpOAuthGrantSessionId(access.sessionId)) id = access.sessionId;
    } catch (error) {
      if (error instanceof Error && ["AUTHORING_MCP_TOKEN_INVALID", "AUTHORING_MCP_TOKEN_EXPIRED"].includes(error.message)) return;
      throw error;
    }
  }
  if (!id) return;
  const row = await readGrant(id);
  if (row?.grant.clientId === clientId && row.grant.resource === resourceUrl()) {
    await db.delete(verification).where(eq(verification.id, id));
  }
}

export async function listOAuthConnections(userId: string) {
  const rows = await db.select({ id: verification.id, value: verification.value, expiresAt: verification.expiresAt })
    .from(verification).where(and(like(verification.identifier, GRANT_PREFIX + hash(userId) + ":%"), gt(verification.expiresAt, new Date())));
  const connections = new Map<string, { id: string; name: string; scopes: string[]; expiresAt: Date }>();
  for (const row of rows) {
    const grant = parseGrant(row.value);
    if (grant.userId !== userId || grant.resource !== resourceUrl() || grant.absoluteExpiry <= Date.now()) continue;
    const consent = await readConsent(binding(grant), db);
    if (!consent || !grant.scope.every(scope => consent.scopes.includes(scope))) continue;
    const key = consentId(binding(grant));
    const existing = connections.get(key);
    if (existing) {
      existing.scopes = [...new Set([...existing.scopes, ...grant.scope])];
      if (row.expiresAt > existing.expiresAt) {
        existing.id = row.id;
        existing.expiresAt = row.expiresAt;
      }
      continue;
    }
    let name = "MCP client";
    try { name = readClientRegistration(grant.clientId).clientName; } catch { /* Expired registration can still be revoked. */ }
    connections.set(key, { id: row.id, name, scopes: grant.scope, expiresAt: row.expiresAt });
  }
  return [...connections.values()];
}

export async function revokeOAuthConnection(userId: string, id: string): Promise<void> {
  if (!isMcpOAuthGrantSessionId(id)) return;
  const row = await readGrant(id);
  if (row?.grant.userId === userId && row.grant.resource === resourceUrl()) {
    const consent = binding(row.grant);
    // Delete consent first so a provider cannot silently reauthorize after user revocation.
    await db.transaction(async tx => {
      await tx.delete(verification).where(eq(verification.id, consentId(consent)));
      await tx.delete(verification).where(like(verification.identifier, grantIdentifierPrefix(consent) + "%"));
    });
  }
}
