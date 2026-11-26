import { chromium, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import adminOps from "@/messages/id/adminOps.json";
import admin from "@/messages/id/admin.json";
import { createMonitoringFixture, monitoringFixtureData } from "@/packages/native-parity/operations/monitoring-fixtures";

const destination = "artifacts/native-parity/operations-web/monitoring";
const root = process.env.PARITY_OPERATIONS_WEB_URL ?? "http://localhost:3211";
const localOrigin = new URL(root).origin;
const timeZone = "Asia/Jakarta";
const viewports = [{ width: 380, height: 844 }, { width: 1536, height: 864 }];
const errors: string[] = [];
const intentionallyFailed = new Set<string>();
const scenarios: { screen: string; id: string; mode?: string; query?: Record<string, string>; verify: (page: Page) => Promise<void> }[] = [
  { screen: "home", id: "home-populated", verify: async page => {
    await expect(page.getByText("2 generasi soal gagal").filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Web Analytics" })).toHaveAttribute("href", "/admin/ops/web-analytics");
  } },
  { screen: "home", id: "home-no-failed-jobs", mode: "empty", verify: async page => {
    await expect(page.getByRole("link", { name: "Web Analytics" })).toBeVisible();
    await expect(page.getByText("2 generasi soal gagal")).toBeHidden();
  } },
  { screen: "home", id: "home-analytics-order", verify: async page => {
    const firstAnalyticsLink = page.locator('a[href^="/admin/ops/"]').filter({ hasText: /Web Analytics|Monitor Ops|Analitik Zyra/ }).filter({ visible: true }).first();
    await expect(firstAnalyticsLink).toHaveAttribute("href", "/admin/ops/web-analytics");
    await firstAnalyticsLink.focus();
  } },
  { screen: "web", id: "web-populated", verify: async page => {
    await expect(page.getByText("2.524", { exact: true })).toBeVisible();
    await expect(page.locator(".recharts-line-curve")).toHaveCount(2);
    for (const curve of await page.locator(".recharts-line-curve").all()) await expect(curve).toHaveAttribute("d", /^M.+/);
  } },
  { screen: "web", id: "web-empty", mode: "empty", verify: async page => {
    await expect(page.getByText(adminOps.webAnalytics.noChartData)).toBeVisible();
    await expect(page.getByText(adminOps.webAnalytics.noTopPages)).toBeVisible();
  } },
  { screen: "web", id: "web-unavailable", mode: "unavailable", verify: async page => {
    await expect(page.getByText(adminOps.webAnalytics.unavailable)).toBeVisible();
  } },
  { screen: "features", id: "features-30-days", verify: async page => {
    await expect(rangeTrigger(page)).toContainText(adminOps.featureUsageUI.range30);
    await expect(page.getByText(adminOps.featureUsageUI.details)).toBeVisible();
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  } },
  { screen: "features", id: "features-7-days-direct", query: { range: "7" }, verify: async page => {
    await expect(rangeTrigger(page)).toContainText(adminOps.featureUsageUI.range7);
    await expect(page.getByText(adminOps.featureUsageUI.noDailyData)).toBeVisible();
  } },
  { screen: "features", id: "features-7-days-empty", verify: async page => {
    await rangeTrigger(page).click();
    await page.getByRole("option", { name: adminOps.featureUsageUI.range7 }).click();
    await expect(rangeTrigger(page)).toContainText(adminOps.featureUsageUI.range7);
    await expect(page.getByText(adminOps.featureUsageUI.noDailyData)).toBeVisible();
    await expect(page).toHaveURL(/range=7/);
  } },
  { screen: "features", id: "features-90-days", verify: async page => {
    await rangeTrigger(page).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("option", { name: adminOps.featureUsageUI.range90 }).click();
    await expect(rangeTrigger(page)).toContainText(adminOps.featureUsageUI.range90);
    await expect(page).toHaveURL(/range=90/);
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  } },
  { screen: "ops", id: "ops-populated", verify: async page => {
    await expect(page.getByText(adminOps.opsUI.jobFailures)).toBeVisible();
    await expect(page.getByText(adminOps.zyraOps.capacity, { exact: true })).toBeVisible();
  } },
  { screen: "ops", id: "ops-read-error", mode: "error", verify: async page => {
    await expect(page.getByText(adminOps.opsUI.loadError)).toBeVisible();
    await expect(page.getByRole("button", { name: admin.states.retry })).toBeVisible();
  } },
  { screen: "ops", id: "ops-read-recovered", mode: "error", verify: async page => {
    await expect(page.getByText(adminOps.opsUI.loadError)).toBeVisible();
    await page.getByRole("button", { name: admin.states.retry }).click();
    await expect(page.getByText(adminOps.opsUI.jobFailures)).toBeVisible();
  } },
  { screen: "ai", id: "ai-populated", verify: async page => {
    await expect(page.getByText(adminOps.analyticsUI.sampleScope)).toBeVisible();
    await expect(page.getByText("Nadia Contoh").filter({ visible: true }).first()).toBeVisible();
  } },
  { screen: "ai", id: "ai-gateway-filter", verify: async page => {
    const filter = page.getByRole("button", { name: adminOps.analyticsUI.gateway, exact: true });
    await filter.click();
    await expect(filter).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(adminOps.analyticsUI.recentRequests)).toBeVisible();
  } },
  { screen: "ai", id: "ai-empty", mode: "empty", verify: async page => {
    await expect(page.getByText(adminOps.analyticsUI.emptyTitle)).toBeVisible();
    await expect(page.getByText("Tidak ada data untuk rentang waktu ini")).toBeVisible();
  } },
  { screen: "models", id: "models-populated", verify: async page => {
    await expect(page.getByText("Model global", { exact: true })).toBeVisible();
  } },
  { screen: "models", id: "models-zyra", verify: async page => {
    const tab = page.getByRole("tab", { name: "Zyra", exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Model global", { exact: true })).toBeHidden();
  } },
  { screen: "models", id: "models-embedding", verify: async page => {
    await page.getByRole("tab", { name: "Embedding" }).click();
    await expect(page.getByText(adminOps.modelsUI.materialSearch)).toBeVisible();
    await expect(page.getByText(adminOps.modelsUI.semanticCache)).toBeVisible();
  } },
  { screen: "keys", id: "keys-populated", verify: async page => {
    await expect(page.getByText("project-primary")).toBeVisible();
    await expect(page.getByText("project-fallback")).toBeVisible();
  } },
  { screen: "keys", id: "keys-read-error", mode: "error", verify: async page => {
    await expect(page.getByText(adminOps.keysUI.failedLoad)).toBeVisible();
  } },
  { screen: "keys", id: "keys-read-recovered", mode: "error", verify: async page => {
    await expect(page.getByText(adminOps.keysUI.failedLoad)).toBeVisible();
    await page.getByRole("button", { name: adminOps.keysUI.retry }).click();
    await expect(page.getByText("project-primary")).toBeVisible();
  } },
  { screen: "tutor", id: "tutor-populated", verify: async page => {
    await expect(page.getByText("Nadia Contoh").filter({ visible: true }).first()).toBeVisible();
  } },
  { screen: "tutor", id: "tutor-detail", verify: async page => {
    await page.getByRole("button", { name: /^(Detail|Lihat)$/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: adminOps.tutorActivityUI.detailTitle })).toBeVisible();
  } },
  { screen: "tutor", id: "tutor-empty", mode: "empty", verify: async page => {
    await expect(page.getByText(adminOps.tutorActivityUI.emptyTitle)).toBeVisible();
  } },
  { screen: "offline", id: "offline-policy", verify: async page => {
    await expect(page.getByRole("heading", { name: adminOps.offlineCache.scheduleTitle })).toBeVisible();
    await expect(page.getByRole("button", { name: adminOps.offlineCache.save })).toBeDisabled();
  } },
  { screen: "offline", id: "offline-policy-draft", verify: async page => {
    await page.getByRole("switch", { name: adminOps.offlineCache.wifiOnly }).click();
    await expect(page.getByRole("button", { name: adminOps.offlineCache.save })).toBeEnabled();
  } },
  { screen: "offline", id: "offline-read-recovered", mode: "error", verify: async page => {
    await expect(page.getByText(adminOps.offlineCache.loadFailed)).toBeVisible();
    await page.getByRole("button", { name: admin.states.retry }).click();
    await expect(page.getByRole("heading", { name: adminOps.offlineCache.scheduleTitle })).toBeVisible();
  } },
  { screen: "links", id: "links-populated", verify: async page => {
    await expect(page.getByText("Kelas Kalkulus")).toBeVisible();
  } },
  { screen: "links", id: "links-qr", verify: async page => {
    await page.getByRole("button", { name: adminOps.shortLinksUI.qr }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kode QR untuk /s/kelas-kalkulus" })).toBeVisible();
  } },
  { screen: "links", id: "links-empty", mode: "empty", verify: async page => {
    await expect(page.getByText(adminOps.shortLinksUI.empty)).toBeVisible();
  } },
];

function rangeTrigger(page: Page) {
  return page.getByRole("combobox", { name: adminOps.featureUsageUI.rangeLabel });
}

function seedSession() {
  const timestamp = "2026-11-26T06:00:00.000Z";
  return {
    user: { id: "fixture-admin", email: "admin@example.invalid", emailVerified: true, name: "Admin Contoh", role: "admin", createdAt: timestamp, updatedAt: timestamp },
    session: { id: "fixture-session", userId: "fixture-admin", token: "fixture-not-a-secret", createdAt: timestamp, updatedAt: timestamp, expiresAt: "2030-01-01T00:00:00.000Z" },
  };
}

async function installRoutes(page: Page, scenario: typeof scenarios[number]) {
  const fixture = createMonitoringFixture(scenario.mode === "empty" ? "empty" : "populated");
  const signal = new AbortController().signal;
  const failingReads: Record<string, string> = { ops: "/api/admin/ops", keys: "/api/admin/key-diagnostics", offline: "/api/admin/offline/policy" };
  const failPath = failingReads[scenario.screen];
  let failures = 0;
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== localOrigin || request.method() !== "GET") {
      errors.push(`Unexpected request: ${request.method()} ${url.pathname} (${url.origin})`);
      await route.abort();
      return;
    }
    const path = url.pathname;
    if (!path.startsWith("/api/")) {
      if (request.headers()["next-router-prefetch"]) await route.fulfill({ status: 204, body: "" });
      else await route.continue();
      return;
    }
    if (scenario.mode === "error" && failPath === path && failures++ === 0) {
      intentionallyFailed.add(request.url());
      await route.fulfill({ status: 503, json: { error: "Synthetic transient failure" } });
      return;
    }
    const fixtureZyra = monitoringFixtureData.zyra;
    const data = await (async (): Promise<unknown> => {
      switch (path) {
        case "/api/auth/get-session": return seedSession();
        case "/api/admin/ops": return fixture.reader.read({ view: "ops" }, signal);
        case "/api/admin/ai-analytics": return fixture.reader.read({ view: "ai" }, signal);
        case "/api/admin/ai-analytics/usage": return { success: true, data: await fixture.reader.read({ view: "usage" }, signal) };
        case "/api/admin/zyra/ops": return { ...fixtureZyra, projectSlotCount: 4, configuredModels: [] };
        case "/api/zyra/proposals": return { proposals: monitoringFixtureData.proposals.proposals.map(proposal => ({
          ...proposal, courseId: null, createdAt: monitoringFixtureData.ops.checkedAt,
        })) };
        case "/api/admin/key-diagnostics": {
          const keys = await fixture.reader.read({ view: "keys" }, signal);
          return { ...keys, rpdLimits: {}, usageByModel: [], geminiKeys: keys.geminiKeys.map(entry => ({
            requestsMinute: 0, rpdLimit: 250, estimatedRpmLimit: 15, utilizationPercent: 0, consecutiveFailures: 0,
            ...entry,
          })) };
        }
        case "/api/admin/offline/policy": return fixture.reader.read({ view: "offline" }, signal);
        case "/api/admin/offline/catalog": return fixture.reader.read({ view: "offlineCatalog", id: url.searchParams.get("courseId") ?? undefined }, signal);
        case "/api/admin/short-links": return fixture.reader.read({ view: "links" }, signal);
        default:
          errors.push(`Unexpected local API: ${path}`);
          return undefined;
      }
    })();
    if (data === undefined) await route.abort();
    else await route.fulfill({ status: 200, json: data });
  });
}

async function main() {
  const filter = new Set(process.env.PARITY_MONITORING_SCREENS?.split(",").filter(Boolean));
  const ids = new Set(process.env.PARITY_MONITORING_CASES?.split(",").filter(Boolean));
  const screenOrder = [...filter];
  const cases = scenarios.filter(item => (!filter.size || filter.has(item.screen)) && (!ids.size || ids.has(item.id)))
    .sort((first, second) => screenOrder.indexOf(first.screen) - screenOrder.indexOf(second.screen));
  if (!cases.length) throw new Error("No monitoring scenarios matched.");
  await mkdir(destination, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE, args: ["--force-color-profile=srgb", "--disable-gpu"] });
  const captures: Record<string, unknown>[] = [];
  const failures: string[] = [];
  try {
    const widths = new Set(process.env.PARITY_MONITORING_WIDTHS?.split(",").map(Number));
    const sizes = viewports.filter(viewport => !widths.size || widths.has(viewport.width));
    if (!sizes.length) throw new Error("No monitoring viewports matched.");
    for (const scenario of cases) for (const theme of ["light", "dark"] as const) {
      const page = await browser.newPage({
        viewport: sizes[0], deviceScaleFactor: 1, locale: "id-ID", timezoneId: timeZone, reducedMotion: "reduce", colorScheme: theme,
      });
      await page.clock.setFixedTime(new Date("2026-11-26T07:00:00.000Z"));
      await page.addInitScript(dark => document.documentElement?.classList.toggle("dark", dark), theme === "dark");
      const name = `${scenario.id}-${theme}`;
      const errorStart = errors.length;
      page.on("pageerror", error => errors.push(`${name}: ${error.message}`));
      page.on("console", message => {
        if (message.type() !== "error") return;
        const url = message.location().url;
        if (!(message.text().includes("503") && intentionallyFailed.has(url))) errors.push(`${name}: ${message.text()}`);
      });
      page.on("response", response => {
        if (response.status() >= 400 && !(response.status() === 503 && intentionallyFailed.has(response.url()))) {
          errors.push(`${name}: HTTP ${response.status()} ${response.url()}`);
        }
      });
      try {
        await installRoutes(page, scenario);
        const entry = ["home", "features", "web"].includes(scenario.screen) ? "/monitoring" : "/monitoring/secondary";
        const path = entry + "?" + new URLSearchParams({ screen: scenario.screen, mode: scenario.mode ?? "populated", theme, ...scenario.query });
        const response = await page.goto(root + path, { waitUntil: "commit", timeout: 180000 });
        expect(response?.status()).toBe(200);
        expect(page.url()).toBe(root + path);
        await expect(page.locator('[data-monitoring-hydrated="true"]')).toBeVisible({ timeout: 90000 });
        await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), theme === "dark");
        await scenario.verify(page);
        await page.evaluate(() => document.fonts.ready);
        for (const viewport of sizes) {
          await page.setViewportSize(viewport);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
          expect(errors.slice(errorStart)).toEqual([]);
          const screenshot = `${name}-${viewport.width}.png`;
          await page.screenshot({ path: `${destination}/${screenshot}`, fullPage: true, animations: "disabled", timeout: 120000 });
          const viewportScreenshot = `${name}-${viewport.width}-viewport.png`;
          await page.screenshot({ path: `${destination}/${viewportScreenshot}`, animations: "disabled", timeout: 120000 });
          captures.push({ id: scenario.id, screen: scenario.screen, theme, viewport, screenshot, viewportScreenshot, url: page.url() });
          process.stdout.write(`passed ${name}-${viewport.width}\n`);
        }
      } catch (error) {
        failures.push(`${name}: ${String(error)} ${errors.slice(errorStart).join("\n")}`);
        process.stderr.write(failures.at(-1) + "\n");
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    const suffix = process.env.PARITY_MONITORING_SCREENS?.replaceAll(",", "-");
    await writeFile(`${destination}/cases${suffix ? "-" + suffix : ""}.json`, JSON.stringify({
      sha: execFileSync("git", ["rev-parse", "HEAD"]).toString().trim(),
      dpr: 1, locale: "id-ID", timeZone, captures, failures, errors,
    }, null, 2));
  }
  if (failures.length || errors.length) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
