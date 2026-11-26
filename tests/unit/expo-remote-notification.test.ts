import { expect, test } from "bun:test";
import { createPushResponseController, remotePushData, type PushHost } from "../../apps/mobile-native/device/remote-response";
import type { NativeRequestInit } from "../../apps/mobile-native/network/transport";
import { operationsCatalog } from "../../lib/admin-mcp/operations-catalog";
import type { ReminderResponse } from "../../apps/mobile-native/device/notification-response-controller";

const id = "a879e028-7191-42cf-b6a6-4d3816df5535";
const response: ReminderResponse = { identifier: "platform-id", deliveredAt: 1000, actionIdentifier: "default",
  trigger: "push", data: { notificationId: id, url: "/profile" } };
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function host(row: () => Promise<unknown>, options: {
  sessionId?: string;
  isCurrent?: PushHost["isCurrent"];
  revalidate?: PushHost["revalidate"];
  acknowledgementStatus?: number;
} = {}) {
  const calls: { path: string; init?: NativeRequestInit }[] = [];
  const visits: string[] = [];
  const instance: PushHost = {
    session: {
      scope: { origin: "https://staging.zyxacademy.com", sessionId: options.sessionId ?? "session", accountId: "owner" },
      signal: new AbortController().signal, isCurrent: () => true, assertCurrent() {},
      async request(path, init) {
        calls.push({ path, init });
        const value = init?.method === "PATCH" ? { success: true } : await row();
        const status = init?.method === "PATCH" ? options.acknowledgementStatus ?? 200
          : typeof value === "number" ? value : value ? 200 : 404;
        return { ok: status === 200, status, headers: new Headers(), body: null, dispose() {},
          json: async () => value, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
      },
    },
    navigationReady: true,
    isCurrent: options.isCurrent ?? (() => true),
    revalidate: options.revalidate ?? (async () => "unavailable"),
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
  const replacement = host(async () => null, { sessionId: "replacement" });
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


test("a foreground session check preserves an in-flight row tap for the same scope", async () => {
  let finishOld!: (value: unknown) => void;
  const old = host(() => new Promise(resolve => { finishOld = resolve; }));
  const verified = host(async () => ({ id, url: "/dashboard/new" }));
  const runner = createPushResponseController("default", () => 1000);
  runner.update(old.instance);
  runner.consume(response);
  runner.update({ status: "checking", scope: old.instance.session.scope });
  expect(old.calls[0]?.init?.signal?.aborted).toBe(true);
  runner.consume(response);
  runner.update(verified.instance);
  finishOld({ id, url: "/dashboard/old" });
  await settle();
  expect(old.visits).toEqual([]);
  expect(old.calls).toHaveLength(1);
  expect(verified.visits).toEqual(["/dashboard/new"]);
  expect(verified.calls).toHaveLength(2);
});

test("a 401 waits for same-session revalidation and retries only the safe lookup", async () => {
  const runner = createPushResponseController("default", () => 1000);
  let finishVerification!: (status: "verified") => void;
  let revalidations = 0;
  let current = true;
  const old = host(async () => 401, {
    isCurrent: () => current,
    revalidate() {
      revalidations += 1;
      current = false;
      return new Promise(resolve => { finishVerification = resolve; });
    },
  });
  const verified = host(async () => ({ id, url: null }), { acknowledgementStatus: 401 });
  runner.update(old.instance);
  runner.consume(response);
  await settle();
  expect(revalidations).toBe(1);
  expect(old.calls).toHaveLength(1);
  runner.update({ status: "checking", scope: old.instance.session.scope });
  runner.update(verified.instance);
  expect(verified.calls).toHaveLength(0);
  finishVerification("verified");
  await settle();
  runner.consume(response);
  expect(verified.visits).toEqual(["/dashboard"]);
  expect(verified.calls.map(call => call.init?.method ?? "GET")).toEqual(["GET", "PATCH"]);
  expect(verified.calls.map(call => call.init?.retry)).toEqual([undefined, undefined]);
  expect(revalidations).toBe(1);
});

test("a stale render cannot navigate before the replacement host is verified", async () => {
  let complete!: (value: unknown) => void;
  let current = true;
  const old = host(() => new Promise(resolve => { complete = resolve; }), { isCurrent: () => current });
  const verified = host(async () => ({ id, url: "/dashboard/current" }));
  const runner = createPushResponseController("default", () => 1000);
  runner.update(old.instance);
  runner.consume(response);
  current = false;
  complete({ id, url: "/dashboard/stale" });
  await settle();
  expect(old.visits).toEqual([]);
  expect(old.calls).toHaveLength(1);
  runner.update(verified.instance);
  await settle();
  expect(verified.visits).toEqual(["/dashboard/current"]);
});

test("a pending tap expires even when same-session verification eventually succeeds", async () => {
  let time = 1000;
  const verified = host(async () => ({ id, url: "/dashboard" }));
  const runner = createPushResponseController("default", () => time);
  runner.update({ status: "checking", scope: verified.instance.session.scope });
  runner.consume(response);
  time += 60_000;
  runner.update(verified.instance);
  await settle();
  expect(verified.calls).toHaveLength(0);
  expect(verified.visits).toEqual([]);
});

test("a repeated 401 ends the tap without another credential check, navigation or write", async () => {
  let revalidations = 0;
  const item = host(async () => 401, { async revalidate() { revalidations += 1; return "verified"; } });
  const runner = createPushResponseController("default", () => 1000);
  runner.update(item.instance);
  runner.consume(response);
  await settle();
  runner.consume(response);
  expect(revalidations).toBe(1);
  expect(item.calls.map(call => call.init?.method ?? "GET")).toEqual(["GET", "GET"]);
  expect(item.visits).toEqual([]);
});

test("logout or a replacement session terminates a tap awaiting credential revalidation", async () => {
  for (const next of [null, { status: "checking" as const, scope: {
    origin: "https://staging.zyxacademy.com", sessionId: "replacement", accountId: "owner",
  } }]) {
    let finishVerification!: (status: "verified") => void;
    const old = host(async () => 401, { revalidate: () => new Promise(resolve => { finishVerification = resolve; }) });
    const replacement = host(async () => ({ id, url: "/dashboard/replacement" }), { sessionId: "replacement" });
    const runner = createPushResponseController("default", () => 1000);
    runner.update(old.instance);
    runner.consume(response);
    await settle();
    runner.update(next);
    runner.update(replacement.instance);
    finishVerification("verified");
    runner.consume(response);
    await settle();
    expect(old.visits).toEqual([]);
    expect(replacement.visits).toEqual([]);
    expect(replacement.calls).toHaveLength(0);
  }
});

test("a digest accepted with verified identity waits for navigation in the same scope", () => {
  const runner = createPushResponseController("default", () => 1000);
  const account = host(async () => null);
  runner.update({ ...account.instance, navigationReady: false });
  runner.consume({ ...response, data: { quietDigest: "true", groupKey: "quiet-digest" } });
  expect(account.visits).toEqual([]);
  runner.update(account.instance);
  expect(account.visits).toEqual(["/dashboard"]);
});

test("unverified digests cannot be delivered to the first or replacement session", () => {
  const runner = createPushResponseController("default", () => 1000);
  const replacement = host(async () => null, { sessionId: "replacement" });
  const digest = { ...response, data: { quietDigest: "true", groupKey: "quiet-digest" } };
  runner.consume(digest);
  runner.update(replacement.instance);
  runner.consume(digest);
  expect(replacement.visits).toEqual([]);
  runner.update({ status: "checking", scope: replacement.instance.session.scope });
  runner.consume({ ...digest, identifier: "second" });
  runner.update(replacement.instance);
  expect(replacement.visits).toEqual([]);
});

test("MCP keeps in-session push handling outside the administrative tool surface", () => {
  const operation = operationsCatalog.find(entry => entry.source === "apps/mobile-native/device/remote-response.ts");
  expect(operation).toMatchObject({ status: "excluded", tools: [], actions: ["consume"] });
});
