const publicPaths = new Set(["/", "/sign-in", "/sign-up", "/dashboard", "/admin", "/tutor"]);
const redactions = new Set(["[invalid-url]", "[off-origin]", "/[other-path]"]);

export function sanitizeAclPath(value, origin, fixturePaths = []) {
  if (typeof value !== "string") return null;
  if (redactions.has(value)) return value;
  let url;
  try { url = new URL(value, origin); } catch { return "[invalid-url]"; }
  if (url.origin !== origin) return "[off-origin]";
  const { pathname } = url;
  if (publicPaths.has(pathname) || fixturePaths.some((path) => new URL(path, origin).pathname === pathname)) return pathname;
  return "/[other-path]";
}

export function aclErrorClass(error) {
  if (!error) return undefined;
  const name = typeof error === "object" ? error.name : "";
  if (["AssertionError", "TimeoutError", "AbortError", "NetworkError", "TypeError"].includes(name)) return name;
  if (typeof error !== "string") return "Error";
  if (/original document returned HTTP \d{3}/i.test(error)) return "AssertionError";
  if (/timeout|timed out/i.test(error)) return "TimeoutError";
  if (/net::ERR|ECONNREFUSED|ECONNRESET/i.test(error)) return "NetworkError";
  return "Error";
}

export function sanitizeAclCase(entry, origin, fixtures) {
  const paths = [fixtures.requestedPath, fixtures.fixturePath].filter(Boolean);
  const path = (value) => sanitizeAclPath(value, origin, paths);
  const navigation = (items = []) => items.map((item) => ({ path: path(item.path), status: item.status,
    ...(Object.hasOwn(item, "location") ? { location: path(item.location) } : {}) }));
  function attempt(item) {
    const errorClass = aclErrorClass(item.errorClass ? { name: item.errorClass } : item.error);
    return { status: item.status, classification: item.classification, landedPath: path(item.landedPath),
      navigation: navigation(item.navigation), ...(errorClass ? { errorClass } : {}) };
  }
  const { error: _rawError, ...rest } = entry;
  return { ...rest, ...attempt(entry),
    requestedPath: path(fixtures.requestedPath), fixturePath: path(fixtures.fixturePath),
    ...(entry.previousAttempts ? { previousAttempts: entry.previousAttempts.map(attempt) } : {}) };
}
