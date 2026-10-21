import { expect, test } from "@playwright/test";

test("public V4 preview presents typeset learning content and an actual PDF", async ({ page }, info) => {
  test.setTimeout(90_000);
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/v4");
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/v4");
  await expect(page.locator("[data-part-kind='worked_example']")).toBeVisible();
  await expect(page.getByTestId("epsilon-delta-board").locator("svg")).toBeVisible();
  await expect(page.locator(".katex-error")).toHaveCount(0);
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: info.outputPath("screenshots/v4-preview.png"), fullPage: true, animations: "disabled" });
  const slider = page.getByRole("slider", { name: "Toleransi epsilon", exact: true });
  await slider.focus();
  await slider.press("End");
  await page.screenshot({ path: info.outputPath("screenshots/v4-preview-changed.png"), fullPage: true, animations: "disabled" });
  const pdf = await page.request.get("/v4/diktat.pdf");
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(failures).toEqual([]);
});
