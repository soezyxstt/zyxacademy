import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ROUTE = "/visual-fixtures/admin-courses";
test.setTimeout(120_000);

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => document.fonts.ready);
  const path = testInfo.outputPath(`screenshots/${name}.png`);
  await page.screenshot({
    path, fullPage: true, animations: "disabled", caret: "hide", scale: "css",
    style: "nextjs-portal { display: none; }",
  });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.describe("Admin course grid", () => {
  test("omit decorative descriptions from the course grid", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(ROUTE, { waitUntil: "domcontentloaded", timeout: 90_000 });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("[data-fixture-ready=true]")).toBeVisible();
    const grid = page.getByRole("button", { name: "Tampilan kartu" });
    await grid.click();
    await expect(grid).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("a:visible", { hasText: "Matematika I" })).toBeVisible();
    await expect(page.getByText("Deskripsi ini tetap tersimpan")).toHaveCount(0);
    await capture(page, testInfo, "admin-courses-grid");
    const courseActions = page.getByRole("button", { name: "Aksi", exact: true }).first();
    await courseActions.click();
    await expect(page.getByRole("menuitem", { name: "Kelola", exact: true })).toBeVisible();
    await capture(page, testInfo, "admin-course-actions");
    await page.keyboard.press("Escape");
    await expect(courseActions).toBeFocused();
    const openSearch = page.getByRole("button", { name: "Cari mata kuliah atau kode slug..." });
    await openSearch.click();
    const search = page.getByPlaceholder("Cari mata kuliah atau kode slug...");
    await expect(search).toBeFocused();
    await search.fill("Matematika");
    await expect(page.locator("a:visible", { hasText: "Matematika I" })).toBeVisible();
    await expect(page.locator("a:visible", { hasText: "Fisika Dasar I" })).toHaveCount(0);
    if ((page.viewportSize()?.width ?? 0) < 640) {
      expect((await search.boundingBox())!.width).toBeGreaterThan(200);
    }
    await capture(page, testInfo, "admin-courses-search");
    await search.press("Escape");
    await expect(openSearch).toBeFocused();
    await expect(page.locator("a:visible", { hasText: "Fisika Dasar I" })).toBeVisible();

    const category = page.getByRole("combobox", { name: "Program studi / kategori" });
    await category.click();
    await page.getByRole("option", { name: "TPB", exact: true }).click();
    await openSearch.click();
    await search.fill("Matematika");
    await expect(category).toBeVisible();
    await expect(category).toHaveText("TPB");
    await capture(page, testInfo, "admin-courses-search-with-category");
    await search.press("Escape");
    await expect(openSearch).toBeFocused();
    await expect(category).toHaveText("TPB");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });
});
