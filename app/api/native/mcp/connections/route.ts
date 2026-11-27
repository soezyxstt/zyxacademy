import { auth } from "@/lib/auth";
import { isSameOriginAdminRequest } from "@/lib/admin-ops-ai/request-origin";
import { isMcpOAuthGrantSessionId, listOAuthConnections, revokeOAuthConnection } from "@/lib/authoring/mcp-oauth";

const headers = { "Cache-Control": "private, no-store" };

async function currentAccount(request: Request) {
  if (!isSameOriginAdminRequest(request)) return new Response(null, { status: 403, headers });
  const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true, disableRefresh: true } });
  if (!session?.user || !session.session) return new Response(null, { status: 401, headers });
  if (request.headers.get("x-native-account") !== session.user.id || request.headers.get("x-native-session") !== session.session.id) {
    return new Response(null, { status: 409, headers });
  }
  return session.user.id;
}

export async function GET(request: Request) {
  const userId = await currentAccount(request);
  if (userId instanceof Response) return userId;
  const connections = await listOAuthConnections(userId);
  return Response.json({ connections }, { headers });
}

export async function DELETE(request: Request) {
  const userId = await currentAccount(request);
  if (userId instanceof Response) return userId;
  const input: unknown = await request.json().catch(() => null);
  const id = input && typeof input === "object" && "id" in input ? input.id : null;
  if (typeof id !== "string" || !isMcpOAuthGrantSessionId(id)) return new Response(null, { status: 400, headers });
  await revokeOAuthConnection(userId, id);
  return new Response(null, { status: 204, headers });
}
