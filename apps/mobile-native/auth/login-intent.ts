import { resolveRoleDashboardPath } from "../../../lib/auth/dashboard-entry";
import { getOAuthCallbackErrorKey, getSafeRedirectPath } from "../../../packages/native-session/auth-redirect";
import type { NativeAccountContext } from "../../../packages/native-session/context";
import { legacyLiveHostPattern, tutorLiveDestination } from "../routing/live-host-alias";
import { publicWebsiteUrl } from "../routing/public-website";
import { NATIVE_BROWSER_SCHEME } from "./browser-intent";
import { returnRoutes } from "./return-routes";
import { NATIVE_STAGING_ORIGIN } from "./session-api";

export type NativeAuthLocale = NativeAccountContext["locale"];
export type NativeAuthEntry = "sign-in" | "sign-up";
export type NativeLoginIntent = Readonly<{
  entry: NativeAuthEntry;
  locale: NativeAuthLocale;
  next?: string;
}>;

const maxReturnLength = 1024;

export function authEntryHref({ entry, locale, next }: NativeLoginIntent) {
  const destination = resolveDestination(next);
  return {
    pathname: entry === "sign-up" ? "/sign-up" as const : "/sign-in" as const,
    params: destination ? { locale, returnTo: encodeReturnTo(destination.href) } : { locale },
  };
}

// Expo Router can decode an href before reading its query parameters. Keep nested
// escapes, plus signs and URL delimiters in an alphabet that survives both steps.
function encodeReturnTo(href: string): string {
  return encodeURIComponent(href)
    .replace(/[.!~'()*]/g, char => "%" + char.charCodeAt(0).toString(16).toUpperCase())
    .replaceAll("%", ".");
}

export function readAuthReturnTo(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > maxReturnLength * 3 || !/^[A-Za-z0-9._-]+$/.test(value)) return;
  try {
    return resolveDestination(decodeURIComponent(value.replaceAll(".", "%")))?.href;
  } catch {
    return;
  }
}

const authEntryPaths = new Map<string, NativeAuthEntry>();
for (const entry of ["sign-in", "sign-up"] as const) {
  for (const prefix of ["", "/", NATIVE_STAGING_ORIGIN + "/", NATIVE_BROWSER_SCHEME + "://", NATIVE_BROWSER_SCHEME + ":///"]) {
    authEntryPaths.set(prefix + entry, entry);
  }
}

function singleParam(params: URLSearchParams, key: string): string | undefined {
  const values = params.getAll(key);
  return values.length === 1 ? values[0] : undefined;
}

export function rewriteNativeAuthEntry(path: string): string | null {
  const base = path.split(/[?#]/, 1)[0];
  const entry = authEntryPaths.get(base.replace(/\/$/, ""));
  if (!entry) return null;
  const route = "/" + entry;
  if (path.length > 8192 || path[base.length] !== "?") return route;

  const params = new URLSearchParams(path.slice(base.length + 1).split("#", 1)[0]);
  const locale = singleParam(params, "locale");
  const error = getOAuthCallbackErrorKey(singleParam(params, "error"));
  const next = params.has("returnTo")
    ? params.has("next") ? undefined : readAuthReturnTo(singleParam(params, "returnTo"))
    : resolveDestination(singleParam(params, "next"))?.href;
  const safe = new URLSearchParams();
  if (locale === "id" || locale === "en") safe.set("locale", locale);
  if (error) safe.set("error", error === "accessDenied" ? "access_denied" : error);
  if (next) safe.set("returnTo", encodeReturnTo(next));
  const query = safe.toString();
  return query ? route + "?" + query : route;
}

type Area = keyof typeof returnRoutes;
type Destination = { href: string; pattern: string; area: Area };
export type NativeRouteNode = {
  href: unknown;
  contextKey: string;
  isGenerated: boolean;
  isInternal: boolean;
  children: readonly NativeRouteNode[];
};

const routePatterns = (Object.keys(returnRoutes) as Area[]).flatMap(area =>
  returnRoutes[area].map(pattern => {
    const parts = pattern.slice(1).split("/");
    return { area, pattern, parts, specificity: parts.reduce((score, part) => score * 2 + Number(!part.startsWith("[")), 0) };
  }),
).sort((left, right) => right.specificity - left.specificity);

function readPathSegment(part: string): string {
  try {
    const decoded = decodeURIComponent(part);
    return /^[\p{L}\p{N}._~:-]+$/u.test(decoded) ? decoded : "";
  } catch {
    return "";
  }
}

function resolveDestination(raw: unknown): Destination | null {
  // The next value shares the SecureStore write with the verifier and the session.
  if (typeof raw !== "string" || raw.length > maxReturnLength || !raw.startsWith("/") ||
    raw.startsWith("//") || /[\\\s\u0000-\u001f\u007f]/.test(raw)) return null;
  if (publicWebsiteUrl(raw)) return { href: raw, pattern: "/website", area: "public" };
  const href = getSafeRedirectPath(raw);
  if (href !== raw) return null;
  const pathname = href.split(/[?#]/, 1)[0];
  const parts = pathname.slice(1).split("/").map(readPathSegment);
  if (parts.some(part => !part)) return null;
  const canonicalPath = "/" + parts.map(part => encodeURIComponent(part)).join("/");
  const suffix = href.slice(pathname.length);
  if (canonicalPath === "/mcp/connections" && suffix) return null;
  if (canonicalPath === "/murid") return { href: `/dashboard${suffix}`, pattern: "/dashboard", area: "student" };
  const match = routePatterns.find(route => route.parts.length === parts.length &&
    route.parts.every((part, index) => part.startsWith("[") || part === parts[index]));
  if (match?.pattern === legacyLiveHostPattern) {
    const target = tutorLiveDestination(parts[1]);
    return target ? { href: target, pattern: "/tutor/[courseId]/live", area: "tutor" } : null;
  }
  return match && match.area !== "public" ? { href: `${canonicalPath}${suffix}`, pattern: match.pattern, area: match.area } : null;
}

export function parseNativeLoginIntent(data: unknown): NativeLoginIntent | undefined {
  if (!data || typeof data !== "object" || !("entry" in data) || !("locale" in data)) return;
  const { entry, locale } = data;
  if ((entry !== "sign-in" && entry !== "sign-up") || (locale !== "id" && locale !== "en")) return;
  const next = "next" in data ? resolveDestination(data.next)?.href : undefined;
  return next ? { entry, locale, next } : { entry, locale };
}

function destinationForAccount(destination: Destination | null, account: Pick<NativeAccountContext, "roles">): Destination | null {
  if (destination?.pattern !== "/discussions") return destination;
  const dashboard = resolveRoleDashboardPath(account.roles);
  const pattern = `${dashboard}/discussions`;
  const area = dashboard === "/admin" ? "admin" : dashboard === "/tutor" ? "tutor" : "student";
  return { href: pattern + destination.href.slice("/discussions".length), pattern, area };
}

function canOpen(area: Area, roles: NativeAccountContext["roles"]): boolean {
  switch (area) {
    case "account": return roles.length > 0;
    case "public": return true;
    case "admin": return roles.includes("admin");
    case "tutor": return roles.includes("tutor");
    case "student": return roles.includes("murid");
  }
}

function hasNativeRoute(node: NativeRouteNode | null, pattern: string): boolean {
  if (!node) return false;
  if (node.children.length) return node.children.some(child => hasNativeRoute(child, pattern));
  return !node.isGenerated && !node.isInternal && !/(?:^|\/)_layout\.[jt]sx?$/.test(node.contextKey) &&
    typeof node.href === "string" && node.href.replace(/\/\([^/]+\)(?=\/|$)/g, "") === pattern;
}

export function resolveNativeProtectedDestination(
  href: string,
  account: Pick<NativeAccountContext, "roles">,
  sitemap?: NativeRouteNode | null,
) {
  const destination = destinationForAccount(resolveDestination(href), account);
  return destination && destination.area !== "public" && canOpen(destination.area, account.roles) &&
    (sitemap === undefined || hasNativeRoute(sitemap, destination.pattern)) ? destination : null;
}

export function resolveNativeLoginReturn(
  next: string | undefined,
  account: Pick<NativeAccountContext, "dashboard" | "roles">,
  sitemap: NativeRouteNode | null,
) {
  const home = resolveDestination(account.dashboard);
  const destination = next ? destinationForAccount(resolveDestination(next), account) : home;
  const dashboard = home && canOpen(home.area, account.roles) && hasNativeRoute(sitemap, home.pattern) ? home.href : null;
  if (!destination) return { status: "unavailable", dashboard } as const;
  if (!canOpen(destination.area, account.roles)) return { status: "denied", dashboard } as const;
  return hasNativeRoute(sitemap, destination.pattern)
    ? { status: "ready", href: destination.href } as const
    : { status: "unavailable", dashboard } as const;
}
