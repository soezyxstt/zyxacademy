import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSettingsPreferencesFixture } from "./fixtures/settings-preferences-build";
import { fixtureFontStyles } from "./fixtures/fonts";

const origin = "https://preferences.fixture.test";
let fixture: Awaited<ReturnType<typeof buildSettingsPreferencesFixture>>;
let fonts: string;
test.beforeAll(async () => {
  fixture = await buildSettingsPreferencesFixture();
  fonts = fixtureFontStyles();
});

async function openPreferences(page: Page, theme: "light" | "dark", locale = "id", tab?: string, prompt?: string) {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === "/settings") {
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fixture.styles}${fonts}</style></head><body class="bg-background text-foreground"><div id="root"></div><script>${fixture.script.replace(/<\/script/gi, "<\\/script")}</script></body></html>` });
    }
    if (url.origin === origin && /^\/brand\/zyx-logo-(?:horizontal|symbol)-(?:color|reversed)\.svg$/.test(url.pathname)) {
      return route.fulfill({ contentType: "image/svg+xml", body: readFileSync(resolve("public", url.pathname.slice(1))) });
    }
    if (url.origin === origin && url.pathname === "/api/notifications/status") {
      return route.fulfill({ json: { transports: { webpush: { registeredCount: 0, configured: true } } } });
    }
    if (url.origin === origin && route.request().method() === "GET" && url.pathname === "/api/account/sessions") {
      return route.fulfill({ json: { sessions: [{
        id: "fixture-current", label: "Chrome on Windows", current: true,
        createdAt: "2026-11-25T08:00:00.000Z", updatedAt: "2026-11-25T08:00:00.000Z",
        expiresAt: "2026-12-25T08:00:00.000Z",
      }] } });
    }
    if (url.origin === origin && route.request().method() === "GET" && url.pathname === "/api/notifications/quiet-hours") {
      return route.fulfill({ json: { enabled: false, startMinute: 1320, endMinute: 420, timeZone: "Asia/Jakarta" } });
    }
    failures.push(`Unexpected ${route.request().method()} ${url.href}`);
    return route.abort();
  });
  const url = `${origin}/settings?locale=${locale}${tab ? `&tab=${tab}` : ""}${prompt ? `&permissionPrompt=${prompt}` : ""}`;
  expect((await page.goto(url))?.status()).toBe(200);
  expect(page.url()).toBe(url);
  if (!prompt) await expect(page.getByRole("main").getByRole("tablist")).toBeVisible();
  return failures;
}

async function capture(page: Page, info: TestInfo, name: string, failures: string[], fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
  expect(failures).toEqual([]);
}

async function choose(page: Page, label: string, value: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}

for (const theme of ["light", "dark"] as const) {
  test(`settings source fixture groups controls and keeps preferences in ${theme} mode`, async ({ page }, info) => {
    const failures = await openPreferences(page, theme);
    const main = page.getByRole("main");
    await expect(main.getByRole("tab", { name: "Umum", selected: true })).toBeVisible();
    await expect(main.getByRole("combobox", { name: "Bahasa", exact: true })).toBeVisible();
    await expect(main.getByRole("switch", { name: "Getaran", exact: true })).toBeDisabled();
    await expect(main.getByRole("link", { name: "Kelola bacaan", exact: true })).toHaveAttribute("href", "/offline");
    await expect(main.getByRole("link", { name: "Unduh aplikasi", exact: true })).toHaveAttribute("href", "/download");
    await capture(page, info, `preferences-general-${theme}`, failures);

    await main.getByRole("tab", { name: "Tampilan", exact: true }).click();
    await expect(page).toHaveURL(/tab=appearance/);
    const spacing = main.getByRole("combobox", { name: "Jarak antarelemen", exact: true });
    await expect(spacing).toHaveText("Normal");
    await expect(main.getByRole("combobox", { name: "Bahasa", exact: true })).toHaveCount(0);
    await expect(main.getByRole("switch", { name: "Getaran", exact: true })).toHaveCount(0);
    await capture(page, info, `preferences-appearance-${theme}`, failures);
    await spacing.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option", { name: "Rapat", exact: true })).toBeVisible();
    await capture(page, info, `preferences-spacing-menu-${theme}`, failures);
    await page.keyboard.press("Escape");
    await expect(spacing).toBeFocused();
    await choose(page, "Jarak antarelemen", "Rapat");
    await choose(page, "Ukuran teks", "Besar");
    await main.getByRole("switch", { name: "Animasi", exact: true }).click();

    await main.getByRole("tab", { name: "Notifikasi", exact: true }).click();
    await expect(page).toHaveURL(/tab=notifications/);
    await expect(main.getByText("pelajar@example.test", { exact: false })).toBeVisible();
    await expect(main.getByText("Memeriksa status...", { exact: true })).toHaveCount(0);
    const position = main.getByRole("combobox", { name: "Posisi pemberitahuan di layar", exact: true });
    await choose(page, "Posisi pemberitahuan di layar", "Kiri bawah");
    const previewToast = page.locator('[data-sonner-toast][data-x-position="left"][data-y-position="bottom"]');
    await expect(previewToast.getByText("Pemberitahuan akan muncul di sini")).toBeVisible();
    await previewToast.getByRole("button", { name: "Tutup", exact: true }).click();
    await expect(previewToast).toHaveCount(0);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await capture(page, info, `preferences-notifications-${theme}`, failures, false);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await expect(main.getByRole("button", { name: "Simpan preferensi", exact: true })).toBeInViewport();
    await capture(page, info, `preferences-notification-email-${theme}`, failures, false);

    expect((await page.goto(`${origin}/settings?locale=id&tab=email`))?.status()).toBe(200);
    await expect(main.getByRole("tab", { name: "Notifikasi", selected: true })).toBeVisible();
    await expect(position).toHaveText("Kiri bawah");
    await main.getByRole("tab", { name: "Tampilan", exact: true }).click();
    await expect(spacing).toHaveText("Rapat");
    await expect(main.getByRole("switch", { name: "Animasi", exact: true })).not.toBeChecked();
    const hapticsBeforeReset = await page.evaluate(() => localStorage.getItem("zyx-haptics-enabled"));
    await main.getByRole("button", { name: "Kembalikan tampilan awal", exact: true }).click();
    await expect(spacing).toHaveText("Normal");
    await expect(main.getByRole("combobox", { name: "Ukuran teks", exact: true })).toHaveText("Normal");
    await expect(main.getByRole("switch", { name: "Animasi", exact: true })).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem("zyx-haptics-enabled"))).toBe(hapticsBeforeReset);
    await main.getByRole("tab", { name: "Notifikasi", exact: true }).click();
    await expect(position).toHaveText("Kiri bawah");
    expect((await page.goto(`${origin}/settings?locale=id&tab=appearance`))?.status()).toBe(200);
    await expect(main.getByRole("tab", { name: "Tampilan", selected: true })).toBeVisible();
    await expect(spacing).toHaveText("Normal");
    expect(failures).toEqual([]);
  });
}

test("settings source fixture keeps English deep links and applies language changes", async ({ page }) => {
  const failures = await openPreferences(page, "light", "en", "email");
  const main = page.getByRole("main");
  await expect(main.getByRole("tab", { name: "Notifications", selected: true })).toBeVisible();
  await main.getByRole("tab", { name: "General", exact: true }).click();
  await choose(page, "Language", "Bahasa Indonesia");
  await expect(main.getByRole("tab", { name: "Umum", selected: true })).toBeVisible();
  await main.getByRole("tab", { name: "Profil", exact: true }).click();
  await expect(page).toHaveURL(/tab=profile/);
  await expect(main.getByRole("link", { name: "Edit profil", exact: true })).toHaveAttribute("href", "/profile/edit");
  expect(failures).toEqual([]);
});

test("notification activity preferences and permission dialog review", async ({ page }, info) => {
  const failures = await openPreferences(page, "light", "id", "notifications");
  const main = page.getByRole("main");
  const discussions = main.getByRole("switch", { name: "Diskusi", exact: true });
  const flashcards = main.getByRole("switch", { name: "Pengingat flashcard", exact: true });
  await expect(discussions).toBeChecked();
  await expect(flashcards).toBeChecked();
  await expect(main.getByRole("switch", { name: "Aktifkan jam tenang", exact: true })).not.toBeChecked();
  await expect(main.getByRole("switch", { name: "Aktifkan jam tenang", exact: true })).toBeVisible();
  await capture(page, info, "notification-preferences", failures, true);
  await capture(page, info, "notification-preferences-viewport", failures, false);
  await discussions.click();
  await expect(discussions).not.toBeChecked();
  await expect(flashcards).toBeChecked();
  await expect(discussions).toBeEnabled();
  await discussions.click();
  await expect(discussions).toBeChecked();
  await page.goto(`${origin}/settings?locale=id&tab=notifications&permissionPrompt=default`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", {name: "Aktifkan notifikasi"})).toBeVisible();
  await expect(dialog.getByRole("button", {name: "Ingatkan saya nanti"})).toBeVisible();
  await expect(dialog.getByRole("button", {name: "Jangan tampilkan lagi"})).toBeVisible();
  await capture(page, info, "notification-permission-dialog", failures, false);
  await dialog.getByRole("button", {name: "Ingatkan saya nanti"}).click();
  await expect(dialog).not.toBeVisible();
  await page.goto(`${origin}/settings?locale=en&tab=notifications&permissionPrompt=blocked`);
  await expect(dialog.getByRole("button", {name: "Open preferences"})).toBeVisible();
  await expect(dialog.getByRole("button", {name: "Don't show again"})).toBeVisible();
  await capture(page, info, "notification-permission-blocked-en", failures, false);
});
