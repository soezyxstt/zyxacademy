/**
 * lib/native/deep-links.ts
 *
 * Parses and routes Capacitor App Links (Android), Universal Links (iOS),
 * and custom-scheme deep links for auth callbacks, course materials,
 * discussions, and schedules, including cold-start `App.getLaunchUrl()`.
 */

import { DEFAULT_AUTH_CALLBACK_PATH, getSafeRedirectPath } from "@/lib/auth-redirect";
import {
  isMobileAuthScheme,
  normalizeNativeAuthScheme,
  parseNativeAuthDeepLink,
} from "./auth-handoff";
import { getCapacitor, type CapacitorPluginListenerHandle } from "./runtime";

export const ALLOWED_APP_LINK_HOSTS = [
  "www.zyxacademy.com",
  "zyxacademy.com",
  "zyx.academy",
  "staging.zyxacademy.com",
] as const;

const ALLOWED_HOST_SET = new Set<string>(ALLOWED_APP_LINK_HOSTS);

export type ParsedNativeDeepLink =
  | { kind: "auth"; path: string }
  | { kind: "app"; path: string };

/**
 * Allowlist of direct app deep-link routes for materials/courses, discussions, and schedules.
 */
export function isSupportedAppDeepLinkPath(pathname: string): boolean {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.startsWith("/\\")) {
    return false;
  }
  const normalized = pathname.replace(/\/+$/, "") || "/";

  // Materials and courses (includes /courses/[id]/material/[materialId], /courses/tutorial-pka/jadwal, etc.)
  if (normalized === "/courses" || normalized.startsWith("/courses/")) {
    return true;
  }

  // Discussions (student, tutor, admin, and role-dispatch /discussions)
  if (
    normalized === "/discussions" ||
    normalized.startsWith("/discussions/") ||
    normalized === "/dashboard/discussions" ||
    normalized.startsWith("/dashboard/discussions/") ||
    normalized === "/tutor/discussions" ||
    normalized.startsWith("/tutor/discussions/") ||
    normalized === "/admin/discussions" ||
    normalized.startsWith("/admin/discussions/") ||
    /^\/tutor\/[^/]+\/discussions(?:\/.*)?$/.test(normalized)
  ) {
    return true;
  }

  // Schedules (student calendar, dashboard schedule, tutor schedule, admin schedules, live meeting links)
  if (
    normalized === "/calendar" ||
    normalized.startsWith("/calendar/") ||
    normalized === "/dashboard/schedule" ||
    normalized.startsWith("/dashboard/schedule/") ||
    normalized === "/tutor/schedule" ||
    normalized.startsWith("/tutor/schedule/") ||
    normalized === "/admin/schedules" ||
    normalized.startsWith("/admin/schedules/") ||
    normalized.startsWith("/meet/")
  ) {
    return true;
  }

  return false;
}

function validateSafeAppPath(rawPath: string): string | null {
  if (!rawPath || !rawPath.startsWith("/")) return null;
  if (rawPath.startsWith("//") || rawPath.startsWith("/\\") || /[\u0000-\u001f\u007f]/.test(rawPath)) {
    return null;
  }
  let resolved: URL;
  try {
    resolved = new URL(rawPath, "https://zyx-deeplink.invalid");
  } catch {
    return null;
  }
  if (resolved.origin !== "https://zyx-deeplink.invalid") {
    return null;
  }
  if (!isSupportedAppDeepLinkPath(resolved.pathname)) {
    return null;
  }
  const candidate = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  const safe = getSafeRedirectPath(candidate);
  // Ensure getSafeRedirectPath did not reject and fall back to /dashboard
  if (safe === DEFAULT_AUTH_CALLBACK_PATH && resolved.pathname !== DEFAULT_AUTH_CALLBACK_PATH) {
    return null;
  }
  return safe;
}

/**
 * Parses an incoming native URL (OAuth custom scheme, app custom scheme,
 * Android App Link, or iOS Universal Link) into a safe internal route.
 * Returns null for unrecognized hosts, unsupported paths, or unsafe redirect targets.
 */
export function parseNativeDeepLink(rawUrl: string): ParsedNativeDeepLink | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // 1. Auth handoff callback always takes priority.
  const authPath = parseNativeAuthDeepLink(trimmed);
  if (authPath) {
    return { kind: "auth", path: authPath };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  // 2. HTTPS Android App Links / iOS Universal Links.
  if (parsed.protocol === "https:") {
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_HOST_SET.has(host)) return null;
    const safePath = validateSafeAppPath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    return safePath ? { kind: "app", path: safePath } : null;
  }

  // 3. Mobile custom URL schemes (com.zyx.academy://courses/..., com.zyx.academy.nightly://calendar, etc.).
  const scheme = normalizeNativeAuthScheme(parsed.protocol.replace(/:$/, ""));
  if (scheme && isMobileAuthScheme(scheme)) {
    const combinedPathname = `/${parsed.hostname}${parsed.pathname}`.replace(/\/+/g, "/");
    const safePath = validateSafeAppPath(`${combinedPathname}${parsed.search}${parsed.hash}`);
    return safePath ? { kind: "app", path: safePath } : null;
  }

  return null;
}

/**
 * Computes the navigation target for an app deep link.
 * If the WebView is currently on /sign-in or /sign-up, preserves the deep link
 * in `?next=...` so authentication immediately returns the user to the target.
 */
export function resolveDeepLinkNavigationPath(
  targetPath: string,
  currentPathname?: string,
): string {
  const safeTarget = getSafeRedirectPath(targetPath);
  const current = (currentPathname ?? "").trim();
  if (current === "/sign-in" || current.startsWith("/sign-in/") || current === "/sign-up" || current.startsWith("/sign-up/")) {
    const query = new URLSearchParams({ next: safeTarget });
    return `/sign-in?${query.toString()}`;
  }
  return safeTarget;
}

export interface DeepLinkDedupeTracker {
  shouldHandle: (rawUrl: string, currentPath: string, now?: number) => ParsedNativeDeepLink | null;
}

export function createDeepLinkDedupeTracker(dedupeWindowMs = 3_000): DeepLinkDedupeTracker {
  let lastRawUrl = "";
  let lastHandledAt = 0;

  return {
    shouldHandle(rawUrl: string, currentPath: string, now = Date.now()): ParsedNativeDeepLink | null {
      const parsed = parseNativeDeepLink(rawUrl);
      if (!parsed) return null;

      // Avoid duplicate handling when both getLaunchUrl() and appUrlOpen emit the same URL.
      if (rawUrl === lastRawUrl && now - lastHandledAt < dedupeWindowMs) {
        return null;
      }

      // Avoid reload loops if the WebView is already on the exact target app path.
      if (parsed.kind === "app" && currentPath === parsed.path) {
        lastRawUrl = rawUrl;
        lastHandledAt = now;
        return null;
      }

      lastRawUrl = rawUrl;
      lastHandledAt = now;
      return parsed;
    },
  };
}

const HANDLED_LAUNCH_URL_STORAGE_KEY = "zyx:native-handled-launch-url";
let handledColdStartLaunchUrl: string | null = null;

function readHandledLaunchUrl(): string | null {
  if (handledColdStartLaunchUrl) return handledColdStartLaunchUrl;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage?.getItem(HANDLED_LAUNCH_URL_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function markLaunchUrlHandled(rawUrl: string): void {
  handledColdStartLaunchUrl = rawUrl;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(HANDLED_LAUNCH_URL_STORAGE_KEY, rawUrl);
  } catch {
    // Ignore storage access errors in restricted WebViews.
  }
}

export function resetHandledLaunchUrlForTest(): void {
  handledColdStartLaunchUrl = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.removeItem(HANDLED_LAUNCH_URL_STORAGE_KEY);
  } catch {
    // Ignore storage access errors.
  }
}

export async function subscribeNativeDeepLinks(handlers: {
  onAuthFinish: (path: string) => void;
  onAppRoute: (path: string) => void;
}): Promise<() => void> {
  const cap = getCapacitor();
  const appPlugin = cap?.Plugins?.App;
  if (!appPlugin?.addListener) return () => {};

  const tracker = createDeepLinkDedupeTracker();
  let handle: CapacitorPluginListenerHandle | null = null;
  let disposed = false;

  const dispatchUrl = (rawUrl: string | undefined | null) => {
    if (!rawUrl || disposed) return;
    const currentPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : "";
    const parsed = tracker.shouldHandle(rawUrl, currentPath);
    if (!parsed) return;

    if (parsed.kind === "auth") {
      void cap?.Plugins?.Browser?.close?.().catch(() => {});
      handlers.onAuthFinish(parsed.path);
      return;
    }

    if (/^com\.zyx\.academy(?:\.nightly)?:/i.test(rawUrl.trim())) {
      void cap?.Plugins?.Browser?.close?.().catch(() => {});
    }

    const currentPathname = typeof window !== "undefined" ? window.location.pathname : "";
    handlers.onAppRoute(resolveDeepLinkNavigationPath(parsed.path, currentPathname));
  };

  try {
    handle = await appPlugin.addListener("appUrlOpen", (event) => {
      dispatchUrl(event?.url);
    });

    if (disposed && handle) {
      void handle.remove().catch(() => {});
      return () => {};
    }

    if (typeof appPlugin.getLaunchUrl === "function") {
      const launch = await appPlugin.getLaunchUrl().catch(() => null);
      if (!disposed && launch?.url && readHandledLaunchUrl() !== launch.url) {
        markLaunchUrlHandled(launch.url);
        dispatchUrl(launch.url);
      }
    }
  } catch {
    return () => {};
  }

  return () => {
    disposed = true;
    if (handle) {
      void handle.remove().catch(() => {});
      handle = null;
    }
  };
}
