import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveMcpAdmin } from "@/lib/authoring/mcp-auth";
import {
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

  const expectedResource = resourceUrl(request.nextUrl.origin);
  if (requestedResource && requestedResource !== expectedResource) {
    return errorResponse(request, "invalid_target", state, redirectUri);
  }

  let scope: string[];
  try {
    scope = requestedScopes(params.get("scope"));
  } catch {
    return errorResponse(request, "invalid_scope", state, redirectUri);
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(next)}`, request.nextUrl.origin));
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
    const code = error instanceof Error && error.message === "AUTHORING_MCP_ADMIN_REQUIRED" ? "access_denied" : "server_error";
    return errorResponse(request, code, state, redirectUri);
  }
}
