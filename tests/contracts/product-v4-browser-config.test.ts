import { expect, test } from "bun:test";
import { verificationBrowserIdentity, verificationBrowserProvider } from "@/lib/compute/product-v4-browser-config";
import { acquireConfiguredVerificationBrowser } from "@/lib/compute/product-v4-browser-session";
import { expectedChromiumRuntime } from "@/lib/compute/product-v4-runtime-binding";

test("CI identity matches the installed pinned browser and cannot acquire a remote browser", async () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", AUTHORING_VERIFICATION_BROWSER_PROVIDER: "github_actions", CF_ACCOUNT_ID: "a".repeat(32), CF_API_TOKEN: "unused" };
  expect(verificationBrowserIdentity(env)).toEqual({ browserProvider: "github_actions", browserVersion: expectedChromiumRuntime().browserVersion });
  await expect(acquireConfiguredVerificationBrowser(env)).rejects.toThrow("CI_RUNNER_REQUIRED");
});

test("provider defaults retain Cloudflare and reject typos and unreviewed Steel versions", () => {
  expect(verificationBrowserIdentity({ NODE_ENV: "test",})).toEqual({ browserProvider: "cloudflare", browserVersion: "152.0.7977.64" });
  expect(() => verificationBrowserProvider({ NODE_ENV: "test", AUTHORING_VERIFICATION_BROWSER_PROVIDER: "typo" })).toThrow("PROVIDER_INVALID");
  for (const version of [undefined, "latest", "128", "*"]) {
    expect(() => verificationBrowserIdentity({ NODE_ENV: "test", AUTHORING_VERIFICATION_BROWSER_PROVIDER: "steel", AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION: version })).toThrow("VERSION_CONFIGURATION_REQUIRED");
  }
  expect(verificationBrowserIdentity({ NODE_ENV: "test", AUTHORING_VERIFICATION_BROWSER_PROVIDER: "steel", AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION: "140.0.1.2" })).toEqual({ browserProvider: "steel", browserVersion: "140.0.1.2" });
});

test("selected provider cannot fall back to the other provider credentials", async () => {
  await expect(acquireConfiguredVerificationBrowser({ NODE_ENV: "test", AUTHORING_VERIFICATION_BROWSER_PROVIDER: "steel", CF_ACCOUNT_ID: "a".repeat(32), CF_API_TOKEN: "token" })).rejects.toThrow("STEEL_CONFIGURATION_REQUIRED");
  await expect(acquireConfiguredVerificationBrowser({ NODE_ENV: "test", STEEL_API_KEY: "token" })).rejects.toThrow("BROWSER_CONFIGURATION_REQUIRED");
});

test("runtime identity rejects a legacy unbound plan, provider switches and version drift", async () => {
  const { assertVerificationBrowserIdentity } = await import("@/lib/compute/product-v4-browser-config");
  const steel: NodeJS.ProcessEnv = { NODE_ENV: "test", AUTHORING_VERIFICATION_BROWSER_PROVIDER: "steel", AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION: "140.0.1.2" };
  const identity = verificationBrowserIdentity(steel);
  expect(() => assertVerificationBrowserIdentity(identity, steel)).not.toThrow();
  for (const binding of [{ browserVersion: identity.browserVersion }, { ...identity, browserProvider: "cloudflare" }, { ...identity, browserVersion: "140.0.1.3" }]) {
    expect(() => assertVerificationBrowserIdentity(binding, steel)).toThrow("BROWSER_IDENTITY_MISMATCH");
  }
});
