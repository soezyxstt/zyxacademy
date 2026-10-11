import { describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { GET as getMetadata } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as getAuthorizeRoute } from "@/app/api/mcp/oauth/authorize/route";
import { issueClientRegistration } from "@/lib/authoring/mcp-oauth";

describe("MCP OAuth Authorization Page and Endpoints", () => {
  it("advertises /mcp/authorize in well-known metadata", async () => {
    const request = new Request("http://localhost:3000/.well-known/oauth-authorization-server");
    const response = await getMetadata(request);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { authorization_endpoint: string; scopes_supported: string[] };
    expect(json.authorization_endpoint).toBe("http://localhost:3000/mcp/authorize");
    expect(json.scopes_supported).toContain("authoring:read");
    expect(json.scopes_supported).toContain("authoring:stage");
    expect(json.scopes_supported).toContain("authoring:review");
    expect(json.scopes_supported).toContain("authoring:withdraw");
  });

  it("rejects authorize requests missing PKCE or valid response_type", async () => {
    const req = new NextRequest("http://localhost:3000/api/mcp/oauth/authorize?response_type=token");
    const res = await getAuthorizeRoute(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_request");
  });

  it("rejects unregistered client IDs", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/mcp/oauth/authorize?response_type=code&code_challenge_method=S256&code_challenge=challenge123&client_id=fake-client&redirect_uri=http://localhost:8080/callback"
    );
    const res = await getAuthorizeRoute(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_client");
  });

  it("redirects interactive requests to /mcp/authorize with query parameters intact", async () => {
    const clientId = issueClientRegistration({
      clientName: "Cursor IDE",
      redirectUris: ["http://localhost:8080/callback"],
    });

    const query = new URLSearchParams({
      response_type: "code",
      code_challenge_method: "S256",
      code_challenge: "challenge_xyz_123",
      client_id: clientId,
      redirect_uri: "http://localhost:8080/callback",
      scope: "authoring:read authoring:stage",
      state: "state_abc",
    });

    const req = new NextRequest(`http://localhost:3000/api/mcp/oauth/authorize?${query.toString()}`);
    const res = await getAuthorizeRoute(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    const redirectedUrl = new URL(location!);
    expect(redirectedUrl.pathname).toBe("/mcp/authorize");
    expect(redirectedUrl.searchParams.get("client_id")).toBe(clientId);
    expect(redirectedUrl.searchParams.get("redirect_uri")).toBe("http://localhost:8080/callback");
    expect(redirectedUrl.searchParams.get("state")).toBe("state_abc");
    expect(redirectedUrl.searchParams.get("scope")).toBe("authoring:read authoring:stage");
    expect(redirectedUrl.searchParams.get("code_challenge")).toBe("challenge_xyz_123");
  });

  it("rejects redirect_uri mismatches with registered client uris", async () => {
    const clientId = issueClientRegistration({
      clientName: "Claude Desktop",
      redirectUris: ["http://localhost:8080/callback"],
    });

    const query = new URLSearchParams({
      response_type: "code",
      code_challenge_method: "S256",
      code_challenge: "challenge_xyz_123",
      client_id: clientId,
      redirect_uri: "http://localhost:9999/unregistered",
    });

    const req = new NextRequest(`http://localhost:3000/api/mcp/oauth/authorize?${query.toString()}`);
    const res = await getAuthorizeRoute(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_request");
  });
});
