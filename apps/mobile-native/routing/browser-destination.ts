import { NATIVE_STAGING_ORIGIN } from "../auth/session-api";

export type BrowserDestination = "authorize" | "connections" | "meet";
type Params = Readonly<Record<string, string | readonly string[] | undefined>>;

// Query keys consumed by the Next MCP consent page. Browser cookies and the
// server-side registered client remain authoritative for the OAuth request.
const authorizeKeys = ["prompt", "client_id", "redirect_uri", "state", "response_type",
  "code_challenge", "code_challenge_method", "scope", "resource"] as const;

export function browserDestination(kind: BrowserDestination, params: Params): string | null {
  if (kind === "connections") return NATIVE_STAGING_ORIGIN + "/mcp/connections";
  if (kind === "meet") {
    const slug = params.slug;
    if (typeof slug !== "string" || !slug || slug === "." || slug === ".." || /[\\/\u0000-\u001f\u007f\ud800-\udfff]/u.test(slug)) return null;
    return NATIVE_STAGING_ORIGIN + "/meet/" + encodeURIComponent(slug);
  }

  const url = new URL("/mcp/authorize", NATIVE_STAGING_ORIGIN);
  for (const key of authorizeKeys) {
    const value = params[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return null;
    url.searchParams.set(key, value);
  }
  return url.href;
}
