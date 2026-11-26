import { expect, test } from "bun:test";
import { deviceIsOffline, readingAccess } from "../../apps/mobile-native/offline/reading-access";

const scope = { origin: "https://staging.zyxacademy.com", accountId: "learner", sessionId: "session" };
const base = { identity: { ...scope, expiresAt: 150 }, locale: "id" as const, foreground: true,
  offline: true, liveStudent: false, denied: false, revalidating: false, now: 100 };

test("an explicitly offline learner gets a credential-free lookup scope bounded by session expiry", () => {
  expect(readingAccess(base)).toEqual({ scope: { ...scope, locale: "id" }, verifiedUntil: 150 });
  expect(readingAccess({ ...base, offline: false, liveStudent: true }).scope).toEqual({ ...scope, locale: "id" });
});

test("denial, inactive app, expired or absent identity, and unfinished verification hide the library", () => {
  for (const changes of [{ identity: null }, { denied: true }, { foreground: false }, { now: 150 },
    { offline: false }, { revalidating: true }]) {
    expect(readingAccess({ ...base, ...changes })).toEqual({ scope: null, verifiedUntil: 0 });
  }
});

test("unknown connectivity cannot activate offline access to a saved library", () => {
  expect(deviceIsOffline({})).toBe(false);
  expect(deviceIsOffline({ type: "UNKNOWN", isConnected: false })).toBe(false);
  expect(deviceIsOffline({ type: "NONE", isConnected: false })).toBe(true);
  expect(deviceIsOffline({ type: "WIFI", isInternetReachable: false })).toBe(true);
  expect(deviceIsOffline({ type: "WIFI", isConnected: true, isInternetReachable: true })).toBe(false);
});
