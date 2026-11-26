export const NATIVE_STAGING_ORIGIN = "https://staging.zyxacademy.com";
const COOKIE_NAME = "__Secure-better-auth.session_token";
const SESSION_PATH = "/api/auth/get-session?disableCookieCache=true";
const REQUEST_TIMEOUT_MS = 15_000;

export type SessionHeaders = Pick<Headers, "get"> & { getSetCookie?: () => string[] };
export type SessionIdentity = Readonly<{ accountId: string; sessionId: string; expiresAt: number }>;

export function isSignedSessionCookie(cookie: unknown): cookie is string {
  if (typeof cookie !== "string" || !cookie.startsWith(`${COOKIE_NAME}=`)) return false;
  const value = cookie.slice(COOKIE_NAME.length + 1);
  if (!/^[A-Za-z0-9._%-]{1,400}$/.test(value)) return false;
  try {
    return /^[A-Za-z0-9_-]{1,256}\.[A-Za-z0-9+/]{43}=$/.test(decodeURIComponent(value));
  } catch {
    return false;
  }
}

export function readSignedSessionCookie(headers: SessionHeaders): string | null {
  const separate = headers.getSetCookie?.();
  const values = separate?.length ? separate : [headers.get("set-cookie") ?? ""];
  // Expo may combine the headers. The comma in Expires is followed by a date, not a cookie name.
  const matches = values.flatMap(value => value.split(/,\s*(?=[^\s=,;]+=)/)).flatMap(value => {
    const [cookie, ...attributes] = value.trim().split(/;\s*/);
    const flags = new Set(attributes.map(attribute => attribute.toLowerCase()));
    return isSignedSessionCookie(cookie) && flags.has("secure") && flags.has("httponly") && flags.has("path=/")
      ? [cookie]
      : [];
  });
  return matches.length === 1 ? matches[0] : null;
}

export function readIdentity(value: unknown): SessionIdentity | null {
  if (typeof value !== "object" || !value || !("user" in value) || !("session" in value)) return null;
  const { user, session } = value;
  if (typeof user !== "object" || !user || !("id" in user) || typeof user.id !== "string" || !user.id.trim()
    || typeof session !== "object" || !session || !("id" in session) || typeof session.id !== "string" || !session.id.trim()
    || !("userId" in session) || user.id !== session.userId
    || !("expiresAt" in session) || typeof session.expiresAt !== "string") return null;
  const expiresAt = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAt)) return null;
  return { accountId: user.id, sessionId: session.id, expiresAt };
}

type SessionFetcher = (url: string, init: RequestInit) => Promise<Pick<Response,
  "ok" | "url" | "type" | "redirected" | "status" | "json" | "body"
>>;

export function createNativeSessionApi(origin: string, fetcher: SessionFetcher) {
  if (origin !== NATIVE_STAGING_ORIGIN) throw new Error("Origin sesi Expo tidak didukung.");

  async function request(path: string, method: "GET" | "POST", cookie: string, signal?: AbortSignal) {
    if (!isSignedSessionCookie(cookie) || signal?.aborted) throw new Error("Sesi belum tersedia.");
    const url = `${origin}${path}`;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetcher(url, {
        method,
        credentials: "omit",
        redirect: "manual",
        signal: controller.signal,
        headers: { Cookie: cookie, Origin: origin, "Cache-Control": "no-store, no-cache" },
      });
      if (controller.signal.aborted || response.redirected || response.type === "opaqueredirect"
        || (response.url && response.url !== url) || (response.status >= 300 && response.status < 400)) {
        void response.body?.cancel().catch(() => {});
        throw new Error("Respons sesi tidak valid.");
      }
      if (response.status === 401) {
        void response.body?.cancel().catch(() => {});
        return null;
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new Error("Sesi tidak dapat diperiksa.");
      }
      const value: unknown = await response.json();
      if (controller.signal.aborted) throw new Error("Permintaan sesi dibatalkan.");
      return value;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  }

  async function read(cookie: string, signal?: AbortSignal, disableRefresh = false): Promise<SessionIdentity | null> {
    const path = disableRefresh ? `${SESSION_PATH}&disableRefresh=true` : SESSION_PATH;
    const result: unknown = await request(path, "GET", cookie, signal);
    if (result === null) return null;
    const identity = readIdentity(result);
    if (!identity) throw new Error("Identitas sesi tidak valid.");
    return identity;
  }

  return {
    read,
    async revoke(cookie: string) {
      await request("/api/auth/sign-out", "POST", cookie);
      // Better Auth can return success even if deleting the database session failed.
      if (await read(cookie, undefined, true)) throw new Error("Sesi masih aktif.");
    },
  };
}
