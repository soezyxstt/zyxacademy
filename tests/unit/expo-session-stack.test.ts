import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isSessionRoute, navigationSessionKey, resetSessionStack } from "../../apps/mobile-native/routing/session-stack";

const identity = { accountId: "student-a", sessionId: "session-1", expiresAt: 1234 };
type FixtureRoute = Parameters<typeof resetSessionStack>[0]["routes"][number] & {
  key: string;
  params?: object;
};
const stack = (...routes: FixtureRoute[]) => ({
  key: "root", index: routes.length - 1, routeKeySeq: routes.length, routes, stale: false, type: "stack",
  routeNames: ["index", "sign-in", "sign-out", "auth/native-finish", "courses/[id]", "offline", "mcp/authorize", "forms/[id]"],
});
const course = { name: "courses/[id]", key: "old-course", params: { id: "private-course" } };

describe("Expo private back stack", () => {
  test("foreground verification and temporary network errors preserve identity, even offline", () => {
    const first = navigationSessionKey({ status: "signed-in", ...identity });
    expect(navigationSessionKey({ status: "signed-in", ...identity, expiresAt: 2345 })).toBe(first);
    expect(navigationSessionKey({ status: "unavailable", offlineIdentity: { ...identity, locale: "en" } })).toBe(first);
    expect(navigationSessionKey({ status: "unavailable" })).toBeUndefined();
    expect(navigationSessionKey({ status: "signed-in", ...identity, sessionId: "session-2" })).not.toBe(first);
    expect(navigationSessionKey({ status: "signed-in", ...identity, accountId: "student-b" })).not.toBe(first);
    expect(navigationSessionKey({ status: "logout-pending", retry: true })).toBeNull();
    expect(navigationSessionKey({ status: "signed-out" })).toBeNull();
  });

  test("retains the current login, callback, form, or consent link exactly and drops earlier private entries", () => {
    for (const active of [
      { name: "sign-in", key: "login", params: { next: "/courses/new-course" } },
      { name: "auth/native-finish", key: "callback" },
      { name: "forms/[id]", key: "form", params: { id: "intake" } },
      { name: "mcp/authorize", key: "consent", params: { handoff: "pending" } },
    ]) {
      const preload = { ...course, key: "preloaded-course", isPreloaded: true as const };
      const before = { ...stack(course, active, preload), index: 1 };
      expect(resetSessionStack(before, false)).toEqual({
        ...before,
        index: 0,
        history: undefined,
        routes: [active],
      });
      expect(resetSessionStack(stack(active), false)).toBeNull();
    }
  });

  test("replaces a private current route without forwarding its path or parameters", () => {
    const before = stack({ name: "offline", key: "old-offline" }, course);
    expect(resetSessionStack(before, false)?.routes).toEqual([{ name: "index" }]);
    expect(resetSessionStack(before, true)?.routes).toEqual([{ name: "sign-out" }]);
  });

  test("classifies every canonical lane route by its session requirement", () => {
    const rows = readFileSync("plans/native-parallel/routes.tsv", "utf8").trim().split("\n").slice(1);
    for (const row of rows) {
      const [owner, source] = row.split("\t");
      if (owner === "integration") continue;
      const name = source.split("/").slice(1, -1).filter(segment => !segment.startsWith("(")).join("/") || "index";
      expect(isSessionRoute(name)).toBe(!source.includes("/(marketing)/"));
    }
    expect(isSessionRoute("offline")).toBe(true);
    expect(isSessionRoute("internal/session")).toBe(true);
  });
});
