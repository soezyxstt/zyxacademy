import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createManagementFixture } from "../../../../packages/native-parity/operations/management-fixtures";

const widths = [{ width: 380, height: 844, dpr: 1 }, { width: 402, height: 874, dpr: 3 }];
const references = [
  { id: "management-form-builder", url: "?screen=forms", text: "Editor Pertanyaan" },
  { id: "management-form-list", url: "?screen=forms&tab=forms", text: "Umpan balik latihan" },
  { id: "management-form-list-empty", url: "?screen=forms&tab=forms&theme=dark", text: "Belum ada formulir" },
  { id: "management-form-summary", url: "?screen=form-detail", text: "Umpan balik latihan" },
  { id: "management-docs-list", url: "?screen=docs", text: "Menyiapkan mata kuliah dan bab" },
  { id: "management-docs-detail", url: "?screen=docs-detail&theme=dark", text: "Blog dan tautan" },
];

async function main() {
  const output = process.env.OPERATIONS_PARITY_OUTPUT ?? "tests/visual/native-parallel/operations/references";
  const origin = process.env.OPERATIONS_PARITY_ORIGIN ?? "http://localhost:3211";
  await mkdir(output, { recursive: true });
  const fixture = createManagementFixture();
  const forms = (await fixture.read("forms", undefined)).map(form => ({ ...form, createdAt: "2026-11-26T08:00:00Z" }));
  const detail = await fixture.read("form", "form-local");
  const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE, args: ["--force-color-profile=srgb"] });
  const results: { id: string; width: number; dpr: number; scrollWidth?: number; overflow?: boolean; error?: string }[] = [];
  try {
    for (const { width, height, dpr } of widths) {
      for (const item of references) {
        const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, locale: "id-ID", timezoneId: "UTC", reducedMotion: "reduce" });
        const failures: string[] = [];
        page.on("pageerror", error => failures.push(error.message));
        await page.route(url => url.origin !== origin, route => route.abort());
        await page.route("**/api/admin/custom-forms", route => route.fulfill({ json: { success: true, forms: item.id.endsWith("-empty") ? [] : forms } }));
        await page.route("**/api/admin/custom-forms/form-local", route => route.fulfill({ json: { success: true, ...detail } }));
        await page.route("**/api/admin/export-spreadsheet?*", route => route.fulfill({ json: { spreadsheetUrl: null } }));
        try {
          const response = await page.goto(`${origin}/management${item.url}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
          expect(response?.status()).toBe(200);
          if (item.id.startsWith("management-form-list")) await page.getByRole("tab", { name: "Daftar Terbit" }).click();
          await expect(page.getByText(item.text, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
          await page.evaluate(() => document.fonts.ready);
          const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          if (failures.length) throw new Error(failures.join("\n"));
          await page.screenshot({ path: `${output}/${item.id}-${width}-dpr${dpr}.png`, animations: "disabled", scale: "device" });
          results.push({ id: item.id, width, dpr, scrollWidth, overflow: scrollWidth > width });
          console.log(item.id, width, dpr, `scrollWidth=${scrollWidth}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({ id: item.id, width, dpr, error: message });
          console.error(item.id, width, dpr, message);
          process.exitCode = 1;
        } finally {
          await page.close();
        }
      }
    }
  } finally { await browser.close(); await writeFile(`${output}/management-reference-results.json`, `${JSON.stringify(results, null, 2)}\n`); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
