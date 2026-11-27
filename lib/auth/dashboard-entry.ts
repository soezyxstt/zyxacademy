export const DASHBOARD_ENTRY_COOKIE_NAME = "zyx_dashboard_entry_seen";

/**
 * Cooldown window before an active session visiting the marketing root is
 * redirected to their role dashboard again (6 hours).
 */
export const DASHBOARD_ENTRY_COOLDOWN_SECONDS = 6 * 60 * 60;

/**
 * Short cooldown applied when a session cookie was present in proxy.ts but
 * turned out to be expired/invalid on the server, preventing redirect loops.
 */
export const DASHBOARD_ENTRY_STALE_COOLDOWN_SECONDS = 5 * 60;

export const ENTRY_REDIRECT_ROUTE = "/api/entry-redirect";

export type RoleDashboardPath = "/admin" | "/tutor" | "/dashboard";

/**
 * Resolves the default dashboard route for a user's canonical roles.
 * Multi-role priority: admin -> tutor -> student (/dashboard).
 */
export function resolveRoleDashboardPath(
  roles: readonly string[],
): RoleDashboardPath {
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("tutor")) return "/tutor";
  return "/dashboard";
}

/**
 * Validates the fallback landing path passed to `/api/entry-redirect` when a
 * session cookie is stale or invalid. Only the marketing root and its localized
 * root variants are permitted to prevent open redirects.
 */
export function getSafeEntryReturnPath(
  raw: string | null | undefined,
): "/" | "/id" | "/en" {
  if (raw === "/id" || raw === "/en") return raw;
  return "/";
}

/**
 * Returns true if the pathname is an authenticated app area where the user is
 * already inside the product, so intentionally visiting the marketing site
 * afterwards does not bounce them back until the cooldown expires.
 */
export function isAppEntryVisitedPath(pathname: string): boolean {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/tutor" ||
    pathname.startsWith("/tutor/") ||
    pathname === "/courses" ||
    pathname.startsWith("/courses/") ||
    pathname === "/calendar" ||
    pathname.startsWith("/calendar/") ||
    pathname === "/discussions" ||
    pathname.startsWith("/discussions/") ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
  );
}

/**
 * Returns true for top-level document GET navigations (excluding RSC fetches,
 * Next.js router prefetches, and non-GET requests).
 */
export function isDocumentGetNavigation(request: {
  method: string;
  headers: Pick<Headers, "get">;
}): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.get("rsc")) return false;
  if (request.headers.get("next-router-prefetch")) return false;
  const purpose =
    request.headers.get("purpose") ?? request.headers.get("sec-purpose");
  if (purpose?.toLowerCase().includes("prefetch")) return false;
  return true;
}

/**
 * Detects Zyx native mobile (Capacitor) or desktop (Tauri) shells via User-Agent.
 */
export function isNativeUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return /\bZyx(?:Mobile|Desktop)App\//i.test(userAgent);
}

const NATIVE_MARKETING_EXACT_PATHS = new Set([
  "/",
  "/about",
  "/download",
  "/plans",
  "/testimonial",
  "/blog",
  "/demo",
  "/forms-playground",
]);

/**
 * Returns true when a pathname belongs to the public marketing site that native
 * app shells should bypass directly into the role dashboard (or /sign-in).
 * Auth and legal routes (/sign-in, /sign-up, /sign-out, /privacy, /terms,
 * /unsubscribe) remain accessible.
 */
export function isNativeMarketingRedirectPath(pathname: string): boolean {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
  const normalized = trimmed.replace(/^\/(?:id|en)(?=\/|$)/, "") || "/";
  if (NATIVE_MARKETING_EXACT_PATHS.has(normalized)) return true;
  if (normalized.startsWith("/blog/") || normalized.startsWith("/demo/")) {
    return true;
  }
  return false;
}
