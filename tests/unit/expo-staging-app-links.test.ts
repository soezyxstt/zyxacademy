import { expect, test } from "bun:test";
import policy from "../../packages/native-session/expo-staging-app-links.json";
import { buildAndroidAssetLinks, buildAppleAppSiteAssociation } from "../../lib/well-known/mobile-links";
import { authEntryHref, readAuthReturnTo, resolveNativeProtectedDestination } from "../../apps/mobile-native/auth/login-intent";
import { returnRoutes } from "../../apps/mobile-native/auth/return-routes";
import { NATIVE_STAGING_ORIGIN } from "../../apps/mobile-native/auth/session-api";
import { createNativeIntentRedirect } from "../../apps/mobile-native/routing/consent-intent";
import { readExpoStagingAppLink } from "../../apps/mobile-native/routing/staging-app-links";
import { offlineLibraryTarget, offlineSignInReturn } from "../../apps/mobile-native/offline/library-model";

const { withExpoStagingAppLinks } = require("../../apps/mobile-native/plugins/staging-app-links.js");
const fingerprint = Array.from({ length: 32 }, () => "5F").join(":");
const stable = Array.from({ length: 32 }, () => "1A").join(":");
const nightly = Array.from({ length: 32 }, () => "3B").join(":");
const staging = "https://staging.zyxacademy.com";
const production = "https://www.zyxacademy.com";

test("absent configuration leaves the Expo manifest and current Apple and Capacitor relations alone", () => {
  const override = { package: policy.androidPackage, intentFilters: [{ action: "EXAMPLE" }] };
  expect(withExpoStagingAppLinks(override, {})).toBe(override);
  expect(withExpoStagingAppLinks(override, { [policy.fingerprintVariable]: "invalid" })).toBe(override);
  expect(withExpoStagingAppLinks(override, { [policy.fingerprintVariable]: fingerprint, ZYX_ENVIRONMENT: "production" })).toBe(override);
  expect(withExpoStagingAppLinks(override, { [policy.fingerprintVariable]: fingerprint, BETTER_AUTH_URL: production })).toBe(override);
  const oldPackage = { ...override, package: "com.zyx.academy.nightly" };
  expect(withExpoStagingAppLinks(oldPackage, { [policy.fingerprintVariable]: fingerprint })).toBe(oldPackage);
  const inputs = { stableFingerprints: stable, nightlyFingerprints: nightly, expoStagingFingerprints: "" };
  expect(buildAndroidAssetLinks({ ...inputs, configuredOrigin: staging, requestOrigin: staging }).map(link => link.target.package_name))
    .toEqual(["com.zyx.academy", "com.zyx.academy.nightly"]);
  expect(buildAppleAppSiteAssociation({ teamId: "AB12CD34EF" }).applinks.details[0].appIDs)
    .toEqual(["AB12CD34EF.com.zyx.academy", "AB12CD34EF.com.zyx.academy.nightly"]);
});

test("the association adds only the opt-in fingerprint on the exact configured staging origin", () => {
  const defaults = { stableFingerprints: stable, nightlyFingerprints: nightly, expoStagingFingerprints: fingerprint };
  for (const input of [
    { configuredOrigin: production, requestOrigin: production },
    { configuredOrigin: staging, requestOrigin: production },
    { configuredOrigin: production, requestOrigin: staging },
    { configuredOrigin: staging, requestOrigin: staging, environment: "production" },
    { configuredOrigin: staging, requestOrigin: "https://preview.zyxacademy.com" },
    { configuredOrigin: staging, requestOrigin: "http://staging.zyxacademy.com" },
    { configuredOrigin: staging, requestOrigin: staging + ":8443" },
  ]) expect(buildAndroidAssetLinks({ ...defaults, ...input })).toHaveLength(2);

  const result = buildAndroidAssetLinks({ ...defaults, expoStagingFingerprints: ` ${fingerprint.toLowerCase()}, ${fingerprint}, invalid`,
    configuredOrigin: staging, requestOrigin: staging, environment: "staging" });
  expect(result[2]).toEqual({ relation: ["delegate_permission/common.handle_all_urls"], target: {
    namespace: "android_app", package_name: policy.androidPackage, sha256_cert_fingerprints: [fingerprint],
  } });
  expect(result.slice(0, 2)).toEqual(buildAndroidAssetLinks(defaults));
});

test("the verified app filter always has literal paths and only approved dynamic path matchers", () => {
  const android = withExpoStagingAppLinks({ package: policy.androidPackage }, { [policy.fingerprintVariable]: fingerprint });
  expect(android.intentFilters).toHaveLength(1);
  const [filter] = android.intentFilters;
  expect(filter).toMatchObject({ action: "VIEW", autoVerify: true, category: ["BROWSABLE", "DEFAULT"] });
  expect(filter.data).toContainEqual({ scheme: "https", host: "staging.zyxacademy.com", path: "/offline" });
  expect(filter.data).toContainEqual({ scheme: "https", host: "staging.zyxacademy.com",
    pathAdvancedPattern: `/courses/${policy.segmentPattern}/material/${policy.segmentPattern}` });
  expect(JSON.stringify(android)).not.toContain(fingerprint);

  const installed = new Set<string>(Object.entries(returnRoutes).filter(([area]) => area !== "public").flatMap(([, patterns]) => [...patterns]));
  for (const route of Object.keys(policy.routes)) expect(installed.has(route)).toBe(true);
  for (const entry of filter.data) {
    expect(entry.scheme).toBe("https");
    expect(entry.host).toBe("staging.zyxacademy.com");
    expect(entry.path).not.toBe("/");
    expect(entry.pathPrefix).toBeUndefined();
    expect(entry.pathPattern).toBeUndefined();
    expect(Boolean(entry.path) || Boolean(entry.pathAdvancedPattern)).toBe(true);
  }
});

test("App Links retain only route-owned queries and continue through existing signed role checks", async () => {
  expect(policy.origin).toBe(NATIVE_STAGING_ORIGIN);
  const redirect = createNativeIntentRedirect(async () => "fixture-handoff");
  const offline = staging + "/offline?locale=id&courseId=physics&materialId=article%3Av2&read=article&section=phase-1&next=%2Fadmin";
  const relative = "/offline?locale=id&courseId=physics&materialId=article%3Av2&read=article&section=phase-1";
  expect(await redirect({ path: offline, initial: true })).toBe(relative);
  expect(await redirect({ path: offline, initial: false })).toBe(relative);
  const returnTo = authEntryHref({ entry: "sign-in", locale: "id", next: relative }).params.returnTo;
  expect(readAuthReturnTo(returnTo)).toBe(relative);
  expect(offlineSignInReturn(offlineLibraryTarget("physics", "article:v2"), "article", "phase-1"))
    .toBe("/offline?courseId=physics&materialId=article%3Av2&read=article&section=phase-1");
  expect(offlineSignInReturn(null, "article", "phase-1")).toBe("/offline");

  const course = "/courses/physics/material/article%3Av2?section=phase-1";
  expect(readExpoStagingAppLink(staging + course + "&session=evil&materialId=other#ignored")).toBe(course);
  expect(resolveNativeProtectedDestination(course, { roles: ["murid"] })?.href).toBe(course);
  expect(resolveNativeProtectedDestination(course, { roles: ["tutor"] })).toBeNull();
  expect(readExpoStagingAppLink(staging + "/dashboard/discussions?thread=first&thread=second&channel=course"))
    .toBe("/dashboard/discussions?channel=course");
  expect(readExpoStagingAppLink(staging + "/settings?tab=%2F%2Fother.example")).toBe("/settings");
});

test("public and consent URLs are excluded without enabling a catch-all", async () => {
  const redirect = createNativeIntentRedirect(async () => "fixture-handoff");
  expect(await redirect({ path: "https://other.example/offline?courseId=physics", initial: true })).toBe("/");
  expect(await redirect({ path: staging + ":8443/offline?courseId=physics", initial: false })).toBe("/");
  expect(await redirect({ path: staging + "/courses/%2e%2e/admin", initial: false })).toBe("/");
  expect(await redirect({ path: staging + "/blog/source", initial: true })).toBe("/website?link=fixture-handoff");
  for (const path of [
    "/", "/courses", "/blog/linear", "/f/intake", "/forms/feedback", "/meet/class",
    "/auth/native-finish", "/sign-in", "/sign-up", "/sign-out", "/mcp/authorize",
    "/settings/notifications/browser", "/api/auth/native/google-link/start", "/admin/forms", "/admin/meet",
    "/courses/../admin", "/courses/%2e%2e", "/courses/a%2fb", "/courses/a%252fb", "/courses/a\\b", "/admin/unknown",
  ]) expect(readExpoStagingAppLink(staging + path)).toBeNull();
  for (const origin of [
    "http://staging.zyxacademy.com", production, "https://staging.zyxacademy.com.evil.example",
    "https://staging.zyxacademy.com:8443", "https://staging.zyxacademy.com:443",
    "https://user@staging.zyxacademy.com", "https://STAGING.ZYXACADEMY.COM",
  ]) expect(readExpoStagingAppLink(origin + "/offline")).toBeNull();
});
