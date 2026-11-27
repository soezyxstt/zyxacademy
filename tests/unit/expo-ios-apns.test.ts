import { expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { buildApnsPayload, getApnsConfig, getExpoIosApnsConfig, sendApnsNotifications } from "../../lib/notifications/apns";
import { dispatchTokensByTransport } from "../../lib/notifications/dispatch";
import { EXPO_IOS_BUNDLE_ID, EXPO_IOS_ORIGIN, expoIosPushRegistration } from "../../packages/notifications/expo-ios-push";

const { withExpoStagingIosPush } = require("../../apps/mobile-native/plugins/staging-ios-push");
const build = { ios: { bundleIdentifier: EXPO_IOS_BUNDLE_ID, entitlements: { existing: true } },
  plugins: [["expo-notifications", { enableRemoteNotifications: false, defaultChannel: "zyx_updates" }]] };
const payload = { title: "Private learner name", body: "Private score", type: "quiz_graded" as const,
  link: "/courses/private", notificationId: "9658a2c1-e9b3-4ad7-8e8b-b78b600273c3",
  metadata: { attachment: "restricted", notificationId: "forged" } };
const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const base = { BETTER_AUTH_URL: EXPO_IOS_ORIGIN, ZYX_ENVIRONMENT: "staging",
  APNS_BUNDLE_ID: "com.zyx.academy.nightly", APNS_KEY_ID: "LEGACYKEY1", APNS_TEAM_ID: "LEGACYTEAM", APNS_PRIVATE_KEY: key,
  APNS_EXPO_IOS_DEVELOPMENT_KEY_ID: "DEVKEY1234", APNS_EXPO_IOS_DEVELOPMENT_TEAM_ID: "DEVTEAM123",
  APNS_EXPO_IOS_DEVELOPMENT_PRIVATE_KEY: key,
  APNS_EXPO_IOS_PRODUCTION_KEY_ID: "PRODKEY123", APNS_EXPO_IOS_PRODUCTION_TEAM_ID: "PRODTEAM12",
  APNS_EXPO_IOS_PRODUCTION_PRIVATE_KEY: key,
};

test("only the explicitly provisioned Expo staging build plans remote notification entitlements", () => {
  expect(withExpoStagingIosPush(build, {})).toBe(build);
  const configured = withExpoStagingIosPush(build, { EXPO_IOS_APNS_ENVIRONMENT: "production", ZYX_ENVIRONMENT: "staging", APNS_PRIVATE_KEY: "fixture-private" });
  expect(configured.ios.entitlements).toEqual({ existing: true, "aps-environment": "production" });
  expect(configured.extra).toEqual({ zyxExpoIosApnsEnvironment: "production" });
  expect(configured.plugins[0][1]).toEqual({ mode: "production", enableRemoteNotifications: true, defaultChannel: "zyx_updates" });
  expect(JSON.stringify(configured)).not.toContain("fixture-private");
  expect(withExpoStagingIosPush(build, { EXPO_IOS_APNS_ENVIRONMENT: "production", ZYX_ENVIRONMENT: "production" })).toBe(build);
  const legacy = { ...build, ios: { bundleIdentifier: "com.zyx.academy" } };
  expect(withExpoStagingIosPush(legacy, { EXPO_IOS_APNS_ENVIRONMENT: "development" })).toBe(legacy);
});

test("Expo registration binds the actual bundle ID and signed profile before considering device tokens", () => {
  const provisioned = { applicationId: EXPO_IOS_BUNDLE_ID, configuredEnvironment: "development",
    provisioningEnvironment: "development", storeDistribution: false };
  expect(expoIosPushRegistration(provisioned)).toEqual({ platform: "ios", transport: "apns", device: "expo-ios-development" });
  expect(expoIosPushRegistration({ ...provisioned, provisioningEnvironment: null })).toBeNull();
  expect(expoIosPushRegistration({ ...provisioned, applicationId: "com.zyx.academy" })).toBeNull();
  expect(expoIosPushRegistration({ ...provisioned, configuredEnvironment: "production" })).toBeNull();
  expect(expoIosPushRegistration({ ...provisioned, configuredEnvironment: "production", provisioningEnvironment: null })).toBeNull();
  expect(expoIosPushRegistration({ ...provisioned, configuredEnvironment: "production", provisioningEnvironment: null, storeDistribution: true }))
    .toEqual({ platform: "ios", transport: "apns", device: "expo-ios-production" });
});

test("Expo APNs profiles require their own staging credentials and use the fixed topic and environment", async () => {
  const dev = getExpoIosApnsConfig("development", base);
  const prod = getExpoIosApnsConfig("production", base);
  expect(dev).toMatchObject({ bundleId: EXPO_IOS_BUNDLE_ID, keyId: "DEVKEY1234", useSandbox: true });
  expect(prod).toMatchObject({ bundleId: EXPO_IOS_BUNDLE_ID, keyId: "PRODKEY123", useSandbox: false });
  expect(getApnsConfig(base)).toMatchObject({ bundleId: "com.zyx.academy.nightly", keyId: "LEGACYKEY1", useSandbox: false });
  expect(getExpoIosApnsConfig("development", { ...base, APNS_EXPO_IOS_DEVELOPMENT_PRIVATE_KEY: undefined })).toBeNull();
  expect(getExpoIosApnsConfig("production", { ...base, APNS_EXPO_IOS_PRODUCTION_PRIVATE_KEY: "invalid" })).toBeNull();
  expect(getExpoIosApnsConfig("production", { ...base, BETTER_AUTH_URL: "https://www.zyxacademy.com" })).toBeNull();

  for (const [environment, config, host] of [
    ["development", dev, "https://api.sandbox.push.apple.com"], ["production", prod, "https://api.push.apple.com"],
  ] as const) {
    expect(await sendApnsNotifications(["bb".repeat(32)], payload, {
      expoEnvironment: environment, config, nowSeconds: 1_700_000_000, sendRequest: async request => {
        expect(request.host).toBe(host);
        expect(request.bundleId).toBe(EXPO_IOS_BUNDLE_ID);
        expect(JSON.parse(request.payloadJson)).toEqual({ notificationId: payload.notificationId,
          aps: { alert: { title: "Zyx Academy" }, sound: "default" } });
        return { status: 200 };
      },
    })).toMatchObject({ succeeded: 1, failedTokens: [] });
  }
  expect(buildApnsPayload(payload)).toMatchObject({ aps: { alert: { title: payload.title, body: payload.body } }, url: payload.link });
  expect(buildApnsPayload({ ...payload, notificationId: undefined,
    metadata: { quietDigest: "true", groupKey: "quiet-digest", count: "12" } }, "development"))
    .toEqual({ quietDigest: "true", groupKey: "quiet-digest", aps: { alert: { title: "Zyx Academy" }, sound: "default" } });
});

test("dispatch never mixes the three APNs topics or falls back on a corrupt Expo label", async () => {
  const observed: Array<{ tokens: string[]; profile: string | undefined }> = [];
  const result = await dispatchTokensByTransport([
    { token: "cap", transport: "apns", device: "capacitor-ios" },
    { token: "dev", transport: "apns", device: "expo-ios-development" },
    { token: "prod", transport: "apns", device: "expo-ios-production" },
    { token: "unknown", transport: "apns", device: "expo-ios-other" },
    { token: "wrong", transport: "fcm", device: "expo-ios-production" },
  ], payload, {
    sendApns: async (tokens, _, profile) => {
      observed.push({ tokens, profile });
      return { succeeded: tokens.length, failedTokens: [], errors: [] };
    },
    sendFcm: async () => { throw new Error("APNs reached FCM"); },
  });
  expect(observed).toEqual([
    { tokens: ["cap"], profile: undefined },
    { tokens: ["dev"], profile: "development" },
    { tokens: ["prod"], profile: "production" },
  ]);
  expect(result).toMatchObject({ attempted: 5, succeeded: 3, failedTokens: [] });
});
