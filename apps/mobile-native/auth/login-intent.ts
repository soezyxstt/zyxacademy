import { getSafeRedirectPath } from "../../../packages/native-session/auth-redirect";
import type { NativeAccountContext } from "../../../packages/native-session/context";
import { returnRoutes } from "./return-routes";

export type NativeAuthLocale = NativeAccountContext["locale"];
export type NativeAuthEntry = "sign-in" | "sign-up";
export type NativeLoginIntent = Readonly<{
  entry: NativeAuthEntry;
  locale: NativeAuthLocale;
  next?: string;
}>;

export function authEntryHref({ entry, locale, next }: NativeLoginIntent) {
  return {
    pathname: entry === "sign-up" ? "/sign-up" as const : "/sign-in" as const,
    params: next ? { locale, next } : { locale },
  };
}

type Area = keyof typeof returnRoutes;
type Destination = { href: string; pattern: string; area: Area };
type RouteNode = {
  href: unknown;
  contextKey: string;
  isGenerated: boolean;
  isInternal: boolean;
  children: readonly RouteNode[];
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
    return /^[\p{L}\p{N}._~-]+$/u.test(decoded) ? decoded : "";
  } catch {
    return "";
  }
}

function resolveDestination(raw: unknown): Destination | null {
  // The next value shares the SecureStore write with the verifier and the session.
  if (typeof raw !== "string" || raw.length > 1024 || !raw.startsWith("/") ||
    raw.startsWith("//") || /[\\\s\u0000-\u001f\u007f]/.test(raw)) return null;
  const href = getSafeRedirectPath(raw);
  if (href !== raw) return null;
  const pathname = href.split(/[?#]/, 1)[0];
  const parts = pathname.slice(1).split("/").map(readPathSegment);
  if (parts.some(part => !part)) return null;
  const canonicalPath = "/" + parts.map(part => encodeURIComponent(part)).join("/");
  const suffix = href.slice(pathname.length);
  if (canonicalPath === "/murid") return { href: `/dashboard${suffix}`, pattern: "/dashboard", area: "student" };
  const match = routePatterns.find(route => route.parts.length === parts.length &&
    route.parts.every((part, index) => part.startsWith("[") || part === parts[index]));
  return match ? { href: `${canonicalPath}${suffix}`, pattern: match.pattern, area: match.area } : null;
}

export function parseNativeLoginIntent(data: unknown): NativeLoginIntent | undefined {
  if (!data || typeof data !== "object" || !("entry" in data) || !("locale" in data)) return;
  const { entry, locale } = data;
  if ((entry !== "sign-in" && entry !== "sign-up") || (locale !== "id" && locale !== "en")) return;
  const next = "next" in data ? resolveDestination(data.next)?.href : undefined;
  return next ? { entry, locale, next } : { entry, locale };
}

function canOpen(area: Area, roles: NativeAccountContext["roles"]): boolean {
  switch (area) {
    case "public": return true;
    case "admin": return roles.includes("admin");
    case "tutor": return roles.includes("tutor") || roles.includes("admin");
    case "student": return roles.includes("murid");
  }
}

function hasNativeRoute(node: RouteNode | null, pattern: string): boolean {
  if (!node) return false;
  if (node.children.length) return node.children.some(child => hasNativeRoute(child, pattern));
  return !node.isGenerated && !node.isInternal && !/(?:^|\/)_layout\.[jt]sx?$/.test(node.contextKey) &&
    typeof node.href === "string" && node.href.replace(/\/\([^/]+\)(?=\/|$)/g, "") === pattern;
}

export function resolveNativeLoginReturn(
  next: string | undefined,
  account: Pick<NativeAccountContext, "dashboard" | "roles">,
  sitemap: RouteNode | null,
) {
  const destination = next ? resolveDestination(next) : resolveDestination(account.dashboard);
  const dashboard = hasNativeRoute(sitemap, account.dashboard) ? account.dashboard : null;
  if (!destination) return { status: "unavailable", dashboard } as const;
  if (!canOpen(destination.area, account.roles)) return { status: "denied", dashboard } as const;
  return hasNativeRoute(sitemap, destination.pattern)
    ? { status: "ready", href: destination.href } as const
    : { status: "unavailable", dashboard } as const;
}
