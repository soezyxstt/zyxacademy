import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { bindCalendarLink } from "@/apps/mobile-native/features/student/community/calendar-link";
import { createNativeTransport } from "@/apps/mobile-native/network/transport";
import { createNativeIntentRedirect } from "@/apps/mobile-native/routing/consent-intent";
import { EXPO_STAGING_ORIGIN, EXPO_STAGING_SCHEME, normalizeCalendarLinkScheme } from "@/lib/native/expo-auth-config";
import { calendarBrowserUrl } from "@/packages/student-community/calendar-link";

const origin = EXPO_STAGING_ORIGIN;
const nonce = "525bfd44-97a7-495e-b1f0-ca84d41d7a0a";
const otherNonce = "06e9b5e4-6f1f-4cab-9bb4-1e0fb52e34ff";
const path = "/api/auth/native/google-link/start?token=" + "a".repeat(43);
const credentials = { origin, accountId: "student", sessionId: "session", readCookie: () => "session=fixture" };

test("Expo Calendar accepts only the protected one-time HTTPS browser target and staging scheme", () => {
  expect(calendarBrowserUrl(origin, { nativeBrowser: true, url: path })).toBe(origin + path);
  expect(calendarBrowserUrl(origin, { nativeBrowser: false, url: path })).toBeNull();
  for (const url of ["https://evil.example" + path, "//evil.example" + path, path + "&next=/admin", path + "#token", path + "&token=another"]) {
    expect(calendarBrowserUrl(origin, { nativeBrowser: true, url })).toBeNull();
  }
  expect(normalizeCalendarLinkScheme(EXPO_STAGING_SCHEME, nonce, origin)).toBe(EXPO_STAGING_SCHEME);
  expect(normalizeCalendarLinkScheme(EXPO_STAGING_SCHEME, null, origin)).toBeNull();
  expect(normalizeCalendarLinkScheme(EXPO_STAGING_SCHEME, nonce, "https://zyxacademy.com")).toBeNull();
  expect(normalizeCalendarLinkScheme("com.zyx.academy", null, "https://zyxacademy.com")).toBe("com.zyx.academy");
});

test("Calendar consent is one active signed account and surface, with a separately verified connection before sync", async () => {
  const calls: string[] = [];
  let connected = false;
  const transport = createNativeTransport({ origin, async fetcher(url, request) {
    const operation = new URL(url).pathname.split("/").at(-1)!;
    calls.push(operation);
    expect(new Headers(request.headers).get("cookie")).toBe("session=fixture");
    expect(new Headers(request.headers).get("x-student-id")).toBe("student");
    if (operation === "calendar-connect") {
      expect(JSON.parse(request.body as string)).toEqual({ path: "/calendar", scheme: EXPO_STAGING_SCHEME, linkState: nonce });
      return Response.json({ nativeBrowser: true, url: path });
    }
    if (operation === "calendar-status") return Response.json({ connected });
    return Response.json({ ok: true });
  } });
  const session = transport.setSession(credentials);
  const opened: string[] = [];
  const bind = () => bindCalendarLink(session, { current: () => true, nonce: () => nonce, async open(url) { opened.push(url); } });
  await bind().connect("/calendar");
  expect(opened).toEqual([origin + path]);
  expect(bind().takeReturn("/dashboard/schedule", nonce, "1")).toBeNull();
  expect(bind().takeReturn("/calendar", otherNonce, "1")).toBeNull();
  expect(bind().takeReturn("/calendar", nonce, "1")).toBe("linked");
  expect(bind().takeReturn("/calendar", nonce, "1")).toBeNull();
  await expect(bind().confirmAndSync()).rejects.toThrow();
  expect(calls).toEqual(["calendar-connect", "calendar-status"]);
  connected = true;
  await bind().confirmAndSync();
  expect(calls).toEqual(["calendar-connect", "calendar-status", "calendar-status", "calendar-sync"]);
});

test("cancelled, expired and switched recipient returns cannot acquire a signed sync", async () => {
  const transport = createNativeTransport({ origin, async fetcher() {
    return Response.json({ nativeBrowser: true, url: path });
  } });
  const session = transport.setSession(credentials);
  let now = 0;
  const dependencies = { current: () => true, nonce: () => nonce, async open() {}, now: () => now };
  const calendar = bindCalendarLink(session, dependencies);
  await calendar.connect("/dashboard/schedule");
  expect(calendar.takeReturn("/dashboard/schedule", nonce, "error")).toBe("cancelled");
  expect(calendar.takeReturn("/dashboard/schedule", nonce, "1")).toBeNull();
  await calendar.connect("/dashboard/schedule");
  now += 16 * 60_000;
  expect(calendar.takeReturn("/dashboard/schedule", nonce, "1")).toBeNull();
  await calendar.connect("/dashboard/schedule");
  const other = transport.setSession({ ...credentials, accountId: "other", sessionId: "other-session" });
  expect(calendar.takeReturn("/dashboard/schedule", nonce, "1")).toBeNull();
  expect(bindCalendarLink(other, dependencies).takeReturn("/dashboard/schedule", nonce, "1")).toBeNull();
});

test("system callback remains a Calendar route in Expo and the verified host supplies both course agenda controls", async () => {
  const callback = EXPO_STAGING_SCHEME + "://dashboard/schedule?calendarSync=1&linkState=" + nonce;
  const redirect = createNativeIntentRedirect(async () => "unused");
  expect(await redirect({ path: callback, initial: false })).toBe(callback);
  const host = readFileSync("apps/mobile-native/features/student/VerifiedStudentEntry.tsx", "utf8");
  expect(host).toContain('["/calendar", "/dashboard/schedule"].includes');
  expect(host).toContain("calendarLink={calendarLink}");
  const calendar = readFileSync("apps/mobile-native/features/student/community/calendar.tsx", "utf8");
  expect(calendar).toContain('calendarLink.takeReturn(path, route.query.linkState, route.query.calendarSync)');
  expect(calendar).toContain("await calendarLink.confirmAndSync()");
});
