import { expect, test } from "@playwright/test";
import { mockTerminal } from "./terminal-fixture";

test("terminal opens on run and accepts input after the prompt", async ({ page }, info) => {
  await mockTerminal(page);
  await page.goto("/visual-fixtures/coding?terminal=1");
  await expect(page.getByRole("textbox", { name: "Kode Python" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Terminal" })).toBeHidden();
  await page.screenshot({ path: info.outputPath("screenshots/terminal-closed.png"), fullPage: true });
  await page.getByRole("textbox", { name: "Kode Python" }).fill('name = input("Nama: ")');
  await page.getByRole("button", { name: "Jalankan" }).click();
  const input = page.getByRole("textbox", { name: "Input terminal" });
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await page.screenshot({ path: info.outputPath("screenshots/terminal-input.png"), fullPage: true });
  await input.fill("Adi");
  await input.press("Enter");
  await expect(page.locator('pre[aria-live="polite"]')).toContainText("Halo, Adi");
  await page.screenshot({ path: info.outputPath("screenshots/terminal-result.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Tutup terminal" }).click();
  await expect(page.getByRole("heading", { name: "Terminal" })).toBeHidden();
});
