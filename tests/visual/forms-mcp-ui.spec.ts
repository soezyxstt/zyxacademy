import { test, expect } from "@playwright/test";
import { formsUiHtml } from "../../lib/admin-mcp/forms-ui";

const questions = [
  { type: "SECTION", title: "Bagian pertama" }, { type: "STATEMENT", title: "Petunjuk", description: "Baca dengan saksama." },
  { type: "TEXT", title: "Nama", required: true }, { type: "PARAGRAPH", title: "Catatan" },
  { type: "RADIO", title: "Pilihan", options: ["Satu", "Dua"], required: true },
  { type: "CHECKBOX", title: "Topik", options: ["A", "B"] }, { type: "DROP_DOWN", title: "Kelas", options: ["A", "B"] },
  { type: "SCALE", title: "Skala", scaleLow: 1, scaleHigh: 5 }, { type: "RATING", title: "Nilai" },
  { type: "GRID_RADIO", title: "Matriks", gridRows: ["Baris 1", "Baris 2"], gridColumns: ["Ya", "Tidak"], required: true },
  { type: "GRID_CHECKBOX", title: "Matriks pilihan", gridRows: ["Baris"], gridColumns: ["A", "B"] },
  { type: "DATE", title: "Tanggal" }, { type: "TIME", title: "Waktu" }, { type: "FILE_UPLOAD", title: "Berkas" },
];
const deliver = async (page: import("@playwright/test").Page, data: unknown) => page.evaluate(data => window.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { ok: true, data } } }, "*"), data);

test("preview and aggregate summary states", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.setContent(formsUiHtml);
  await deliver(page, { form: { title: '<img src=x onerror=alert(1)>', questions } });
  await expect(page.getByRole("heading", { name: '<img src=x onerror=alert(1)>' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("preview.png"), fullPage: true });
  await page.getByRole("button", { name: "Periksa jawaban" }).click();
  await expect(page.getByText("Pertanyaan ini wajib diisi.").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("validation.png"), fullPage: true });
  await page.getByRole("textbox", { name: "Nama" }).fill("Test");
  await page.getByLabel("Satu").check();
  await page.getByLabel("Ya").first().check();
  await page.getByLabel("Ya").nth(1).check();
  await page.getByRole("button", { name: "Periksa jawaban" }).click();
  await expect(page.getByRole("status")).toHaveText("Simulasi selesai. Jawaban tidak dikirim.");
  await page.screenshot({ path: testInfo.outputPath("success.png"), fullPage: true });
  await deliver(page, { totalResponses: 4, questions: [{ title: "Pilihan", answered: 2, denominator: 4, counts: { Satu: 2, Dua: 1 } }] });
  await expect(page.getByText("50.0%").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("summary.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("empty, error and unsupported submission states", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", request => { if (!request.url().startsWith("about:")) errors.push("Unexpected network request"); });
  await page.setContent(formsUiHtml);
  await deliver(page, { totalResponses: 0, questions: [] });
  await expect(page.getByRole("heading", { name: "Belum ada respons" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("summary-empty.png"), fullPage: true });
  await page.evaluate(() => window.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { isError: true } }, "*"));
  await expect(page.getByRole("heading", { name: "Data tidak tersedia" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("resource-error.png"), fullPage: true });
  await deliver(page, { form: { title: "Berkas dan pilihan lain", questions: [
    { type: "FILE_UPLOAD", title: "Bukti", required: true },
    { type: "CHECKBOX", title: "Topik", options: ["A"], otherOption: { enabled: true, label: "Topik lain" } },
  ] } });
  await page.getByLabel("A", { exact: true }).check();
  await page.getByRole("checkbox", { name: "Topik lain" }).check();
  await page.getByRole("button", { name: "Periksa jawaban" }).click();
  await expect(page.getByText("Jelaskan pilihan lainnya.")).toBeVisible();
  await expect(page.getByText("Berkas wajib tidak dapat diperiksa dalam simulasi.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("file-and-other-validation.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("long labels wrap and dark mode remains readable", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setContent(formsUiHtml);
  const long = "Label".repeat(80);
  await deliver(page, { form: { title: long, questions: [{ type: "RADIO", title: long, options: [long] }] } });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("long-labels.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await deliver(page, { totalResponses: 2, questions: [{ title: "Pilihan jadwal", answered: 2, denominator: 2, counts: { Sabtu: 1, Minggu: 1 } }] });
  await page.screenshot({ path: testInfo.outputPath("dark-summary.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
