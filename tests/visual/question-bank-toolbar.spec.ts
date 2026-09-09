import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ROUTE = "/visual-fixtures/question-bank-toolbar";

async function assertAndCapture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

  const path = testInfo.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ caret: "initial", fullPage: true, path, scale: "css" });
  await testInfo.attach(name, { contentType: "image/png", path });
}

test("bank soal toolbar and filter states", async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => runtimeErrors.push(`page: ${error.message}`));

  const activeResponse = await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
  expect(activeResponse?.status()).toBeLessThan(400);
  expect(new URL(page.url()).pathname).toBe(ROUTE);
  await expect(page.getByRole("heading", { name: "Bank Soal" })).toBeVisible();
  await page.waitForTimeout(1500);
  await assertAndCapture(page, testInfo, "active-closed");

  await page.getByRole("button", { name: "Filter soal" }).click();
  await expect(page.getByRole("heading", { name: "Filter soal" })).toBeVisible();
  await assertAndCapture(page, testInfo, "active-open");

  await page.getByRole("combobox", { name: "Filter status" }).click();
  await page.getByRole("option", { name: "Published" }).click();
  await expect(page.getByRole("button", { name: "Filter soal, 1 aktif" })).toBeVisible();
  await assertAndCapture(page, testInfo, "active-applied");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("button", { name: "Filter soal" })).toBeVisible();

  const historicalResponse = await page.goto(`${ROUTE}?tab=historical`, { waitUntil: "domcontentloaded" });
  expect(historicalResponse?.status()).toBeLessThan(400);
  expect(new URL(page.url()).pathname).toBe(ROUTE);
  await expect(page.getByRole("tab", { name: "Referensi historis" })).toHaveAttribute("data-state", "active");
  await page.waitForTimeout(1500);
  await assertAndCapture(page, testInfo, "historical-closed");

  await page.getByRole("button", { name: "Filter soal" }).click();
  await expect(page.getByRole("heading", { name: "Filter soal" })).toBeVisible();
  await assertAndCapture(page, testInfo, "historical-open");

  await page.getByRole("combobox", { name: "Filter kategori" }).click();
  await page.getByRole("option", { name: "UTS" }).click();
  await expect(page.getByRole("button", { name: "Filter soal, 1 aktif" })).toBeVisible();
  await assertAndCapture(page, testInfo, "historical-applied");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("button", { name: "Filter soal" })).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});
