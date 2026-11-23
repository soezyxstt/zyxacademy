import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ARTIFACT_DIR =
  process.env.ADMIN_OPS_SCREENSHOT_DIR ||
  "artifacts/visual-quality/admin-ops-rework";

test.setTimeout(120_000);

async function mockAdminApis(page: Page) {
  const nowIso = new Date().toISOString();
  await page.route("**/api/auth/get-session*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "admin-1",
          name: "Adi Haditya Nursyam",
          email: "soezyxst@gmail.com",
          emailVerified: true,
          role: "admin",
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        session: {
          id: "sess-1",
          userId: "admin-1",
          token: "mock-token",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      }),
    })
  );

  await page.route("**/api/admin/ops", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checkedAt: nowIso,
        gemini: { reqToday: 0, freeLimit: 250, cacheHitToday: 0, cacheHitPct: 0 },
        kv: { writesToday: 14, limit: 1000, remaining: 986 },
        budgets: { tutorPerDay: 30, feedbackPerSubmission: 1, summariesPerDayPerUser: 5 },
        usageByFeature: [],
        jobFailures24h: 0,
        syncQueueDepth: 12,
        jobHealth: {
          recommendationsLastAt: new Date(Date.now() - 18 * 60_000).toISOString(),
          snapshotsLastAt: new Date(Date.now() - 45 * 60_000).toISOString(),
          pathsLastAt: new Date(Date.now() - 120 * 60_000).toISOString(),
        },
      }),
    })
  );

  await page.route("**/api/admin/ai-analytics", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalRequests: 148,
        successfulRequests: 145,
        failedRequests: 3,
        gatewayRequests: 139,
        directRequests: 9,
        gatewaySuccessRate: 98.6,
        directSuccessRate: 88.9,
        averageLatencyMs: 640,
        recentLogs: [
          {
            timestamp: new Date(Date.now() - 60_000).toISOString(),
            operation: "tutor_rag",
            model: "google/gemini-2.5-flash",
            viaGateway: true,
            latencyMs: 520,
            success: true,
          },
          {
            timestamp: new Date(Date.now() - 180_000).toISOString(),
            operation: "discussion-tutor",
            model: "openai/gpt-4o-mini",
            viaGateway: true,
            latencyMs: 780,
            success: true,
          },
          {
            timestamp: new Date(Date.now() - 320_000).toISOString(),
            operation: "playground",
            model: "anthropic/claude-3-5-haiku",
            viaGateway: true,
            latencyMs: 890,
            success: true,
          },
          {
            timestamp: new Date(Date.now() - 480_000).toISOString(),
            operation: "quiz_generation",
            model: "google/gemini-2.5-flash",
            viaGateway: false,
            latencyMs: 1420,
            success: false,
            error: "Rate limit exceeded",
          },
        ],
      }),
    })
  );

  await page.route("**/api/admin/ai-analytics/usage*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: {
          totalRequests: 148,
          totalTokens: 197900,
          estimatedCostUsd: 0.42,
          avgLatencyMs: 640,
          cacheHitRate: 24,
        },
        daily: [
          { date: "2026-11-18", requests: 18, tokens: 24500 },
          { date: "2026-11-19", requests: 24, tokens: 31200 },
          { date: "2026-11-20", requests: 31, tokens: 42100 },
          { date: "2026-11-21", requests: 28, tokens: 36800 },
          { date: "2026-11-22", requests: 22, tokens: 29400 },
          { date: "2026-11-23", requests: 25, tokens: 33900 },
        ],
        byFeature: [
          { feature: "tutor_rag", requests: 86, tokens: 112000 },
          { feature: "discussion-tutor", requests: 34, tokens: 44000 },
          { feature: "playground", requests: 28, tokens: 41900 },
        ],
      }),
    })
  );

  await page.route("**/api/admin/key-diagnostics", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checkedAt: nowIso,
        totalRequestsToday: 42,
        rpdLimits: { "gemini-2.5-flash": 250 },
        geminiKeys: [
          {
            keyId: "project-primary",
            modelId: "gemini-2.5-flash",
            requestsToday: 34,
            requestsMinute: 2,
            estimatedRpmLimit: 15,
            utilizationPercent: 13.6,
            circuitState: "CLOSED",
            successes: 34,
            failures: 0,
            cooldownRemainingMs: 0,
            activeRequestsCount: 0,
          },
          {
            keyId: "project-primary",
            modelId: "gemini-2.5-pro",
            requestsToday: 8,
            requestsMinute: 0,
            estimatedRpmLimit: 5,
            utilizationPercent: 8,
            circuitState: "CLOSED",
            successes: 8,
            failures: 0,
            cooldownRemainingMs: 0,
            activeRequestsCount: 0,
          },
        ],
      }),
    })
  );
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(500);
  const path = `${ARTIFACT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

test.describe("Admin Ops rework visual verification", () => {
  test("captures desktop screenshots of all reworked Admin Ops pages", async ({ page }, info) => {
    test.skip(info.project.name === "mobile-380", "Desktop cases run on desktop project");
    await page.setViewportSize({ width: 1280, height: 860 });
    await mockAdminApis(page);

    const views = [
      { id: "ops", name: "ops-monitor", waitFor: "Akses cepat pemantauan" },
      { id: "tutor-activity", name: "tutor-activity", waitFor: "Membuat entri" },
      { id: "analytics", name: "zyra-analytics", waitFor: "Model aktif" },
      { id: "feature-usage", name: "feature-usage", waitFor: "Pertumbuhan tercepat" },
      { id: "keys", name: "api-keys", waitFor: "project-primary" },
    ];

    for (const v of views) {
      const response = await page.goto(`/visual-fixtures/admin-ops-rework?view=${v.id}`, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.getByText(v.waitFor).first()).toBeVisible({ timeout: 20_000 });
      await capture(page, info, v.name);
    }
  });
});
