import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { McpAuthorizeView } from "@/components/mcp/mcp-authorize-view";
import consentIdMessages from "@/messages/id/consent.json";
import { approvedScopes, MCP_OAUTH_SCOPES, requestedScopes } from "@/lib/authoring/mcp-oauth";
import { issueMcpConnectionToken, readMcpConnectionToken } from "@/lib/authoring/mcp-workflows";

describe("MCP consent scope choices", () => {
  it("shows only the three requested permissions", () => {
    const requested = requestedScopes("authoring:read authoring:stage authoring:review");
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="id" timeZone="UTC" messages={{ consent: consentIdMessages }}>
        <McpAuthorizeView
          client={{ clientId: "test-client", clientName: "ChatGPT", redirectUri: "https://example.test/callback" }}
          user={{ id: "test-admin", name: "Admin", email: "admin@example.test", image: null }}
          isAdmin
          scopes={requested}
          defaultScopes={requested}
          searchParams={{ clientId: "test-client", redirectUri: "https://example.test/callback", scope: requested.join(" "), codeChallenge: "test", codeChallengeMethod: "S256" }}
          currentPathWithSearch="/mcp/authorize"
        />
      </NextIntlClientProvider>,
    );
    expect(html.match(/role="checkbox"/g)).toHaveLength(3);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(3);
    expect(html).toContain("3 dari 3 izin");
  });

  it("describes requested admin permissions without showing machine identifiers", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="id" timeZone="UTC" messages={{ consent: consentIdMessages }}>
        <McpAuthorizeView
          client={{ clientId: "client", clientName: "Client", redirectUri: "https://example.test/callback" }}
          user={{ id: "admin", name: "Admin", email: "admin@example.test", image: null }}
          isAdmin scopes={["forms:read"]} defaultScopes={["forms:read"]}
          searchParams={{ clientId: "client", redirectUri: "https://example.test/callback", scope: "forms:read", codeChallenge: "test", codeChallengeMethod: "S256" }}
          currentPathWithSearch="/mcp/authorize"
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("Lihat formulir");
    expect(html).not.toContain('>forms:read<');
  });

  it("rejects unrequested scopes and preserves the approved token scope", () => {
    const raw = "authoring:read authoring:stage authoring:review";
    expect(approvedScopes(raw, requestedScopes(raw))).not.toContain("authoring:withdraw");
    expect(() => approvedScopes(raw, [...MCP_OAUTH_SCOPES])).toThrow("invalid_scope");
    const scopes = approvedScopes(raw, requestedScopes(raw));
    const token = issueMcpConnectionToken({ userId: "test-admin", sessionId: "test-session", clientId: "client", resource: "https://example.test/api/mcp/authoring", scopes });
    expect(readMcpConnectionToken(token).scopes).toEqual(scopes);
    expect(() => approvedScopes(raw, [])).toThrow("invalid_scope");
    expect(() => approvedScopes(raw, ["authoring:publish"])).toThrow("invalid_scope");
  });
});
