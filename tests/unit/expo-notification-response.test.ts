import { expect, test } from "bun:test";

import {
  createReminderResponseController,
  normalizeNotificationDate,
  observeReminderResponses,
  reminderPresentation,
  sitemapHasReminderRoute,
  type ReminderDestination,
  type ReminderRecipient,
  type ReminderResponse,
} from "../../apps/mobile-native/device/notification-response-controller";
import { localReminderSessionPrefix } from "../../apps/mobile-native/device/notification-response-identity";

const defaultAction = "expo.modules.notifications.actions.DEFAULT";
const current = Date.parse("2026-11-26T09:00:00Z");
const scope = { origin: "https://staging.example.test", accountId: "student-a", sessionId: "session-a" };
const digest = async (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex");

async function studyResponse(deliveredAt = current, source = scope): Promise<ReminderResponse> {
  return {
    identifier: `${await localReminderSessionPrefix(source, digest)}study_reminder.daily`,
    deliveredAt, trigger: "daily", actionIdentifier: defaultAction,
    data: { kind: "study_reminder", url: "/dashboard" },
  };
}

async function tutorResponse(deliveredAt = current): Promise<ReminderResponse> {
  return {
    identifier: `${await localReminderSessionPrefix(scope, digest)}tutor_reminder.booking-1`,
    deliveredAt, trigger: "timeInterval", actionIdentifier: defaultAction,
    data: { kind: "tutor_reminder", url: "/dashboard/schedule", bookingId: "booking-1" },
  };
}

async function verified(isCurrent = () => true): Promise<ReminderRecipient> {
  return { status: "verified", prefix: await localReminderSessionPrefix(scope, digest), isCurrent };
}

function fixture() {
  const visited: ReminderDestination[] = [];
  const routes = {
    pathname: "/gallery/separator",
    ready: true,
    isRegistered: () => true,
    navigate(path: ReminderDestination) { visited.push(path); },
  };
  let time = current;
  return {
    bridge: createReminderResponseController({ defaultAction, now: () => time }),
    routes, visited,
    time(next: number) { time = next; },
  };
}

test("deduplicates a cold response and its warm listener replay after waiting for the verified session", async () => {
  const { bridge, routes, visited } = fixture();
  bridge.updateHost({ status: "checking" }, { ...routes, ready: false });
  const tapped = await studyResponse();
  let last: ReminderResponse | null = tapped;
  let warm: ((response: ReminderResponse) => void) | undefined;
  let clears = 0;
  const stop = observeReminderResponses({
    subscribe(listener) { warm = listener; return () => { warm = undefined; }; },
    readLast: () => last,
    clearLast() { clears++; last = null; },
  }, bridge.consume);
  expect(clears).toBe(1);
  warm?.(tapped);
  expect(visited).toEqual([]);
  bridge.updateHost(await verified(), { ...routes, ready: false });
  expect(visited).toEqual([]);
  bridge.updateHost(await verified(), routes);
  expect(visited).toEqual(["/dashboard"]);
  warm?.(tapped);
  expect(visited).toEqual(["/dashboard"]);
  stop();
  expect(warm).toBeUndefined();
});

test("opens an exact mounted schedule, preserves the current screen and recognizes later recurring deliveries", async () => {
  const { bridge, routes, visited, time } = fixture();
  bridge.updateHost(await verified(), routes);
  bridge.consume(await tutorResponse());
  expect(visited).toEqual(["/dashboard/schedule"]);
  bridge.updateHost(await verified(), { ...routes, pathname: "/dashboard" });
  bridge.consume(await studyResponse());
  expect(visited).toEqual(["/dashboard/schedule"]);
  time(current + 24 * 60 * 60 * 1000);
  bridge.updateHost(await verified(), routes);
  bridge.consume(await studyResponse(current + 24 * 60 * 60 * 1000));
  expect(visited).toEqual(["/dashboard/schedule", "/dashboard"]);
});

test("fails closed on any scope mismatch and suppresses reminders after the verified session expires", async () => {
  const { bridge, routes, visited } = fixture();
  let active = true;
  const recipient = await verified(() => active);
  bridge.updateHost(recipient, routes);
  for (const wrong of [
    { ...scope, origin: "https://production.example.test" },
    { ...scope, accountId: "student-b" },
    { ...scope, sessionId: "session-b" },
  ]) {
    const notification = await studyResponse(current, wrong);
    expect(bridge.consume(notification)).toBe(true);
    expect(reminderPresentation(notification, recipient)).toBe("hidden");
  }
  const same = await studyResponse();
  expect(reminderPresentation(same, recipient)).toBe("reminder");
  active = false;
  expect(reminderPresentation(same, recipient)).toBe("hidden");
  bridge.consume(same);
  bridge.updateHost(await verified(), routes);
  expect(visited).toEqual([]);
});

test("discards stale, signed-out and unregistered route taps without replaying after later updates", async () => {
  const { bridge, routes, visited, time } = fixture();
  bridge.updateHost({ status: "checking" }, routes);
  bridge.consume(await studyResponse(current - 24 * 60 * 60 * 1000 - 1));
  bridge.consume(await studyResponse());
  time(current + 60_001);
  bridge.updateHost(await verified(), routes);
  expect(visited).toEqual([]);
  let tapped = await tutorResponse(current + 60_001);
  bridge.updateHost({ status: "unavailable" }, routes);
  bridge.consume(tapped);
  bridge.updateHost(await verified(), routes);
  expect(visited).toEqual([]);
  tapped = await tutorResponse(current + 60_002);
  bridge.updateHost(await verified(), { ...routes, isRegistered: () => false });
  bridge.consume(tapped);
  bridge.updateHost(await verified(), routes);
  expect(visited).toEqual([]);
});

test("does not accept custom actions, untrusted targets, mismatched booking data or remote pushes", async () => {
  const { bridge, routes, visited } = fixture();
  const recipient = await verified();
  bridge.updateHost(recipient, routes);
  const study = await studyResponse();
  expect(bridge.consume({ ...study, actionIdentifier: "custom" })).toBe(true);
  for (const url of ["/dashboard?redirect=1", "/dashboard/schedule", "//other.example/dashboard", "https://zyx.example/dashboard"]) {
    const invalid = { ...study, data: { kind: "study_reminder", url } };
    expect(bridge.consume(invalid)).toBe(true);
    expect(reminderPresentation(invalid, recipient)).toBe("hidden");
  }
  const tutor = await tutorResponse();
  const badBooking = { ...tutor, data: { kind: "tutor_reminder", url: "/dashboard/schedule", bookingId: "booking-2" } };
  expect(bridge.consume(badBooking)).toBe(true);
  expect(reminderPresentation(badBooking, recipient)).toBe("hidden");
  expect(bridge.consume({ ...study, trigger: "push" })).toBe(false);
  expect(reminderPresentation({ ...study, trigger: "push" }, recipient)).toBe("default");
  expect(reminderPresentation({ ...study, identifier: "unrelated", trigger: "date" }, recipient)).toBe("default");
  expect(visited).toEqual([]);
});

test("does not clear a newer or unrelated native response", async () => {
  const old = await studyResponse();
  const newer = { ...await tutorResponse(), trigger: "push" };
  let last: ReminderResponse = newer;
  let warm: (response: ReminderResponse) => void = () => {};
  let cleared = 0;
  const { bridge } = fixture();
  observeReminderResponses({
    subscribe(listener) { warm = listener; return () => {}; },
    readLast: () => last,
    clearLast() { cleared++; },
  }, bridge.consume);
  warm(old);
  expect(cleared).toBe(0);
  last = old;
  warm(old);
  expect(cleared).toBe(1);
});

test("matches exact Expo Router screens under groups and ignores generated, dynamic and layout-only nodes", () => {
  const entry = (href: string, contextKey: string) => ({
    href, contextKey, isInternal: false, isGenerated: false, children: [],
  });
  const layout = entry("/(student)/dashboard", "./(student)/dashboard/_layout.tsx");
  const screen = entry("/(student)/dashboard/schedule", "./(student)/dashboard/schedule/index.tsx");
  expect(sitemapHasReminderRoute(layout, "/dashboard")).toBe(false);
  expect(sitemapHasReminderRoute({ ...layout, children: [screen] }, "/dashboard/schedule")).toBe(true);
  expect(sitemapHasReminderRoute({ ...screen, isGenerated: true }, "/dashboard/schedule")).toBe(false);
  expect(sitemapHasReminderRoute({ ...screen, isInternal: true }, "/dashboard/schedule")).toBe(false);
  expect(sitemapHasReminderRoute(entry("/dashboard/[page]", "./dashboard/[page].tsx"), "/dashboard/schedule")).toBe(false);
  expect(sitemapHasReminderRoute(entry("//dashboard", "./somewhere.tsx"), "/dashboard")).toBe(false);
});

test("preserves occurrence identity from iOS seconds and Android milliseconds", () => {
  const stamp = current + 123;
  expect(normalizeNotificationDate(stamp / 1000, "ios")).toBe(stamp);
  expect(normalizeNotificationDate(stamp, "android")).toBe(stamp);
});
