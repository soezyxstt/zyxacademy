import { NextRequest, NextResponse } from "next/server";
import { MCP_OAUTH_SCOPES, resourceUrl } from "@/lib/authoring/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    resource: resourceUrl(request.nextUrl.origin),
    authorization_servers: [request.nextUrl.origin],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
  });
}
