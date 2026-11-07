import McpLayout from "@/app/mcp/layout";
import { FixtureReady } from "./ready";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { McpAuthorizeView } from "@/components/mcp/mcp-authorize-view";
import ui from "@/messages/id/ui.json";
import messages from "@/messages/id/consent.json";

export default function McpConsentFixture() {
  if (process.env.NODE_ENV === "production") notFound();
  const scopes = ["forms:read", "forms:write", "forms:responses:read", "forms:responses:export", "courses:read", "courses:write"];
  return <NextIntlClientProvider locale="id" timeZone="UTC" messages={{ consent: messages, ui }}>
    <FixtureReady />
    <McpLayout>
    <McpAuthorizeView client={{ clientId: "fixture", clientName: "Zyx Admin", redirectUri: "https://example.test/callback" }} user={{ id: "fixture", name: "Admin", email: "admin@example.test", image: null }} isAdmin scopes={scopes} defaultScopes={scopes} searchParams={{ clientId: "fixture", redirectUri: "https://example.test/callback", scope: scopes.join(" "), codeChallenge: "fixture", codeChallengeMethod: "S256" }} currentPathWithSearch="/visual-fixtures/mcp-consent" />
    </McpLayout>
  </NextIntlClientProvider>;
}
