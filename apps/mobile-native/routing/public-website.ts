import { stripPublicLocalePrefix } from "../../../lib/public-locale-routes";
import { NATIVE_BROWSER_SCHEME } from "../auth/browser-intent";
import { NATIVE_STAGING_ORIGIN } from "../auth/session-api";

// A bare native root launches the app. An explicit HTTPS home or language root opens the website.
const websitePaths = new Set([
  "/about", "/blog", "/demo", "/download", "/forms-playground", "/plans",
  "/privacy", "/tautan", "/terms", "/testimonial", "/unsubscribe",
]);

export function publicWebsiteUrl(input: string): string | null {
  if (!input || input.length > 16384 || /[\\\u0000-\u001f\u007f\ud800-\udfff]/u.test(input)) return null;
  let path = input;
  if (input.startsWith(NATIVE_BROWSER_SCHEME + "://")) {
    const rest = input.slice(NATIVE_BROWSER_SCHEME.length + 3);
    path = rest.startsWith("/") ? rest : "/" + rest;
  } else if (input.startsWith(NATIVE_STAGING_ORIGIN + "/")) {
    path = input.slice(NATIVE_STAGING_ORIGIN.length);
  }
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  const rawPath = path.split(/[?#]/, 1)[0];
  if (rawPath.includes("//")) return null;
  try {
    if (rawPath.split("/").some(part => {
      const decoded = decodeURIComponent(part);
      return decoded === "." || decoded === ".." || /[\\/\u0000-\u001f\u007f]/u.test(decoded);
    })) return null;
  } catch {
    return null;
  }
  const pathname = rawPath.replace(/\/$/, "") || "/";
  const explicitWebHome = pathname === "/" && input.startsWith(NATIVE_STAGING_ORIGIN + "/");
  if (!explicitWebHome && !websitePaths.has(pathname) && !/^\/(blog|demo|forms|f|meet)\/[^/]+$/.test(pathname) &&
    !stripPublicLocalePrefix(pathname)) return null;
  return NATIVE_STAGING_ORIGIN + path;
}

// Universal and scheme links can carry single-use email or form query values.
// Keep the original URL in memory, outside native stack params and persisted history.
export function createWebsiteIntake(now: () => number = Date.now) {
  const links = new Map<string, { url: string; expires: number }>();
  function prune() {
    for (const [key, link] of links) if (link.expires <= now()) links.delete(key);
  }
  function capture(input: string, allocate: () => string): string | null;
  function capture(input: string, allocate: () => Promise<string>): Promise<string> | null;
  function capture(input: string, allocate: () => string | Promise<string>): string | Promise<string> | null {
    const url = publicWebsiteUrl(input);
    if (!url) return null;
    const retain = (key: string) => {
      prune();
      const oldest = links.keys().next();
      if (links.size >= 8 && !oldest.done) links.delete(oldest.value);
      links.set(key, { url, expires: now() + 300_000 });
      return "/website?link=" + encodeURIComponent(key);
    };
    try {
      const key = allocate();
      return typeof key === "string" ? retain(key) : key.then(retain, () => "/website");
    } catch {
      return "/website";
    }
  }
  return {
    capture,
    resolve(key: unknown) {
      prune();
      return typeof key === "string" ? links.get(key)?.url ?? null : null;
    },
    release(key: unknown) {
      if (typeof key === "string") links.delete(key);
    },
  };
}

export const websiteIntake = createWebsiteIntake();
