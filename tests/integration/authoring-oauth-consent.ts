// Run in its own Bun process so the request/session mocks never reach other tests.
import { expect, mock } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import * as schema from "@/db/schema";
import { PERAN_IDS } from "@/lib/auth/peran";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb: db } = await createPostgresTestDb();
const origin = "https://issuer.example";
const internalOrigin = "https://0.0.0.0:8080";
const proxyHeaders = { host: "0.0.0.0:8080", "x-forwarded-host": "untrusted.example", "x-forwarded-proto": "http" };
const callback = "https://client.example/callback";
const resource = `${origin}/api/mcp/authoring`;
const read = "authoring:read";
const stage = "authoring:stage";
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const expiresAt = new Date(Date.now() + 3_600_000);
let userId = "ada";
let sessionId = "ada-session";
let signedIn = false;

async function redirectOf(action: Promise<unknown>): Promise<URL> {
  try {
    await action;
  } catch (error) {
    if (isRedirectError(error)) return new URL(getURLFromRedirectError(error), origin);
    throw error;
  }
  throw new Error("Expected a redirect");
}

try {
  process.env.SKIP_ENV_VALIDATION = "1";
  process.env.BETTER_AUTH_URL = origin;
  process.env.NEXT_PUBLIC_APP_URL = origin;
  process.env.ZYX_MCP_ENVIRONMENT = "staging";
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  mock.module("@/db", () => ({ db }));
  mock.module("@/lib/db", () => ({ db }));
  // This integration renders an RSC page outside the Next.js module loader.
  mock.module("server-only", () => ({}));
  mock.module("next/headers", () => ({
    headers: async () => new Headers(proxyHeaders), cookies: async () => new Map(),
  }));
  mock.module("@/lib/auth", () => ({
    auth: { api: { getSession: async () => signedIn ? { user: { id: userId }, session: { id: sessionId, expiresAt } } : null } },
  }));

  const { user, session, pengguna, peran, penggunaPeran, verification } = schema;
  await db.insert(peran).values({ id: PERAN_IDS.admin, code: "admin" });
  for (const id of ["ada", "ben", "student"]) {
    await db.insert(user).values({ id, name: id, email: `${id}@example.test` });
    await db.insert(pengguna).values({ id });
    if (id !== "student") await db.insert(penggunaPeran).values({ id, penggunaId: id, peranId: PERAN_IDS.admin, source: "seed" });
    await db.insert(session).values({ id: `${id}-session`, userId: id, token: id, expiresAt });
  }
  await db.insert(session).values({ id: "second-session", userId: "ada", token: "other", expiresAt });

  const { GET: discover } = await import("@/app/.well-known/oauth-authorization-server/route");
  const { GET: discoverResource } = await import("@/app/.well-known/oauth-protected-resource/route");
  const { GET: discoverAuthoringResource } = await import("@/app/.well-known/oauth-protected-resource/api/mcp/authoring/route");
  const { POST: handleAuthoring } = await import("@/app/api/mcp/authoring/route");
  const { POST: issueManualToken } = await import("@/app/api/mcp/authoring/connection/route");
  const { default: consentPage } = await import("@/app/mcp/authorize/page");
  const { GET: authorize } = await import("@/app/api/mcp/oauth/authorize/route");
  const { POST: exchange } = await import("@/app/api/mcp/oauth/token/route");
  const { submitMcpAuthorization } = await import("@/app/mcp/authorize/actions");
  const { issueClientRegistration, MCP_OAUTH_INITIAL_SCOPES, listOAuthConnections, revokeOAuthConnection } = await import("@/lib/authoring/mcp-oauth");
  const { issueMcpConnectionToken, readMcpConnectionToken, MCP_AUTHORING_DEFAULT_SCOPES, MCP_AUTHORING_SCOPES } = await import("@/lib/authoring/mcp-workflows");
  const { principalFromConnectionToken } = await import("@/lib/authoring/mcp-auth");
  const { POST: revoke } = await import("@/app/api/mcp/oauth/revoke/route");
  const { assertAdminMutationAuthority } = await import("@/lib/admin-mcp/mutations");
  // Use the application database type; its module is mocked to the PGlite fixture above.
  const { db: applicationDb } = await import("@/lib/db");
  const clientId = issueClientRegistration({ clientName: "First", redirectUris: [callback] });
  const otherClient = issueClientRegistration({ clientName: "Second", redirectUris: [callback] });
  const params = { client_id: clientId, redirect_uri: callback, resource, scope: read, state: "opaque",
    response_type: "code", code_challenge_method: "S256", code_challenge: challenge };

  async function silent(overrides: Record<string, string | null> = {}) {
    const query = new URLSearchParams({ ...params, prompt: "none" });
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    const response = await authorize(new NextRequest(`${internalOrigin}/api/mcp/oauth/authorize?${query}`, { headers: proxyHeaders }));
    const target = new URL(response.headers.get("location")!);
    expect(target.origin + target.pathname).toBe(callback);
    expect(target.searchParams.get("state")).toBe(params.state);
    return target.searchParams;
  }
  function consent(decision: string, selected: string[], overrides: Record<string, string> = {}) {
    const data = new FormData();
    for (const [key, value] of Object.entries({ ...params, expected_user_id: userId, expected_session_id: sessionId, ...overrides })) data.set(key, value);
    if (decision) data.set("decision", decision);
    for (const scope of selected) data.append("selected_scope", scope);
    return redirectOf(submitMcpAuthorization(data));
  }
  async function redeem(code: string) {
    const response = await exchange(new NextRequest(`${internalOrigin}/api/mcp/oauth/token`, {
      method: "POST", headers: { ...proxyHeaders, "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", client_id: clientId, redirect_uri: callback,
        code, code_verifier: verifier }),
    }));
    return response.json();
  }

  async function refresh(token: string, overrides: Record<string, string> = {}) {
    const response = await exchange(new NextRequest(`${internalOrigin}/api/mcp/oauth/token`, {
      method: "POST", headers: { ...proxyHeaders, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: token, ...overrides }),
    }));
    expect(response.headers.get("cache-control")).toBe("no-store");
    return response.json();
  }

  const metadata = await (await discover(new Request(`${internalOrigin}/.well-known/oauth-authorization-server`, { headers: proxyHeaders }))).json();
  expect(metadata).toMatchObject({
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/authorize`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`,
    token_endpoint: `${origin}/api/mcp/oauth/token`,
    scopes_supported: [...MCP_OAUTH_INITIAL_SCOPES],
    grant_types_supported: ["authorization_code", "refresh_token"],
    revocation_endpoint: `${origin}/api/mcp/oauth/revoke`,
  });
  const metadataPath = "/.well-known/oauth-protected-resource";
  const rootResource = await discoverResource(new Request(internalOrigin + metadataPath, { headers: proxyHeaders }));
  const authoringResource = await discoverAuthoringResource(new Request(internalOrigin + metadataPath + "/api/mcp/authoring", { headers: proxyHeaders }));
  for (const response of [rootResource, authoringResource]) {
    expect(await response.json()).toMatchObject({ resource, authorization_servers: [origin], scopes_supported: [...MCP_OAUTH_INITIAL_SCOPES] });
  }
  const showConsent = await authorize(new NextRequest(`${internalOrigin}/api/mcp/oauth/authorize?${new URLSearchParams(params)}`, { headers: proxyHeaders }));
  expect(new URL(showConsent.headers.get("location")!).origin).toBe(origin);
  function callAuthoring(token?: string) {
    const headers = new Headers(proxyHeaders);
    if (token) headers.set("authorization", `Bearer ${token}`);
    // An invalid profile stops an authenticated request before MCP transport setup.
    return handleAuthoring(new NextRequest(`${internalOrigin}/api/mcp/authoring?skills=invalid`, { method: "POST", headers }));
  }
  const unauthenticated = await callAuthoring();
  expect(unauthenticated.status).toBe(401);
  const authenticateHeader = unauthenticated.headers.get("www-authenticate")!;
  expect(authenticateHeader).toContain(`resource_metadata="${origin}${metadataPath}/api/mcp/authoring"`);
  const initialScope = authenticateHeader.match(/,\s*scope="([^"]+)"/)?.[1];
  expect(initialScope?.split(" ")).toEqual([...MCP_OAUTH_INITIAL_SCOPES]);
  const silentQuery = { ...params, prompt: "none" };
  const forwarded = await redirectOf(consentPage({ searchParams: Promise.resolve(silentQuery) }));
  expect(forwarded.pathname).toBe("/api/mcp/oauth/authorize");
  expect(Object.fromEntries(forwarded.searchParams)).toEqual(silentQuery);
  expect((await silent()).get("error")).toBe("login_required");
  signedIn = true;
  const initialPage = await consentPage({ searchParams: Promise.resolve({ ...params, scope: undefined }) });
  expect(initialPage.props.scopes).toEqual([...MCP_OAUTH_INITIAL_SCOPES]);
  expect(initialPage.props.scopes).toHaveLength(46);
  expect(initialPage.props.defaultScopes).toEqual([...MCP_AUTHORING_DEFAULT_SCOPES]);
  expect(initialPage.props.searchParams.scope).toBe(initialScope);
  const challengePage = await consentPage({ searchParams: Promise.resolve({ ...params, scope: initialScope }) });
  expect(challengePage.props.scopes).toEqual(initialPage.props.scopes);
  expect(challengePage.props.defaultScopes).toEqual(initialPage.props.defaultScopes);
  const narrowPage = await consentPage({ searchParams: Promise.resolve(params) });
  expect(narrowPage.props.scopes).toEqual([read]);
  expect(narrowPage.props.defaultScopes).toEqual([read]);
  expect(narrowPage.props.searchParams.scope).toBe(read);
  expect((await silent()).get("error")).toBe("consent_required");
  expect((await consent("deny", [read])).searchParams.get("error")).toBe("access_denied");
  expect((await consent("", [read])).searchParams.get("error")).toBe("invalid_request");
  await expect(consent("deny", [], { redirect_uri: "https://unregistered.example" })).rejects.toThrow("Invalid redirect URI");
  expect(await db.select().from(verification)).toHaveLength(0);

  // An old approval form must not silently grant access to the newly active account.
  expect((await consent("approve", [read], { expected_user_id: "", expected_session_id: "" })).searchParams.get("error")).toBe("login_required");
  userId = "ben"; sessionId = "ben-session";
  const staleAccount = await consent("approve", [read], { expected_user_id: "ada", expected_session_id: "ada-session" });
  expect(staleAccount.searchParams.get("error")).toBe("login_required");
  expect(staleAccount.searchParams.get("state")).toBe(params.state);
  userId = "ada"; sessionId = "second-session";
  expect((await consent("approve", [read], { expected_session_id: "ada-session" })).searchParams.get("error")).toBe("login_required");
  expect(await db.select().from(verification)).toHaveLength(0);
  sessionId = "ada-session";

  const binding = { userId, sessionId, clientId, resource, scopes: [read] };
  const oldBearer = issueMcpConnectionToken(binding);
  await expect(principalFromConnectionToken(oldBearer, resource)).rejects.toThrow("AUTHORING_MCP_CONSENT_REQUIRED");
  const connection = await issueManualToken(new NextRequest(`${internalOrigin}/api/mcp/authoring/connection`, { method: "POST", headers: proxyHeaders }));
  const { endpoint, access_token: manual } = await connection.json();
  expect(endpoint).toBe(resource);
  expect(readMcpConnectionToken(manual).resource).toBe(resource);
  expect(readMcpConnectionToken(manual).scopes).toEqual([...MCP_AUTHORING_SCOPES]);
  expect(readMcpConnectionToken(manual).scopes).not.toContain("forms:read");
  expect(await (await callAuthoring(manual)).json()).toEqual({ error: "INVALID_SKILLS_PROFILE" });
  const internalToken = issueMcpConnectionToken({ ...binding, clientId: "zyx-admin-connection", resource: `${internalOrigin}/api/mcp/authoring` });
  const rejectedAudience = await callAuthoring(internalToken);
  expect(rejectedAudience.status).toBe(401);
  expect(await rejectedAudience.json()).toEqual({ error: "AUTHORING_MCP_INVALID_RESOURCE" });
  expect((await principalFromConnectionToken(manual, resource)).userId).toBe(userId);
  await expect(principalFromConnectionToken(manual, `${resource}-other`)).rejects.toThrow("AUTHORING_MCP_INVALID_RESOURCE");

  expect((await consent("approve", [read, stage])).searchParams.get("error")).toBe("invalid_scope");
  const initialApproval = await consent("approve", [...MCP_AUTHORING_DEFAULT_SCOPES], { scope: initialScope! });
  const initialToken = await redeem(initialApproval.searchParams.get("code")!);
  expect(readMcpConnectionToken(initialToken.access_token).scopes).toEqual([...MCP_AUTHORING_DEFAULT_SCOPES]);
  const initialGrant = await db.select().from(verification).where(like(verification.identifier, "mcp:oauth:consent:%"));
  // Discovery of more scopes cannot widen an existing grant without fresh consent.
  for (const scope of [null, "", initialScope!]) {
    expect((await silent({ scope })).get("error")).toBe("consent_required");
  }
  expect(await db.select().from(verification).where(like(verification.identifier, "mcp:oauth:consent:%"))).toEqual(initialGrant);
  expect((await principalFromConnectionToken(initialToken.access_token, resource)).scopes).toEqual([...MCP_AUTHORING_DEFAULT_SCOPES]);
  const adminApproval = await consent("approve", [read, "forms:read"], { scope: initialScope! });
  const adminToken = await redeem(adminApproval.searchParams.get("code")!);
  expect(readMcpConnectionToken(adminToken.access_token).scopes).toEqual([read, "forms:read"]);
  expect((await principalFromConnectionToken(adminToken.access_token, resource)).scopes).toEqual([read, "forms:read"]);
  const interactive = await consent("approve", [read, stage], { scope: `${read} ${stage}` });
  const interactiveToken = await redeem(interactive.searchParams.get("code")!);
  expect(readMcpConnectionToken(interactiveToken.access_token).scopes).toEqual([read, stage]);
  expect(await (await callAuthoring(interactiveToken.access_token)).json()).toEqual({ error: "INVALID_SKILLS_PROFILE" });
  const subsetCode = (await silent()).get("code")!;
  const subset = await redeem(subsetCode);
  expect(readMcpConnectionToken(subset.access_token).scopes).toEqual([read]);
  expect((await redeem(subsetCode)).error).toBe("invalid_grant");

  expect((await silent({ scope: "authoring:withdraw" })).get("error")).toBe("consent_required");
  expect((await silent({ client_id: otherClient })).get("error")).toBe("consent_required");
  const otherResource = "https://other.example/api/mcp/authoring";
  expect((await silent({ resource: otherResource })).get("error")).toBe("invalid_target");
  process.env.BETTER_AUTH_URL = "https://other.example";
  process.env.NEXT_PUBLIC_APP_URL = process.env.BETTER_AUTH_URL;
  try {
    expect((await silent({ resource: otherResource })).get("error")).toBe("consent_required");
  } finally {
    process.env.BETTER_AUTH_URL = origin;
    process.env.NEXT_PUBLIC_APP_URL = origin;
  }
  userId = "ben"; sessionId = "ben-session";
  expect((await silent()).get("error")).toBe("consent_required");
  // Switching the browser account never retargets an existing MCP bearer token.
  expect(await principalFromConnectionToken(subset.access_token, resource)).toMatchObject({ userId: "ada", sessionId: readMcpConnectionToken(subset.access_token).sessionId });
  userId = "student"; sessionId = "student-session";
  expect((await silent()).get("error")).toBe("access_denied");
  userId = "ada"; sessionId = "second-session";
  expect((await silent()).get("error")).toBe("consent_required");
  sessionId = "ada-session";

  const outstanding = (await silent({ scope: stage })).get("code")!;
  await consent("approve", [read]);
  expect((await silent({ scope: stage })).get("error")).toBe("consent_required");
  expect((await redeem(outstanding)).error).toBe("invalid_grant");
  await expect(principalFromConnectionToken(interactiveToken.access_token, resource)).rejects.toThrow("AUTHORING_MCP_CONSENT_REQUIRED");
  expect((await principalFromConnectionToken(subset.access_token, resource)).userId).toBe(userId);

  await db.update(verification).set({ expiresAt: new Date(0) }).where(like(verification.identifier, "mcp:oauth:consent:%"));
  expect((await silent()).get("error")).toBe("consent_required");
  await consent("approve", [read]);
  await db.delete(verification).where(like(verification.identifier, "mcp:oauth:consent:%"));
  expect((await silent()).get("error")).toBe("consent_required");
  await expect(principalFromConnectionToken(subset.access_token, resource)).rejects.toThrow("AUTHORING_MCP_CONSENT_REQUIRED");

  // User-controlled disconnect must revoke consent, and must not affect another user.
  const disconnectApproval = await consent("approve", [read]);
  const disconnected = await redeem(disconnectApproval.searchParams.get("code")!);
  const disconnectId = readMcpConnectionToken(disconnected.access_token).sessionId;
  expect((await listOAuthConnections("ada")).map(item => item.id)).toContain(disconnectId);
  expect(await listOAuthConnections("ben")).toEqual([]);
  await revokeOAuthConnection("ben", disconnectId);
  expect((await principalFromConnectionToken(disconnected.access_token, resource)).userId).toBe("ada");
  await revokeOAuthConnection("ada", disconnectId);
  expect((await silent()).get("error")).toBe("consent_required");
  expect((await refresh(disconnected.refresh_token)).error).toBe("invalid_grant");

  const durableApproval = await consent("approve", [read]);
  const durable = await redeem(durableApproval.searchParams.get("code")!);
  // Independent families must survive revocation of another provider credential.
  const replayFamily = await redeem((await silent()).get("code")!);
  const replayGrantId = readMcpConnectionToken(replayFamily.access_token).sessionId;
  const expiredFamily = await redeem((await silent()).get("code")!);
  const expiredGrantId = readMcpConnectionToken(expiredFamily.access_token).sessionId;
  await db.update(verification).set({ expiresAt: new Date(0) }).where(eq(verification.id, expiredGrantId));
  expect((await refresh(expiredFamily.refresh_token)).error).toBe("invalid_grant");
  await expect(principalFromConnectionToken(expiredFamily.access_token, resource)).rejects.toThrow("AUTHORING_MCP_CONSENT_REQUIRED");
  expect(durable.expires_in).toBeGreaterThan(0);
  expect(durable.expires_in).toBeLessThanOrEqual(3600);
  expect(typeof durable.refresh_token).toBe("string");
  const grantId = readMcpConnectionToken(durable.access_token).sessionId;
  expect(grantId).not.toBe(sessionId);
  expect((await refresh(durable.refresh_token, { client_id: otherClient })).error).toBe("invalid_grant");
  expect((await refresh(durable.refresh_token, { resource: otherResource })).error).toBe("invalid_target");
  expect((await refresh(durable.refresh_token, { scope: `${read} ${stage}` })).error).toBe("invalid_scope");
  await db.delete(session).where(eq(session.id, sessionId));
  expect((await silent()).get("error")).toBe("login_required");
  await expect(principalFromConnectionToken(manual, resource)).rejects.toThrow("AUTHORING_MCP_SESSION_INVALID");
  const durablePrincipal = await principalFromConnectionToken(durable.access_token, resource);
  expect(durablePrincipal.userId).toBe(userId);
  await applicationDb.transaction(tx => assertAdminMutationAuthority(tx, durablePrincipal, "admin.operation_receipt", null));
  const replayed = await refresh(replayFamily.refresh_token);
  const [replayGrant] = await db.select({ value: verification.value }).from(verification).where(eq(verification.id, replayGrantId));
  const replayData = JSON.parse(replayGrant.value);
  await db.update(verification).set({ value: JSON.stringify({ ...replayData, rotatedAt: Date.now() - 20_000 }) }).where(eq(verification.id, replayGrantId));
  expect((await refresh(replayFamily.refresh_token)).error).toBe("invalid_grant");
  expect((await refresh(replayed.refresh_token)).error).toBe("invalid_grant");
  await expect(principalFromConnectionToken(replayed.access_token, resource)).rejects.toThrow("AUTHORING_MCP_CONSENT_REQUIRED");

  const [rotated, parallel] = await Promise.all([refresh(durable.refresh_token), refresh(durable.refresh_token)]);
  expect(parallel.refresh_token).toBe(rotated.refresh_token);
  expect(rotated.refresh_token).not.toBe(durable.refresh_token);
  expect(readMcpConnectionToken(rotated.access_token).sessionId).toBe(grantId);
  const retried = await refresh(durable.refresh_token);
  expect(retried.refresh_token).toBe(rotated.refresh_token);
  expect((await principalFromConnectionToken(rotated.access_token, resource)).scopes).toEqual([read]);
  await db.update(pengguna).set({ status: "suspended" }).where(eq(pengguna.id, userId));
  expect((await refresh(rotated.refresh_token)).error).toBe("invalid_grant");
  await expect(principalFromConnectionToken(rotated.access_token, resource)).rejects.toThrow("AUTHORING_MCP_ADMIN_REQUIRED");
  await db.update(pengguna).set({ status: "active" }).where(eq(pengguna.id, userId));
  const response = await revoke(new NextRequest(`${internalOrigin}/api/mcp/oauth/revoke`, {
    method: "POST", body: new URLSearchParams({ client_id: clientId, token: rotated.access_token }),
  }));
  expect(response.status).toBe(200);
  expect((await refresh(rotated.refresh_token)).error).toBe("invalid_grant");
  const revoked = await callAuthoring(rotated.access_token);
  expect(revoked.status).toBe(401);
  expect(revoked.headers.get("www-authenticate")).toContain('error="invalid_token"');
  await expect(applicationDb.transaction(tx => assertAdminMutationAuthority(tx, durablePrincipal, "admin.operation_receipt", null))).rejects.toThrow("OAUTH_CONSENT_REQUIRED");
} finally {
  await client.close();
}
