import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pageTitle } from "@/lib/site";
import { resolveMcpAdmin } from "@/lib/authoring/mcp-auth";
import {
  MCP_OAUTH_SCOPES,
  readClientRegistration,
  requestedScopes,
  resourceUrl,
} from "@/lib/authoring/mcp-oauth";
import { McpAuthorizeView } from "@/components/mcp/mcp-authorize-view";
import { McpAuthorizeError } from "@/components/mcp/mcp-authorize-error";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consent.authorize");
  return {
    title: pageTitle(t("metadataTitle")),
    description: t("metadataDescription"),
  };
}

type SearchParams = {
  client_id?: string;
  redirect_uri?: string;
  state?: string;
  response_type?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  resource?: string;
};

export default async function McpAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations("consent.authorize");
  const sp = await searchParams;
  const clientId = sp.client_id ?? "";
  const redirectUri = sp.redirect_uri ?? "";
  const state = sp.state;
  const responseType = sp.response_type;
  const codeChallenge = sp.code_challenge ?? "";
  const codeChallengeMethod = sp.code_challenge_method ?? "";
  const requestedResource = sp.resource;

  // Validate OAuth request parameters
  if (responseType !== "code" || codeChallengeMethod !== "S256" || !codeChallenge) {
    return (
      <McpAuthorizeError
        title={t("invalidRequest")}
        description={t("invalidRequestDescription")}
        errorCode="invalid_request"
      />
    );
  }

  let client;
  try {
    client = readClientRegistration(clientId);
  } catch {
    return (
      <McpAuthorizeError
        title={t("unknownClient")}
        description={t("unknownClientDescription")}
        errorCode="invalid_client"
      />
    );
  }

  if (!client.redirectUris.includes(redirectUri)) {
    return (
      <McpAuthorizeError
        title={t("redirectMismatch")}
        description={t("redirectMismatchDescription")}
        errorCode="invalid_redirect_uri"
      />
    );
  }

  const reqHeaders = await headers();
  const host = reqHeaders.get("host") || "localhost:3000";
  const proto = reqHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const expectedResource = resourceUrl(origin);

  if (requestedResource && requestedResource !== expectedResource) {
    return (
      <McpAuthorizeError
        title={t("targetMismatch")}
        description={t("targetMismatchDescription")}
        errorCode="invalid_target"
      />
    );
  }

  let validScopes: string[];
  try {
    validScopes = requestedScopes(sp.scope ?? null);
  } catch {
    return (
      <McpAuthorizeError
        title={t("invalidScope")}
        description={t("invalidScopeDescription")}
        errorCode="invalid_scope"
      />
    );
  }

  // Construct current URL for redirect after sign in
  const queryParams = new URLSearchParams();
  queryParams.set("client_id", clientId);
  queryParams.set("redirect_uri", redirectUri);
  queryParams.set("response_type", responseType);
  queryParams.set("code_challenge", codeChallenge);
  queryParams.set("code_challenge_method", codeChallengeMethod);
  if (sp.scope) queryParams.set("scope", sp.scope);
  if (state) queryParams.set("state", state);
  if (requestedResource) queryParams.set("resource", requestedResource);

  const currentPathWithSearch = `/mcp/authorize?${queryParams.toString()}`;

  // Session check
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session?.user) {
    redirect(`/sign-in?next=${encodeURIComponent(currentPathWithSearch)}`);
  }

  // Check admin role
  let isAdmin = false;
  try {
    await resolveMcpAdmin({
      userId: session.user.id,
      sessionId: session.session.id,
      scopes: validScopes,
      authMethod: "session",
    });
    isAdmin = true;
  } catch (error) {
    if (error instanceof Error && error.message === "AUTHORING_MCP_ADMIN_REQUIRED") {
      isAdmin = false;
    } else {
      return (
        <McpAuthorizeError
          title={t("sessionInvalid")}
          description={t("sessionInvalidDescription")}
          errorCode="session_invalid"
          returnUrl={`/sign-in?next=${encodeURIComponent(currentPathWithSearch)}`}
        />
      );
    }
  }

  return (
    <McpAuthorizeView
      client={{
        clientId,
        clientName: client.clientName || t("defaultClientName"),
        redirectUri,
      }}
      user={{
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email,
        image: session.user.image ?? null,
      }}
      isAdmin={isAdmin}
      scopes={[...MCP_OAUTH_SCOPES]}
      defaultScopes={validScopes}
      searchParams={{
        clientId,
        redirectUri,
        scope: sp.scope ?? validScopes.join(" "),
        state,
        codeChallenge,
        codeChallengeMethod,
        resource: requestedResource,
      }}
      currentPathWithSearch={currentPathWithSearch}
    />
  );
}
