import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NATIVE_LAST_ROUTE_MAX_AGE_MS,
  isRestorableNativeRoute,
  isRouteAllowedForRoleDashboard,
  normalizeRestorableNativeRoute,
  parseNativeLastRoute,
  resolveNativeEntryDestination,
  serializeNativeLastRoute,
} from "@/lib/native/route-persistence";
import { createLifecycleRefreshController } from "@/lib/native/lifecycle-refresh";
import { quizStorageKeys, readQuizIndex } from "@/lib/quiz/player-state";

describe("native route persistence", () => {
  test("accepts authenticated app routes including quiz attempt query params", () => {
    expect(
      normalizeRestorableNativeRoute("/courses/calc-1/quiz/q-42?attemptId=att-99"),
    ).toBe("/courses/calc-1/quiz/q-42?attemptId=att-99");
    expect(normalizeRestorableNativeRoute("/courses/tutorial-pka/simulasi/matematika/1")).toBe(
      "/courses/tutorial-pka/simulasi/matematika/1",
    );
    expect(normalizeRestorableNativeRoute("/discussions?channel=c1")).toBe(
      "/discussions?channel=c1",
    );
    expect(normalizeRestorableNativeRoute("/tutor/c1/quizzes")).toBe("/tutor/c1/quizzes");
    expect(normalizeRestorableNativeRoute("/admin/quizzes")).toBe("/admin/quizzes");
    expect(isRestorableNativeRoute("/achievements")).toBe(true);
    expect(isRestorableNativeRoute("/leaderboard")).toBe(true);
  });

  test("rejects marketing, auth, API, external, and malformed paths", () => {
    for (const invalid of [
      "/",
      "/id",
      "/en",
      "/plans",
      "/sign-in",
      "/sign-in?next=%2Fdashboard",
      "/sign-up",
      "/api/entry-redirect",
      "//evil.example/courses",
      "/\\evil.example",
      "https://evil.example/courses",
      "/courses/1\r\nSet-Cookie: a=b",
      `/courses/${"a".repeat(1100)}`,
    ]) {
      expect(normalizeRestorableNativeRoute(invalid)).toBeNull();
    }
  });

  test("serializes and parses user-bound route with TTL enforcement", () => {
    const now = 1_700_000_000_000;
    const raw = serializeNativeLastRoute({
      userId: "user-123",
      path: "/courses/phy-1/quiz/q-7?attemptId=att-1",
      updatedAt: now,
    });
    expect(raw).not.toBeNull();

    // Same user within TTL restores exact path
    expect(
      parseNativeLastRoute(raw, {
        expectedUserId: "user-123",
        now: now + 10_000,
      }),
    ).toBe("/courses/phy-1/quiz/q-7?attemptId=att-1");

    // Different user must never inherit previous user's route
    expect(
      parseNativeLastRoute(raw, {
        expectedUserId: "user-999",
        now: now + 10_000,
      }),
    ).toBeNull();

    // Expired route falls back to null
    expect(
      parseNativeLastRoute(raw, {
        expectedUserId: "user-123",
        now: now + NATIVE_LAST_ROUTE_MAX_AGE_MS + 1,
      }),
    ).toBeNull();

    // Corrupted cookie never throws
    expect(
      parseNativeLastRoute("%E0%A4%A", {
        expectedUserId: "user-123",
        now,
      }),
    ).toBeNull();
  });

  test("enforces role boundaries when resolving native entry destination", () => {
    const now = 1_700_000_000_000;
    const adminRouteCookie = serializeNativeLastRoute({
      userId: "u1",
      path: "/admin/quizzes",
      updatedAt: now,
    });
    const tutorRouteCookie = serializeNativeLastRoute({
      userId: "u1",
      path: "/tutor/course-1/quizzes",
      updatedAt: now,
    });
    const quizRouteCookie = serializeNativeLastRoute({
      userId: "u1",
      path: "/courses/course-1/quiz/q1?attemptId=a1",
      updatedAt: now,
    });

    expect(isRouteAllowedForRoleDashboard("/admin/quizzes", "/dashboard")).toBe(false);
    expect(isRouteAllowedForRoleDashboard("/admin/quizzes", "/tutor")).toBe(false);
    expect(isRouteAllowedForRoleDashboard("/admin/quizzes", "/admin")).toBe(true);
    expect(isRouteAllowedForRoleDashboard("/tutor/c1", "/dashboard")).toBe(false);
    expect(isRouteAllowedForRoleDashboard("/tutor/c1", "/tutor")).toBe(true);
    expect(isRouteAllowedForRoleDashboard("/tutor/c1", "/admin")).toBe(true);

    expect(
      resolveNativeEntryDestination({
        rawCookieValue: adminRouteCookie,
        userId: "u1",
        roleDashboard: "/dashboard",
        now: now + 5_000,
      }),
    ).toBe("/dashboard");

    expect(
      resolveNativeEntryDestination({
        rawCookieValue: tutorRouteCookie,
        userId: "u1",
        roleDashboard: "/tutor",
        now: now + 5_000,
      }),
    ).toBe("/tutor/course-1/quizzes");

    expect(
      resolveNativeEntryDestination({
        rawCookieValue: quizRouteCookie,
        userId: "u1",
        roleDashboard: "/dashboard",
        now: now + 5_000,
      }),
    ).toBe("/courses/course-1/quiz/q1?attemptId=a1");
  });

  test("invokes onBackground hook on app background and visibility hidden", () => {
    let backgroundCalls = 0;
    const controller = createLifecycleRefreshController({
      queryClient: {
        refetchQueries: async () => {},
        isMutating: () => 0,
      },
      onBackground: () => {
        backgroundCalls += 1;
      },
    });

    controller.handleAppStateChange(false);
    expect(backgroundCalls).toBe(1);
    controller.handleAppStateChange(true);
    expect(backgroundCalls).toBe(1);
    controller.handleVisibilityChange(false);
    expect(backgroundCalls).toBe(2);
    controller.dispose();
  });

  test("Android MainActivity flushes WebView cookies in onPause and onStop", () => {
    const mainActivity = readFileSync(
      join(
        process.cwd(),
        "apps/mobile/android/app/src/main/java/com/zyx/academy/MainActivity.java",
      ),
      "utf8",
    );
    expect(mainActivity).toContain("import android.webkit.CookieManager;");
    expect(mainActivity).toContain("CookieManager.getInstance().flush()");
    expect(mainActivity).toContain("public void onPause()");
    expect(mainActivity).toContain("public void onStop()");
  });
});

describe("quiz player index persistence", () => {
  test("reads valid persisted question index and safely defaults out-of-range values to 0", () => {
    expect(quizStorageKeys("att-7").index).toBe("zyx-quiz-index-att-7");
    expect(readQuizIndex("4", 10)).toBe(4);
    expect(readQuizIndex("0", 10)).toBe(0);
    expect(readQuizIndex("9", 10)).toBe(9);
    expect(readQuizIndex("10", 10)).toBe(0);
    expect(readQuizIndex("-1", 10)).toBe(0);
    expect(readQuizIndex("abc", 10)).toBe(0);
    expect(readQuizIndex(null, 10)).toBe(0);
    expect(readQuizIndex("2", 0)).toBe(0);
  });
});
