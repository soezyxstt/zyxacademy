import { expect, test, type Page, type TestInfo } from "@playwright/test";

test.setTimeout(120_000);

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => document.fonts.ready);
  const path = info.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

test("admin navigation opens, closes and keeps accessible names", async ({ page }, info) => {
  const errors: string[] = [];
  await page.addInitScript(() => { delete (Navigator.prototype as { serviceWorker?: unknown }).serviceWorker; });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  expect((await page.goto("/admin", { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
  if (info.project.name === "mobile-380") {
    const mobileNavbar = page.locator("[data-mobile-navbar]");
    const mobileBottomNav = page.locator("[data-mobile-bottom-nav]");
    await expect(mobileNavbar).toBeVisible({ timeout: 30_000 });
    await expect(mobileBottomNav).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("aside[data-sidebar-ready=true]")).toHaveCount(0);
    await expect(page.locator("aside[data-desktop-sidebar]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Buka navigasi" })).toHaveCount(0);
    await expect(page.locator('a[href="/admin/gamification"]')).toHaveCount(0);
    await expect(mobileBottomNav.getByRole("link", { name: "Beranda", exact: true })).toBeVisible();
    await capture(page, info, "mobile-default");
    await mobileBottomNav.getByRole("button", { name: "Lainnya", exact: true }).click();
    const moreDialog = page.getByRole("dialog");
    await expect(moreDialog).toBeVisible();
    await expect(moreDialog.getByRole("heading", { name: "Semua modul admin", exact: true })).toBeVisible();
    await expect(moreDialog.getByRole("link", { name: "Mata kuliah", exact: true })).toBeVisible();
    await expect(moreDialog.locator('a[href="/admin/gamification"]')).toHaveCount(0);
    await capture(page, info, "mobile-more-open");
    await page.keyboard.press("Escape");
    await expect(moreDialog).toHaveCount(0);
    await capture(page, info, "mobile-more-closed");
  } else {
    const sidebar = page.locator("aside[data-sidebar-ready=true]").first();
    await expect(sidebar).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator("[data-mobile-navbar]")).toHaveCount(0);
    await expect(page.locator("[data-mobile-bottom-nav]")).toHaveCount(0);
    await expect(sidebar.locator('a[href="/admin/gamification"]')).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Panel admin", exact: true })).toBeVisible();
    await capture(page, info, "desktop-expanded");
    await sidebar.getByRole("button", { name: "Tutup sidebar" }).click();
    await expect(sidebar.getByRole("link", { name: "Panel admin", exact: true })).toBeVisible();
    await capture(page, info, "desktop-collapsed");
    await sidebar.getByRole("button", { name: "Akademik" }).click();
    await expect(page.getByRole("link", { name: "Mata kuliah", exact: true })).toBeVisible();
    await capture(page, info, "desktop-collapsed-menu");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
