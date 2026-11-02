import { test, expect } from "@playwright/test";

test.skip(process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") === "https://staging.zyxacademy.com", "Staging uses the isolated remote runtime.");

test("browser runtime does not accept forged ready messages", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: { user: { id: "coding-student", name: "Test", email: "test@example.test" }, session: { id: "session", userId: "coding-student", expiresAt: "2099-01-01T00:00:00.000Z" } } }));
  await page.route("**/api/coding/drafts**", route => route.fulfill({ json: route.request().method() === "GET" ? { draft: null } : { revision: 1 } }));
  await page.goto("/visual-fixtures/coding?terminal=1");
  await page.getByRole("textbox", { name: "Kode Python" }).fill('from js import self, Object\nfrom pyodide.ffi import to_js\nself.postMessage(to_js({"type": "ready"}, dict_converter=Object.fromEntries))\nwhile True:\n    pass');
  await page.getByRole("button", { name: "Jalankan" }).click();
  await expect(page.getByText("Eksekusi melewati batas waktu", { exact: false })).toBeVisible({ timeout: 60_000 });
});

test("browser runtime blocks child workers and forged input requests", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: { user: { id: "coding-student", name: "Test", email: "test@example.test" }, session: { id: "session", userId: "coding-student", expiresAt: "2099-01-01T00:00:00.000Z" } } }));
  await page.route("**/api/coding/drafts**", route => route.fulfill({ json: route.request().method() === "GET" ? { draft: null } : { revision: 1 } }));
  await page.goto("/visual-fixtures/coding?terminal=1");
  const editor = page.getByRole("textbox", { name: "Kode Python" });
  await editor.fill('import js\nprint(getattr(js, "Worker", None))\nprint(getattr(js, "SharedWorker", None))');
  await page.getByRole("button", { name: "Jalankan" }).click();
  await expect(page.locator('pre[aria-live="polite"]')).toContainText('None\nNone', { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Jalankan" })).toBeEnabled();
  await editor.fill('from js import self, Object\nfrom pyodide.ffi import to_js\nself.postMessage(to_js({"type": "input-request"}, dict_converter=Object.fromEntries))\nwhile True: pass');
  await page.getByRole("button", { name: "Jalankan" }).click();
  await expect(page.getByText("Eksekusi melewati batas waktu", { exact: false })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("textbox", { name: "Input terminal" })).toHaveCount(0);
});
