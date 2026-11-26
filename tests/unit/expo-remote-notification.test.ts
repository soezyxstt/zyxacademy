import { expect, test } from "bun:test";
import { createPushResponseController, remotePushData, type PushHost } from "../../apps/mobile-native/device/remote-response";
import type { NativeRequestInit } from "../../apps/mobile-native/network/transport";
import type { ReminderResponse } from "../../apps/mobile-native/device/notification-response-controller";

const id = "a879e028-7191-42cf-b6a6-4d3816df5535";
const response: ReminderResponse = { identifier: "platform-id", deliveredAt: 1000, actionIdentifier: "default",
  trigger: "push", data: { notificationId: id, url: "/profile" } };
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function host(row: () => Promise<unknown>) {
  const calls: { path: string; init?: NativeRequestInit }[] = [];
  const visits: string[] = [];
  const instance: PushHost = {
    session: {
      scope: { origin: "https://staging.zyxacademy.com", sessionId: "session", accountId: "owner" },
      signal: new AbortController().signal, isCurrent: () => true, assertCurrent() {},
      async request(path, init) {
        calls.push({ path, init });
        const value = init?.method === "PATCH" ? { success: true } : await row();
        return { ok: !!value, status: value ? 200 : 404, headers: new Headers(), body: null, dispose() {},
          json: async () => value, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
      },
    },
    resolve: path => path ?? "/dashboard",
    navigate: path => { visits.push(path); },
  };
  return { instance, calls, visits };
}

test("accepts the Expo content, direct FCM data and direct APNs payload", () => {
  const data = { notificationId: id, url: "/dashboard" };
  expect(remotePushData(data, {})).toEqual(data);
  expect(remotePushData({}, { remoteMessage: { data } })).toEqual(data);
  expect(remotePushData({}, { payload: data })).toEqual(data);
  expect(remotePushData(null, {})).toBeNull();
});

test("cold response waits for routing, confirms inbox visibility and acknowledges once", async () => {
  const runner = createPushResponseController("default", () => 1000);
  const item = host(async () => ({ id, url: "/dashboard/discussions" }));
  expect(runner.consume(response)).toBe(true);
  runner.update(item.instance);
  runner.consume(response);
  await settle();
  expect(item.visits).toEqual(["/dashboard/discussions"]);
  expect(item.calls.map(call => call.path)).toEqual(["/api/notifications/history?tapId=" + id, "/api/notifications/read"]);
});

test("denied, substituted or expired notifications do not navigate or acknowledge", async () => {
  for (const reply of [null, { id: "other", url: "/admin" }]) {
    const item = host(async () => reply);
    const runner = createPushResponseController("default", () => 1000);
    runner.update(item.instance);
    runner.consume(response);
    await settle();
    expect(item.visits).toEqual([]);
    expect(item.calls).toHaveLength(1);
  }
  const stale = host(async () => ({ id, url: "/dashboard" }));
  const runner = createPushResponseController("default", () => 86_402_000);
  runner.update(stale.instance);
  runner.consume(response);
  expect(stale.calls).toHaveLength(0);
});

test("changing sessions while visibility is pending cancels navigation and acknowledgement", async () => {
  let complete!: (value: unknown) => void;
  const old = host(() => new Promise(resolve => { complete = resolve; }));
  const replacement = host(async () => null);
  const runner = createPushResponseController("default", () => 1000);
  runner.update(old.instance);
  runner.consume(response);
  runner.update(replacement.instance);
  complete({ id, url: "/dashboard" });
  await settle();
  expect(old.visits).toEqual([]);
  expect(replacement.visits).toEqual([]);
  expect(old.calls).toHaveLength(1);
});

test("quiet digest only opens the verified home and never acknowledges unrelated records", async () => {
  const account = host(async () => null);
  const runner = createPushResponseController("default", () => 1000);
  runner.update(account.instance);
  runner.consume({ ...response, data: { quietDigest: "true", groupKey: "quiet-digest", url: "/admin" } });
  expect(account.visits).toEqual(["/dashboard"]);
  expect(account.calls).toHaveLength(0);
});
