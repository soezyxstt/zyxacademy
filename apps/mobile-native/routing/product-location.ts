import { getSafeRedirectPath } from "../../../packages/native-session/auth-redirect";
import { websiteIntake } from "./public-website";

type RouteParameters = Readonly<Record<string, string | readonly string[] | undefined>>;

export function productNavigationHref(path: string, allocate: () => string) {
  const website = websiteIntake.capture(path, allocate);
  if (website) return { href: website, website: true };
  return getSafeRedirectPath(path) === path ? { href: path, website: false } : null;
}

export function academicRouteCanRead(href: string, focused: boolean, focusedOnce: boolean) {
  return focused || (focusedOnce && href.split(/[?#]/, 1)[0] === "/admin/courses");
}

export function productQueryUpdate(pattern: string, current: string, next: string) {
  const from = new URL(current, "https://zyx.invalid");
  const to = new URL(next, from);
  if (from.origin !== to.origin || from.pathname !== to.pathname) return null;
  const dynamicNames = new Set(Array.from(pattern.matchAll(/\[([^\]]+)\]/g), match => match[1]));
  const keys = new Set([...from.searchParams.keys(), ...to.searchParams.keys()]);
  const updates: [string, string | string[] | undefined][] = [];
  for (const key of keys) {
    if (dynamicNames.has(key) || key === "#") continue;
    const values = to.searchParams.getAll(key);
    const previous = from.searchParams.getAll(key);
    if (values.length === previous.length && values.every((value, index) => value === previous[index])) continue;
    updates.push([key, values.length > 1 ? values : values[0]]);
  }
  if (from.hash !== to.hash) updates.push(["#", to.hash ? to.hash.slice(1) : undefined]);
  return Object.fromEntries(updates);
}

// Rebuild the product URL from this stack entry's local parameters. A hidden
// screen must not start loading the URL of the next screen pushed above it.
export function productLocation(pattern: string, params: RouteParameters): string | null {
  const used = new Set<string>();
  const parts: string[] = [];
  for (const part of pattern.split("/")) {
    if (!part.startsWith("[")) { parts.push(part); continue; }
    const key = part.slice(1, -1);
    const value = params[key];
    if (typeof value !== "string" || !value || value === "." || value === ".." ||
      /[\\/\u0000-\u001f\u007f\ud800-\udfff]/u.test(value)) return null;
    used.add(key);
    parts.push(encodeURIComponent(value));
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "#" || used.has(key) || value === undefined) continue;
    for (const item of typeof value === "string" ? [value] : value) search.append(key, item);
  }
  const query = search.toString();
  const hash = params["#"];
  const fragment = typeof hash === "string" && hash ? "#" + encodeURIComponent(hash) : "";
  return parts.join("/") + (query ? "?" + query : "") + fragment;
}
