import { expect, test } from "@playwright/test";

test("V4 article and diktat cannot be edited as legacy content", async ({ page }, testInfo) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  const response = await page.goto("/visual-fixtures/product-v4-editor", { timeout: 90_000 });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/visual-fixtures\/product-v4-editor$/);
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(page.getByText("Revisi artikel melalui bundle V4 dan unggah ulang.")).toBeVisible();
  await expect(page.getByText("Revisi diktat melalui bundle V4 dan unggah ulang.")).toBeVisible();
  await expect(page.getByRole("article").locator("input,textarea,button,[role=combobox]")).toHaveCount(0);
  await page.evaluate(async () => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: testInfo.outputPath("screenshots/product-v4-readonly.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(failures).toEqual([]);
});

