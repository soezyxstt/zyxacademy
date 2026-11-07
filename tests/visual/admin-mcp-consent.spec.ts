import { test, expect } from "@playwright/test";
test("requested admin scopes stay readable and can be deselected", async ({ page }, testInfo) => {
  test.setTimeout(240000);
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
  await page.goto("/visual-fixtures/mcp-consent", { waitUntil: "domcontentloaded", timeout: 180000 });
  await expect(page.locator("body")).toHaveAttribute("data-mcp-fixture-ready", "true");
  await expect(page.getByText("Kelola formulir", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(6);
  await page.screenshot({ path: testInfo.outputPath("consent-selected.png"), fullPage: true });
  const checkbox = page.getByRole("checkbox").first();
  await checkbox.click(); await expect(checkbox).not.toBeChecked();
  await checkbox.focus();
  await page.screenshot({ path: testInfo.outputPath("consent-deselected-focus.png"), fullPage: true });
  for (const item of await page.getByRole("checkbox").all()) if (await item.isChecked()) await item.uncheck();
  await expect(page.getByRole("button", { name: "Izinkan Zyx Admin" })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("consent-no-scopes.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(failures).toEqual([]);
});

test("keyboard focus on admin permission", async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/visual-fixtures/mcp-consent", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toHaveAttribute("data-mcp-fixture-ready", "true");
  const first = page.getByRole("checkbox").first();
  await first.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await expect(first).toBeFocused();
  expect(await first.evaluate(element => element.matches(":focus-visible"))).toBe(true);
  expect(await first.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe("none");
  await page.screenshot({ path: testInfo.outputPath("consent-keyboard-focus.png"), fullPage: true });
  expect(errors).toEqual([]);
});
