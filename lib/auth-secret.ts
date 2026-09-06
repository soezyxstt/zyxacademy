import { createHash } from "node:crypto";

const STRETCH_SALT = "zyx-edu:better-auth:secret-stretch:v1";

/**
 * Material passed to Better Auth as `secret`.
 *
 * If `BETTER_AUTH_SECRET` is already long (≥32 chars), it is used as-is so
 * production can use `openssl rand -base64 32` directly.
 *
 * Shorter values are stretched with SHA-256 so local `.env` files with simple
 * passphrases still satisfy Better Auth’s length/entropy checks. Prefer a
 * random 32+ character secret in deployed environments.
 */
export function resolveAuthSecret(): string {
  const raw = process.env.BETTER_AUTH_SECRET;
  if (raw == null || raw === "") {
    if (process.env.SKIP_ENV_VALIDATION || process.env.npm_lifecycle_event === "build") {
      return "build-time-placeholder-auth-secret-32-chars-long";
    }
    throw new Error("Missing required environment variable: BETTER_AUTH_SECRET");
  }

  if (raw.length >= 32) {
    return raw;
  }

  return createHash("sha256").update(`${STRETCH_SALT}:${raw}`, "utf8").digest("base64url");
}
