import { NextResponse } from "next/server";
import { MCP_OAUTH_SCOPES, publicMcpOrigin, resourceUrl } from "@/lib/authoring/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request) {
  return NextResponse.json({
    resource: resourceUrl(),
    authorization_servers: [publicMcpOrigin()],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
  });
}
