/**
 * lib/native/route-persistence.ts
 *
 * Persists the last active authenticated route for Zyx native shells
 * (Capacitor mobile and Tauri desktop) in a user-bound cookie so OS
 * process kills, Activity recreation, WebView reloads, or relaunches
 * resume the user's current screen instead of bouncing back to /dashboard.
 */

import { DEFAULT_AUTH_CALLBACK_PATH, getSafeRedirectPath } from "@/lib/auth-redirect";
import type { RoleDashboardPath } from "@/lib/auth/dashboard-entry";
import { isNativeApp } from "./runtime";

export const NATIVE_LAST_ROUTE_COOKIE_NAME = "zyx_native_last_route";

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

export function isRouteAllowedForRoleDashboard(
  path: string,
  roleDashboard: RoleDashboardPath,
): boolean {
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return roleDashboard === "/admin";
  }
  if (pathname === "/tutor" || pathname.startsWith("/tutor/")) {
    return roleDashboard === "/tutor" || roleDashboard === "/admin";
  }
  return true;
}

export function serializeNativeLastRoute(input: {
  userId: string;
  path: string;
  updatedAt?: number;
}): string | null {
  const userId = input.userId.trim();
  if (!userId) return null;
  const safePath = normalizeRestorableNativeRoute(input.path);
  if (!safePath) return null;
  const updatedAt =
    typeof input.updatedAt === "number" && Number.isFinite(input.updatedAt)
      ? Math.floor(input.updatedAt)
      : Date.now();
  return encodeURIComponent(JSON.stringify({ u: userId, p: safePath, t: updatedAt }));
}

export function parseNativeLastRoute(
  rawCookieValue: string | null | undefined,
  options: {
    expectedUserId: string;
    now?: number;
    maxAgeMs?: number;
  },
): string | null {
  if (!rawCookieValue || typeof rawCookieValue !== "string") return null;
  const expectedUserId = options.expectedUserId.trim();
  if (!expectedUserId) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawCookieValue);
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (record.u !== expectedUserId) return null;
  if (typeof record.t !== "number" || !Number.isFinite(record.t)) return null;

  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? NATIVE_LAST_ROUTE_MAX_AGE_MS;
  const ageMs = now - record.t;
  if (ageMs > maxAgeMs || ageMs < -60_000) return null;

  if (typeof record.p !== "string") return null;
  return normalizeRestorableNativeRoute(record.p);
}

export function resolveNativeEntryDestination(input: {
  rawCookieValue: string | null | undefined;
  userId: string;
  roleDashboard: RoleDashboardPath;
  now?: number;
}): string {
  const restored = parseNativeLastRoute(input.rawCookieValue, {
    expectedUserId: input.userId,
    now: input.now,
  });
  if (restored && isRouteAllowedForRoleDashboard(restored, input.roleDashboard)) {
    return restored;
  }
  return input.roleDashboard;
}

export function persistNativeLastRoute(
  userId: string | null | undefined,
  path: string | null | undefined,
  options?: {
    now?: number;
    forceNative?: boolean;
  },
): boolean {
  if (typeof document === "undefined") return false;
  if (!options?.forceNative && !isNativeApp()) return false;
  if (!userId || !path) return false;

  const serialized = serializeNativeLastRoute({
    userId,
    path,
    updatedAt: options?.now,
  });
  if (!serialized) return false;

  const isHttps =
    typeof window !== "undefined" && window.location?.protocol === "https:";
  const secureAttr = isHttps ? "; Secure" : "";
  try {
    document.cookie = `${NATIVE_LAST_ROUTE_COOKIE_NAME}=${serialized}; Path=/; Max-Age=${NATIVE_LAST_ROUTE_MAX_AGE_SECONDS}; SameSite=Lax${secureAttr}`;
    return true;
  } catch {
    return false;
  }
}

export function clearNativeLastRoute(): void {
  if (typeof document === "undefined") return;
  const isHttps =
    typeof window !== "undefined" && window.location?.protocol === "https:";
  const secureAttr = isHttps ? "; Secure" : "";
  try {
    document.cookie = `${NATIVE_LAST_ROUTE_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secureAttr}`;
  } catch {
    // Ignore restricted WebView cookie errors.
  }
}
