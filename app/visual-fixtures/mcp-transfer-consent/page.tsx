import { notFound } from "next/navigation";
import { McpAuthorizeView } from "@/components/mcp/mcp-authorize-view";
import { MCP_AUTHORING_DEFAULT_SCOPES, MCP_AUTHORING_SCOPES } from "@/lib/authoring/mcp-workflows";
import McpLayout from "@/app/mcp/layout";

export default function TransferConsentFixture() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_VISUAL_FIXTURES !== "true") notFound();
  return <McpLayout><McpAuthorizeView client={{ clientId: "fixture", clientName: "Transfer agent", redirectUri: "https://agent.example.invalid/callback" }}
    user={{ id: "fixture", name: "Admin fixture", email: "admin@example.invalid", image: null }} isAdmin
    scopes={[...MCP_AUTHORING_SCOPES]} defaultScopes={[...MCP_AUTHORING_DEFAULT_SCOPES]}
    searchParams={{ clientId: "fixture", redirectUri: "https://agent.example.invalid/callback", scope: MCP_AUTHORING_DEFAULT_SCOPES.join(" "), codeChallenge: "fixture", codeChallengeMethod: "S256" }} currentPathWithSearch="/visual-fixtures/mcp-transfer-consent" /></McpLayout>;
}
