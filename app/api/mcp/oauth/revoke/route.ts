import { NextRequest, NextResponse } from "next/server";
import { readClientRegistration, revokeOAuthToken } from "@/lib/authoring/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", Pragma: "no-cache" };
export async function POST(request: NextRequest) {
  let token: string;
  let clientId: string;
  try {
    const body = await request.formData();
    token = String(body.get("token") ?? "");
    clientId = String(body.get("client_id") ?? "");
  } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400, headers }); }
  if (!token || !clientId) return NextResponse.json({ error: "invalid_request" }, { status: 400, headers });
  try { readClientRegistration(clientId); } catch { return NextResponse.json({ error: "invalid_client" }, { status: 400, headers }); }
  try {
    await revokeOAuthToken(token, clientId);
    return new NextResponse(null, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503, headers });
  }
}
