import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOfflineWebFixture } from "./fixtures/offline-web-build";
import { fixtureFontStyles } from "./fixtures/fonts";
import type { OfflineWebMode, OfflineWebScenario } from "./fixtures/offline-web";

const origin = "https://offline-web.fixture.test";
const thumbnail = `data:image/png;base64,${readFileSync(resolve("tests/visual/fixtures/rich-documents/built/mechanics.png")).toString("base64")}`;
let fixture: Awaited<ReturnType<typeof buildOfflineWebFixture>>;
test.beforeAll(async () => { fixture = await buildOfflineWebFixture(); });

async function openFixture(page: Page, theme: "light" | "dark", locale: "id" | "en" = "id", scenario: OfflineWebScenario = "populated", mode: OfflineWebMode = "library") {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.addInitScript(config => {
    window.__offlineWebConfig = config;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => config.online });
  }, { locale, scenario, mode, thumbnail, online: mode !== "library" });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === "/offline") {
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fixture.styles}${fixtureFontStyles()}</style></head><body class="bg-background text-foreground"><div id="root"></div><script>${fixture.script.replace(/<\/script/gi, "<\\/script")}</script></body></html>` });
    }
    if (url.origin === origin && /^\/brand\/zyx-logo-(?:horizontal|symbol)-(?:color|reversed)\.svg$/.test(url.pathname)) return route.fulfill({ contentType: "image/svg+xml", body: readFileSync(resolve("public", url.pathname.slice(1))) });
    failures.push(`Unexpected ${route.request().method()} ${url.href}`); return route.abort();
  });
  await page.goto(`${origin}/offline?locale=${locale}&mode=${mode}`);
  if (mode === "library") await expect(page.getByRole("heading", { name: locale === "id" ? "Materi di perangkat" : "Materials on this device", exact: true })).toBeVisible();
  else await expect(page.getByRole("button", { name: locale === "id" ? "Simpan offline" : "Save offline", exact: true })).toBeVisible();
  return failures;
}

async function capture(page: Page, info: TestInfo, name: string, failures: string[]) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: info.project.name !== "mobile-380", animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" }); expect(failures).toEqual([]);
}

async function selectSection(page: Page, label: string, locale: "id" | "en" = "id") {
  const nav = page.getByRole("navigation", { name: locale === "id" ? "Materi di perangkat" : "Materials on this device" });
  const button = nav.getByRole("button", { name: label, exact: true });
  if (await button.isVisible()) await button.click();
  else { await nav.getByRole("button", { name: locale === "id" ? "Lebih" : "More", exact: true }).click(); await page.getByRole("menuitem", { name: label, exact: true }).click(); }
}

for (const theme of ["light", "dark"] as const) test(`web offline library, reader and storage in ${theme}`, async ({ page }, info) => {
  const failures = await openFixture(page, theme);
  await capture(page, info, `offline-web-courses-${theme}`, failures);
  await page.getByRole("button", { name: /^Matematika I/ }).click();
  await capture(page, info, `offline-web-course-${theme}`, failures);
  await page.locator("li").filter({ hasText: "Limit fungsi" }).getByRole("button", { name: "Buka", exact: true }).click();
  await expect(page.locator("article .katex").first()).toBeVisible();
  await capture(page, info, `offline-web-reader-${theme}`, failures);
  await page.evaluate(() => window.__offlineWebControls.updateReading());
  await expect(page.getByRole("button", { name: "Buka versi baru", exact: true })).toBeVisible();
  await expect(page.locator("article")).not.toContainText("Penjelasan versi terbaru");
  await capture(page, info, `offline-web-reader-update-${theme}`, failures);
  await page.getByRole("button", { name: "Buka versi baru", exact: true }).click();
  await expect(page.locator("article")).toContainText("Penjelasan versi terbaru");
  await page.getByRole("button", { name: "Bacaan", exact: true }).click();
  await selectSection(page, "Penyimpanan");
  await expect(page.getByRole("meter")).toBeVisible();
  await capture(page, info, `offline-web-storage-${theme}`, failures);
  await page.getByRole("button", { name: "Simpan tetap", exact: true }).click();
  await expect(page.getByRole("button", { name: "Lepas simpan tetap", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: /^Hapus Limit fungsi/ }).click();
  await expect(page.locator("li")).toHaveCount(1);
  await page.getByRole("button", { name: "Hapus unduhan", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, info, `offline-web-clear-${theme}`, failures);
  await page.getByRole("dialog").getByRole("button", { name: "Hapus unduhan", exact: true }).click();
  await expect(page.locator("li")).toHaveCount(0);
  await selectSection(page, "Mata kuliah");
  await expect(page.getByRole("button", { name: /^Matematika I/ })).toBeVisible();
  expect(failures).toEqual([]);
});

test("English web metadata and sync failure keep saved readings", async ({ page }, info) => {
  const failures = await openFixture(page, "light", "en");
  await selectSection(page, "Achievements", "en");
  await capture(page, info, "offline-web-achievements-en", failures);
  await selectSection(page, "Videos", "en");
  await expect(page.getByRole("button", { name: "Open", exact: true })).toBeDisabled();
  await expect(page.locator("li img")).toBeVisible();
  await capture(page, info, "offline-web-videos-en", failures);
  await page.evaluate(() => window.__offlineWebControls.setSyncError());
  await expect(page.getByRole("status").filter({ hasText: "Could not update" })).toBeVisible();
  await selectSection(page, "Readings", "en");
  await expect(page.locator("li")).toHaveCount(2);
  await capture(page, info, "offline-web-sync-error-en", failures);
});

for (const scenario of ["empty", "expired"] as const) test(`web ${scenario} library hides unavailable metadata`, async ({ page }, info) => {
  const failures = await openFixture(page, "dark", "id", scenario);
  await expect(page.locator("li")).toHaveCount(0);
  if (scenario === "expired") await expect(page.getByRole("status").filter({ hasText: "memeriksa akses" })).toBeVisible();
  await capture(page, info, `offline-web-${scenario}`, failures);
});

test("article reader shows pending save, saved state and an explicit update action", async ({ page }, info) => {
  const failures = await openFixture(page, "dark", "id", "populated", "article");
  await page.evaluate(() => { window.__offlineWebControls.downloadMode = "pending"; });
  const save = page.getByRole("button", { name: "Simpan offline", exact: true });
  await save.click(); await expect(save).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.__offlineWebControls.downloadPending)).toBe(true);
  await capture(page, info, "offline-article-saving", failures);
  await page.evaluate(() => { window.__offlineWebControls.downloadMode = "success"; window.__offlineWebControls.releaseDownload(); });
  await expect(page.getByRole("button", { name: "Tersimpan offline", exact: true })).toBeEnabled();
  await page.evaluate(() => window.__offlineWebControls.signalUpdate());
  await expect(page.getByRole("button", { name: "Materi diperbarui. Muat versi terbaru", exact: true })).toBeVisible();
  await capture(page, info, "offline-article-update", failures);
  expect(await page.evaluate(() => window.__offlineWebControls.refreshes)).toBe(0);
  await page.getByRole("button", { name: "Materi diperbarui. Muat versi terbaru", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__offlineWebControls.refreshes)).toBe(1);
  expect(failures).toEqual([]);
});

test("English diktat reader keeps the document available after a failed offline download", async ({ page }, info) => {
  const failures = await openFixture(page, "light", "en", "populated", "diktat");
  await page.evaluate(() => { window.__offlineWebControls.downloadMode = "error"; });
  await page.getByRole("button", { name: "Save offline", exact: true }).click();
  const retry = page.getByRole("button", { name: "Not saved. Check your connection and storage, then try again.", exact: true });
  await expect(retry).toBeVisible();
  await capture(page, info, "offline-diktat-download-error-en", failures);
  await page.evaluate(() => { window.__offlineWebControls.downloadMode = "success"; });
  await retry.click();
  await expect(page.getByRole("button", { name: "Saved offline", exact: true })).toBeEnabled();
  await capture(page, info, "offline-diktat-downloaded-en", failures);
  expect(failures).toEqual([]);
});
