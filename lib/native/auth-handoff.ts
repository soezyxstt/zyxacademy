/**
 * lib/native/auth-handoff.ts
 *
 * Pure allowlist and URL builders/parsers for Chrome Custom Tabs (Android),
 * Safari (iOS), and system browser (Desktop Tauri) OAuth handoff.
 *
 * Tokens are transported exclusively in URL fragments (#token=...&state=...&next=...)
 * and bound to a per-login client state nonce to prevent login CSRF and query-log leakage.
 */

import { getSafeRedirectPath } from "@/lib/auth-redirect";

export const ALLOWED_NATIVE_AUTH_SCHEMES = [
  "com.zyx.academy",
  "com.zyx.academy.nightly",
  "zyxacademy",
  "zyxacademy-nightly",
] as const;

export const NATIVE_AUTH_STATE_STORAGE_KEY = "zyx_native_auth_state";
export const NATIVE_AUTH_HANDOFF_COOKIE = "zyx_native_handoff";

export type NativeAuthScheme = (typeof ALLOWED_NATIVE_AUTH_SCHEMES)[number];

const ALLOWED_SCHEME_SET = new Set<string>(ALLOWED_NATIVE_AUTH_SCHEMES);
const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function isAllowedNativeAuthScheme(value: string | null | undefined): value is NativeAuthScheme {
  if (!value) return false;
  return ALLOWED_SCHEME_SET.has(value.trim().toLowerCase());
}

export function normalizeNativeAuthScheme(value: string | null | undefined): NativeAuthScheme | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return isAllowedNativeAuthScheme(trimmed) ? trimmed : null;
}

export function normalizeNativeAuthState(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return STATE_RE.test(trimmed) ? trimmed : null;
}

export function isMobileAuthScheme(scheme: NativeAuthScheme): boolean {
  return scheme === "com.zyx.academy" || scheme === "com.zyx.academy.nightly";
}

export function resolveNativeAuthScheme(input: {
  runtime: "capacitor" | "tauri" | "web";
  userAgent?: string;
  hostname?: string;
}): NativeAuthScheme | null {
  if (input.runtime === "web") return null;
  const isNightly =
    /nightly/i.test(input.userAgent ?? "") ||
    (input.hostname ?? "").toLowerCase() === "staging.zyxacademy.com";

  if (input.runtime === "capacitor") {
    return isNightly ? "com.zyx.academy.nightly" : "com.zyx.academy";
  }
  return isNightly ? "zyxacademy-nightly" : "zyxacademy";
}

export function buildNativeAuthDeepLink(
  scheme: NativeAuthScheme,
  token: string,
  state: string,
  nextPath: string,
): string {
  const safeNext = getSafeRedirectPath(nextPath);
  const fragment = new URLSearchParams({
    token,
    state,
    next: safeNext,
  });
  return `${scheme}://auth/native-finish#${fragment.toString()}`;
}

export function parseNativeAuthDeepLink(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const scheme = normalizeNativeAuthScheme(parsed.protocol.replace(/:$/, ""));
  if (!scheme) return null;

  const normalizedRoute = `/${parsed.hostname}${parsed.pathname}`.replace(/\/+/g, "/");
  if (normalizedRoute !== "/auth/native-finish") {
    return null;
  }

  const fragmentParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const token = fragmentParams.get("token")?.trim();
  const state = normalizeNativeAuthState(fragmentParams.get("state"));
  if (!token || !state) return null;

  const safeNext = getSafeRedirectPath(fragmentParams.get("next") ?? undefined);
  const outFragment = new URLSearchParams({
    token,
    state,
    next: safeNext,
  });
  return `/auth/native-finish#${outFragment.toString()}`;
}
