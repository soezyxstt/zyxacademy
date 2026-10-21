import { test, expect } from "@playwright/test";

test("typed geometry preserves equal units and mathematical labels", async ({ page }, testInfo) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  const response = await page.goto("/visual-fixtures/geometry-2d");
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/visual-fixtures/geometry-2d");
  const svg = page.locator("svg[data-unit-scale-x]");
  await expect(svg).toBeVisible();
  expect(await svg.getAttribute("data-unit-scale-x")).toBe(await svg.getAttribute("data-unit-scale-y"));
  await expect(page.locator("[data-geometry-label] .katex")).toHaveCount(6);
  await expect(page.locator(".katex-error")).toHaveCount(0);
  await expect(page.getByRole("table")).toBeVisible();
  await page.evaluate(async () => { await Promise.all([...document.fonts].filter((font) => font.family.includes("KaTeX")).map((font) => font.load())); await document.fonts.ready; });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: testInfo.outputPath("screenshots/geometry-2d.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(failures).toEqual([]);
});
