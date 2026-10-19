import type { Metadata } from "next";
import { headers } from "next/headers";
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

export const metadata: Metadata = {
  title: pageTitle("Otorisasi MCP"),
  description: "Otorisasi integrasi Model Context Protocol Zyx Academy.",
};

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
        title="Parameter permintaan tidak valid"
        description="Permintaan otorisasi harus menyertakan response_type=code, code_challenge_method=S256, dan parameter code_challenge yang sah."
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
        title="Klien tidak terdaftar"
        description="Pengenal klien (client_id) tidak dikenali atau format token pendaftaran tidak valid."
        errorCode="invalid_client"
      />
    );
  }

  if (!client.redirectUris.includes(redirectUri)) {
    return (
      <McpAuthorizeError
        title="URL pengalihan tidak sesuai"
        description="URL pengalihan yang diminta (redirect_uri) tidak cocok dengan daftar URL pengalihan terdaftar untuk klien ini."
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
        title="Target sumber daya tidak sesuai"
        description="Sumber daya yang diminta tidak cocok dengan endpoint MCP authoring Zyx Academy."
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
        title="Cakupan izin tidak valid"
        description="Satu atau lebih cakupan izin (scope) yang diminta tidak didukung oleh gateway MCP authoring Zyx."
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
          title="Autentikasi sesi gagal"
          description="Sesi Anda saat ini tidak valid atau telah kedaluwarsa. Silakan masuk kembali."
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
        clientName: client.clientName || "MCP client",
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
