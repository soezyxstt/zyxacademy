import { expect, test } from "@playwright/test";
import { mockTerminal } from "./terminal-fixture";

test("article Python example supports delayed interactive input and autocomplete", async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await mockTerminal(page);
  await page.goto("/visual-fixtures/coding?tab=article");
  const example = page.locator('[data-part-id="example"]');
  await expect(page.locator('[data-part-id="static"] pre code')).toContainText("for angka");
  const editor = example.getByRole("textbox", { name: "Kode Python" });
  await editor.fill('nama=input("Nama: ")\nprint("Halo,",nama)');
  await page.screenshot({ path: info.outputPath("screenshots/article-idle.png"), fullPage: true });
  await example.getByRole("button", { name: "Jalankan", exact: true }).click();
  const input = example.getByRole("textbox", { name: "Input terminal" });
  await expect(example.locator('pre[aria-live="polite"]')).toContainText("Nama:");
  await expect(input).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/article-input.png"), fullPage: true });
  await page.waitForTimeout(6500);
  await input.fill("Ayu"); await input.press("Enter");
  await expect(example.getByText("Halo, Ayu", { exact: false })).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/article-success.png"), fullPage: true });
  await example.scrollIntoViewIfNeeded();
  await editor.fill("pri"); await editor.press("Control+Space");
  await expect(example.getByRole("listbox")).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/article-autocomplete.png"), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("article terminal stop and error states", async ({ page }, info) => {
  await mockTerminal(page); await page.goto("/visual-fixtures/coding?tab=article");
  const example = page.locator('[data-part-id="example"]');
  const editor = example.getByRole("textbox", { name: "Kode Python" });
  await editor.fill('print("mulai")\nwhile True: pass');
  await example.getByRole("button", { name: "Jalankan", exact: true }).click();
  await expect(example.locator('pre[aria-live="polite"]')).toContainText("mulai");
  await example.getByRole("button", { name: "Stop" }).click();
  await expect(example.getByText("Eksekusi dihentikan")).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/article-stopped.png"), fullPage: true });
  await editor.fill('raise ValueError("contoh")');
  await example.getByRole("button", { name: "Jalankan", exact: true }).click();
  await expect(example.getByText("Terjadi error saat menjalankan kode", { exact: false })).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/article-error.png"), fullPage: true });
});
