import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function capture(page: Page, info: TestInfo, state: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`screenshots/${state}.png`), fullPage: true, animations: "disabled", caret: "initial" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

for (const browserOnly of [false, true]) test(`Python article examples support edit and run, browserOnly=${browserOnly}`, async ({ page }, info) => {
  test.setTimeout(180_000);
  const failures: string[] = [];
  page.on("pageerror", error => { failures.push(error.message); console.log("PAGE_ERROR", error.message); });
  page.on("console", message => { if (message.type() === "error") { failures.push(message.text()); console.log("CONSOLE_ERROR", message.text()); } });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await page.addInitScript(() => { Reflect.deleteProperty(Navigator.prototype, "serviceWorker"); try { localStorage.setItem("fcm_consent", "denied"); } catch {} });
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: { user: { id: "coding-student", name: "Test", email: "test@example.test" }, session: { id: "session", userId: "coding-student", expiresAt: "2099-01-01T00:00:00.000Z" } } }));
  await page.route("**/api/coding/drafts**", route => route.fulfill({ json: route.request().method() === "GET" ? { draft: null } : { revision: 1 } }));
  const codingRequests: string[] = [];
  page.on("request", request => { if (/\/api\/coding\/(drafts|terminal)/.test(request.url())) codingRequests.push(request.url()); });
  const response = await page.goto(`/visual-fixtures/article-python${browserOnly ? "?free=1" : ""}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await page.addStyleTag({ content: "nextjs-portal { display:none !important; }" });
  const article = page.getByRole("region", { name: "Artikel mahasiswa" });
  const examples = article.getByRole("region", { name: "Playground Python" });
  await expect(examples).toHaveCount(2);
  const first = examples.nth(0);
  const second = examples.nth(1);
  const editor = first.getByRole("textbox", { name: "Kode Python" });
  const otherEditor = second.getByRole("textbox", { name: "Kode Python" });
  await expect(editor).toContainText('nama = input("Nama: ")', { timeout: 30000 });
  await expect(otherEditor).toContainText("print(2 + 3)");
  await expect(page.getByRole("region", { name: "Pratinjau admin" }).getByRole("textbox", { name: "Kode Python" })).toHaveCount(0);
  await expect(article.getByText("console.log('tetap statis')")).toBeVisible();
  await capture(page, info, "article-python-idle");

  await editor.fill('nama = input("Nama: ")\nprint("Hai,", nama)');
  await first.getByRole("button", { name: "Jalankan", exact: true }).click();
  await expect(first.getByRole("textbox", { name: "Input terminal" })).toBeVisible({ timeout: 60_000 });
  await capture(page, info, "article-python-input");
  await first.getByRole("textbox", { name: "Input terminal" }).fill("Ayu");
  await first.getByRole("textbox", { name: "Input terminal" }).press("Enter");
  await expect(first.locator('pre[aria-live="polite"]')).toContainText("Hai, Ayu", { timeout: 60_000 });
  await expect(first.getByText("Eksekusi selesai", { exact: true })).toBeVisible();
  await expect(otherEditor).toContainText("print(2 + 3)");
  await capture(page, info, "article-python-output");

  await editor.fill('raise ValueError("contoh")');
  await first.getByRole("button", { name: "Jalankan", exact: true }).click();
  await expect(first.getByText("Terjadi error saat menjalankan kode", { exact: false })).toBeVisible({ timeout: 60_000 });
  await capture(page, info, "article-python-error");

  await editor.fill("while True: pass");
  await first.getByRole("button", { name: "Jalankan", exact: true }).click();
  await expect(first.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await capture(page, info, "article-python-running");
  await first.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(first.getByText("Eksekusi dihentikan", { exact: true })).toBeVisible();
  await capture(page, info, "article-python-stopped");
  await first.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(editor).toContainText('nama = input("Nama: ")', { timeout: 30000 });
  await expect(otherEditor).toContainText("print(2 + 3)");
  await expect(first.getByText("Eksekusi dihentikan", { exact: true })).toHaveCount(0);
  await capture(page, info, "article-python-reset");
  if (info.project.name === "laptop-fhd-125") {
    for (const width of [640, 740]) {
      await page.setViewportSize({ width, height: 864 });
      await capture(page, info, `article-python-container-${width}`);
    }
  }
  expect(new URL(page.url()).pathname).toBe("/visual-fixtures/article-python");
  if (browserOnly) expect(codingRequests).toEqual([]);
  expect(failures).toEqual([]);
});
