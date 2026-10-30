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
  const sidebar = page.locator("aside[data-sidebar-ready=true]").first();
  await expect(sidebar).toHaveCount(1, { timeout: 30_000 });
  if (info.project.name === "mobile-380") {
    await expect(sidebar).toHaveAttribute("inert", "");
    await page.getByRole("button", { name: "Buka navigasi" }).click();
    await expect(sidebar).not.toHaveAttribute("aria-hidden", "true");
    await expect(sidebar).not.toHaveAttribute("inert", "");
    await expect(sidebar.getByRole("link", { name: "Panel admin", exact: true })).toBeVisible();
    await capture(page, info, "mobile-open");
    await page.keyboard.press("Escape");
    await expect(sidebar).toHaveAttribute("aria-hidden", "true");
    await expect(sidebar).toHaveAttribute("inert", "");
    await capture(page, info, "mobile-closed");
  } else {
    await expect(sidebar.getByRole("link", { name: "Panel admin", exact: true })).toBeVisible();
    await capture(page, info, "desktop-expanded");
    await sidebar.getByRole("button", { name: "Tutup sidebar" }).click();
    await expect(sidebar.getByRole("link", { name: "Panel admin", exact: true })).toBeVisible();
    await capture(page, info, "desktop-collapsed");
    await sidebar.getByRole("button", { name: "Akademik dan konten" }).click();
    await expect(page.getByRole("link", { name: "Mata kuliah", exact: true })).toBeVisible();
    await capture(page, info, "desktop-collapsed-menu");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
