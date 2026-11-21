/**
 * lib/native/auth-handoff.ts
 *
 * Pure allowlist and URL builders/parsers for Chrome Custom Tabs (Android),
 * Safari (iOS), and system browser (Desktop Tauri) OAuth handoff.
 */

import { getSafeRedirectPath } from "@/lib/auth-redirect";

export const ALLOWED_NATIVE_AUTH_SCHEMES = [
  "com.zyx.academy",
  "com.zyx.academy.nightly",
  "zyxacademy",
  "zyxacademy-nightly",
] as const;

export type NativeAuthScheme = (typeof ALLOWED_NATIVE_AUTH_SCHEMES)[number];

const ALLOWED_SCHEME_SET = new Set<string>(ALLOWED_NATIVE_AUTH_SCHEMES);

export function isAllowedNativeAuthScheme(value: string | null | undefined): value is NativeAuthScheme {
  if (!value) return false;
  return ALLOWED_SCHEME_SET.has(value.trim().toLowerCase());
}

export function normalizeNativeAuthScheme(value: string | null | undefined): NativeAuthScheme | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return isAllowedNativeAuthScheme(trimmed) ? trimmed : null;
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
  nextPath: string,
): string {
  const safeNext = getSafeRedirectPath(nextPath);
  const params = new URLSearchParams({
    token,
    next: safeNext,
  });
  return `${scheme}://auth/native-finish?${params.toString()}`;
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

  const token = parsed.searchParams.get("token")?.trim();
  if (!token) return null;

  const safeNext = getSafeRedirectPath(parsed.searchParams.get("next") ?? undefined);
  const params = new URLSearchParams({
    token,
    next: safeNext,
  });
  return `/auth/native-finish?${params.toString()}`;
}
