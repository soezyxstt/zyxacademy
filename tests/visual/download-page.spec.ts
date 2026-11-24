import { expect, test } from "@playwright/test";

test("public download page keeps Apple installers unavailable in both locales", async ({ page }, testInfo) => {
  for (const [locale, heading] of [["id", "Unduh Zyx Academy"], ["en", "Download Zyx Academy"]]) {
    const response = await page.goto(`/${locale}/download`);
    expect(response?.ok()).toBe(true);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: heading })).toBeVisible();
    for (const platform of ["macOS", "iPhone"]) {
      const row = main.getByRole("listitem").filter({ hasText: platform });
      await expect(row.getByRole("button")).toBeDisabled();
      await expect(row.getByRole("link")).toHaveCount(0);
    }
    const marks = main.locator('li img[src^="/platforms/"]');
    await expect(marks).toHaveCount(6);
    await expect.poll(() => marks.evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`download-${locale}.png`), animations: "disabled" });
  }
});

test("desktop navbar spaces groups evenly and keeps the page links together", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-380");
  await page.goto("/id/download");
  const nav = page.getByRole("navigation", { name: "Navigasi utama" });
  const tabs = nav.locator("ul > li");
  const search = nav.getByRole("button", { name: "Cari", exact: true });
  await expect(nav.locator("#mobile-navigation").getByRole("button", { name: "Cari", exact: true })).toBeVisible();
  const [logo, first, next, last, searchBox, language, theme, download] = await Promise.all([
    nav.getByRole("link", { name: "Beranda Zyx Academy" }).boundingBox(),
    tabs.first().boundingBox(), tabs.nth(1).boundingBox(), tabs.last().boundingBox(),
    search.boundingBox(), nav.locator("button[aria-pressed]").boundingBox(),
    nav.getByRole("button", { name: /ubah tema|change theme/i }).boundingBox(),
    nav.getByRole("link", { name: "Unduh", exact: true }).boundingBox(),
  ]);
  if (!logo || !first || !next || !last || !searchBox || !language || !theme || !download) throw new Error("Missing desktop navigation group");
  const leftGap = first.x - (logo.x + logo.width);
  const rightGap = searchBox.x - (last.x + last.width);
  expect(searchBox.x).toBeLessThan(language.x);
  expect(language.x).toBeLessThan(theme.x);
  expect(theme.x).toBeLessThan(download.x);
  expect(Math.abs(leftGap - rightGap)).toBeLessThan(2);
  expect(next.x - (first.x + first.width)).toBeLessThan(leftGap);
});

test("mobile marketing menu shares its header and restores keyboard focus", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-380");
  await page.goto("/id/download");
  const nav = page.getByRole("navigation", { name: "Navigasi utama" });
  const toggle = nav.getByRole("button", { name: "Buka menu" });
  await toggle.click();
  const panel = nav.locator("#mobile-navigation");
  await expect(panel.getByRole("link", { name: "Unduh" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Beranda Zyx Academy" })).toHaveCount(1);
  await expect(nav.getByRole("button", { name: "Cari", exact: true })).toHaveCount(1);
  await expect(nav.locator("button[aria-pressed]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(panel).toBeHidden();
});
