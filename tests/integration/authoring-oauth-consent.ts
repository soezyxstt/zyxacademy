// Run in its own Bun process so the request/session mocks never reach other tests.
import { expect, mock } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { NextRequest } from "next/server";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import * as schema from "@/db/schema";

const directory = await mkdtemp(join(tmpdir(), "zyx-oauth-"));
const sqlite = createClient({ url: `file:${join(directory, "test.db")}` });
const db = drizzle(sqlite, { schema });
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
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  mock.module("@/db", () => ({ db }));
  mock.module("@/lib/db", () => ({ db }));
  mock.module("next/headers", () => ({
    headers: async () => new Headers(proxyHeaders), cookies: async () => new Map(),
  }));
  mock.module("@/lib/auth", () => ({
    auth: { api: { getSession: async () => signedIn ? { user: { id: userId }, session: { id: sessionId, expiresAt } } : null } },
  }));

  const { user, session, pengguna, peran, penggunaPeran, verification } = schema;
  await (await pushSQLiteSchema({ user, session, pengguna, peran, penggunaPeran, verification }, db)).apply();
  await db.insert(peran).values({ id: "admin", code: "admin" });
  for (const id of ["ada", "ben", "student"]) {
    await db.insert(user).values({ id, name: id, email: `${id}@example.test` });
    await db.insert(pengguna).values({ id });
    if (id !== "student") await db.insert(penggunaPeran).values({ id, penggunaId: id, peranId: "admin", source: "seed" });
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
  const { issueClientRegistration } = await import("@/lib/authoring/mcp-oauth");
  const { issueMcpConnectionToken, readMcpConnectionToken } = await import("@/lib/authoring/mcp-workflows");
  const { principalFromConnectionToken } = await import("@/lib/authoring/mcp-auth");
  const clientId = issueClientRegistration({ clientName: "First", redirectUris: [callback] });
  const otherClient = issueClientRegistration({ clientName: "Second", redirectUris: [callback] });
  const params = { client_id: clientId, redirect_uri: callback, resource, scope: read, state: "opaque",
    response_type: "code", code_challenge_method: "S256", code_challenge: challenge };

  async function silent(overrides: Record<string, string> = {}) {
    const query = new URLSearchParams({ ...params, prompt: "none", ...overrides });
    const response = await authorize(new NextRequest(`${internalOrigin}/api/mcp/oauth/authorize?${query}`, { headers: proxyHeaders }));
    const target = new URL(response.headers.get("location")!);
    expect(target.origin + target.pathname).toBe(callback);
    expect(target.searchParams.get("state")).toBe(params.state);
    return target.searchParams;
  }
  function consent(decision: string, selected: string[], overrides: Record<string, string> = {}) {
    const data = new FormData();
    for (const [key, value] of Object.entries({ ...params, ...overrides })) data.set(key, value);
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

  const metadata = await (await discover(new Request(`${internalOrigin}/.well-known/oauth-authorization-server`, { headers: proxyHeaders }))).json();
  expect(metadata).toMatchObject({
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/authorize`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`,
    token_endpoint: `${origin}/api/mcp/oauth/token`,
  });
  const metadataPath = "/.well-known/oauth-protected-resource";
  const rootResource = await discoverResource(new Request(internalOrigin + metadataPath, { headers: proxyHeaders }));
  const authoringResource = await discoverAuthoringResource(new Request(internalOrigin + metadataPath + "/api/mcp/authoring", { headers: proxyHeaders }));
  for (const response of [rootResource, authoringResource]) {
    expect(await response.json()).toMatchObject({ resource, authorization_servers: [origin] });
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
  expect(unauthenticated.headers.get("www-authenticate")).toContain(`resource_metadata="${origin}${metadataPath}/api/mcp/authoring"`);
  const silentQuery = { ...params, prompt: "none" };
  const forwarded = await redirectOf(consentPage({ searchParams: Promise.resolve(silentQuery) }));
  expect(forwarded.pathname).toBe("/api/mcp/oauth/authorize");
  expect(Object.fromEntries(forwarded.searchParams)).toEqual(silentQuery);
  expect((await silent()).get("error")).toBe("login_required");
  signedIn = true;
  expect((await silent()).get("error")).toBe("consent_required");
  expect((await consent("deny", [read])).searchParams.get("error")).toBe("access_denied");
  expect((await consent("", [read])).searchParams.get("error")).toBe("invalid_request");
  await expect(consent("deny", [], { redirect_uri: "https://unregistered.example" })).rejects.toThrow("Invalid redirect URI");
  expect(await db.select().from(verification)).toHaveLength(0);

  const binding = { userId, sessionId, clientId, resource, scopes: [read] };
  const oldBearer = issueMcpConnectionToken(binding);
  await expect(principalFromConnectionToken(oldBearer, resource)).rejects.toThrow("AUTHORING_MCP_CONSENT_REQUIRED");
  const connection = await issueManualToken(new NextRequest(`${internalOrigin}/api/mcp/authoring/connection`, { method: "POST", headers: proxyHeaders }));
  const { endpoint, access_token: manual } = await connection.json();
  expect(endpoint).toBe(resource);
  expect(readMcpConnectionToken(manual).resource).toBe(resource);
  expect(await (await callAuthoring(manual)).json()).toEqual({ error: "INVALID_SKILLS_PROFILE" });
  const internalToken = issueMcpConnectionToken({ ...binding, clientId: "zyx-admin-connection", resource: `${internalOrigin}/api/mcp/authoring` });
  const rejectedAudience = await callAuthoring(internalToken);
  expect(rejectedAudience.status).toBe(401);
  expect(await rejectedAudience.json()).toEqual({ error: "AUTHORING_MCP_INVALID_RESOURCE" });
  expect((await principalFromConnectionToken(manual, resource)).userId).toBe(userId);
  await expect(principalFromConnectionToken(manual, `${resource}-other`)).rejects.toThrow("AUTHORING_MCP_INVALID_RESOURCE");

  const interactive = await consent("approve", [read, stage]);
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
  try {
    expect((await silent({ resource: otherResource })).get("error")).toBe("consent_required");
  } finally {
    process.env.BETTER_AUTH_URL = origin;
  }
  userId = "ben"; sessionId = "ben-session";
  expect((await silent()).get("error")).toBe("consent_required");
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

  await consent("approve", [read]);
  await db.delete(session).where(eq(session.id, sessionId));
  expect((await silent()).get("error")).toBe("login_required");
  await expect(principalFromConnectionToken(manual, resource)).rejects.toThrow("AUTHORING_MCP_SESSION_INVALID");
} finally {
  sqlite.close();
  await rm(directory, { recursive: true, force: true });
}
