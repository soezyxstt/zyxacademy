import { NATIVE_BROWSER_SCHEME } from "../auth/browser-intent";

/** Keep the nested academic path encoded when Expo extracts an app link's query. */
export function academicIntentPath(input: string): string | null {
  const prefix = `${NATIVE_BROWSER_SCHEME}://`;
  const queryStart = input.indexOf("?");
  if (!input.startsWith(prefix) || queryStart < 0) return null;

  const route = input.slice(prefix.length, queryStart).replace(/^\/|\/$/g, "");
  if (route !== "academic" && route !== "internal/academic") return null;
  const query = input.slice(queryStart + 1);
  if (/[\s#\\]/u.test(query)) return null;
  try {
    decodeURIComponent(query);
  } catch {
    return null;
  }
  if (!new URLSearchParams(query).has("path")) return null;
  return `/${route}?${query}`;
}
