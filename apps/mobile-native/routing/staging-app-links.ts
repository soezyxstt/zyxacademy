import policy from "../../../packages/native-session/expo-staging-app-links.json";

const segmentPattern = new RegExp(`^${policy.segmentPattern}$`);
const routes = Object.entries(policy.routes).map(([pattern, query]) => {
  const parts = pattern.slice(1).split("/");
  const specificity = parts.reduce((count, part) => count + Number(!part.startsWith("[")), 0);
  return { parts, specificity, query };
}).sort((left, right) => right.specificity - left.specificity);
const maxHref = 1024;

function matchPath(pathname: string) {
  const parts = pathname.slice(1).split("/").map(decodeURIComponent);
  if (parts.some(part => !segmentPattern.test(part) || part === "." || part === "..")) return null;
  const route = routes.find(({ parts: expected }) => expected.length === parts.length &&
    expected.every((part, index) => part.startsWith("[") || parts[index] === part));
  return route ? { parts, route } : null;
}

const stagingHost = new URL(policy.origin).hostname;

export function isRejectedExpoStagingAppLink(raw: string): boolean {
  if (!/^https?:\/\//i.test(raw)) return false;
  try {
    const url = new URL(raw);
    return url.hostname === stagingHost || matchPath(url.pathname) !== null;
  } catch {
    return true;
  }
}

export function readExpoStagingAppLink(raw: string): string | null {
  const prefix = policy.origin + "/";
  if (!raw.startsWith(prefix) || raw.length > policy.origin.length + maxHref || /[\\\s\u0000-\u001f\u007f]/.test(raw)) return null;
  const relative = raw.slice(policy.origin.length);
  const rawPath = relative.split(/[?#]/, 1)[0];
  try {
    const url = new URL(raw);
    if (url.origin !== policy.origin || url.pathname !== rawPath) return null;
    const match = matchPath(rawPath);
    if (!match) return null;
    const { parts, route } = match;
    const params = new URLSearchParams();
    for (const key of route.query) {
      const values = url.searchParams.getAll(key);
      if (values.length === 1 && /^[\p{L}\p{N} ._~:@+-]{1,200}$/u.test(values[0])) params.set(key, values[0]);
    }
    const query = params.toString();
    const target = "/" + parts.map(part => encodeURIComponent(part)).join("/") + (query ? "?" + query : "");
    return target.length <= maxHref ? target : null;
  } catch {
    return null;
  }
}
