import { test, expect } from "@playwright/test";

test("interactive terminal and Python autocomplete", async ({ page }, info) => {
  test.setTimeout(180000);
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: { user: { id: "coding-student", name: "Test", email: "test@example.test" }, session: { id: "session", userId: "coding-student", expiresAt: "2099-01-01T00:00:00.000Z" } } }));
  await page.route("**/api/coding/drafts**", route => route.fulfill({ json: route.request().method() === "GET" ? { draft: null } : { revision: 1 } }));
  await page.goto("/visual-fixtures/coding?terminal=1");
  const editor = page.getByRole("textbox", { name: "Kode Python" });
  await expect(editor).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/idle.png"), fullPage: true });
  const start = Date.now();
  await page.getByRole("button", { name: "Jalankan" }).click();
  const input = page.getByRole("textbox", { name: "Input terminal" });
  await expect(input).toBeVisible({ timeout: 60000 });
  console.log(`time-to-input-ms: ${Date.now() - start}`);
  await expect(page.locator("pre[aria-live=polite]").getByText("Nama:", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/waiting.png"), fullPage: true });
  await input.fill("Ayu"); await input.press("Enter");
  await expect(page.getByText("Halo, Ayu", { exact: false })).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: info.outputPath("screenshots/success.png"), fullPage: true });
  await editor.fill("pri"); await editor.press("Control+Space");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/autocomplete.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(failures).toEqual([]);
});

test("learner code cannot reset the execution deadline with a ready message", async ({ page }) => {
  test.setTimeout(90000);
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: { user: { id: "coding-student", name: "Test", email: "test@example.test" }, session: { id: "session", userId: "coding-student", expiresAt: "2099-01-01T00:00:00.000Z" } } }));
  await page.route("**/api/coding/drafts**", route => route.fulfill({ json: route.request().method() === "GET" ? { draft: null } : { revision: 1 } }));
  await page.goto("/visual-fixtures/coding?terminal=1");
  await page.getByRole("textbox", { name: "Kode Python" }).fill('from js import self, Object\nfrom pyodide.ffi import to_js\nself.postMessage(to_js({"type": "ready"}, dict_converter=Object.fromEntries))\nwhile True:\n    pass');
  await page.getByRole("button", { name: "Jalankan" }).click();
  await expect(page.getByText("Eksekusi melewati batas waktu", { exact: false })).toBeVisible({ timeout: 60000 });
});

test("input remains available after the execution time limit", async ({ page }) => {
  test.setTimeout(90000);
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: { user: { id: "coding-student", name: "Test", email: "test@example.test" }, session: { id: "session", userId: "coding-student", expiresAt: "2099-01-01T00:00:00.000Z" } } }));
  await page.route("**/api/coding/drafts**", route => route.fulfill({ json: route.request().method() === "GET" ? { draft: null } : { revision: 1 } }));
  await page.goto("/visual-fixtures/coding?terminal=1");
  await page.getByRole("button", { name: "Jalankan" }).click();
  const input = page.getByRole("textbox", { name: "Input terminal" });
  await expect(input).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(6500);
  await expect(input).toBeVisible();
  await input.fill("Ayu");
  await input.press("Enter");
  await expect(page.getByText("Halo, Ayu", { exact: false })).toBeVisible({ timeout: 10000 });
});

test("isolated terminal blocks child workers and ignores forged input requests", async ({ page }) => {
  test.setTimeout(120000);
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: { user: { id: "coding-student", name: "Test", email: "test@example.test" }, session: { id: "session", userId: "coding-student", expiresAt: "2099-01-01T00:00:00.000Z" } } }));
  await page.route("**/api/coding/drafts**", route => route.fulfill({ json: route.request().method() === "GET" ? { draft: null } : { revision: 1 } }));
  await page.goto("/visual-fixtures/coding?terminal=1");
  const editor = page.getByRole("textbox", { name: "Kode Python" });
  await editor.fill('import js\nprint(getattr(js, "Worker", None))\nprint(getattr(js, "SharedWorker", None))');
  await page.getByRole("button", { name: "Jalankan" }).click();
  await expect(page.locator('pre[aria-live="polite"]')).toContainText('None\nNone', { timeout: 60000 });
  await expect(page.getByRole("button", { name: "Jalankan" })).toBeEnabled();
  await editor.fill('from js import self, Object\nfrom pyodide.ffi import to_js\nself.postMessage(to_js({"type": "input-request"}, dict_converter=Object.fromEntries))\nwhile True: pass');
  await page.getByRole("button", { name: "Jalankan" }).click();
  await expect(page.getByText("Eksekusi melewati batas waktu", { exact: false })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("textbox", { name: "Input terminal" })).toHaveCount(0);
});

test("supports repeated input, Unicode, stop, and a clean rerun", async ({ page }) => {
  test.setTimeout(180000);
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: { user: { id: "coding-student", name: "Test", email: "test@example.test" }, session: { id: "session", userId: "coding-student", expiresAt: "2099-01-01T00:00:00.000Z" } } }));
  await page.route("**/api/coding/drafts**", route => route.fulfill({ json: route.request().method() === "GET" ? { draft: null } : { revision: 1 } }));
  await page.goto("/visual-fixtures/coding?terminal=1");
  const editor = page.getByRole("textbox", { name: "Kode Python" });
  const run = page.getByRole("button", { name: "Jalankan" });
  const input = page.getByRole("textbox", { name: "Input terminal" });
  await editor.fill('import sys\nnama = input("Nama: ")\nprint("Kota: ", end="", flush=True)\nkota = sys.stdin.readline().strip()\nprint(f"Halo {nama} dari {kota}")');
  await run.click();
  await expect(input).toBeVisible({ timeout: 60000 });
  await input.fill("Áyu"); await input.press("Enter");
  await expect(page.locator('pre[aria-live="polite"]')).toContainText("Kota:");
  await expect(input).toBeVisible();
  await input.fill("Bandung"); await input.press("Enter");
  await expect(page.locator('pre[aria-live="polite"]')).toContainText("Halo Áyu dari Bandung", { timeout: 10000 });
  await expect(run).toBeEnabled();
  await editor.fill('print("mulai", flush=True)\nwhile True: pass');
  await run.click();
  await expect(page.locator('pre[aria-live="polite"]')).toContainText("mulai", { timeout: 60000 });
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Eksekusi dihentikan", { exact: false })).toBeVisible();
  await expect(run).toBeEnabled();
  await editor.fill('print("ulangi berhasil")');
  await run.click();
  await expect(page.locator('pre[aria-live="polite"]')).toContainText("ulangi berhasil", { timeout: 60000 });
});
