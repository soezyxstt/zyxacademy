import { NextResponse } from "next/server";
import { MCP_OAUTH_SCOPES, publicMcpOrigin } from "@/lib/authoring/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request) {
  const origin = publicMcpOrigin();
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/authorize`,
    token_endpoint: `${origin}/api/mcp/oauth/token`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`,
    revocation_endpoint: `${origin}/api/mcp/oauth/revoke`,
    revocation_endpoint_auth_methods_supported: ["none"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    client_id_metadata_document_supported: false,
  });
}
