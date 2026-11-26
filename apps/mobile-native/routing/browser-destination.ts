import { publicMeetingPath } from "../../../packages/meet/public-destination";
import { NATIVE_STAGING_ORIGIN } from "../auth/session-api";

export type BrowserDestination = "authorize" | "meet";
type Params = Readonly<Record<string, string | readonly string[] | undefined>>;

// Query keys consumed by the Next MCP consent page. Browser cookies and the
// server-side registered client remain authoritative for the OAuth request.
const authorizeKeys = ["prompt", "client_id", "redirect_uri", "state", "response_type",
  "code_challenge", "code_challenge_method", "scope", "resource"] as const;

export function browserDestination(kind: BrowserDestination, params: Params): string | null {
  if (kind === "meet") {
    const path = publicMeetingPath(params.slug);
    return path ? NATIVE_STAGING_ORIGIN + path : null;
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
