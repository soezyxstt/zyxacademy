import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";
import { aiStatsSchema, usageAnalyticsSchema } from "../../lib/admin/ops-query";
import { adminLeaderboardSchema } from "../../lib/admin/leaderboard-query";
import admin from "../../messages/id/admin.json";
import adminEval from "../../messages/id/adminEval.json";
import adminOps from "../../messages/id/adminOps.json";
import { buildFixture } from "./fixtures/interactive-document-build";

test.setTimeout(90_000);

const origin = "http://admin-query.invalid";
let fixture: Awaited<ReturnType<typeof buildFixture>>;

// Only the auth transport is replaced. Account keys, cache cleanup, queries,
// schemas, and all three admin views use their production implementations.
const authBoundary = `
  import { useSyncExternalStore } from 'react';
  const listeners = new Set();
  const session = id => ({ data: id ? { user: { id, name: 'Admin', email: id + '@example.test', role: 'admin' } } : null, isPending: false });
  let current = session('admin-a');
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const snapshot = () => current;
  export const useSession = () => useSyncExternalStore(subscribe, snapshot, snapshot);
  window.setAdminFixtureAccount = id => { current = session(id); for (const listener of listeners) listener(); };
`;

test.beforeAll(async () => {
  fixture = await buildFixture("tests/visual/fixtures/admin-query.tsx", "", {
    "@/lib/auth-client": authBoundary,
  });
});

async function boot(
  page: Page,
  mode: Window["adminQueryFixture"]["mode"],
  respond: (route: Route) => Promise<void>,
) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-18T08:00:00.000Z"));
  await page.route("**/*", async route => {
    if (route.request().url() === `${origin}/`) {
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>',
      });
    }
    return respond(route);
  });
  await page.goto(origin);
  await page.addStyleTag({ content: fixture.styles });
  await page.evaluate(value => { window.adminQueryFixture = { mode: value }; }, mode);
  await page.addScriptTag({ content: fixture.script });
  return errors;
}

async function capture(page: Page, info: TestInfo, name: string, errors: string[]) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
  expect(errors).toEqual([]);
}

const analytics = aiStatsSchema.parse({
  totalRequests: 2,
  successfulRequests: 2,
  failedRequests: 0,
  gatewayRequests: 2,
  directRequests: 0,
  averageLatencyMs: 280,
  gatewaySuccessRate: 100,
  directSuccessRate: 0,
  recentLogs: [{
    timestamp: "2026-11-18T07:45:00.000Z",
    operation: "generateContent",
    model: "gemini-2.5-flash",
    viaGateway: true,
    latencyMs: 280,
    success: true,
  }],
});

function usage(userId: string, name: string) {
  return usageAnalyticsSchema.parse({
    success: true,
    data: {
      users: [{ userId, name, email: `${userId}@example.test`, requests: 2, inputTokens: 1200, outputTokens: 300, totalTokens: 1500 }],
      daily: [
        { date: "2026-11-16", requests: 1, inputTokens: 500, outputTokens: 100 },
        { date: "2026-11-17", requests: 1, inputTokens: 700, outputTokens: 200 },
      ],
    },
  });
}

test("admin analytics rejects invalid responses, retries, and isolates usage ranges", async ({ page }, info) => {
  let analyticsReads = 0;
  let initialAnalytics: Route | undefined;
  const usageRequests = new Map<number, Route[]>();
  const errors = await boot(page, "analytics", async route => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.method()).toBe("GET");
    if (url.pathname === "/api/admin/ai-analytics") {
      analyticsReads++;
      if (analyticsReads === 1) { initialAnalytics = route; return; }
      return route.fulfill({ json: analytics });
    }
    expect(url.pathname).toBe("/api/admin/ai-analytics/usage");
    const start = Date.parse(url.searchParams.get("startDate") ?? "");
    const end = Date.parse(url.searchParams.get("endDate") ?? "");
    const days = Math.round((end - start) / 86_400_000);
    expect([7, 30]).toContain(days);
    usageRequests.set(days, [...(usageRequests.get(days) ?? []), route]);
  });

  await expect(page.getByRole("status", { name: adminOps.analyticsUI.loading, exact: true })).toBeVisible();
  await expect.poll(() => analyticsReads).toBe(1);
  await capture(page, info, "analytics-loading", errors);
  await initialAnalytics!.fulfill({ json: { totalRequests: "invalid" } });
  await expect(page.getByText(adminOps.analyticsUI.loadError, { exact: true })).toBeVisible();
  expect(analyticsReads).toBe(1);
  await capture(page, info, "analytics-invalid-response", errors);

  await page.getByRole("button", { name: admin.states.retry, exact: true }).click();
  await expect(page.getByRole("cell", { name: "gemini-2.5-flash", exact: true })).toBeVisible();
  await expect.poll(() => usageRequests.get(30)?.length).toBe(1);
  await expect(page.getByRole("status", { name: "Memuat data penggunaan Zyra", exact: true })).toBeVisible();
  await capture(page, info, "analytics-ready-usage-loading", errors);
  await usageRequests.get(30)![0].fulfill({ json: usage("ayu", "Ayu Rentang 30 Hari") });
  await expect(page.getByText("Ayu Rentang 30 Hari", { exact: true })).toBeVisible();
  await capture(page, info, "usage-thirty-days", errors);

  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "7 Hari Terakhir", exact: true }).click();
  await expect.poll(() => usageRequests.get(7)?.length).toBe(1);
  await expect(page.getByText("Ayu Rentang 30 Hari", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Memuat data penggunaan Zyra", exact: true })).toBeVisible();
  await capture(page, info, "usage-new-range-loading", errors);
  await usageRequests.get(7)![0].fulfill({ json: { success: true, data: { users: [], daily: [{ date: "invalid" }] } } });
  await expect(page.getByText(admin.usageCharts.loadFailed, { exact: true })).toBeVisible();
  expect(usageRequests.get(7)).toHaveLength(1);
  await capture(page, info, "usage-invalid-response", errors);

  await page.getByRole("button", { name: admin.states.retry, exact: true }).click();
  await expect.poll(() => usageRequests.get(7)?.length).toBe(2);
  await usageRequests.get(7)![1].fulfill({ json: usage("bima", "Bima Rentang 7 Hari") });
  await expect(page.getByText("Bima Rentang 7 Hari", { exact: true })).toBeVisible();
  await expect(page.getByText("Ayu Rentang 30 Hari", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveText("7 Hari Terakhir");
  await capture(page, info, "usage-recovered-seven-days", errors);
});

function leaderboard(students: { id: string; name: string; category: "quiz" | "simulation" }[]) {
  return adminLeaderboardSchema.parse({
    mode: "course",
    courses: [{ id: "fixture-course", title: "Kinematika" }],
    summary: { totalStudents: students.length, totalAttempts: students.length, avgOverallScore: 86, highestScore: 86 },
    students: students.map((student, index) => ({
      rank: index + 1,
      studentId: student.id,
      studentName: student.name,
      studentEmail: `${student.id}@example.test`,
      studentImage: null,
      attemptCount: 1,
      avgScore: 86,
      bestScore: 86,
      totalScore: 86,
      avgDuration: 180,
      lastAttemptAt: "2026-11-17T08:00:00.000Z",
      courseNames: ["Kinematika"],
      attempts: [{
        id: `attempt-${student.id}`, title: "Gerak lurus", category: student.category,
        courseId: "fixture-course", courseTitle: "Kinematika", score: 86, durationSeconds: 180,
        submittedAt: "2026-11-17T08:00:00.000Z",
      }],
    })),
  });
}

test("admin leaderboard clears prior filters and open student details on an account change", async ({ page }, info) => {
  let account: string | null = "admin-a";
  const requests = new Map<string, Route[]>();
  const errors = await boot(page, "leaderboard", async route => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.method()).toBe("GET");
    expect(url.pathname).toBe("/api/admin/leaderboard");
    expect(url.searchParams.get("courseId")).toBe("fixture-course");
    expect(url.searchParams.has("search")).toBe(false);
    expect(account).not.toBeNull();
    const key = `${account}:${url.searchParams.get("type") ?? "all"}`;
    requests.set(key, [...(requests.get(key) ?? []), route]);
  });
  const loading = page.getByRole("status", { name: adminEval.leaderboard.loading, exact: true });
  const ayu = { id: "ayu", name: "Ayu Simulasi", category: "simulation" as const };
  const bima = { id: "bima", name: "Bima Kuis", category: "quiz" as const };

  await expect(loading).toBeVisible();
  await expect.poll(() => requests.get("admin-a:all")?.length).toBe(1);
  await capture(page, info, "leaderboard-loading", errors);
  await requests.get("admin-a:all")![0].fulfill({ json: leaderboard([ayu, bima]) });
  await expect(page.getByText(ayu.name, { exact: true })).toBeVisible();
  await expect(page.getByText(bima.name, { exact: true })).toBeVisible();
  await capture(page, info, "leaderboard-all-types", errors);

  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: adminEval.leaderboard.quiz, exact: true }).click();
  await expect.poll(() => requests.get("admin-a:quiz")?.length).toBe(1);
  await expect(loading).toBeVisible();
  await expect(page.getByText(ayu.name, { exact: true })).toHaveCount(0);
  await expect(page.getByText(bima.name, { exact: true })).toHaveCount(0);
  await capture(page, info, "leaderboard-new-type-loading", errors);
  await requests.get("admin-a:quiz")![0].fulfill({ json: leaderboard([bima]) });
  await expect(page.getByText(bima.name, { exact: true })).toBeVisible();
  await expect(page.getByText(ayu.name, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: adminEval.leaderboard.details, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Gerak lurus", { exact: true })).toBeVisible();
  await capture(page, info, "leaderboard-student-details", errors);

  account = "admin-b";
  await page.evaluate(() => window.setAdminFixtureAccount("admin-b"));
  await expect.poll(() => requests.get("admin-b:all")?.length).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(bima.name, { exact: true })).toHaveCount(0);
  await expect(page.getByText(ayu.name, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveText(adminEval.leaderboard.allTypes);
  await expect(loading).toBeVisible();
  await capture(page, info, "leaderboard-account-change-loading", errors);
  await requests.get("admin-b:all")![0].fulfill({ json: leaderboard([{ id: "citra", name: "Citra Akun Kedua", category: "quiz" }]) });
  await expect(page.getByText("Citra Akun Kedua", { exact: true })).toBeVisible();
  await expect(page.getByText(bima.name, { exact: true })).toHaveCount(0);
  await capture(page, info, "leaderboard-second-account", errors);

  account = null;
  await page.evaluate(() => window.setAdminFixtureAccount(null));
  await expect(loading).toBeVisible();
  await expect(page.getByText("Citra Akun Kedua", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: adminEval.leaderboard.refresh, exact: true })).toBeDisabled();
  expect([...requests.keys()]).toEqual(["admin-a:all", "admin-a:quiz", "admin-b:all"]);
  await capture(page, info, "leaderboard-signed-out", errors);
});
