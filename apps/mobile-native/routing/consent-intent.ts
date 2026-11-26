import { NATIVE_BROWSER_SCHEME } from "../auth/browser-intent";
import { NATIVE_STAGING_ORIGIN } from "../auth/session-api";
import { browserDestination } from "./browser-destination";

const route = "/mcp/authorize";
const inputs = [route, NATIVE_STAGING_ORIGIN + route, NATIVE_BROWSER_SCHEME + "://" + route.slice(1),
  NATIVE_BROWSER_SCHEME + "://" + route];

// Keep OAuth state and nested redirect URIs out of the router's query parser.
export function createConsentIntake(now: () => number = Date.now) {
  const pending = new Map<string, { url: string; expiresAt: number }>();

  function prune() {
    const time = now();
    for (const [id, value] of pending) if (value.expiresAt <= time) pending.delete(id);
  }

  function capture(path: string, allocateId: () => string): string | null {
    const base = path.split(/[?#]/, 1)[0];
    if (!inputs.includes(base)) return null;
    if (path.length > 32768 || path.includes("#")) return route;
    const params = new URLSearchParams(path.slice(base.length));
    const fields: Record<string, string | string[]> = Object.create(null);
    params.forEach((value, key) => {
      const previous = fields[key];
      if (previous === undefined) fields[key] = value;
      else if (typeof previous === "string") fields[key] = [previous, value];
    });
    const url = browserDestination("authorize", fields);
    if (!url || !params.has("client_id")) return route;

    prune();
    const oldest = pending.keys().next();
    if (pending.size >= 8 && !oldest.done) pending.delete(oldest.value);
    const id = allocateId();
    pending.set(id, { url, expiresAt: now() + 5 * 60_000 });
    return route + "?handoff=" + encodeURIComponent(id);
  }

  function resolve(id: unknown): string | null {
    prune();
    return typeof id === "string" ? pending.get(id)?.url ?? null : null;
  }

  return { capture, resolve };
}

export const consentIntake = createConsentIntake();
