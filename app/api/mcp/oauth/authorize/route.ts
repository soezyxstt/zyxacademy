import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveMcpAdmin } from "@/lib/authoring/mcp-auth";
import {
  publicMcpOrigin,
  readClientRegistration,
  requestedScopes,
  resourceUrl,
  storeAuthorizationCode,
} from "@/lib/authoring/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(request: NextRequest, error: string, state?: string, redirectUri?: string) {
  if (redirectUri) {
    const target = new URL(redirectUri);
    target.searchParams.set("error", error);
    if (state) target.searchParams.set("state", state);
    return NextResponse.redirect(target);
  }
  return NextResponse.json({ error }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state") ?? undefined;
  const responseType = params.get("response_type");
  const codeChallenge = params.get("code_challenge") ?? "";
  const codeChallengeMethod = params.get("code_challenge_method");
  const requestedResource = params.get("resource");
  const prompt = params.get("prompt");

  if (responseType !== "code" || codeChallengeMethod !== "S256" || !codeChallenge) {
    return errorResponse(request, "invalid_request", state, undefined);
  }

  let client;
  try {
    client = readClientRegistration(clientId);
  } catch {
    return errorResponse(request, "invalid_client", state, undefined);
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return errorResponse(request, "invalid_request", state, undefined);
  }

  const expectedResource = resourceUrl();
  if (requestedResource && requestedResource !== expectedResource) {
    return errorResponse(request, "invalid_target", state, redirectUri);
  }

  let scope: string[];
  try {
    scope = requestedScopes(params.get("scope"));
  } catch {
    return errorResponse(request, "invalid_scope", state, redirectUri);
  }

  // Silent approval path when prompt=none is requested
  if (prompt === "none") {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return errorResponse(request, "login_required", state, redirectUri);
    }

    try {
      const principal = await resolveMcpAdmin({
        userId: session.user.id,
        sessionId: session.session.id,
        scopes: scope,
        authMethod: "session",
      });
      const code = await storeAuthorizationCode({
        clientId,
        redirectUri,
        userId: principal.userId,
        sessionId: principal.sessionId,
        codeChallenge,
        scope: principal.scopes.filter((item) => scope.includes(item)),
        resource: expectedResource,
      });
      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      if (state) target.searchParams.set("state", state);
      return NextResponse.redirect(target);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "consent_required") return errorResponse(request, "consent_required", state, redirectUri);
        if (error.message === "AUTHORING_MCP_SESSION_INVALID") return errorResponse(request, "login_required", state, redirectUri);
        if (error.message === "AUTHORING_MCP_ADMIN_REQUIRED") return errorResponse(request, "access_denied", state, redirectUri);
      }
      return errorResponse(request, "server_error", state, redirectUri);
    }
  }

  // Standard interactive user-agent consent flow
  const authUrl = new URL("/mcp/authorize", publicMcpOrigin());
  authUrl.search = request.nextUrl.search;
  return NextResponse.redirect(authUrl);
}
