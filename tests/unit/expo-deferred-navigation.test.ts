import { expect, test } from "bun:test";
import type { NativeRouteNode } from "../../apps/mobile-native/auth/login-intent";
import { createNativeSessionApi, NATIVE_STAGING_ORIGIN } from "../../apps/mobile-native/auth/session-api";
import { createNativeSessionController } from "../../apps/mobile-native/auth/session-controller";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import { productQueryUpdate } from "../../apps/mobile-native/routing/product-location";
import { createDeferredSessionNavigation, nativeSessionNavigationStatus } from "../../apps/mobile-native/routing/session-stack";
import { tutorClassEntries } from "../../apps/mobile-native/routing/staff-navigation";

const origin = NATIVE_STAGING_ORIGIN;
const now = Date.parse("2026-11-26T10:00:00Z");
const loginHeaders = new Headers({
  "Set-Cookie": `__Secure-better-auth.session_token=fixture.${"A".repeat(43)}%3D; Path=/; Secure; HttpOnly`,
});
const tutorHome = "/tutor";
const attempt = "/courses/physics/quiz/quiz-a?attemptId=attempt-a";
const assessmentApi = "/api/native/student/assessment/physics/quiz/quiz-a/attempt";

function sessionReply(accountId: string, expiresAt = now + 600_000) {
  return Response.json({ user: { id: accountId }, session: {
    id: `session-${accountId}`, userId: accountId, expiresAt: new Date(expiresAt).toISOString(),
  } });
}

async function activeRoute(accountId: string) {
  const verify = Promise.withResolvers<Response>();
  const gateApiRead = Promise.withResolvers<void>();
  const response = Promise.withResolvers<Response>();
  const requestStarted = Promise.withResolvers<void>();
  const sent: string[] = [];
  let serverAccount = accountId;
  let verifying = false;
  let stored: string | null = null;
  const api = createNativeSessionApi(origin, async (_url, init) => {
    if (init.method === "POST") return Response.json({ success: true });
    if (verifying) {
      gateApiRead.resolve();
      return verify.promise;
    }
    return sessionReply(serverAccount);
  });
  const dataTransport = createNativeTransport({ origin, fetcher: async (_url, init) => {
    sent.push(init.method ?? "GET");
    requestStarted.resolve();
    return response.promise;
  } });
  const controller = createNativeSessionController({ origin, api, dataTransport, now: () => now, store: {
    async read() { return stored; }, async write(value) { stored = value; }, async remove() { stored = null; },
  } });
  await controller.refresh();
  await controller.acceptLogin(loginHeaders, accountId);
  const captured = controller.getSnapshot();
  if (!captured.transport) throw new Error("A verified transport is required");
  let focused = true;
  const status = () => focused
    ? nativeSessionNavigationStatus(captured.state, captured.transport, controller.getSnapshot(), now)
    : "blocked";
  const navigation = createDeferredSessionNavigation();
  return { controller, transport: captured.transport, started: requestStarted.promise, response, status, navigation, sent,
    blur() { focused = false; navigation.cancel(); },
    focus() { focused = true; },
    async refresh() {
      verifying = true;
      const operation = controller.refresh();
      await gateApiRead.promise;
      return { operation };
    },
    verified: () => verify.resolve(sessionReply(accountId, now + 1_200_000)),
    retired: () => verify.resolve(Response.json(null)),
    async signInAnotherAccount(nextAccount: string) {
      verifying = false;
      serverAccount = nextAccount;
      await controller.acceptLogin(loginHeaders, nextAccount);
    },
  };
}

test("a completed Student submission replaces the quiz query once after the actual same-session refresh", async () => {
  const route = await activeRoute("student-a");
  const destinations: ReturnType<typeof productQueryUpdate>[] = [];
  const submission = route.transport.request(`${assessmentApi}/attempt-a`, { method: "POST", body: "{}" });
  await route.started;
  const { operation } = await route.refresh();
  expect(route.controller.getPendingRefresh()).toBe(operation);
  expect(route.status()).toBe("revalidating");
  await expect(route.transport.request(`${assessmentApi}/another`, { method: "POST", body: "{}" }))
    .rejects.toMatchObject({ code: "credentials" });
  expect(route.sent).toEqual(["POST"]);
  route.response.resolve(Response.json({ status: "completed", attemptId: "attempt-a" }));
  const receipt = await (await submission).json() as { status: string; attemptId: string };
  expect(receipt).toEqual({ status: "completed", attemptId: "attempt-a" });
  const update = productQueryUpdate("/courses/[id]/quiz/[quizId]", attempt, `${attempt}&submitted=1`);
  for (let count = 0; count < 2; count++) {
    route.navigation.run(() => destinations.push(update), route.status, route.controller.getPendingRefresh);
  }
  expect(destinations).toEqual([]);
  route.verified();
  await operation;
  expect(route.controller.getPendingRefresh()).toBeNull();
  expect(destinations).toEqual([{ submitted: "1" }]);
  route.navigation.run(() => destinations.push({ submitted: undefined }), route.status, route.controller.getPendingRefresh);
  expect(destinations.at(-1)).toEqual({ submitted: undefined });
});

function node(href: string): NativeRouteNode {
  return { href, contextKey: `.${href}.tsx`, isGenerated: false, isInternal: false, children: [] };
}

for (const outcome of ["verified", "blur then refocus", "retired"] as const) {
  test(`Tutor singleton navigation during revalidation when the screen or session is ${outcome}`, async () => {
    const route = await activeRoute("tutor-a");
    const push: string[] = [];
    const list = route.transport.request("/api/native/academic/tutor/dashboard");
    await route.started;
    const { operation } = await route.refresh();
    route.response.resolve(Response.json({ courses: [{ courseId: "physics", title: "Physics" }] }));
    const { courses } = await (await list).json() as { courses: { courseId: string; title: string }[] };
    const sitemap = { ...node("/"), children: [node(tutorHome), node("/tutor/[courseId]")] };
    const entries = tutorClassEntries(tutorHome, courses, { roles: ["tutor"], locale: "en" }, sitemap);
    expect(entries).toHaveLength(1);
    route.navigation.run(() => push.push(entries[0].href), route.status, route.controller.getPendingRefresh);
    expect(push).toEqual([]);
    if (outcome === "blur then refocus") {
      route.blur();
      route.focus();
    }
    if (outcome === "retired") route.retired();
    else route.verified();
    await operation;
    expect(push).toEqual(outcome === "verified" ? ["/tutor/physics"] : []);
    if (outcome === "retired") {
      expect(route.transport.isCurrent()).toBe(false);
      await route.signInAnotherAccount("tutor-b");
      expect(route.controller.getSnapshot().state).toMatchObject({ status: "signed-in", accountId: "tutor-b" });
      expect(route.status()).toBe("blocked");
    }
  });
}

test("deferred navigation never creates a refresh and an accepted newer action supersedes a pending one", async () => {
  const action = createDeferredSessionNavigation();
  const actualRefresh = Promise.withResolvers<void>();
  const push: string[] = [];
  let status: ReturnType<typeof nativeSessionNavigationStatus> = "revalidating";
  const readStatus = () => status;
  action.run(() => push.push("no refresh"), readStatus, () => null);
  action.run(() => push.push("pending"), readStatus, () => actualRefresh.promise);
  status = "ready";
  action.run(() => push.push("newer"), readStatus);
  expect(push).toEqual(["newer"]);
  actualRefresh.resolve();
  await actualRefresh.promise;
  expect(push).toEqual(["newer"]);
});
