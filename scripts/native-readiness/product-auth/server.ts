import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mock } from "bun:test";
import { NextRequest } from "next/server";
import { studentNavigationEndpoint } from "@/components/navigation/student/student-nav-model";
import { getSafeRedirectPath } from "@/lib/auth-redirect";
import { NATIVE_AUTH_HANDOFF_COOKIE, normalizeNativeAuthState } from "@/lib/native/auth-handoff";
import { EXPO_STAGING_ORIGIN, EXPO_STAGING_SCHEME } from "@/lib/native/expo-auth-config";
import { assertFixtureRunner, fixtureHost, fixtureOrigin, fixturePort, fixtureSessionSeconds } from "./scope";
import { prepareFixtureDatabase, seedBrowserSession } from "./seed";
import { notificationId, seedStudentInbox, verifiedInboxAcknowledgement } from "./inbox-fixture";
import { createTutorLiveFixture } from "./tutor-live-fixture";
import { containsStaffRecord, matchesStaffContext, oppositeStaffRole, staffRoles, type StaffRole } from "./staff-role";

const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const browserPage = "/auth/native-start";
const browserSubmit = "/api/auth/native/fixture";
const nativeComplete = "/api/auth/native/complete";
const result = (status: number) => new Response(null, { status, headers: noStore });
const requestContext = new AsyncLocalStorage<NextRequest>();

function currentRequest() {
  const request = requestContext.getStore();
  if (!request) throw new Error("Missing fixture request context");
  return request;
}

function handoffQuery(url: URL) {
  const state = normalizeNativeAuthState(url.searchParams.get("state"));
  if (!state || url.searchParams.get("scheme") !== EXPO_STAGING_SCHEME) return null;
  const next = getSafeRedirectPath(url.searchParams.get("next") ?? undefined);
  return new URLSearchParams({ state, scheme: EXPO_STAGING_SCHEME, next });
}

function localizeRedirect(response: Response) {
  const location = response.headers.get("location");
  if (!location || location.startsWith(`${EXPO_STAGING_SCHEME}://auth/native-finish#`)) return response;
  if (!location.startsWith(EXPO_STAGING_ORIGIN + "/")) return result(502);
  const headers = new Headers(response.headers);
  headers.set("Location", fixtureOrigin + location.slice(EXPO_STAGING_ORIGIN.length));
  return new Response(response.body, { status: response.status, headers });
}

function browserFixturePage(query: URLSearchParams, staff?: StaffRole) {
  const action = browserSubmit + "?" + query.toString().replaceAll("&", "&amp;");
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Native Preview Sign-in</title><main><h1>Native Preview Sign-in</h1>
    <form method="post" action="${action}">
    <label for="runner-code">Runner code</label>
    <input id="runner-code" type="password" name="claim" inputmode="none" required autocomplete="off" autofocus>
    <button>Continue as preview ${staff ?? "student"}</button></form></main></html>`, {
    // A no-referrer navigation changes a real HTML form POST's Origin to null.
    // Refer only within this private origin so the same-origin check stays exact.
    headers: { ...noStore, "Referrer-Policy": "same-origin", "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" },
  });
}

export async function startAuthFixture(certPath: string, keyPath: string, options: {
  studentProduct?: boolean; staff?: StaffRole; offlineProduct?: boolean;
} = {}) {
  const { studentProduct = false, staff, offlineProduct = false } = options;
  assertFixtureRunner();
  if (offlineProduct && (staff || studentProduct)) throw new Error("Offline preview requires its own Student fixture");
  process.env.SKIP_ENV_VALIDATION = "1";
  process.env.QUEUE_PROVIDER = "noop";
  process.env.GOOGLE_CLIENT_ID = "native-preview-disabled";
  process.env.GOOGLE_CLIENT_SECRET = "native-preview-disabled";
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  process.env.BETTER_AUTH_URL = EXPO_STAGING_ORIGIN;
  process.env.NEXT_PUBLIC_APP_URL = EXPO_STAGING_ORIGIN;

  const tutorLive = staff === "tutor" ? createTutorLiveFixture() : null;

  // Route handlers still call the actual Better Auth, role and DB implementations.
  // The CI process uses a short nonrenewable session policy on the real Better Auth instance.
  const authModule = await import("better-auth");
  const createAuth = authModule.betterAuth;
  mock.module("better-auth", () => ({
    ...authModule,
    betterAuth: (options: Parameters<typeof createAuth>[0]) => createAuth({
      ...options,
      session: { ...options.session, expiresIn: fixtureSessionSeconds, disableSessionRefresh: true },
      telemetry: { enabled: false },
    }),
  }));
  mock.module("server-only", () => ({}));
  mock.module("next/headers", () => ({
    headers: async () => currentRequest().headers,
    cookies: async () => currentRequest().cookies,
  }));

  await prepareFixtureDatabase();
  const [{ GET: start }, { GET: complete }, { POST: exchange }, { GET: accountContext }, { auth }, { pool }] = await Promise.all([
    import("@/app/api/auth/native/start/route"),
    import("@/app/api/auth/native/complete/route"),
    import("@/app/api/auth/native/expo/exchange/route"),
    import("@/app/api/native/context/route"),
    import("@/lib/auth"),
    import("@/lib/db"),
  ]);

  const product = studentProduct ? await Promise.all([
    import("@/app/api/native/student/courses/route"),
    import("@/app/api/notifications/history/route"),
    import("@/app/api/notifications/read/route"),
    import("@/app/api/native/student/community/[operation]/route"),
    import("@/app/api/notifications/quiet-hours/route"),
    import("@/app/api/student/upcoming-sessions/route"),
  ]) : null;
  const previewReading = studentProduct ? await (await import("./reading-fixture")).createReadingPreview() : null;
  const previewVideo = studentProduct ? await (await import("./video-fixture")).createVideoPreview() : null;
  const studentNavigation = studentProduct || offlineProduct ? await import("@/app/api/student/navigation/route") : null;
  const staffReads = staff ? await (await import("./staff-fixture")).loadStaffReads() : null;
  const offline = offlineProduct ? await (await import("./offline-fixture")).createOfflinePreview() : null;
  const liveRoutes = tutorLive ? await Promise.all([
    import("@/app/api/native/academic/tutor-support/[...resource]/route"),
    import("@/app/api/native/academic/tutor-support/courses/[courseId]/live/host/route"),
  ]) : null;
  const opposite = staff ? oppositeStaffRole(staff) : null;

  const claim = randomBytes(32).toString("hex");
  let claimExpiresAt = 0;
  let startStatus: number | undefined;
  let sawStartRequest = false;
  let browserStep: "browser page served" | "browser page rejected" | "browser form rejected by origin"
    | "browser form rejected by handoff" | "browser claim rejected" | undefined;
  let confirmedState: string | null = null;
  let claimed = false;
  let completedHandoff = false;
  let exchangedCode = false;
  let verifiedContext = false;
  let signedOut = false;
  let loadedDashboard = false;
  let acknowledgedInbox = false;
  let verifiedStaffRead = false;
  let deniedOppositeRole = false;
  let unauthorizedRead = false;
  let visitedHealth = false;
  let browserIdentity: Awaited<ReturnType<typeof seedBrowserSession>> | null = null;
  const server = Bun.serve<{ roomId: string }>({
    websocket: tutorLive?.websocket ?? { message() {} },
    hostname: fixtureHost,
    port: fixturePort,
    tls: { cert: Bun.file(certPath), key: Bun.file(keyPath) },
    maxRequestBodySize: 16 * 1024,
    error: () => result(500),
    async fetch(request, listener) {
      const url = new URL(request.url);
      if (listener.requestIP(request)?.address !== fixtureHost || url.origin !== fixtureOrigin ||
        request.headers.get("host") !== url.host || request.headers.has("forwarded") ||
        [...request.headers.keys()].some(name => name.startsWith("x-forwarded-"))) return result(403);

      if (tutorLive && url.pathname.startsWith("/room/")) return tutorLive.worker(request, listener);

      const headers = new Headers(request.headers);
      headers.set("Host", new URL(EXPO_STAGING_ORIGIN).host);
      const browserOrigin = headers.get("origin");
      if (browserOrigin === fixtureOrigin) headers.set("Origin", EXPO_STAGING_ORIGIN);
      const body = (request.method === "POST" || request.method === "PATCH") && request.body ? await request.arrayBuffer() : undefined;
      const upstream = new NextRequest(EXPO_STAGING_ORIGIN + url.pathname + url.search, {
        method: request.method, headers, body: body?.byteLength ? body : undefined,
      });
      const route = request.method + " " + url.pathname;
      if (route === "GET /__preview/health") {
        visitedHealth = true;
        return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><title>Preview HTTPS ready</title><h1>Preview HTTPS ready</h1></html>',
          { headers: { ...noStore, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'" } });
      }
      if (route === "GET /api/auth/native/start") {
        sawStartRequest = true;
        const response = await start(upstream);
        const query = handoffQuery(url);
        startStatus = response.status;
        if (response.status === 302 && query && !claimed) {
          confirmedState = query.get("state");
          claimExpiresAt ||= Date.now() + 120_000;
        }
        return localizeRedirect(response);
      }
      if (route === "GET " + browserPage) {
        const query = handoffQuery(url);
        if (query && confirmedState === query.get("state") && !claimed && Date.now() < claimExpiresAt) {
          browserStep = "browser page served";
          return browserFixturePage(query, staff);
        }
        browserStep = "browser page rejected";
        return result(403);
      }
      if (route === "POST " + browserSubmit) {
        if (browserOrigin !== fixtureOrigin) {
          browserStep = "browser form rejected by origin";
          return result(403);
        }
        const query = handoffQuery(url);
        if (!query || query.get("state") !== confirmedState || !upstream.cookies.has(NATIVE_AUTH_HANDOFF_COOKIE) ||
          claimed || Date.now() >= claimExpiresAt) {
          browserStep = "browser form rejected by handoff";
          return result(403);
        }
        const submitted = (await upstream.formData()).get("claim");
        if (typeof submitted !== "string" || !/^[a-f\d]{64}$/.test(submitted) ||
          !timingSafeEqual(Buffer.from(claim, "hex"), Buffer.from(submitted, "hex"))) {
          browserStep = "browser claim rejected";
          return result(403);
        }
        claimed = true;
        browserIdentity = await seedBrowserSession(staff);
        await tutorLive?.seed(browserIdentity.accountId);
        if (studentProduct) await seedStudentInbox(browserIdentity.accountId);
        await offline?.seed(browserIdentity.accountId);
        return new Response(null, { status: 303, headers: {
          ...noStore, Location: fixtureOrigin + nativeComplete + "?" + query, "Set-Cookie": browserIdentity.cookie,
        } });
      }
      if (route === "GET " + nativeComplete) {
        const response = await complete(upstream);
        if (response.headers.get("location")?.startsWith(EXPO_STAGING_SCHEME + "://auth/native-finish#")) completedHandoff = true;
        return localizeRedirect(response);
      }
      if (route === "POST /api/auth/native/expo/exchange") {
        const response = await exchange(upstream);
        if (response.ok) exchangedCode = true;
        return response;
      }
      if (route === "GET /api/native/context") {
        const response = await requestContext.run(upstream, accountContext);
        if (response.ok && (!staff || (browserIdentity && matchesStaffContext(staff, await response.clone().json(), browserIdentity)))) {
          verifiedContext = true;
        }
        return response;
      }
      if (offline && browserIdentity && url.pathname.startsWith("/api/offline/")) {
        const response = await requestContext.run(upstream, () => offline.handle(route, upstream, browserIdentity));
        if (response) return response;
      }
      if (tutorLive && liveRoutes) {
        const courseId = staffRoles.tutor.recordId;
        const path = `/api/native/academic/tutor-support/courses/${courseId}/live`;
        if (route === "GET " + path) {
          return requestContext.run(upstream, () => liveRoutes[0].GET(upstream, { params: Promise.resolve({ resource: ["courses", courseId, "live"] }) }));
        }
        if ((request.method === "GET" || request.method === "POST") && url.pathname === path + "/host") {
          const response = await requestContext.run(upstream, () =>
            liveRoutes[1][request.method === "GET" ? "GET" : "POST"](upstream, { params: Promise.resolve({ courseId }) }));
          if (request.method === "GET") tutorLive.recordHostRead(response, url.searchParams.has("sessionId"));
          return response;
        }
      }
      if (staff && opposite && staffReads && request.method === "GET") {
        if (url.pathname === staffRoles[staff].apiPath) {
          const response = await requestContext.run(upstream, () => staffReads[staff](upstream));
          if (response.ok && containsStaffRecord(staff, await response.clone().json())) verifiedStaffRead = true;
          return response;
        }
        if (url.pathname === staffRoles[opposite].apiPath) {
          const response = await requestContext.run(upstream, () => staffReads[opposite](upstream));
          if (response.ok) unauthorizedRead = true;
          return response;
        }
      }
      if (product && route === "GET /api/native/student/courses" && url.searchParams.get("view") === "dashboard") {
        const response = await requestContext.run(upstream, () => product[0].GET(upstream));
        if (response.ok) loadedDashboard = true;
        return response;
      }
      if (previewReading && browserIdentity && (request.method === "GET" || request.method === "HEAD")) {
        const identity = browserIdentity;
        const response = await requestContext.run(upstream, () => previewReading.handle(upstream, identity));
        if (response) return response;
      }
      if (previewVideo && browserIdentity && request.method === "GET") {
        const identity = browserIdentity;
        const response = await requestContext.run(upstream, () => previewVideo(upstream, identity));
        if (response) return response;
      }
      if (studentNavigation && route === `GET ${studentNavigationEndpoint}`) {
        return requestContext.run(upstream, () => studentNavigation.GET(upstream));
      }
      if (product && route === "GET /api/notifications/history") {
        return requestContext.run(upstream, () => product[1].GET(upstream));
      }
      if (product && route === "GET /api/native/student/community/notifications") {
        return requestContext.run(upstream, () => product[3].GET(upstream, { params: Promise.resolve({ operation: "notifications" }) }));
      }
      if (product && route === "GET /api/notifications/quiet-hours") {
        return requestContext.run(upstream, () => product[4].GET(upstream));
      }
      if (product && route === "GET /api/student/upcoming-sessions") {
        return requestContext.run(upstream, () => product[5].GET());
      }
      if (product && route === "PATCH /api/notifications/read") {
        const selection = await upstream.clone().json().catch(() => null);
        const response = await requestContext.run(upstream, () => product[2].PATCH(upstream));
        if (response.ok && Array.isArray(selection?.ids) && selection.ids.length === 1 && selection.ids[0] === notificationId) {
          acknowledgedInbox = true;
        }
        return response;
      }
      if (route === "GET /api/auth/get-session" || route === "POST /api/auth/sign-out") {
        if (route === "POST /api/auth/sign-out" && staffReads && opposite && browserIdentity && verifiedStaffRead) {
          const session = await auth.api.getSession({ headers: upstream.headers, query: { disableCookieCache: true, disableRefresh: true } });
          if (session?.user.id === browserIdentity.accountId && session.session.id === browserIdentity.sessionId) {
            // The UI should reject navigation without dispatching a read. Probe
            // the canonical handler separately with the same still-active cookie.
            const unauthorized = new NextRequest(EXPO_STAGING_ORIGIN + staffRoles[opposite].apiPath, { headers: upstream.headers });
            const denial = await requestContext.run(unauthorized, () => staffReads[opposite](unauthorized));
            deniedOppositeRole = denial.status === 403;
          }
        }
        const response = await auth.handler(upstream);
        if (route === "POST /api/auth/sign-out" && response.ok) signedOut = true;
        return response;
      }
      return result(404);
    },
  });

  return {
    claim,
    async withdrawOfflineEnrollment() {
      if (!offline || !verifiedContext || !browserIdentity) throw new Error("Offline preview account is unavailable");
      await offline.revoke(browserIdentity.accountId);
    },
    sawOfflineRevocation: () => offline?.sawRevocation() ?? false,
    browserTrustVerified: () => visitedHealth,
    verifiedTutorLive: () => tutorLive?.verified(),
    revokeOnlineReading: () => previewReading?.revoke(),
    verifiedOnlineReading: () => previewReading?.verified(),
    identity: () => browserIdentity && { accountId: browserIdentity.accountId, sessionId: browserIdentity.sessionId },
    progress() {
      if (signedOut) return "sign-out";
      if (verifiedStaffRead) return "authorized staff read";
      if (acknowledgedInbox) return "inbox acknowledgement";
      if (loadedDashboard) return "Student dashboard";
      if (verifiedContext) return "authorized context";
      if (exchangedCode) return "code exchange";
      if (completedHandoff) return "browser completion";
      if (claimed) return "browser form";
      if (browserStep) return browserStep;
      if (confirmedState) return "native start";
      if (startStatus) return "native start HTTP " + startStatus;
      if (sawStartRequest) return "native start request without response";
      return "no auth request";
    },
    async verifiedAndRevoked() {
      if (!verifiedContext || !signedOut || !browserIdentity) return false;
      if (staff && (!verifiedStaffRead || !deniedOppositeRole || unauthorizedRead)) return false;
      if (studentProduct && (!loadedDashboard || !acknowledgedInbox ||
        !await verifiedInboxAcknowledgement(browserIdentity.accountId))) return false;
      if (offline && !offline.sawRevocation()) return false;
      const headers = new Headers({ Cookie: browserIdentity.cookie.split(";", 1)[0] });
      return (await auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } })) === null;
    },
    async stop() {
      previewReading?.stop();
      await server.stop(true);
      await pool.end();
    },
  };
}
