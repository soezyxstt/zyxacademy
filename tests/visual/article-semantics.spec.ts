import { test, expect } from "@playwright/test";

test("V4 local meanings, scoped symbols, cases and worked steps", async ({ page }, testInfo) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/visual-fixtures/article-semantics");
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/visual-fixtures/article-semantics");
  await expect(page.locator("[data-relation-id]")).toHaveCount(7);
  await expect(page.locator("[data-step-id]")).toHaveCount(2);
  await expect(page.locator("[data-symbol-id]")).toHaveCount(2);
  await expect(page.locator(".katex-error")).toHaveCount(0);
  await expect(page.getByText("Pembagian oleh nol tetap dilarang.")).toBeVisible();
  await page.evaluate(async () => { await Promise.all([...document.fonts].filter((font) => font.family.includes("KaTeX")).map((font) => font.load())); await document.fonts.ready; });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: testInfo.outputPath("screenshots/article-semantics.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(failures).toEqual([]);
});
