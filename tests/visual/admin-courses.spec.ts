import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ROUTE = "/visual-fixtures/admin-courses";

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => document.fonts.ready);
  const path = testInfo.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.describe("Admin course cards", () => {
  test("omit decorative descriptions from the course grid", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(ROUTE, { waitUntil: "domcontentloaded", timeout: 90_000 });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("[data-fixture-ready=true]")).toBeVisible();
    await expect(page.getByText("Matematika I")).toBeVisible();
    await expect(page.getByText("Deskripsi ini tetap tersimpan")).toHaveCount(0);
    const search = page.getByPlaceholder("Cari mata kuliah atau kode slug...");
    await search.fill("Matematika");
    await expect(page.getByText("Fisika Dasar I")).toHaveCount(0);
    await search.fill("");
    await expect(page.getByText("Fisika Dasar I")).toBeVisible();
    await capture(page, testInfo, "admin-courses-grid");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });
});
