"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { resolveMcpAdmin } from "@/lib/authoring/mcp-auth";
import {
  readClientRegistration,
  requestedScopes,
  resourceUrl,
  storeAuthorizationCode,
} from "@/lib/authoring/mcp-oauth";

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function submitMcpAuthorization(formData: FormData) {
  const decision = formData.get("decision")?.toString();
  const clientId = formData.get("client_id")?.toString() ?? "";
  const redirectUri = formData.get("redirect_uri")?.toString() ?? "";
  const state = formData.get("state")?.toString() || undefined;
  const scopeRaw = formData.get("scope")?.toString() ?? "";
  const codeChallenge = formData.get("code_challenge")?.toString() ?? "";
  const codeChallengeMethod = formData.get("code_challenge_method")?.toString() ?? "";
  const requestedResource = formData.get("resource")?.toString() || undefined;

  // Rejection by user
  if (decision === "deny") {
    const target = new URL(redirectUri);
    target.searchParams.set("error", "access_denied");
    if (state) target.searchParams.set("state", state);
    redirect(target.toString());
  }

  // Request validation
  if (codeChallengeMethod !== "S256" || !codeChallenge) {
    const target = new URL(redirectUri);
    target.searchParams.set("error", "invalid_request");
    if (state) target.searchParams.set("state", state);
    redirect(target.toString());
  }

  let client;
  try {
    client = readClientRegistration(clientId);
  } catch {
    const target = new URL(redirectUri);
    target.searchParams.set("error", "invalid_client");
    if (state) target.searchParams.set("state", state);
    redirect(target.toString());
  }

  if (!client.redirectUris.includes(redirectUri)) {
    throw new Error("Invalid redirect URI");
  }

  const reqHeaders = await headers();
  const host = reqHeaders.get("host") || "localhost:3000";
  const proto = reqHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const expectedResource = resourceUrl(origin);

  if (requestedResource && requestedResource !== expectedResource) {
    const target = new URL(redirectUri);
    target.searchParams.set("error", "invalid_target");
    if (state) target.searchParams.set("state", state);
    redirect(target.toString());
  }

  let scopes: string[];
  try {
    scopes = requestedScopes(scopeRaw);
  } catch {
    const target = new URL(redirectUri);
    target.searchParams.set("error", "invalid_scope");
    if (state) target.searchParams.set("state", state);
    redirect(target.toString());
  }

  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session?.user) {
    const target = new URL(redirectUri);
    target.searchParams.set("error", "login_required");
    if (state) target.searchParams.set("state", state);
    redirect(target.toString());
  }

  let targetUrl: string;
  try {
    const principal = await resolveMcpAdmin({
      userId: session.user.id,
      sessionId: session.session.id,
      scopes,
      authMethod: "session",
    });

    const code = await storeAuthorizationCode({
      clientId,
      redirectUri,
      userId: principal.userId,
      sessionId: principal.sessionId,
      codeChallenge,
      scope: principal.scopes.filter((item) => scopes.includes(item)),
      resource: expectedResource,
    });

    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    if (state) target.searchParams.set("state", state);
    targetUrl = target.toString();
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const isDenied = error instanceof Error && error.message === "AUTHORING_MCP_ADMIN_REQUIRED";
    const target = new URL(redirectUri);
    target.searchParams.set("error", isDenied ? "access_denied" : "server_error");
    if (state) target.searchParams.set("state", state);
    targetUrl = target.toString();
  }

  redirect(targetUrl);
}
