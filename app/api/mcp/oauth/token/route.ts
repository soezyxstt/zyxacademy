import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveMcpAdmin } from "@/lib/authoring/mcp-auth";
import { consumeAuthorizationCode, issueAccessToken, readClientRegistration, resourceUrl } from "@/lib/authoring/mcp-oauth";
import { MCP_CONNECTION_TOKEN_TTL_SECONDS } from "@/lib/authoring/mcp-workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenError(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

async function readParameters(request: NextRequest): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json() as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, String(value ?? "")]));
  }
  const body = await request.formData();
  return Object.fromEntries([...body.entries()].map(([key, value]) => [key, String(value)]));
}

function verifyPkce(verifier: string, challenge: string): boolean {
  const actual = createHash("sha256").update(verifier, "utf8").digest("base64url");
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(challenge, "utf8");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export async function POST(request: NextRequest) {
  let params: Record<string, string>;
  try {
    params = await readParameters(request);
  } catch {
    return tokenError("invalid_request");
  }
  if (params.grant_type !== "authorization_code" || !params.code || !params.code_verifier || !params.client_id) {
    return tokenError("invalid_grant");
  }

  let client;
  try {
    client = readClientRegistration(params.client_id);
  } catch {
    return tokenError("invalid_client");
  }

  let authorization;
  try {
    authorization = await consumeAuthorizationCode(params.code);
  } catch {
    return tokenError("invalid_grant");
  }
  if (authorization.clientId !== params.client_id || !client.redirectUris.includes(authorization.redirectUri)) {
    return tokenError("invalid_grant");
  }
  if (params.redirect_uri && params.redirect_uri !== authorization.redirectUri) {
    return tokenError("invalid_grant");
  }
  if (!verifyPkce(params.code_verifier, authorization.codeChallenge)) {
    return tokenError("invalid_grant");
  }

  try {
    const principal = await resolveMcpAdmin({
      userId: authorization.userId,
      sessionId: authorization.sessionId,
      scopes: authorization.scope,
      authMethod: "oauth",
    });
    if (authorization.resource !== resourceUrl()) return tokenError("invalid_target");
    const accessToken = issueAccessToken(authorization);
    return NextResponse.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: MCP_CONNECTION_TOKEN_TTL_SECONDS,
      scope: principal.scopes.join(" "),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_grant";
    return tokenError(code === "AUTHORING_MCP_ADMIN_REQUIRED" ? "access_denied" : "invalid_grant", 400);
  }
}
