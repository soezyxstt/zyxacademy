import { expect, test } from "@playwright/test";
import { mockTerminal, mockZyraDrawer } from "./terminal-fixture";

test.setTimeout(90_000);

test("shows the Python error and describes Zyra's current task", async ({ page }, info) => {
  await mockTerminal(page);
  await mockZyraDrawer(page);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/zyra/chat", async route => { await waiting; await route.fulfill({ status: 200, body: "" }); });
  await page.goto("/visual-fixtures/coding?terminal=1");
  await page.getByRole("textbox", { name: "Kode Python" }).fill('raise ValueError("contoh")');
  await page.getByRole("button", { name: "Jalankan" }).click();
  await expect(page.getByText("Terjadi error saat menjalankan kode")).toBeVisible();
  await expect(page.locator('pre[aria-live="polite"]')).toContainText("ValueError: contoh");
  await expect(page.getByText("Python belum tersedia. Coba lagi.")).toHaveCount(0);
  await page.getByRole("button", { name: "Buka Zyra" }).click();
  await page.getByRole("complementary", { name: "Asisten belajar Zyra" }).getByRole("tab", { name: "Tutor", exact: true }).click();
  await page.getByRole("textbox", { name: "Tanyakan materi atau rumus..." }).fill("Jelaskan error pada kode.");
  await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /Zyra/ })).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display:none !important; }" });
  await page.screenshot({ path: info.outputPath("screenshots/error-zyra-loading.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  release();
});

test("explains a conflicting saved draft without claiming another device", async ({ page }, info) => {
  await mockTerminal(page);
  await page.route("**/api/coding/drafts**", route => route.fulfill({ json: { draft: { code: "print('server')", stdin: "", revision: 2 } } }));
  await page.addInitScript(() => localStorage.setItem("zyx-python:coding-student:coding-course:playground", JSON.stringify({ code: "print('local')", stdin: "", revision: 1 })));
  await page.goto("/visual-fixtures/coding?terminal=1");
  await expect(page.getByText("Kode di browser berbeda dari kode tersimpan. Simpan kode ini untuk mengganti kode tersimpan.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Simpan kode ini" })).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display:none !important; }" });
  await page.screenshot({ path: info.outputPath("screenshots/draft-conflict.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
