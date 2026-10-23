import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  MCP_CONNECTION_TOKEN_TTL_SECONDS,
  issueMcpConnectionToken,
} from "@/lib/authoring/mcp-workflows";
import { resolveMcpAdmin } from "@/lib/authoring/mcp-auth";
import { connectionScopes } from "@/lib/authoring/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function createConnection(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "AUTHORING_MCP_LOGIN_REQUIRED" }, { status: 401 });

  try {
    const body = await request.text();
    let scopes: string[];
    try { scopes = connectionScopes(body); }
    catch { return NextResponse.json({ error: "invalid_scope" }, { status: 400 }); }
    const principal = await resolveMcpAdmin({
      userId: session.user.id,
      sessionId: session.session.id,
      scopes,
      authMethod: "session",
    });
    const resource = `${request.nextUrl.origin}/api/mcp/authoring`;
    const accessToken = issueMcpConnectionToken({
      userId: principal.userId,
      sessionId: principal.sessionId,
      clientId: "zyx-admin-connection",
      resource,
      scopes: principal.scopes,
    });
    return NextResponse.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: MCP_CONNECTION_TOKEN_TTL_SECONDS,
      endpoint: resource,
      scopes: principal.scopes,
      note: "Gunakan token ini hanya pada MCP client yang Anda percaya.",
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0] : "AUTHORING_MCP_AUTH_INVALID";
    return NextResponse.json({ error: code }, { status: code === "AUTHORING_MCP_ADMIN_REQUIRED" ? 403 : 401 });
  }
}

export async function POST(request: NextRequest) {
  return createConnection(request);
}
