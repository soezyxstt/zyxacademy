import { resolveAuthBaseUrl } from "@/lib/auth-site-url";

export type McpEnvironment = "staging" | "production" | "local";
/** Deployment tiers such as VERCEL_ENV=production are not application environments. */
export function mcpEnvironmentIdentity() {
  const url = new URL(resolveAuthBaseUrl());
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("MCP_ENVIRONMENT_CONFIG_INVALID");
  const host = url.hostname.toLowerCase();
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(host);
  if (!local && url.protocol !== "https:") throw new Error("MCP_ENVIRONMENT_CONFIG_INVALID");
  const inferred: McpEnvironment | undefined = local ? "local" : host === "staging.zyxacademy.com" ? "staging" : ["zyxacademy.com", "www.zyxacademy.com", "zyx.id", "www.zyx.id"].includes(host) ? "production" : undefined;
  const declared = process.env.ZYX_MCP_ENVIRONMENT?.trim().toLowerCase();
  if (declared && !["staging", "production", "local"].includes(declared)) throw new Error("MCP_ENVIRONMENT_CONFIG_INVALID");
  if (declared && inferred && declared !== inferred) throw new Error("MCP_ENVIRONMENT_CONFIG_MISMATCH");
  if (!inferred && !declared) throw new Error("AUTHORING_MCP_ENVIRONMENT_UNKNOWN");
  const environment = (inferred ?? declared) as McpEnvironment;
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (process.env.BETTER_AUTH_URL?.trim() && publicUrl && new URL(publicUrl).origin !== url.origin) throw new Error("MCP_ENVIRONMENT_CONFIG_MISMATCH");
  return { environment, origin: url.origin, resource: `${url.origin}/api/mcp/authoring` };
}
export function assertMcpTarget(expectedEnvironment: unknown, expectedOrigin: unknown) {
  const identity = mcpEnvironmentIdentity();
  if (identity.environment !== expectedEnvironment || identity.origin !== expectedOrigin) throw new Error("MCP_TARGET_ENVIRONMENT_MISMATCH");
  return identity;
}
