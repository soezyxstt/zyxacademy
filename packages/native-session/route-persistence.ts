import { DEFAULT_AUTH_CALLBACK_PATH, getSafeRedirectPath } from "./auth-redirect";

/** Keep last active route for 24 hours so short/same-day returns resume seamlessly. */
export const NATIVE_LAST_ROUTE_MAX_AGE_SECONDS = 24 * 60 * 60;
export const NATIVE_LAST_ROUTE_MAX_AGE_MS = NATIVE_LAST_ROUTE_MAX_AGE_SECONDS * 1000;
const NATIVE_LAST_ROUTE_MAX_LENGTH = 1024;

const RESTORABLE_PREFIXES = [
  "/dashboard",
  "/courses",
  "/calendar",
  "/discussions",
  "/profile",
  "/settings",
  "/achievements",
  "/leaderboard",
  "/pet",
  "/feedback",
  "/students",
  "/tutor",
  "/admin",
] as const;

function matchesRestorablePrefix(pathname: string): boolean {
  for (const prefix of RESTORABLE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

/**
 * Validates and normalizes a candidate in-app route (pathname + search) for
 * native state restoration. Rejects marketing, auth, API, external, or malformed URLs.
 */
export function normalizeRestorableNativeRoute(rawPath: string | null | undefined): string | null {
  if (!rawPath || typeof rawPath !== "string") return null;
  const trimmed = rawPath.trim();
  if (
    !trimmed ||
    trimmed.length > NATIVE_LAST_ROUTE_MAX_LENGTH ||
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    /[\u0000-\u001f\u007f]/.test(trimmed)
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, "https://zyx-route.invalid");
  } catch {
    return null;
  }

  if (parsed.origin !== "https://zyx-route.invalid") return null;
  if (!matchesRestorablePrefix(parsed.pathname)) return null;

  const candidate = `${parsed.pathname}${parsed.search}`;
  if (candidate.length > NATIVE_LAST_ROUTE_MAX_LENGTH) return null;

  const safe = getSafeRedirectPath(candidate);
  if (safe === DEFAULT_AUTH_CALLBACK_PATH && parsed.pathname !== DEFAULT_AUTH_CALLBACK_PATH) {
    return null;
  }
  return safe;
}

export function isRestorableNativeRoute(rawPath: string | null | undefined): boolean {
  return normalizeRestorableNativeRoute(rawPath) !== null;
}

export function isFreshNativeRouteTimestamp(
  updatedAt: unknown, now = Date.now(), maxAgeMs = NATIVE_LAST_ROUTE_MAX_AGE_MS,
): updatedAt is number {
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return false;
  const ageMs = now - updatedAt;
  return !(ageMs > maxAgeMs || ageMs < -60_000);
}
