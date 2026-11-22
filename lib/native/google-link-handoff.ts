import { createHash, randomBytes } from "node:crypto";
import { and, eq, like, lt } from "drizzle-orm";
import { db } from "@/db";
import { verification } from "@/db/schema";

export const NATIVE_GOOGLE_LINK_TTL_SECONDS = 120;
const PREFIX = "native-google-link:";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ALLOWED_GOOGLE_OAUTH_ORIGIN = "https://accounts.google.com";

export type NativeGoogleLinkHandoffPayload = {
  googleUrl: string;
  setCookieHeader: string;
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

/**
 * Stores a short-lived, single-use handoff so a native app's system browser can
 * inherit the Better Auth OAuth state cookie created by the authenticated WebView
 * session without minting a Zyx session cookie in the external browser.
 */
export async function issueNativeGoogleLinkHandoff(
  payload: NativeGoogleLinkHandoffPayload,
): Promise<string> {
  if (!isAllowedGoogleOAuthUrl(payload.googleUrl)) {
    throw new Error("Invalid Google OAuth URL for native handoff");
  }

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
        setCookieHeader: payload.setCookieHeader,
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
    const setCookieHeader = "setCookieHeader" in parsed && typeof parsed.setCookieHeader === "string"
      ? parsed.setCookieHeader
      : "";
    if (!isAllowedGoogleOAuthUrl(googleUrl)) return null;
    return { googleUrl, setCookieHeader };
  } catch {
    return null;
  }
}
