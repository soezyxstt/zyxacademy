import { expect, test } from "bun:test";

import type { NativeAccountContext } from "../../packages/native-session/context";
import { NATIVE_LAST_ROUTE_MAX_AGE_MS } from "../../packages/native-session/route-persistence";
import type { NativeRouteNode } from "../../apps/mobile-native/auth/login-intent";
import { createExpoRouteHistory, normalizeExpoRouteHistory, resolveExpoEntryRoute } from "../../apps/mobile-native/routing/route-history";
import { operationsCatalog } from "../../lib/admin-mcp/operations-catalog";

const scope = { origin: "https://staging.zyxacademy.com", accountId: "student", sessionId: "verified" };
const account: NativeAccountContext = { accountId: scope.accountId, sessionId: scope.sessionId, locale: "id",
  dashboard: "/dashboard", roles: ["murid"] };
const route = (href: string): NativeRouteNode => ({
  href, contextKey: `.${href}.tsx`, isGenerated: false, isInternal: false, children: [],
});
const sitemap = { ...route("/"), children: [
  route("/(student)/dashboard"), route("/courses"), route("/courses/[id]/quiz/[quizId]"),
  route("/admin"), route("/admin/ops/keys"), route("/about"),
] };
const current = () => true;

function setup() {
  let raw: string | null = null;
  let time = 1_785_000_000_000;
  let readListener = () => {};
  const history = createExpoRouteHistory({
    read() { readListener(); return raw; },
    write(value) { raw = value; },
    remove() { raw = null; },
  }, () => time);
  return { history, raw: () => raw, advance: (ms: number) => { time += ms; },
    onRead: (listener: () => void) => { readListener = listener; } };
}

test("stores the last focus or query for this session and preserves only the new active route", () => {
  const { history, raw } = setup();
  const href = "/courses?q=100%25&q=C%2B%2B";
  history.remember({ ...scope, cookie: "session=credential" } as typeof scope, account, href, current);
  expect(history.restore(scope, account, sitemap, current)).toBe(href);
  expect(raw()).not.toContain("credential");
  history.remember(scope, account, "/courses?q=algebra", current);
  expect(history.restore(scope, account, sitemap, current)).toBe("/courses?q=algebra");
  history.remember(scope, account, "/dashboard", current);
  expect(history.restore(scope, account, sitemap, current)).toBe("/dashboard");
});

test("rejects non-product routes, sensitive destinations, fragments, and credential data", () => {
  const admin: NativeAccountContext = { ...account, roles: ["murid", "admin"], dashboard: "/admin" };
  for (const href of [
    "/about", "/forms/slug", "/meet/slug", "/tautan", "/sign-in", "/auth/native-finish", "/mcp/connections", "/api/entry-redirect",
    "https://staging.zyxacademy.com/courses", "//host/courses", "/courses/one%2Ftwo", "/courses/missing/not-a-route",
    "/admin/ops/keys", "/admin/tokens", "/courses#attempt", "/dashboard?token=x", "/dashboard?access%5Ftoken=x",
    "/courses?q=math&redirect_uri=https%3A%2F%2Fother.example", "/courses?q=math?token=secret",
    "/courses?q=token%253Dcredential", "/courses?q=Bearer%20secret", "/courses?q=eyJexample.payload.signature",
  ]) expect(normalizeExpoRouteHistory(href, admin)).toBeNull();
  expect(normalizeExpoRouteHistory("/admin", account, sitemap)).toBeNull();
  expect(normalizeExpoRouteHistory("/courses/course/quiz/quiz?attemptId=att-1", account, sitemap))
    .toBe("/courses/course/quiz/quiz?attemptId=att-1");
  expect(normalizeExpoRouteHistory("/courses", account, { ...route("/courses"), isInternal: true })).toBeNull();
  expect(normalizeExpoRouteHistory("/courses", account, { ...route("/courses"), isGenerated: true })).toBeNull();
  expect(normalizeExpoRouteHistory("/courses", account, { ...route("/courses"), contextKey: "./courses/_layout.tsx" })).toBeNull();
});

test("only the exact origin, account and session can read or clear stored navigation", () => {
  const { history } = setup();
  history.remember(scope, account, "/courses", current);
  for (const different of [{ origin: "https://other.example" }, { accountId: "other" }, { sessionId: "replacement" }]) {
    const otherScope = { ...scope, ...different };
    expect(history.restore(otherScope, { ...account, ...different }, sitemap, current)).toBeNull();
    history.clear(otherScope);
    expect(history.restore(scope, account, sitemap, current)).toBe("/courses");
  }
  const replacement = { ...scope, sessionId: "replacement" };
  history.remember(replacement, { ...account, sessionId: replacement.sessionId }, "/dashboard", current);
  history.clear(scope);
  expect(history.restore(replacement, { ...account, sessionId: replacement.sessionId }, sitemap, current)).toBe("/dashboard");
  history.clear(replacement);
  expect(history.restore(replacement, { ...account, sessionId: replacement.sessionId }, sitemap, current)).toBeNull();
});

test("ignores stale producers and invalidates saved routes after expiry or a role change", () => {
  const { history, advance, onRead, raw } = setup();
  let valid = true;
  history.remember(scope, account, "/courses", () => {
    const active = valid;
    valid = false;
    return active;
  });
  expect(raw()).toBeNull();
  history.remember(scope, account, "/courses", current);
  valid = true;
  onRead(() => { valid = false; });
  expect(history.restore(scope, account, sitemap, () => valid)).toBeNull();
  onRead(() => {});
  expect(history.restore(scope, account, sitemap, current)).toBe("/courses");
  advance(NATIVE_LAST_ROUTE_MAX_AGE_MS + 1);
  expect(history.restore(scope, account, sitemap, current)).toBeNull();
  expect(raw()).toBeNull();
  history.remember(scope, { ...account, roles: ["admin"] }, "/admin", current);
  expect(history.restore(scope, account, sitemap, current)).toBeNull();
  expect(raw()).toBeNull();
});

test("keeps explicit destinations ahead of persisted state and uses the mounted role dashboard last", () => {
  const neverRestore = () => { throw new Error("Explicit destinations must not read history"); };
  expect(resolveExpoEntryRoute("/about", account, sitemap, neverRestore)).toEqual({ status: "ready", href: "/about" });
  expect(resolveExpoEntryRoute("/admin", account, sitemap, neverRestore)).toEqual({ status: "denied", dashboard: "/dashboard" });
  expect(resolveExpoEntryRoute(undefined, account, sitemap, () => "/courses")).toEqual({ status: "ready", href: "/courses" });
  expect(resolveExpoEntryRoute(undefined, account, sitemap, () => null)).toEqual({ status: "ready", href: "/dashboard" });
});

test("Expo route history remains device-local", () => {
  const entry = operationsCatalog.find(item => item.source === "apps/mobile-native/routing/route-history.ts");
  expect(entry?.status).toBe("excluded");
  expect(entry?.tools).toEqual([]);
});
