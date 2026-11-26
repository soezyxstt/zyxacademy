type RouteParameters = Readonly<Record<string, string | readonly string[] | undefined>>;

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
