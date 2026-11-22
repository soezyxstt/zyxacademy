import { createHash, randomBytes } from "node:crypto";
import { parseSetCookieHeader } from "better-auth/cookies";
import { and, eq, like, lt } from "drizzle-orm";
import { db } from "@/db";
import { verification } from "@/db/schema";

export const NATIVE_GOOGLE_LINK_TTL_SECONDS = 120;
const PREFIX = "native-google-link:";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ALLOWED_GOOGLE_OAUTH_ORIGIN = "https://accounts.google.com";
const ALLOWED_OAUTH_STATE_COOKIE_BASES = new Set([
  "better-auth.oauth_state",
  "better-auth.state",
]);

export type NativeGoogleLinkHandoffPayload = {
  googleUrl: string;
  setCookies: string[];
};

function handoffKey(token: string): string | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  return `${PREFIX}${createHash("sha256").update(token).digest("hex")}`;
}

function isAllowedGoogleOAuthUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.origin === ALLOWED_GOOGLE_OAUTH_ORIGIN && parsed.pathname.startsWith("/o/oauth2/");
  } catch {
    return false;
  }
}

export function isAllowedOAuthStateCookieName(name: string): boolean {
  const normalized = name.trim().replace(/^__(?:Secure|Host)-/, "");
  return ALLOWED_OAUTH_STATE_COOKIE_BASES.has(normalized);
}

/**
 * Extracts individual Set-Cookie header values from a Headers object while
 * retaining only Better Auth OAuth state cookies so session cookies emitted by
 * session refresh middleware can never cross into the external system browser.
 */
export function extractOAuthStateSetCookies(headers: Headers): string[] {
  const rawList = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [];
  const fallback = rawList.length === 0 ? headers.get("set-cookie") : null;
  const candidates = rawList.length > 0 ? rawList : fallback ? [fallback] : [];
  return filterOAuthStateSetCookies(candidates);
}

export function filterOAuthStateSetCookies(rawHeaders: string[]): string[] {
  const allowed: string[] = [];
  for (const header of rawHeaders) {
    if (!header) continue;
    const parsed = parseSetCookieHeader(header);
    const matchingNames = [...parsed.keys()].filter(isAllowedOAuthStateCookieName);
    if (matchingNames.length === 0) continue;
    if (matchingNames.length === parsed.size) {
      allowed.push(header);
      continue;
    }
    // If a fallback comma-joined header mixed allowed and disallowed cookies,
    // reconstruct only the allowlisted OAuth state cookies.
    for (const name of matchingNames) {
      const attrs = parsed.get(name);
      if (!attrs) continue;
      const parts = [`${name}=${attrs.value}`];
      if (attrs.path) parts.push(`Path=${attrs.path}`);
      if (typeof attrs["max-age"] === "number") parts.push(`Max-Age=${attrs["max-age"]}`);
      if (attrs.expires) parts.push(`Expires=${attrs.expires.toUTCString()}`);
      if (attrs.domain) parts.push(`Domain=${attrs.domain}`);
      if (attrs.samesite) parts.push(`SameSite=${attrs.samesite}`);
      if (attrs.httponly) parts.push("HttpOnly");
      if (attrs.secure) parts.push("Secure");
      allowed.push(parts.join("; "));
    }
  }
  return allowed;
}

/**
 * Stores a short-lived, single-use handoff so a native app's system browser can
 * inherit only the Better Auth OAuth state cookie created by the authenticated
 * WebView session without minting a Zyx session cookie in the external browser.
 */
export async function issueNativeGoogleLinkHandoff(
  payload: NativeGoogleLinkHandoffPayload,
): Promise<string> {
  if (!isAllowedGoogleOAuthUrl(payload.googleUrl)) {
    throw new Error("Invalid Google OAuth URL for native handoff");
  }

  const filteredCookies = filterOAuthStateSetCookies(payload.setCookies);
  const token = randomBytes(32).toString("base64url");
  const key = handoffKey(token)!;
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.delete(verification).where(and(
      like(verification.id, `${PREFIX}%`),
      lt(verification.expiresAt, now),
    ));
    await tx.insert(verification).values({
      id: key,
      identifier: key,
      value: JSON.stringify({
        googleUrl: payload.googleUrl,
        setCookies: filteredCookies,
      }),
      expiresAt: new Date(now.getTime() + NATIVE_GOOGLE_LINK_TTL_SECONDS * 1000),
      createdAt: now,
      updatedAt: now,
    });
  });

  return token;
}

/** Atomically consumes a native Google link handoff token at most once. */
export async function consumeNativeGoogleLinkHandoff(
  token: string,
): Promise<NativeGoogleLinkHandoffPayload | null> {
  const key = handoffKey(token);
  if (!key) return null;

  const [record] = await db
    .delete(verification)
    .where(eq(verification.id, key))
    .returning({ value: verification.value, expiresAt: verification.expiresAt });

  if (!record || record.expiresAt.getTime() <= Date.now()) return null;

  try {
    const parsed: unknown = JSON.parse(record.value);
    if (!parsed || typeof parsed !== "object") return null;
    const googleUrl = "googleUrl" in parsed && typeof parsed.googleUrl === "string" ? parsed.googleUrl : "";
    const rawCookies = "setCookies" in parsed && Array.isArray(parsed.setCookies)
      ? parsed.setCookies.filter((item): item is string => typeof item === "string")
      : [];
    if (!isAllowedGoogleOAuthUrl(googleUrl)) return null;
    return {
      googleUrl,
      setCookies: filterOAuthStateSetCookies(rawCookies),
    };
  } catch {
    return null;
  }
}
