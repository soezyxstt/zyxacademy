import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { auth } from "@/lib/auth";
import { principalFromConnectionToken, resolveMcpAdmin, type McpPrincipal } from "@/lib/authoring/mcp-auth";
import { MCP_OAUTH_INITIAL_SCOPES, publicMcpOrigin, resourceUrl } from "@/lib/authoring/mcp-oauth";
import { createAuthoringMcpServer } from "@/lib/authoring/mcp-server";
import { MCP_AUTHORING_SCOPES } from "@/lib/authoring/mcp-workflows";
import { timePdfStage } from "@/lib/compute/pdf-read-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(message: string, invalidToken = false): NextResponse {
  const resourceMetadata = `${publicMcpOrigin()}/.well-known/oauth-protected-resource/api/mcp/authoring`;
  return NextResponse.json(
    { error: message },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}", scope="${MCP_OAUTH_INITIAL_SCOPES.join(" ")}"${invalidToken ? ', error="invalid_token"' : ""}`,
        "Cache-Control": "no-store",
      },
    },
  );
}

const credentialErrors = new Set(["AUTHORING_MCP_TOKEN_INVALID", "AUTHORING_MCP_TOKEN_EXPIRED", "AUTHORING_MCP_INVALID_RESOURCE", "AUTHORING_MCP_SESSION_INVALID", "AUTHORING_MCP_CONSENT_REQUIRED", "AUTHORING_MCP_AUTH_INVALID"]);
function authFailure(error: unknown, bearer: boolean): NextResponse {
  if (isForbidden(error)) return NextResponse.json({ error: "AUTHORING_MCP_ADMIN_REQUIRED" }, { status: 403 });
  const code = error instanceof Error ? error.message.split(":")[0] : "";
  if (credentialErrors.has(code)) return unauthorized(code, bearer);
  return NextResponse.json({ error: "AUTHORING_MCP_AUTH_UNAVAILABLE" }, { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } });
}

function isForbidden(error: unknown): boolean {
  const code = error instanceof Error ? error.message.split(":")[0] : "";
  return code === "AUTHORING_MCP_ADMIN_REQUIRED" || code === "AUTHORING_MCP_SCOPE_REQUIRED";
}

async function authenticate(request: NextRequest): Promise<McpPrincipal | NextResponse> {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const bearer = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!bearer) return unauthorized("AUTHORING_MCP_AUTH_REQUIRED", true);
    try {
      return await principalFromConnectionToken(bearer[1], resourceUrl());
    } catch (error) {
      return authFailure(error, true);
    }
  }

  const cookie = request.headers.get("cookie");
  if (!cookie) return unauthorized("AUTHORING_MCP_LOGIN_REQUIRED");

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return unauthorized("AUTHORING_MCP_LOGIN_REQUIRED");
    return await resolveMcpAdmin({
      userId: session.user.id,
      sessionId: session.session.id,
      scopes: [...MCP_AUTHORING_SCOPES],
      authMethod: "session",
    });
  } catch (error) {
    return authFailure(error, false);
  }
}

async function handle(request: NextRequest): Promise<Response> {
  const principal = await authenticate(request);
  if (principal instanceof NextResponse) return principal;

  const requestId = crypto.randomUUID();
  const skillsProfile = request.nextUrl.searchParams.get("skills") ?? "chatgpt";
  if (skillsProfile !== "chatgpt" && skillsProfile !== "all") {
    return NextResponse.json({ error: "INVALID_SKILLS_PROFILE" }, { status: 400 });
  }
  const server = createAuthoringMcpServer(principal, requestId, skillsProfile);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return timePdfStage(requestId, "send.transport", () => transport.handleRequest(request));
}

export async function POST(request: NextRequest) {
  try {
    return await handle(request);
  } catch {
    return NextResponse.json({ error: "AUTHORING_MCP_INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error: "METHOD_NOT_ALLOWED",
      message: "Zyx Authoring MCP operates in stateless Streamable HTTP mode via POST. Persistent SSE streaming is not supported.",
    },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    },
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: "METHOD_NOT_ALLOWED",
      message: "Zyx Authoring MCP operates in stateless mode. Sessions are not maintained.",
    },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    },
  );
}
