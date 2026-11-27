import { academicIntentPath } from "./academic-intent";
import { NATIVE_BROWSER_SCHEME, rewriteNativeBrowserIntent } from "../auth/browser-intent";
import { rewriteNativeAuthEntry } from "../auth/login-intent";
import { NATIVE_STAGING_ORIGIN } from "../auth/session-api";
import { websiteIntake } from "./public-website";
import { isRejectedExpoStagingAppLink, readExpoStagingAppLink } from "./staging-app-links";
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

  function capture(path: string, allocateId: () => string): string | null;
  function capture(path: string, allocateId: () => Promise<string>): string | Promise<string> | null;
  function capture(path: string, allocateId: () => string | Promise<string>): string | Promise<string> | null {
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

    const retain = (id: string) => {
      prune();
      const oldest = pending.keys().next();
      if (pending.size >= 8 && !oldest.done) pending.delete(oldest.value);
      pending.set(id, { url, expiresAt: now() + 5 * 60_000 });
      return route + "?handoff=" + encodeURIComponent(id);
    };
    try {
      const id = allocateId();
      return typeof id === "string" ? retain(id) : id.then(retain, () => route);
    } catch {
      return route;
    }
  }

  function resolve(id: unknown): string | null {
    prune();
    return typeof id === "string" ? pending.get(id)?.url ?? null : null;
  }

  return { capture, resolve };
}

export const consentIntake = createConsentIntake();

export function createNativeIntentRedirect(allocateConsentId: () => Promise<string>) {
  return ({ path }: { path: string; initial: boolean }) =>
    readExpoStagingAppLink(path) ?? consentIntake.capture(path, allocateConsentId) ?? rewriteNativeAuthEntry(path) ?? academicIntentPath(path) ??
      websiteIntake.capture(path, allocateConsentId) ?? (isRejectedExpoStagingAppLink(path) ? "/" : rewriteNativeBrowserIntent(path));
}
