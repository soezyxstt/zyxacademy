import { expect, test } from "bun:test";
import { createGoogleCredentialLogin } from "../../apps/mobile-native/auth/google-credential-flow";
import { NativeAdditionalLoginError } from "../../apps/mobile-native/auth/additional-login-error";
import { NATIVE_STAGING_ORIGIN, type SessionHeaders } from "../../apps/mobile-native/auth/session-api";

const audience = "fixture.apps.googleusercontent.com";
const nonce = "n".repeat(43);
const proof = "p".repeat(43);
const token = "header.claims.signature";
const session = "__Secure-better-auth.session_token=fixture." + "s".repeat(43) + "%3D";
const identity = "verified-account";
const path = "/api/auth/native/google";

function challenge(flags = `Path=${path}; HttpOnly; Secure; SameSite=Strict`) {
  return Response.json({ clientId: audience, nonce }, { headers: {
    "Set-Cookie": `zyx_native_google_challenge=${proof}; ${flags}`,
  } });
}

function verified() {
  const response = Response.json({ userId: identity });
  response.headers.append("Set-Cookie", `zyx_native_google_challenge=; Path=${path}; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);
  response.headers.append("Set-Cookie", `${session}; Path=/; Secure; HttpOnly; SameSite=Lax`);
  return response;
}

type Hooks = Parameters<typeof createGoogleCredentialLogin>[0];
function fixture(overrides: Partial<Hooks> = {}) {
  const requests: Array<{ action: string; cookie: string | null; token: unknown }> = [];
  const retired: string[] = [];
  const acceptances: unknown[] = [];
  let picks = 0;
  const flow = createGoogleCredentialLogin({
    isConfigured: () => true,
    pick: async (actualClient, actualNonce) => {
      expect(actualClient).toBe(audience);
      expect(actualNonce).toBe(nonce);
      picks += 1;
      return { status: "selected", idToken: token };
    },
    cancelPicker: async () => {},
    async fetcher(url, init) {
      const headers = new Headers(init.headers);
      expect(url).toBe(NATIVE_STAGING_ORIGIN + path);
      expect(headers.get("Origin")).toBe(NATIVE_STAGING_ORIGIN);
      expect(init.credentials).toBe("omit");
      expect(init.redirect).toBe("manual");
      const body = JSON.parse(String(init.body));
      requests.push({ action: body.action, cookie: headers.get("Cookie"), token: body.idToken });
      if (body.action === "challenge") return challenge();
      if (body.action === "verify") return verified();
      return Response.json({ cancelled: true });
    },
    revoke: async cookie => { retired.push(cookie); },
    ...overrides,
  });
  return { flow, requests, retired, acceptances, get picks() { return picks; },
    accept: async (_headers: SessionHeaders, account: string, signal: AbortSignal, intent: unknown) => {
      expect(signal.aborted).toBe(false);
      acceptances.push({ account, intent });
    } };
}

test("retires browser attempts and accepts only the verified origin session with the native return intent", async () => {
  const { flow, accept, requests, acceptances, retired } = fixture();
  const intent = { entry: "sign-up" as const, locale: "id" as const, next: "/offline" };
  const states: string[] = [];
  flow.subscribe(() => { states.push(flow.getStatus()); });
  const result = await flow.signIn(accept, intent, async () => {
    expect(requests).toEqual([]);
    expect(flow.isRunning()).toBe(true);
    return true;
  });
  expect(result).toBe("accepted");
  expect(states).toEqual(["opening", "exchanging", "idle"]);
  expect(requests).toEqual([
    { action: "challenge", cookie: null, token: undefined },
    { action: "verify", cookie: `zyx_native_google_challenge=${proof}`, token },
    { action: "cancel", cookie: `zyx_native_google_challenge=${proof}`, token: undefined },
  ]);
  expect(acceptances).toEqual([{ account: identity, intent }]);
  expect(retired).toEqual([]);
});

test("unconfigured browser fallback requires no challenge and a picker cancellation only retires its proof", async () => {
  const disabled = fixture({ isConfigured: () => false });
  expect(await disabled.flow.signIn(disabled.accept)).toBe("unavailable");
  expect(disabled.requests).toEqual([]);
  const cancelled = fixture({ pick: async () => ({ status: "cancelled" }) });
  expect(await cancelled.flow.signIn(cancelled.accept)).toBe("cancelled");
  expect(cancelled.requests.map(request => request.action)).toEqual(["challenge", "cancel"]);
  expect(cancelled.acceptances).toEqual([]);
  expect(cancelled.flow.getStatus()).toBe("idle");
});

test("a saved-account credential keeps the origin session binding and leaves cleanup to its controller", async () => {
  const { flow, retired } = fixture();
  const scope = { kind: "additional", fromSessionId: "source" } as const;
  const outcome = await flow.signIn(async (_headers, accountId, _signal, intent, acceptedScope) => {
    expect(accountId).toBe(identity);
    expect(acceptedScope).toEqual(scope);
    expect(intent).toBeUndefined();
    throw new NativeAdditionalLoginError("ACTIVE_ACCOUNT");
  }, undefined, async () => true, scope);
  expect(outcome).toBe("error");
  expect(flow.getFailure()).toBe("ACTIVE_ACCOUNT");
  expect(retired).toEqual([]);
});

test("unconfirmed browser retirement, missing cookie attributes and redirect prevent picker or token exchange", async () => {
  const previous = fixture();
  expect(await previous.flow.signIn(previous.accept, undefined, async () => false)).toBe("error");
  expect(previous.requests).toEqual([]);
  const invalid = fixture({ fetcher: async () => challenge(`Path=${path}; HttpOnly; SameSite=Strict`) });
  expect(await invalid.flow.signIn(invalid.accept)).toBe("error");
  expect(invalid.picks).toBe(0);
  const redirected = fixture({ fetcher: async () => Response.redirect("https://different.example/", 302) });
  expect(await redirected.flow.signIn(redirected.accept)).toBe("error");
  expect(redirected.picks).toBe(0);
});

test("does not accept a session arriving after cancellation and revokes the returned session", async () => {
  let markVerify!: () => void;
  let finishVerify!: (response: Response) => void;
  const verificationStarted = new Promise<void>(resolve => { markVerify = resolve; });
  const providerResponse = new Promise<Response>(resolve => { finishVerify = resolve; });
  const variant = fixture({ fetcher: async (_url, init) => {
    const action = JSON.parse(String(init.body)).action;
    if (action === "challenge") return challenge();
    if (action === "verify") {
      markVerify();
      return providerResponse;
    }
    return Response.json({ cancelled: true });
  } });
  const pending = variant.flow.signIn(variant.accept);
  await verificationStarted;
  await expect(variant.flow.signIn(variant.accept)).resolves.toBe("error");
  variant.flow.cancel();
  finishVerify(verified());
  expect(await pending).toBe("cancelled");
  expect(variant.acceptances).toEqual([]);
  expect(variant.retired).toEqual([session]);
});

test("pre-request cancellation dismisses the picker and sends no ID token", async () => {
  let openPicker!: () => void;
  let settlePicker!: (result: unknown) => void;
  const opening = new Promise<void>(resolve => { openPicker = resolve; });
  const picked = new Promise(resolve => { settlePicker = resolve; });
  const variant = fixture({
    pick: async () => { openPicker(); return picked; },
    cancelPicker: async () => { settlePicker({ status: "selected", idToken: token }); },
  });
  const pending = variant.flow.signIn(variant.accept);
  await opening;
  variant.flow.cancel();
  expect(await pending).toBe("cancelled");
  expect(variant.requests.map(request => request.action)).toEqual(["challenge", "cancel"]);
  expect(variant.acceptances).toEqual([]);
});
