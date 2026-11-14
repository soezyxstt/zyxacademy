import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { stubVisualTelemetry } from "@/tests/visual/telemetry-stubs";
import { waitForVisualReadiness } from "@/tests/visual/visual-readiness";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const localBase = ["127.0.0.1", "localhost", "::1"].includes(new URL(baseURL).hostname);
const studentStatePath = resolve("artifacts/bilingual/student-auth.json");
const loggedFixtureReady = localBase
  && process.env.BILINGUAL_ACCOUNT_STORAGE_STATES === "1"
  && existsSync(studentStatePath);
const emptyStorageState = { cookies: [], origins: [] };

type PageDiagnostics = {
  runtime: string[];
  console: string[];
  failedRequests: string[];
  badResponses: string[];
};

function collectDiagnostics(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = { runtime: [], console: [], failedRequests: [], badResponses: [] };
  page.on("pageerror", (error) => diagnostics.runtime.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.console.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (!request.failure()?.errorText.includes("ERR_ABORTED")) {
      diagnostics.failedRequests.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) diagnostics.badResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return diagnostics;
}

function expectNoRuntimeOrNetworkErrors(diagnostics: PageDiagnostics) {
  expect(diagnostics.runtime, "uncaught browser errors").toEqual([]);
  expect(diagnostics.console, "console errors").toEqual([]);
  expect(diagnostics.failedRequests, "unexpected failed requests").toEqual([]);
  expect(diagnostics.badResponses, "HTTP responses with status >= 400").toEqual([]);
}

test.setTimeout(90_000);
test.beforeEach(async ({ page }) => {
  await stubVisualTelemetry(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
});

async function openMobileMenu(page: Page) {
  const openMenu = page.getByRole("button", { name: /open menu|buka menu/i });
  await expect(openMenu).toBeVisible();
  await openMenu.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  return sheet;
}

async function prepareLocale(sheet: ReturnType<Page["getByRole"]>, page: Page, targetLocale: "id" | "en") {
  const toggle = sheet.locator("button[aria-pressed]");
  await expect(toggle).toHaveCount(1);
  const currentLocale = await page.locator("html").getAttribute("lang");
  if (currentLocale !== targetLocale) {
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("lang", targetLocale);
  }
  await expect(toggle).toHaveAttribute("aria-pressed", targetLocale === "en" ? "true" : "false");
  await expect(toggle).toHaveText(targetLocale.toUpperCase());
  await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === "zyx_locale")?.value)
    .toBe(targetLocale);
}

async function expectInsideViewport(element: ReturnType<Page["getByRole"]>, sheet: ReturnType<Page["getByRole"]>, page: Page) {
  const [elementBox, sheetBox, viewport] = await Promise.all([
    element.boundingBox(),
    sheet.boundingBox(),
    page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
  ]);
  expect(elementBox, "expected a visible control box").not.toBeNull();
  expect(sheetBox, "expected a visible navigation sheet box").not.toBeNull();
  if (!elementBox || !sheetBox) return;
  expect(elementBox.x).toBeGreaterThanOrEqual(sheetBox.x - 1);
  expect(elementBox.y).toBeGreaterThanOrEqual(sheetBox.y - 1);
  expect(elementBox.x + elementBox.width).toBeLessThanOrEqual(sheetBox.x + sheetBox.width + 1);
  expect(elementBox.y + elementBox.height).toBeLessThanOrEqual(sheetBox.y + sheetBox.height + 1);
  expect(elementBox.x).toBeGreaterThanOrEqual(0);
  expect(elementBox.x + elementBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(elementBox.y).toBeGreaterThanOrEqual(0);
  expect(elementBox.y + elementBox.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function captureMobileSheet(page: Page, sheet: ReturnType<Page["getByRole"]>, testInfo: TestInfo, name: string) {
  await waitForVisualReadiness(page);
  const sheetBox = await sheet.boundingBox();
  const [viewport, sheetDimensions] = await Promise.all([
    page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth })),
    sheet.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })),
  ]);
  expect(sheetBox).not.toBeNull();
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width);
  expect(sheetDimensions.scrollWidth).toBeLessThanOrEqual(sheetDimensions.clientWidth);
  if (sheetBox) {
    expect(sheetBox.x).toBeGreaterThanOrEqual(0);
    expect(sheetBox.x + sheetBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(sheetBox.y).toBeGreaterThanOrEqual(0);
    expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

const matrix = [
  { width: 320, height: 844 },
  { width: 380, height: 844 },
] as const;

for (const session of ["guest", "student"] as const) {
  test.describe(`${session} public navbar mobile sheet`, () => {
    test.use({
      storageState: session === "student" && existsSync(studentStatePath) ? studentStatePath : emptyStorageState,
    });
    if (session === "student") {
      test.skip(!loggedFixtureReady, "Requires the ignored local-only synthetic student auth state.");
    }

    for (const viewport of matrix) {
      for (const theme of ["light", "dark"] as const) {
        for (const locale of ["id", "en"] as const) {
          test(`${viewport.width}px ${theme} ${locale}`, async ({ page, context }, testInfo) => {
            test.skip(testInfo.project.name !== "mobile-380", "This focused matrix sets its own 320px and 380px mobile viewports.");
            const diagnostics = collectDiagnostics(page);
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
            await page.addInitScript(() => { try { localStorage.removeItem("theme"); } catch { /* Storage is unavailable on about:blank. */ } });
            await context.addCookies([{ name: "zyx_locale", value: locale, url: baseURL, sameSite: "Lax" }]);
            await page.goto("/plans");
            await waitForVisualReadiness(page);
            await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /(?!.*dark)/);

            const sheet = await openMobileMenu(page);
            await prepareLocale(sheet, page, locale);
            await expect(sheet.getByRole("combobox")).toHaveCount(0);

            const themeToggle = sheet.getByRole("button", { name: /change theme|ubah tema/i });
            const languageToggle = sheet.locator("button[aria-pressed]");
            await expect(themeToggle).toBeVisible();
            await expect(languageToggle).toBeVisible();
            for (const control of [themeToggle, languageToggle]) {
              const box = await control.boundingBox();
              expect(box).not.toBeNull();
              if (box) {
                expect(box.width).toBeCloseTo(32, 0);
                expect(box.height).toBeCloseTo(32, 0);
              }
              await expectInsideViewport(control, sheet, page);
            }

            if (session === "student") {
              const account = sheet.getByRole("button", { name: /bilingual student fixture/i });
              await expect(account).toBeVisible();
              await expect(account).toContainText("bilingual-student@example.invalid");
              await expectInsideViewport(account, sheet, page);
              await account.click();
              const menu = page.getByRole("menu");
              await expect(menu.getByRole("menuitem", { name: /sign out|keluar/i })).toBeVisible();
              await expect(menu.getByRole("menuitem", { name: /student dashboard|dasbor siswa/i })).toHaveAttribute("href", "/dashboard");
              await page.keyboard.press("Escape");
            } else {
              const signIn = sheet.getByRole("button", { name: /sign in with google|masuk dengan google/i });
              await expect(signIn).toBeVisible();
              await expectInsideViewport(signIn, sheet, page);
            }

            await captureMobileSheet(page, sheet, testInfo, `${session}-navbar-sheet-${viewport.width}-${theme}-${locale}`);
            expectNoRuntimeOrNetworkErrors(diagnostics);
          });
        }
      }
    }
  });
}
