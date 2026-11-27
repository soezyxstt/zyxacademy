/**
 * lib/native/route-persistence.ts
 *
 * Persists the last active authenticated route for Zyx native shells
 * (Capacitor mobile and Tauri desktop) in a user-bound cookie so OS
 * process kills, Activity recreation, WebView reloads, or relaunches
 * resume the user's current screen instead of bouncing back to /dashboard.
 */

import {
  isFreshNativeRouteTimestamp, NATIVE_LAST_ROUTE_MAX_AGE_SECONDS, normalizeRestorableNativeRoute,
} from "../../packages/native-session/route-persistence";
import type { RoleDashboardPath } from "@/lib/auth/dashboard-entry";
import { isNativeApp } from "./runtime";

export {
  NATIVE_LAST_ROUTE_MAX_AGE_MS, NATIVE_LAST_ROUTE_MAX_AGE_SECONDS, isRestorableNativeRoute,
  normalizeRestorableNativeRoute,
} from "../../packages/native-session/route-persistence";

export const NATIVE_LAST_ROUTE_COOKIE_NAME = "zyx_native_last_route";

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
  if (!isFreshNativeRouteTimestamp(record.t, options.now, options.maxAgeMs)) return null;

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
