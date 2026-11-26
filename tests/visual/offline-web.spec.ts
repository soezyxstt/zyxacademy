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

async function openFixture(page: Page, theme: "light" | "dark", locale: "id" | "en" = "id", scenario: OfflineWebScenario = "populated", mode: OfflineWebMode = "library", path = "/offline") {
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
    if (url.origin === origin && url.pathname === path) {
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fixture.styles}${fixtureFontStyles()}</style></head><body class="bg-background text-foreground"><div id="root"></div><script>${fixture.script.replace(/<\/script/gi, "<\\/script")}</script></body></html>` });
    }
    if (url.origin === origin && url.pathname === "/api/notifications/history") return route.fulfill({ json: { notifications: [], unreadCount: 0 } });
    if (url.origin === origin && /^\/brand\/zyx-logo-(?:horizontal|symbol)-(?:color|reversed)\.svg$/.test(url.pathname)) return route.fulfill({ contentType: "image/svg+xml", body: readFileSync(resolve("public", url.pathname.slice(1))) });
    failures.push(`Unexpected ${route.request().method()} ${url.href}`); return route.abort();
  });
  await page.goto(`${origin}${path}?locale=${locale}&mode=${mode}`);
  if (mode === "library") await expect(page.getByRole("heading", { name: locale === "id" ? "Bacaan offline" : "Offline readings", exact: true })).toBeVisible();
  else await expect(page.locator("h1").filter({ hasText: /Limit fungsi|Study guide/ }).first()).toBeVisible();
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
  await page.getByRole("button", { name: locale === "id" ? "Kelola materi di perangkat" : "Manage materials on this device" }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

for (const theme of ["light", "dark"] as const) test(`web offline library, reader and storage in ${theme}`, async ({ page }, info) => {
  const failures = await openFixture(page, theme);
  const offlineIndicator = page.getByText("Offline", { exact: true });
  await expect(offlineIndicator).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Limit fungsi/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Mata kuliah" })).toHaveCount(0);
  await capture(page, info, `offline-web-readings-${theme}`, failures);
  await page.evaluate(() => {
    window.__offlineWebConfig.online = true;
    window.dispatchEvent(new Event("online"));
  });
  await expect(offlineIndicator).toHaveCount(0);
  await expect(page.getByText("Online", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Buka aplikasi" })).toHaveAttribute("href", "/dashboard");
  await capture(page, info, `offline-web-readings-online-${theme}`, failures);
  await page.evaluate(() => {
    window.__offlineWebConfig.online = false;
    window.dispatchEvent(new Event("offline"));
  });
  await selectSection(page, "Mata kuliah");
  await page.getByRole("button", { name: /^Matematika I/ }).click();
  await capture(page, info, `offline-web-course-${theme}`, failures);
  await page.locator("li").filter({ hasText: "Limit fungsi" }).getByRole("button", { name: "Buka", exact: true }).click();
  await expect(page.locator("article .katex").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mendekati suatu nilai", exact: true })).toHaveCount(1);
  await expect(offlineIndicator).toHaveCount(1);
  await capture(page, info, `offline-web-reader-${theme}`, failures);
  await page.evaluate(() => {
    window.__offlineWebConfig.online = true;
    window.dispatchEvent(new Event("online"));
  });
  await expect(offlineIndicator).toHaveCount(0);
  await expect(page.getByText(/^(Online|Koneksi kembali tersedia)$/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Buka aplikasi" })).toHaveAttribute("href", /^\/courses\//);
  await expect(page.locator("article .katex").first()).toBeVisible();
  await capture(page, info, `offline-web-reader-online-${theme}`, failures);
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

for (const mode of ["article", "diktat"] as const) test(`online ${mode} toolbar and automatic admission on a second visit`, async ({ page }, info) => {
  const locale = mode === "article" ? "id" : "en";
  const theme = mode === "article" ? "dark" : "light";
  const resourceId = mode === "article" ? "limits" : "derivatives";
  const failures = await openFixture(page, theme, locale, "populated", mode, `/courses/math/material/${resourceId}`);
  const save = page.getByRole("button", { name: /^(Simpan offline|Save offline|Tersimpan offline|Saved offline)$/ });
  const update = page.getByRole("button", { name: /^(Materi diperbarui. Muat versi terbaru|Material updated. Load the latest version)$/ });
  const visits = () => page.evaluate(() => window.__offlineWebControls?.readVisits());
  const packages = () => page.evaluate(() => window.__offlineWebControls?.packageRequests);
  await expect.poll(visits).toBe(1);
  await expect(save).toHaveCount(0);
  await expect(update).toHaveCount(0);
  await expect(page.getByRole("button", { name: locale === "id" ? "Bagikan" : "Share", exact: true })).toBeVisible();
  await capture(page, info, `online-${mode}-first-visit`, failures);
  await page.evaluate(() => window.__offlineWebControls.reviseReading());
  await expect(page.locator("h1").filter({ hasText: /\(v3\)$/ }).first()).toBeVisible();
  await expect.poll(visits).toBe(1);
  expect(await packages()).toBe(0);

  await page.reload();
  await expect.poll(visits).toBe(2);
  await expect.poll(packages).toBe(1);
  await expect(save).toHaveCount(0);
  await capture(page, info, `online-${mode}-second-visit`, failures);

  await page.evaluate(() => window.__offlineWebControls.signalUpdate());
  await expect(update).toBeVisible();
  expect(await page.evaluate(() => window.__offlineWebControls.refreshes)).toBe(0);
  await capture(page, info, `online-${mode}-update`, failures);
  await update.click();
  await expect.poll(() => page.evaluate(() => window.__offlineWebControls.refreshes)).toBe(1);
  await page.evaluate(() => window.__offlineWebControls.signalRevocation());
  await expect.poll(() => page.evaluate(() => window.__offlineWebControls.refreshes)).toBe(2);
  expect(await packages()).toBe(1);
  expect(failures).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`web service-worker fallback keeps the student shell in ${theme}`, async ({ page }, info) => {
    const failures = await openFixture(page, theme, "id", "populated", "library", "/courses/math/material");
    const mobile = info.project.name === "mobile-380";
    const chrome = page.locator(mobile ? "[data-mobile-navbar]" : "[data-desktop-sidebar]");
    await expect(chrome).toBeVisible();
    await expect(chrome.getByText(/^(?:Offline|Online|Nightly)$/)).toHaveCount(0);
    await expect(page.locator("#main-content").getByText("Offline", { exact: true })).toBeVisible();
    await expect(chrome.getByRole("button", { name: "Notifikasi" })).toBeVisible();
    if (mobile) {
      await expect(chrome.getByRole("link", { name: "Kembali" })).toHaveAttribute("href", "/dashboard");
      const nav = page.locator("[data-mobile-bottom-nav]");
      expect(await nav.getByRole("link").evaluateAll(links => links.map(link => link.getAttribute("href"))))
        .toEqual(["/dashboard", "/courses", "/dashboard/schedule", "/dashboard/discussions", "/profile"]);
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);
    } else {
      await expect(chrome.getByRole("link", { name: "Matematika I" })).toHaveAttribute("href", "/courses/math");
      await expect(chrome.getByRole("button", { name: "Tutup sidebar" })).toBeVisible();
    }
    await capture(page, info, `student-navigation-web-${theme}`, failures);
  });
}
