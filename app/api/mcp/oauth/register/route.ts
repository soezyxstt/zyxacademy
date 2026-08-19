import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedRedirectUri, issueClientRegistration } from "@/lib/authoring/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const registrationSchema = z.object({
  client_name: z.string().trim().min(1).max(160).optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(16),
}).passthrough();

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success || parsed.data.redirect_uris.some((uri) => !isAllowedRedirectUri(uri))) {
    return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }
  const clientId = issueClientRegistration({
    clientName: parsed.data.client_name,
    redirectUris: parsed.data.redirect_uris,
  });
  return NextResponse.json({
    client_id: clientId,
    client_name: parsed.data.client_name ?? "MCP client",
    redirect_uris: parsed.data.redirect_uris,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }, { status: 201 });
}
