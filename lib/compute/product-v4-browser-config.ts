export type VerificationBrowserProvider = "cloudflare" | "steel" | "github_actions";
export const CLOUDFLARE_VERIFICATION_BROWSER_VERSION = "152.0.7977.64";
export const CI_VERIFICATION_BROWSER_VERSION = "151.0.7922.34";

export function verificationBrowserProvider(env = process.env): VerificationBrowserProvider {
  const provider = env.AUTHORING_VERIFICATION_BROWSER_PROVIDER ?? "cloudflare";
  if (!["cloudflare", "steel", "github_actions"].includes(provider)) throw new Error("VERIFICATION_BROWSER_PROVIDER_INVALID");
  return provider as VerificationBrowserProvider;
}

/** An operator-reviewed exact version, never an automatically accepted remote version. */
export function verificationBrowserIdentity(env = process.env) {
  const browserProvider = verificationBrowserProvider(env);
  const browserVersion = browserProvider === "cloudflare" ? CLOUDFLARE_VERIFICATION_BROWSER_VERSION : browserProvider === "github_actions" ? CI_VERIFICATION_BROWSER_VERSION : env.AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION;
  if (!browserVersion || !/^\d+\.\d+\.\d+\.\d+$/.test(browserVersion)) throw new Error("VERIFICATION_BROWSER_VERSION_CONFIGURATION_REQUIRED");
  return { browserProvider, browserVersion };
}

export function assertVerificationBrowserIdentity(expected: { browserProvider?: string; browserVersion?: string }, env = process.env): void {
  const actual = verificationBrowserIdentity(env);
  if (expected.browserProvider !== actual.browserProvider || expected.browserVersion !== actual.browserVersion) throw new Error("PRODUCT_V4_BROWSER_IDENTITY_MISMATCH");
}

/** Preserve only known machine categories, never a provider body or connection URL. */
export function verificationBrowserFailureCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  return error.message.match(/\b(?:VERIFICATION_STEEL_(?:(?:ACQUIRE|RELEASE)_(?:ACCESS_DENIED|CREDITS_EXHAUSTED|RATE_LIMITED|CAPACITY_UNAVAILABLE|REJECTED|FAILED|TRANSPORT_FAILED(?:_CLEANUP_FAILED)?)|CONFIGURATION_REQUIRED|SESSION_INVALID|CONNECT_FAILED|CONNECT_OR_METADATA_FAILED_CLEANUP_FAILED|RELEASE_RESPONSE_INVALID|DISCONNECT_FAILED|DISCONNECT_TIMEOUT)|VERIFICATION_BROWSER_(?:PROVIDER_INVALID|VERSION_CONFIGURATION_REQUIRED|RATE_LIMITED|DAILY_QUOTA_EXCEEDED|ACCESS_DENIED|ACQUIRE_FAILED|CONNECT_FAILED|RELEASE_FAILED|RELEASE_TIMEOUT|SESSION_INVALID|CONFIGURATION_REQUIRED|OPERATION_TIMEOUT|DISCONNECT_TIMEOUT)|PRODUCT_V4_BROWSER_(?:IDENTITY_MISMATCH|VERSION_MISMATCH)|VERIFICATION_CAPTURE_TIMEOUT)\b/)?.[0];
}
