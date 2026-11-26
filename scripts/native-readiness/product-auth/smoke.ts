import { createHash, randomBytes } from "node:crypto";
import { createNativeSessionApi, readSignedSessionCookie } from "../../../apps/mobile-native/auth/session-api";
import { loadNativeAccountContext } from "../../../apps/mobile-native/network/account-context";
import { createNativeTransport } from "../../../apps/mobile-native/network/transport";
import { NATIVE_AUTH_HANDOFF_COOKIE } from "@/lib/native/auth-handoff";
import { EXPO_STAGING_ORIGIN, EXPO_STAGING_SCHEME } from "@/lib/native/expo-auth-config";
import { fixtureOrigin, fixtureSessionSeconds } from "./scope";
import { startAuthFixture } from "./server";

class FixtureCheckError extends Error {}

function check(condition: unknown, label: string): asserts condition {
  if (!condition) throw new FixtureCheckError(label);
}

function cookie(response: Response, name: string) {
  const match = response.headers.getSetCookie().find(value => value.startsWith(name + "="));
  check(match, "Expected cookie header missing");
  return match.split(";", 1)[0];
}

const [certificate, key] = process.argv.slice(2);
let stage = "start the isolated auth fixture";
let signOutStatus: number | undefined;
let fixture: Awaited<ReturnType<typeof startAuthFixture>> | undefined;
try {
  check(certificate && key, "TLS material is required");
  fixture = await startAuthFixture(certificate, key);
  const ca = await Bun.file(certificate).text();
  const local = (path: string, init?: RequestInit) => {
    const url = new URL(path, fixtureOrigin);
    check(url.origin === fixtureOrigin, "Test attempted to leave loopback");
    return fetch(url, { ...init, redirect: "manual", tls: { ca } });
  };
  const scopedFetch = async (url: string, init: RequestInit) => {
    const target = new URL(url);
    check(target.origin === EXPO_STAGING_ORIGIN, "Unexpected native client origin");
    const headers = new Headers(init.headers);
    if (headers.get("Origin") === EXPO_STAGING_ORIGIN) headers.set("Origin", fixtureOrigin);
    const response = await local(target.pathname + target.search, { ...init, headers });
    if (target.pathname === "/api/auth/sign-out") signOutStatus = response.status;
    return new Response(response.body, { status: response.status, headers: response.headers });
  };
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(24).toString("hex");
  const query = new URLSearchParams({
    scheme: EXPO_STAGING_SCHEME, state, next: "/dashboard",
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  });

  stage = "reject missing bearer and browser handoff";
  check((await local("/api/native/context")).status === 401, "Guest context was accepted");
  check((await local("/api/auth/native/complete?" + query)).status === 403, "Missing handoff was accepted");

  stage = "start the real native challenge and enter the synthetic browser";
  const start = await local("/api/auth/native/start?" + query);
  check(start.status === 302, "Native start rejected the challenge");
  const startLocation = start.headers.get("location");
  check(startLocation?.startsWith(fixtureOrigin + "/auth/native-start?"), "Unexpected browser destination");
  const page = await local(startLocation);
  check(page.status === 200 && (await page.text()).includes("Continue as preview student"), "Browser fixture did not open");
  const handoffCookie = cookie(start, NATIVE_AUTH_HANDOFF_COOKIE);
  const signInPath = "/api/auth/native/fixture" + new URL(startLocation).search;
  const signIn = (claim: string) => local(signInPath, {
    method: "POST", headers: { Cookie: handoffCookie, Origin: fixtureOrigin },
    body: new URLSearchParams({ claim }),
  });
  check((await signIn("0".repeat(64))).status === 403, "Wrong runner claim was accepted");
  const signedIn = await signIn(fixture.claim);
  check(signedIn.status === 303, "The fixture did not sign in");
  check((await signIn(fixture.claim)).status === 403, "The browser claim could be replayed");
  const browserCookie = cookie(signedIn, "__Secure-better-auth.session_token");

  stage = "produce the real complete callback";
  const completeLocation = signedIn.headers.get("location");
  check(completeLocation?.startsWith(fixtureOrigin + "/api/auth/native/complete?"), "Unexpected completion destination");
  const complete = await local(completeLocation, { headers: { Cookie: browserCookie + "; " + handoffCookie } });
  const deepLink = complete.headers.get("location");
  check(complete.status === 302 && deepLink?.startsWith(EXPO_STAGING_SCHEME + "://auth/native-finish#"), "Unexpected native callback");
  const fragment = new URLSearchParams(new URL(deepLink).hash.slice(1));
  const code = fragment.get("code");
  check(fragment.get("state") === state && code && !fragment.has("token"), "Native callback contract mismatch");

  stage = "reject the wrong origin, reject the wrong verifier and exchange once";
  const exchange = (proof: string, origin = fixtureOrigin) => local("/api/auth/native/expo/exchange", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ code, verifier: proof }),
  });
  check((await exchange(verifier, "https://example.test")).status === 403, "Wrong exchange origin was accepted");
  check((await exchange(randomBytes(32).toString("base64url"))).status === 400, "Wrong verifier was accepted");
  const verified = await exchange(verifier);
  const sessionCookie = readSignedSessionCookie(verified.headers);
  const expected = fixture.identity();
  const { user } = await verified.json();
  check(verified.status === 200 && expected && user?.id === expected.accountId && sessionCookie, "Expected native signed cookie missing");
  check((await exchange(verifier)).status === 400, "Native grant could be replayed");

  stage = "verify the session through the native client";
  const api = createNativeSessionApi(EXPO_STAGING_ORIGIN, scopedFetch);
  const session = await api.read(sessionCookie, undefined, true);
  check(session?.accountId === expected.accountId && session.sessionId === expected.sessionId, "Native session identity mismatch");
  check(session.expiresAt > Date.now() && session.expiresAt <= Date.now() + fixtureSessionSeconds * 1000, "Native session outlives its fixture lease");
  stage = "verify live Student context through the native client";
  const transport = createNativeTransport({ origin: EXPO_STAGING_ORIGIN, fetcher: scopedFetch });
  const binding = transport.setSession({ origin: EXPO_STAGING_ORIGIN, ...expected, readCookie: () => sessionCookie });
  const context = await loadNativeAccountContext(binding);
  check(context.roles.length === 1 && context.roles[0] === "murid" && context.dashboard === "/dashboard", "Unexpected fixture privileges");

  stage = "revoke the authenticated session";
  await api.revoke(sessionCookie);
  check((await local("/api/native/context", { headers: { Cookie: sessionCookie } })).status === 401, "Revoked context stayed active");
  console.log("Verified loopback Native start, complete, exchange, session, Student context and logout");
} catch (error) {
  // Response bodies, cookies, verifier and grant never appear in job logs.
  console.error("Native authenticated fixture failed to " + stage +
    (error instanceof FixtureCheckError ? ": " + error.message : "") +
    (signOutStatus ? " (sign-out HTTP " + signOutStatus + ")" : ""));
  process.exitCode = 1;
} finally {
  await fixture?.stop();
}
