import { academicRoutes } from "./routes";

/** Matches only a local, owned web pathname. Static segments take priority. */
export function matchAcademicRoute(href: string) {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return null;
  const [pathname, search = ""] = href.split(/\?(.*)/s);
  const path = pathname.replace(/\/$/, "");
  const parts = path.split("/");
  if (path.includes("#")) return null;
  try {
    for (const [pattern, feature] of academicRoutes) {
      const tokens = pattern.split("/");
      if (tokens.length !== parts.length) continue;
      const params: Record<string, string> = {};
      const matches = tokens.every((token, index) => {
        if (!token.startsWith("[")) return token === parts[index];
        const value = decodeURIComponent(parts[index]);
        if (!value || value === "." || value === ".." || /[/\\\u0000-\u001f]/u.test(value)) return false;
        params[token.slice(1, -1)] = value;
        return true;
      });
      if (matches) return { feature, pattern, path, params, query: Object.fromEntries(new URLSearchParams(search)) };
    }
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
  }
  return null;
}
