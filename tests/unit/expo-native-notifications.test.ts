import { expect, test } from "bun:test";
import {
  createNativePushController,
  type NativePushDevice,
  type NativePushPermission,
  type NativePushSession,
} from "../../apps/mobile-native/device/notifications-controller";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import { operationsCatalog } from "../../lib/admin-mcp/operations-catalog";

const fcmToken = "a".repeat(100);
const rotatedFcmToken = "b".repeat(100);
const apnsToken = "c1".repeat(32);
const granted = { status: "granted", canAskAgain: true } as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const result = new Promise<T>(done => { resolve = done; });
  return { result, resolve };
}

function createFixture(platform: "ios" | "android" = "android") {
  const calls: { accountId: string; method: string; path: string; payload: unknown }[] = [];
  const activity: string[] = [];
  const transport = platform === "ios" ? "apns" : "fcm";
  let permission: NativePushPermission = { status: "prompt", canAskAgain: true };
  let listener: ((token: string) => void) | undefined;
  let token = platform === "ios" ? apnsToken : fcmToken;
  let responsesDisposed = 0;
  const device: NativePushDevice = {
    registration: platform === "ios"
      ? { platform, transport: "apns", device: "expo-ios" }
      : { platform, transport: "fcm", device: "expo-android" },
    async getPermission() {
      activity.push("check");
      return permission;
    },
    async requestPermission() {
      activity.push("prompt");
      permission = granted;
      return permission;
    },
    async getToken() {
      activity.push("token");
      return token;
    },
    onToken(next) {
      listener = next;
      return () => {
        if (listener === next) listener = undefined;
      };
    },
    async clearNotifications() {
      activity.push("clear");
    },
  };
  function session(
    accountId: string,
    sessionId = accountId,
    respond = async (method: string) => method === "DELETE"
      ? { success: true }
      : { success: true, registered: true, platform, transport, transportActive: true },
  ) {
    let active = true;
    const client: NativePushSession = {
      scope: { origin: "https://staging.example.test", accountId, sessionId },
      isCurrent: () => active,
      async request(path, { method, headers, body }) {
        expect(headers).toEqual({ "Content-Type": "application/json" });
        calls.push({ accountId, method, path, payload: JSON.parse(body) });
        const response = await respond(method);
        return {
          ok: response.success,
          json: async () => response,
          dispose() { responsesDisposed += 1; },
        };
      },
    };
    return { client, invalidate() { active = false; } };
  }
  return {
    device, calls, activity, session,
    controller: createNativePushController(device),
    changePermission(next: NativePushPermission) { permission = next; },
    changeToken(next: string, emit = true) {
      token = next;
      if (emit) listener?.(next);
    },
    disposedResponses: () => responsesDisposed,
  };
}

test("checks permission during account setup and only prompts on an explicit request", async () => {
  const fixture = createFixture("ios");
  const { controller, calls, activity } = fixture;
  await controller.setAccount(fixture.session("student-a").client);
  expect(await controller.sync()).toEqual({
    status: "prompt", canAskAgain: true, registered: false, transportActive: false,
  });
  expect(activity).not.toContain("prompt");
  expect(calls).toEqual([]);

  expect(await controller.requestPermission()).toEqual({
    ...granted, registered: true, transportActive: true,
  });
  expect(activity.filter(event => event === "prompt")).toEqual(["prompt"]);
  expect(calls).toEqual([{
    accountId: "student-a",
    method: "POST",
    path: "/api/notifications/register-token",
    payload: { token: apnsToken, platform: "ios", transport: "apns", device: "expo-ios" },
  }]);
});

test("never requests blocked permissions or attempts registration without build credentials", async () => {
  const fixture = createFixture();
  fixture.changePermission({ status: "denied", canAskAgain: false });
  await fixture.controller.setAccount(fixture.session("student-a").client);
  expect(await fixture.controller.requestPermission()).toEqual({
    status: "denied", canAskAgain: false, registered: false, transportActive: false,
  });
  expect(fixture.activity).not.toContain("prompt");
  expect(fixture.calls).toEqual([]);

  fixture.device.registration = null;
  const unsupported = createNativePushController(fixture.device);
  await unsupported.setAccount(fixture.session("student-a").client);
  const activityBeforeRequest = [...fixture.activity];
  expect(await unsupported.requestPermission()).toEqual({
    status: "unsupported", canAskAgain: false, registered: false, transportActive: false,
  });
  expect(fixture.activity).toEqual(activityBeforeRequest);
});

for (const stage of ["permission check", "device preparation"] as const) {
  test(`a staff opt-in cannot open the system prompt if the inbox closes during ${stage}`, async () => {
    const fixture = createFixture();
    const { controller, activity, calls } = fixture;
    await controller.setAccount(fixture.session("staff-a").client);
    await controller.sync();
    expect(activity).not.toContain("prompt");

    const started = deferred<void>();
    const continued = deferred<void>();
    const active = Symbol();
    let opening = active;
    if (stage === "permission check") {
      const check = fixture.device.getPermission;
      fixture.device.getPermission = async () => {
        started.resolve();
        await continued.result;
        return check();
      };
    } else {
      const request = fixture.device.requestPermission;
      fixture.device.requestPermission = async canPrompt => {
        started.resolve();
        await continued.result;
        return canPrompt() ? request(canPrompt) : null;
      };
    }
    const pending = controller.requestPermission(() => active === opening);
    await started.result;
    opening = Symbol();
    continued.resolve();
    expect(await pending).toMatchObject({ status: "prompt", registered: false });
    expect(activity).not.toContain("prompt");
    expect(calls).toEqual([]);
  });
}

test("uses the newest native token and only deletes the current session registration", async () => {
  const fixture = createFixture();
  fixture.changePermission(granted);
  const { controller, calls } = fixture;
  const initialRead = deferred<string>();
  const readStarted = deferred<void>();
  fixture.device.getToken = () => {
    readStarted.resolve();
    return initialRead.result;
  };
  await controller.setAccount(fixture.session("student-a").client);
  const sync = controller.sync();
  await readStarted.result;
  fixture.changeToken(rotatedFcmToken);
  initialRead.resolve(fcmToken);
  expect((await sync)?.registered).toBe(true);
  expect(calls).toEqual([{
    accountId: "student-a",
    method: "POST",
    path: "/api/notifications/register-token",
    payload: { token: rotatedFcmToken, platform: "android", transport: "fcm", device: "expo-android" },
  }]);
  expect(await controller.setAccount(null)).toBe(true);
  expect(calls.at(-1)).toEqual({
    accountId: "student-a",
    method: "DELETE",
    path: "/api/notifications/register-token",
    payload: { token: rotatedFcmToken },
  });
  expect(controller.getStatus()).toBeNull();
  expect(fixture.activity).toContain("clear");
  expect(fixture.disposedResponses()).toBe(calls.length);
});

test("waits for an in-flight registration and retires its outgoing session before the new write", async () => {
  const fixture = createFixture();
  fixture.changePermission(granted);
  const postStarted = deferred<void>();
  const completePost = deferred<boolean>();
  const first = fixture.session("student-a", "a", async (method) => {
    if (method === "DELETE") return { success: true };
    postStarted.resolve();
    await completePost.result;
    // Simulate a response lost after the server may have written the token.
    return { success: false };
  });
  const second = fixture.session("tutor-b", "b");
  await fixture.controller.setAccount(first.client);
  const firstSync = fixture.controller.sync();
  await postStarted.result;
  const transition = fixture.controller.setAccount(second.client);
  const secondSync = fixture.controller.sync();
  expect(fixture.calls).toHaveLength(1);
  completePost.resolve(true);

  expect(await firstSync).toBeNull();
  expect(await transition).toBe(true);
  expect((await secondSync)?.registered).toBe(true);
  expect(fixture.calls.map(({ accountId, method }) => [accountId, method])).toEqual([
    ["student-a", "POST"],
    ["student-a", "DELETE"],
    ["tutor-b", "POST"],
  ]);
});

test("dispatches registration and retirement with the cookies of their respective transport scopes", async () => {
  const fixture = createFixture();
  fixture.changePermission(granted);
  const origin = "https://staging.example.test";
  const calls: [string, string | undefined, string | null][] = [];
  const sessions = createNativeTransport({
    origin,
    fetcher: async (url, request) => {
      calls.push([url, request.method, new Headers(request.headers).get("Cookie")]);
      return Response.json({
        success: true, registered: true, platform: "android", transport: "fcm", transportActive: true,
      });
    },
  });

  const first = sessions.setSession({
    origin, accountId: "student-a", sessionId: "a", readCookie: () => "session=fixture-a",
  });
  await fixture.controller.setAccount(first);
  expect((await fixture.controller.sync())?.registered).toBe(true);
  expect(await fixture.controller.setAccount(null)).toBe(true);
  sessions.clearSession();
  expect(first.isCurrent()).toBe(false);

  const second = sessions.setSession({
    origin, accountId: "tutor-b", sessionId: "b", readCookie: () => "session=fixture-b",
  });
  await fixture.controller.setAccount(second);
  expect((await fixture.controller.sync())?.registered).toBe(true);
  const endpoint = origin + "/api/notifications/register-token";
  expect(calls).toEqual([
    [endpoint, "POST", "session=fixture-a"],
    [endpoint, "DELETE", "session=fixture-a"],
    [endpoint, "POST", "session=fixture-b"],
  ]);
});

test("an explicit OS permission failure reaches the action while a concurrent foreground sync stays silent", async () => {
  const fixture = createFixture();
  const started = deferred<void>();
  const gate = deferred<void>();
  fixture.device.requestPermission = async () => {
    started.resolve();
    await gate.result;
    throw new Error("OS permission error");
  };
  await fixture.controller.setAccount(fixture.session("staff").client);
  const request = fixture.controller.requestPermission(() => true);
  await started.result;
  const foreground = fixture.controller.sync();
  gate.resolve();
  await expect(request).rejects.toThrow("Device notification permission could not be requested.");
  expect((await foreground)?.registered).toBe(false);
  expect(fixture.calls).toEqual([]);
});

test("a permission reply after logout cannot register a token", async () => {
  const fixture = createFixture();
  const promptStarted = deferred<void>();
  const choice = deferred<NativePushPermission>();
  fixture.device.requestPermission = () => {
    promptStarted.resolve();
    return choice.result;
  };
  await fixture.controller.setAccount(fixture.session("admin-a").client);
  const explicitRequest = fixture.controller.requestPermission();
  await promptStarted.result;
  expect(await fixture.controller.setAccount(null)).toBe(true);
  choice.resolve(granted);
  expect(await explicitRequest).toBeNull();
  expect(fixture.calls).toEqual([]);
  expect(fixture.activity).not.toContain("token");
});

test("retirement can use a same-session cleanup transport after the product transport is aborted", async () => {
  const fixture = createFixture();
  fixture.changePermission(granted);
  const first = fixture.session("student-a", "a");
  await fixture.controller.setAccount(first.client);
  await fixture.controller.sync();
  first.invalidate();

  const cleanup = fixture.session("student-a", "a");
  expect(await fixture.controller.setAccount(null, cleanup.client)).toBe(true);
  expect(fixture.calls.map(call => call.method)).toEqual(["POST", "DELETE"]);

  const second = fixture.session("student-b", "b");
  await fixture.controller.setAccount(second.client);
  await fixture.controller.sync();
  second.invalidate();
  expect(await fixture.controller.setAccount(null, cleanup.client)).toBe(false);
  expect(fixture.calls.map(call => call.method)).toEqual(["POST", "DELETE", "POST"]);
});

test("distinguishes registration from transport readiness and retries an inactive transport", async () => {
  const fixture = createFixture();
  fixture.changePermission(granted);
  let transportActive = false;
  const session = fixture.session("student-a", "a", async () => ({
    success: true, registered: true, platform: "android", transport: "fcm", transportActive,
  }));
  await fixture.controller.setAccount(session.client);
  expect(await fixture.controller.sync()).toEqual({
    ...granted, registered: true, transportActive: false,
  });
  transportActive = true;
  expect(await fixture.controller.sync()).toEqual({
    ...granted, registered: true, transportActive: true,
  });
  expect(fixture.calls).toHaveLength(2);
});

test("silently removes an existing registration when OS permission is revoked", async () => {
  const fixture = createFixture();
  fixture.changePermission(granted);
  await fixture.controller.setAccount(fixture.session("student-a").client);
  await fixture.controller.sync();
  fixture.changePermission({ status: "denied", canAskAgain: false });

  expect(await fixture.controller.sync()).toEqual({
    status: "denied", canAskAgain: false, registered: false, transportActive: false,
  });
  fixture.changeToken(rotatedFcmToken);
  expect(fixture.calls.map(call => [call.method, call.payload])).toEqual([
    ["POST", { token: fcmToken, platform: "android", transport: "fcm", device: "expo-android" }],
    ["DELETE", { token: fcmToken }],
  ]);
  expect(fixture.activity).not.toContain("prompt");
});

test("rejects Expo service tokens and malformed APNs tokens", async () => {
  for (const platform of ["android", "ios"] as const) {
    const fixture = createFixture(platform);
    fixture.changePermission(granted);
    fixture.changeToken(`ExpoPushToken[${fcmToken}]`);
    await fixture.controller.setAccount(fixture.session("student-a").client);
    expect((await fixture.controller.sync())?.registered).toBe(false);
    expect(fixture.calls).toEqual([]);
  }
});

test("Expo device consent and token lifecycle stay outside admin MCP operations", () => {
  const entry = operationsCatalog.find(item => item.source === "apps/mobile-native/device/notifications-controller.ts");
  expect(entry?.status).toBe("excluded");
  expect(entry?.actions).toEqual(["requestPermission", "sync", "setAccount"]);
  expect(entry?.tools).toEqual([]);
});
