import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { consumeAuthorizationCode, createOAuthTokenPair, refreshOAuthTokenPair, readClientRegistration, resourceUrl } from "@/lib/authoring/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", Pragma: "no-cache" };
function tokenError(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status, headers });
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
  try { params = await readParameters(request); } catch { return tokenError("invalid_request"); }
  if (!params.client_id || !params.grant_type) return tokenError("invalid_request");
  if (params.grant_type !== "authorization_code" && params.grant_type !== "refresh_token") return tokenError("unsupported_grant_type");
  let client;
  try { client = readClientRegistration(params.client_id); } catch { return tokenError("invalid_client"); }
  const resource = resourceUrl();
  if (params.resource && params.resource !== resource) return tokenError("invalid_target");

  try {
    if (params.grant_type === "refresh_token") {
      if (!params.refresh_token) return tokenError("invalid_request");
      const pair = await refreshOAuthTokenPair({ token: params.refresh_token, clientId: params.client_id, resource, scope: params.scope });
      return NextResponse.json(pair, { headers });
    }
    if (!params.code || !params.code_verifier) return tokenError("invalid_grant");
    const authorization = await consumeAuthorizationCode(params.code);
    if (authorization.clientId !== params.client_id || !client.redirectUris.includes(authorization.redirectUri)
      || (params.redirect_uri && params.redirect_uri !== authorization.redirectUri)
      || !verifyPkce(params.code_verifier, authorization.codeChallenge)) return tokenError("invalid_grant");
    if (authorization.resource !== resource) return tokenError("invalid_target");
    return NextResponse.json(await createOAuthTokenPair(authorization), { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "AUTHORING_MCP_ADMIN_REQUIRED") return tokenError("access_denied");
    if (["invalid_grant", "invalid_scope", "invalid_target"].includes(code)) return tokenError(code);
    // A database or infrastructure outage is not evidence of a revoked credential.
    return tokenError("temporarily_unavailable", 503);
  }
}
