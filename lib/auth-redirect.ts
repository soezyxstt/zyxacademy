/** Default landing path after a successful OAuth callback when `next` is missing or unsafe. */
export const DEFAULT_AUTH_CALLBACK_PATH = "/dashboard";

const MAX_NEXT_LENGTH = 2048;

/** Dummy origin used only to parse relative URLs safely (see getSafeRedirectPath). */
const RELATIVE_URL_BASE = "https://zyx-auth-redirect.invalid";

/**
 * Returns a same-site relative path safe to pass as OAuth `callbackURL`.
 *
 * Mitigates open redirects: rejects absolute URLs, protocol-relative URLs (`//evil.com`),
 * and other values that `new URL` would resolve away from our dummy base origin.
 */
export function getSafeRedirectPath(
  raw: string | string[] | undefined
): string {
  const next = Array.isArray(raw) ? raw[0] : raw;
  if (next == null || typeof next !== "string") {
    return DEFAULT_AUTH_CALLBACK_PATH;
  }

  const trimmed = next.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NEXT_LENGTH) {
    return DEFAULT_AUTH_CALLBACK_PATH;
  }

  try {
    const resolved = new URL(trimmed, RELATIVE_URL_BASE);
    if (resolved.origin !== RELATIVE_URL_BASE) {
      return DEFAULT_AUTH_CALLBACK_PATH;
    }
    const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    return path.length > 0 ? path : DEFAULT_AUTH_CALLBACK_PATH;
  } catch {
    return DEFAULT_AUTH_CALLBACK_PATH;
  }
}

/** Maps OAuth / auth route query `error` codes to user-visible copy. */
export function getOAuthCallbackErrorMessage(
  raw: string | string[] | undefined
): string | null {
  const code = Array.isArray(raw) ? raw[0] : raw;
  if (code == null || typeof code !== "string" || code.trim() === "") {
    return null;
  }

  const normalized = code
    .trim()
    .toLowerCase()
    .replace(/\+/g, "_")
    .replace(/\s+/g, "_");

  const messages: Record<string, string> = {
    access_denied:
      "Google sign-in was cancelled. You can try again when you are ready.",
    configuration:
      "Sign-in is temporarily unavailable. Please try again later or contact support if this continues.",
  };

  return (
    messages[normalized] ?? "Sign-in could not complete. Please try again."
  );
}

export type OAuthCallbackErrorKey = "accessDenied" | "configuration" | "generic";

export function getOAuthCallbackErrorKey(
  raw: string | string[] | undefined
): OAuthCallbackErrorKey | null {
  const code = Array.isArray(raw) ? raw[0] : raw;
  if (typeof code !== "string" || code.trim() === "") return null;
  const normalized = code.trim().toLowerCase().replace(/\+/g, "_").replace(/\s+/g, "_");
  if (normalized === "access_denied") return "accessDenied";
  if (normalized === "configuration") return "configuration";
  return "generic";
}
