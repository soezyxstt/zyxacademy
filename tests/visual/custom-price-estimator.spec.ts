import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ROUTE = "/visual-fixtures/custom-price-estimator";

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

async function captureEstimator(page: Page, info: TestInfo, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(async () => { await document.fonts.ready; });
  await assertNoOverflow(page);

  const estimator = page.locator("[data-custom-price-estimator]");
  const box = await estimator.boundingBox();
  expect(box).not.toBeNull();

  const path = info.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, fullPage: true, clip: box!, animations: "disabled" });
  await info.attach(name, { contentType: "image/png", path });
}

test("renders valid, invalid, and updated custom price states", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });

  const response = await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(ROUTE);
  await page.emulateMedia({ reducedMotion: "reduce" });

  await expect(page.getByLabel("Jumlah pertemuan")).toHaveValue("15");
  await expect(page.locator("[data-price-before]")).toContainText("Rp 8.325.000");
  await expect(page.locator("[data-price-after]")).toContainText("Rp 4.995.000");
  await expect(page.getByText("Diskon 40%", { exact: true })).toBeVisible();
  await captureEstimator(page, info, "custom-price-estimator-valid");

  await page.getByLabel("Jumlah pertemuan").fill("7");
  await expect(page.getByText("Jumlah pertemuan harus kelipatan 5.", { exact: true })).toBeVisible();
  await expect(page.locator('[data-price-state="invalid"]')).toBeVisible();
  await expect(page.locator("[data-price-after]")).toHaveCount(0);
  await captureEstimator(page, info, "custom-price-estimator-invalid-meetings");

  await page.getByLabel("Jumlah pertemuan").fill("15");
  await page.getByLabel("Jumlah mata kuliah").fill("0");
  await expect(page.getByText("Jumlah mata kuliah harus berupa bilangan bulat positif.", { exact: true })).toBeVisible();
  await expect(page.locator('[data-price-state="invalid"]')).toBeVisible();
  await expect(page.locator("[data-price-after]")).toHaveCount(0);
  await captureEstimator(page, info, "custom-price-estimator-invalid-courses");

  await page.getByLabel("Jumlah mata kuliah").fill("3");
  await page.getByLabel("Anggota kelompok").fill("0");
  await expect(page.getByText("Jumlah anggota kelompok harus berupa bilangan bulat positif.", { exact: true })).toBeVisible();
  await expect(page.locator('[data-price-state="invalid"]')).toBeVisible();
  await expect(page.locator("[data-price-after]")).toHaveCount(0);
  await captureEstimator(page, info, "custom-price-estimator-invalid-persons");

  await page.getByLabel("Anggota kelompok").fill("3");
  await page.getByLabel("Jumlah pertemuan").fill("10");
  await expect(page.locator("[data-price-before]")).toContainText("Rp 6.200.000");
  await expect(page.locator("[data-price-after]")).toContainText("Rp 3.720.000");
  await expect(page.getByText("10 pertemuan", { exact: true })).toBeVisible();
  await assertNoOverflow(page);
  await captureEstimator(page, info, "custom-price-estimator-10-meetings");

  expect(errors).toEqual([]);
});
