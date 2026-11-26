import { createHash, randomBytes } from "node:crypto";
import { createNativeSessionApi, readSignedSessionCookie } from "../../../apps/mobile-native/auth/session-api";
import { loadInbox, markInboxRead } from "../../../apps/mobile-native/features/notification-inbox/client";
import { loadNativeAccountContext } from "../../../apps/mobile-native/network/account-context";
import { createNativeTransport } from "../../../apps/mobile-native/network/transport";
import { NATIVE_AUTH_HANDOFF_COOKIE } from "@/lib/native/auth-handoff";
import { EXPO_ANDROID_BROWSER_RETURN, EXPO_ANDROID_BROWSER_RETURN_HEADER, EXPO_STAGING_ORIGIN, EXPO_STAGING_SCHEME } from "@/lib/native/expo-auth-config";
import { course, video, privateVideoPath } from "./video-fixture";
import { notificationId } from "./inbox-fixture";
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
  const studentProduct = process.env.AUTH_STUDENT_PRODUCT === "true";
  const offlineProduct = process.env.AUTH_OFFLINE_PRODUCT === "true";
  fixture = await startAuthFixture(certificate, key, { studentProduct, offlineProduct });
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
  check(page.status === 200 && page.headers.get("referrer-policy") === "same-origin" &&
    (await page.text()).includes("Continue as preview student"), "Browser form did not preserve its same-origin submission policy");
  const handoffCookie = cookie(start, NATIVE_AUTH_HANDOFF_COOKIE);
  const signInPath = "/api/auth/native/fixture" + new URL(startLocation).search;
  const signIn = (claim: string, origin = fixtureOrigin) => local(signInPath, {
    method: "POST", headers: { Cookie: handoffCookie, Origin: origin },
    body: new URLSearchParams({ claim }),
  });
  check((await signIn(fixture.claim, "null")).status === 403, "A browser form without same-origin provenance was accepted");
  check((await signIn("0".repeat(64))).status === 403, "Wrong runner claim was accepted");
  const signedIn = await signIn(fixture.claim);
  check(signedIn.status === 303, "The fixture did not sign in");
  check((await signIn(fixture.claim)).status === 403, "The browser claim could be replayed");
  const browserCookie = cookie(signedIn, "__Secure-better-auth.session_token");

  stage = "produce the real complete callback";
  const completeLocation = signedIn.headers.get("location");
  check(completeLocation?.startsWith(fixtureOrigin + "/api/auth/native/complete?"), "Unexpected completion destination");
  const complete = await local(completeLocation, { headers: {
    Cookie: browserCookie + "; " + handoffCookie, Accept: "text/html", "User-Agent": "Mozilla/5.0 (Linux; Android 13) Chrome/120.0",
    "Accept-Language": "en",
  } });
  check(complete.status === 200 && complete.headers.get(EXPO_ANDROID_BROWSER_RETURN_HEADER) === EXPO_ANDROID_BROWSER_RETURN &&
    !complete.headers.has("location") && complete.headers.get("cache-control") === "no-store" &&
    complete.headers.get("referrer-policy") === "no-referrer", "Missing protected Android return page");
  const html = await complete.text();
  const deepLink = /<a[^>]* href="([^"]+)"/.exec(html)?.[1].replaceAll("&amp;", "&");
  check(deepLink?.startsWith(EXPO_STAGING_SCHEME + "://auth/native-finish#") && html.includes("Open Zyx Academy") &&
    !html.includes("<script") && !html.includes("http-equiv"), "Unexpected native return link");
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

  if (studentProduct) {
    stage = "read the actual Student dashboard";
    const dashboard = await binding.request("/api/native/student/courses?view=dashboard", {
      headers: { "x-student-id": session.accountId, "x-app-locale": context.locale },
    });
    try {
      check(dashboard.ok, "The dashboard returned HTTP " + dashboard.status);
      const model = await dashboard.json();
      check(model && typeof model === "object" && "view" in model && model.view === "dashboard" &&
        "enrolled" in model && Array.isArray(model.enrolled) && model.enrolled.length === 0 && "preview" in model && model.preview,
      "Expected the real unenrolled Student dashboard projection");
    } finally {
      dashboard.dispose();
    }
    stage = "read and acknowledge one owned notification";
    const signal = new AbortController().signal;
    const inbox = await loadInbox(binding, true, signal);
    check(inbox.unread === 1 && inbox.rows.length === 1 && inbox.rows[0]?.id === notificationId, "Unexpected inbox scope");
    await markInboxRead(binding, { id: notificationId }, signal);
    check((await loadInbox(binding, false, signal)).unread === 0, "The read notification remained unread");
    stage = "verify the enrolled course video through the learner endpoints";
    const videos = await binding.request(`/api/native/student/learning?view=video&courseId=${course}`, { headers: { "x-student-id": session.accountId } });
    try {
      const data = await videos.json() as { playlists?: { videos: { id: string; locked: boolean }[] }[] };
      check(videos.ok && data.playlists?.some(p => p.videos.some(v => v.id === video && !v.locked)), "Authorized video missing");
    } finally { videos.dispose(); }
    const playbackPath = `/api/videos/${video}/playback-url`;
    check((await local(playbackPath)).status === 401, "Guest read a course video");
    const playback = await binding.request(playbackPath);
    try {
      check(playback.ok && (await playback.json() as { url?: string }).url === privateVideoPath, "Private video playback source missing");
    } finally { playback.dispose(); }
  }

  if (offlineProduct) {
    stage = "download a protected Student reading from real offline routes";
    const { offlineTitle } = await import("./offline-fixture");
    const headers = { Cookie: sessionCookie, Origin: fixtureOrigin, "Content-Type": "application/json",
      "x-offline-account-id": expected.accountId, "x-offline-session-id": expected.sessionId };
    const sync = (courseIds: string[], cursor: string | null) => local("/api/offline/sync", {
      method: "POST", headers, body: JSON.stringify({ courseIds, cursor, locale: "id" }),
    });
    const initial = await sync([], null);
    check(initial.ok && initial.headers.get("x-offline-environment") === fixtureOrigin, "Offline sync did not authorize the session");
    const { enrollments, cursor } = await initial.json();
    const courseId = enrollments?.[0]?.id;
    check(typeof courseId === "string" && enrollments.length === 1 && typeof cursor === "string", "Expected one enrolled course and cursor");
    const manifest = await local("/api/offline/manifest?" + new URLSearchParams({ courseId, locale: "id" }), { headers });
    check(manifest.ok, "Manifest HTTP " + manifest.status);
    const material = (await manifest.json()).resources.find((entry: { kind: string; title: string }) =>
      entry.kind === "diktat" && entry.title === offlineTitle);
    check(material?.id, "Protected reading missing from manifest");
    const resource = "/api/offline/resource?" + new URLSearchParams({ courseId, kind: "diktat", id: material.id, locale: "id" });
    const downloaded = await local(resource, { headers });
    check(downloaded.ok && (await downloaded.json()).resource?.title === offlineTitle, "Protected download failed");
    stage = "withdraw the enrollment and reject the same authenticated download";
    await fixture.withdrawOfflineEnrollment();
    const updated = await sync([courseId], cursor);
    check(updated.ok && fixture.sawOfflineRevocation(), "Access revocation missing from sync");
    const { access } = await updated.json();
    check(access?.some((grant: { courseId: string; fullContent: boolean }) => grant.courseId === courseId && grant.fullContent === false),
      "The same session retained the full course grant");
    const denied = await local(resource, { headers });
    check(denied.status === 404 && (await denied.json()).code === "OFFLINE_MATERIAL_UNAVAILABLE",
      "Withdrawn reading returned unexpected HTTP " + denied.status);
  }

  stage = "revoke the authenticated session";
  await api.revoke(sessionCookie);
  check((await local("/api/native/context", { headers: { Cookie: sessionCookie } })).status === 401, "Revoked context stayed active");
  check(await fixture.verifiedAndRevoked(), "Expected authenticated database changes or revocation missing");
  console.log("Verified loopback Native start, complete, exchange, session, Student context and logout" +
    (studentProduct ? ", plus mounted Student dashboard and inbox" : offlineProduct ? ", plus protected offline download and revocation" : ""));
} catch (error) {
  // Response bodies, cookies, verifier and grant never appear in job logs.
  console.error("Native authenticated fixture failed to " + stage +
    (error instanceof FixtureCheckError ? ": " + error.message : "") +
    (signOutStatus ? " (sign-out HTTP " + signOutStatus + ")" : ""));
  process.exitCode = 1;
} finally {
  await fixture?.stop();
}
