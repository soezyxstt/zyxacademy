import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { stubVisualTelemetry } from "@/tests/visual/telemetry-stubs";
import { waitForVisualReadiness } from "@/tests/visual/visual-readiness";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const studentStatePath = resolve("artifacts/bilingual/student-auth.json");
const localBase = ["127.0.0.1", "localhost", "::1"].includes(new URL(baseURL).hostname);
const pkaFixtureReady = localBase
  && process.env.BILINGUAL_ACCOUNT_STORAGE_STATES === "1"
  && existsSync(studentStatePath);

type BoundaryGuards = {
  runtimeErrors: string[];
  httpErrors: Array<{ status: number; pathname: string }>;
  externalRequests: string[];
};

const guardsByPage = new WeakMap<Page, BoundaryGuards>();

function installBoundaryGuards(page: Page) {
  const guards: BoundaryGuards = { runtimeErrors: [], httpErrors: [], externalRequests: [] };
  guardsByPage.set(page, guards);
  page.on("pageerror", error => guards.runtimeErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") guards.runtimeErrors.push(message.text());
  });
  page.on("response", response => {
    if (response.status() >= 400) {
      guards.httpErrors.push({
        status: response.status(),
        pathname: new URL(response.url()).pathname,
      });
    }
  });
  const allowedOrigin = new URL(baseURL).origin;
  page.route("**/*", route => {
    const requestUrl = new URL(route.request().url());
    if (["http:", "https:"].includes(requestUrl.protocol) && requestUrl.origin !== allowedOrigin) {
      guards.externalRequests.push(requestUrl.origin);
      return route.abort();
    }
    return route.continue();
  });
  return guards;
}

async function assertBoundaryGuards(page: Page) {
  const guards = guardsByPage.get(page);
  expect(guards, "boundary guards should be installed before navigation").toBeDefined();
  expect(guards!.runtimeErrors, "browser runtime and console errors").toEqual([]);
  expect(guards!.externalRequests, "browser must not make external network requests").toEqual([]);
  expect(guards!.httpErrors, "unexpected HTTP 4xx/5xx responses").toEqual([]);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth, "document should not overflow horizontally").toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test.setTimeout(90_000);
test.use({ reducedMotion: "reduce" });

test.beforeEach(async ({ page }) => {
  installBoundaryGuards(page);
  await stubVisualTelemetry(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
});

test("MCP invalid authorization errors follow the locale cookie", async ({ page, context }, testInfo) => {
  const cases = [
    {
      locale: "id",
      heading: "Parameter permintaan tidak valid",
      description: "Permintaan otorisasi harus menyertakan response_type=code, code_challenge_method=S256, dan parameter code_challenge yang sah.",
    },
    {
      locale: "en",
      heading: "Invalid request parameters",
      description: "The authorization request must include response_type=code, code_challenge_method=S256, and a valid code_challenge.",
    },
  ] as const;

  for (const item of cases) {
    await context.clearCookies();
    await context.addCookies([
      { name: "zyx_locale", value: item.locale, url: baseURL, sameSite: "Lax" },
    ]);

    const response = await page.goto("/mcp/authorize?response_type=token&code_challenge_method=plain", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    await waitForVisualReadiness(page);
    await expect(page.locator("html")).toHaveAttribute("lang", item.locale);
    await expect(page.getByRole("heading", { name: item.heading })).toBeVisible();
    await expect(page.getByText(item.description, { exact: true })).toBeVisible();
    await expect(page.getByText("invalid_request", { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`mcp-authorize-${item.locale}.png`),
      fullPage: true,
    });
  }
  await assertBoundaryGuards(page);
});

test("unprefixed requests ignore spoofed locale headers and prefixed private/API URLs stay out of the public rewrite map", async ({ page, context }) => {
  await context.addCookies([
    { name: "zyx_locale", value: "id", url: baseURL, sameSite: "Lax" },
  ]);
  await page.setExtraHTTPHeaders({ "x-app-locale": "en" });

  const plansResponse = await page.goto("/plans", { waitUntil: "domcontentloaded" });
  expect(plansResponse?.status()).toBe(200);
  await waitForVisualReadiness(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await expect(page.getByRole("heading", { name: "Paket & layanan" })).toBeVisible();

  await page.setExtraHTTPHeaders({});
  const privatePath = "/en/admin";
  const privateResponse = await page.request.get(privatePath, { maxRedirects: 0 });
  expect(new URL(privateResponse.url()).pathname).toBe(privatePath);
  expect(privateResponse?.status()).toBe(404);

  const apiPath = "/en/api/bilingual-boundary-intentionally-missing";
  const apiResponse = await page.request.get(apiPath, { maxRedirects: 0 });
  expect(new URL(apiResponse.url()).pathname).toBe(apiPath);
  expect(apiResponse.status()).toBe(404);

  const assetResponse = await page.request.get("/favicon.ico", { maxRedirects: 0 });
  expect(new URL(assetResponse.url()).pathname).toBe("/favicon.ico");
  expect(assetResponse.status()).toBe(200);
  await assertBoundaryGuards(page);
});

test.describe("synthetic student PKA report boundary", () => {
  test.use({ storageState: existsSync(studentStatePath) ? studentStatePath : undefined });
  test.skip(!pkaFixtureReady, "Requires the local-only synthetic student auth state seeded for bilingual browser checks.");

  test("report route either renders its shell or records the fixture's enrollment/data boundary", async ({ page }, testInfo) => {
    const reportPath = "/courses/tutorial-pka/laporan";
    const availability = await page.request.get(reportPath, { maxRedirects: 0 });
    if (availability.status() === 404) {
      const evidencePath = testInfo.outputPath("pka-report-boundary.json");
      await mkdir(dirname(evidencePath), { recursive: true });
      await writeFile(evidencePath, JSON.stringify({
        outcome: "report unavailable; PKA route or course is not available in this local database/environment",
        requestedPath: reportPath,
        status: availability.status(),
      }, null, 2));
      await testInfo.attach("pka-report-boundary.json", {
        path: evidencePath,
        contentType: "application/json",
      });
      test.skip(true, "Synthetic fixture has no available PKA report route/course in this local database.");
    }
    expect(availability.status(), "PKA report preflight should not return an HTTP error").toBeLessThan(400);

    const response = await page.goto(reportPath, { waitUntil: "domcontentloaded" });
    await waitForVisualReadiness(page);

    const finalPath = new URL(page.url()).pathname;
    let outcome: string;
    if (finalPath === reportPath) {
      await expect(page.getByRole("heading", { name: "Laporan diagnostik" })).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("pka-report-boundary.png"),
        fullPage: true,
      });
      const notAttemptedCount = await page.getByText("Belum dicoba", { exact: true }).count();
      outcome = notAttemptedCount > 0 ? "report rendered; fixture has no attempted PKA stages" : "report shell rendered; data availability not inferred";
    } else if (finalPath === "/courses/tutorial-pka/daftar") {
      outcome = "redirected to PKA enrollment; report unavailable for this fixture";
    } else if (finalPath === "/sign-in") {
      outcome = "synthetic session was unavailable; redirected to sign-in";
    } else {
      throw new Error(`Unexpected PKA report boundary path: ${finalPath}`);
    }

    await testInfo.attach("pka-report-boundary.json", {
      body: Buffer.from(JSON.stringify({
        outcome,
        finalPath,
        finalStatus: response?.status() ?? null,
      }, null, 2)),
      contentType: "application/json",
    });
    await assertBoundaryGuards(page);
  });
});
