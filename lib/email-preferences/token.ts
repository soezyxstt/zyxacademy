import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveAuthSecret } from "@/lib/auth-secret";
import {
  isEmailNotificationCategory,
  type EmailNotificationCategory,
} from "@/lib/email-preferences/contracts";

const TOKEN_VERSION = 1;
const TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

export interface EmailUnsubscribeTokenPayload {
  version: 1;
  userId: string;
  category: EmailNotificationCategory;
  expiresAt: number;
}

interface CreateEmailUnsubscribeTokenOptions {
  userId: string;
  category: EmailNotificationCategory;
  nowMs?: number;
  secret?: string;
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload, "utf8").digest("base64url");
}

export function createEmailUnsubscribeToken({
  userId,
  category,
  nowMs = Date.now(),
  secret = resolveAuthSecret(),
}: CreateEmailUnsubscribeTokenOptions): string {
  if (!userId) throw new Error("EMAIL_UNSUBSCRIBE_USER_REQUIRED");

  const payload: EmailUnsubscribeTokenPayload = {
    version: TOKEN_VERSION,
    userId,
    category,
    expiresAt: Math.floor(nowMs / 1000) + TOKEN_LIFETIME_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifyEmailUnsubscribeToken(
  token: string,
  options: { nowMs?: number; secret?: string } = {},
): EmailUnsubscribeTokenPayload {
  const { nowMs = Date.now(), secret = resolveAuthSecret() } = options;
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) {
    throw new Error("INVALID_EMAIL_UNSUBSCRIBE_TOKEN");
  }

  const expected = Buffer.from(sign(encodedPayload, secret), "utf8");
  const actual = Buffer.from(encodedSignature, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("INVALID_EMAIL_UNSUBSCRIBE_TOKEN");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("INVALID_EMAIL_UNSUBSCRIBE_TOKEN");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== TOKEN_VERSION ||
    typeof (parsed as { userId?: unknown }).userId !== "string" ||
    !(parsed as { userId: string }).userId ||
    !isEmailNotificationCategory((parsed as { category?: unknown }).category) ||
    typeof (parsed as { expiresAt?: unknown }).expiresAt !== "number"
  ) {
    throw new Error("INVALID_EMAIL_UNSUBSCRIBE_TOKEN");
  }

  const payload = parsed as EmailUnsubscribeTokenPayload;
  if (payload.expiresAt < Math.floor(nowMs / 1000)) {
    throw new Error("EXPIRED_EMAIL_UNSUBSCRIBE_TOKEN");
  }
  return payload;
}
