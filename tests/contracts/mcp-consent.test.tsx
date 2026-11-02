import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { McpAuthorizeView } from "@/components/mcp/mcp-authorize-view";
import consentIdMessages from "@/messages/id/consent.json";
import { approvedScopes, MCP_OAUTH_SCOPES, requestedScopes } from "@/lib/authoring/mcp-oauth";
import { issueMcpConnectionToken, readMcpConnectionToken } from "@/lib/authoring/mcp-workflows";

describe("MCP consent scope choices", () => {
  it("shows all four permissions when the client requests only three", () => {
    const requested = requestedScopes("authoring:read authoring:stage authoring:review");
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="id" timeZone="UTC" messages={{ consent: consentIdMessages }}>
        <McpAuthorizeView
          client={{ clientId: "test-client", clientName: "ChatGPT", redirectUri: "https://example.test/callback" }}
          user={{ id: "test-admin", name: "Admin", email: "admin@example.test", image: null }}
          isAdmin
          scopes={[...MCP_OAUTH_SCOPES]}
          defaultScopes={requested}
          searchParams={{ clientId: "test-client", redirectUri: "https://example.test/callback", scope: requested.join(" "), codeChallenge: "test", codeChallengeMethod: "S256" }}
          currentPathWithSearch="/mcp/authorize"
        />
      </NextIntlClientProvider>,
    );
    expect(html.match(/role="checkbox"/g)).toHaveLength(4);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(3);
    const withdraw = [...html.matchAll(/<button\b[^>]*>/g)].find(([tag]) => tag.includes('aria-label="Tarik materi dan hapus draf"'))?.[0];
    expect(withdraw).toContain('aria-checked="false"');
    expect(html).toContain("3 dari 4 izin");
  });

  it("adds withdraw only when explicitly selected and preserves the approved token scope", () => {
    const raw = "authoring:read authoring:stage authoring:review";
    expect(approvedScopes(raw, requestedScopes(raw))).not.toContain("authoring:withdraw");
    const scopes = approvedScopes(raw, [...MCP_OAUTH_SCOPES]);
    expect(scopes).toEqual([...MCP_OAUTH_SCOPES]);
    const token = issueMcpConnectionToken({
      userId: "test-admin", sessionId: "test-session", clientId: "test-client",
      resource: "https://example.test/api/mcp/authoring", scopes,
    });
    expect(readMcpConnectionToken(token).scopes).toEqual(scopes);
    expect(() => approvedScopes(raw, [])).toThrow("invalid_scope");
    expect(() => approvedScopes(raw, ["authoring:publish"])).toThrow("invalid_scope");
  });
});
