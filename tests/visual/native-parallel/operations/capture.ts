import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
async function main() {
const output = "artifacts/native-parity/operations-web";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE, args: ["--force-color-profile=srgb"] });
const page = await browser.newPage({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 1, locale: "id-ID", timezoneId: "UTC", reducedMotion: "reduce" });
const errors: string[] = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !m.text().includes("fixture-missing-image")) errors.push(m.text()); });
const cases = ["analytics-data", "analytics-empty", "analytics-unavailable", "blog-valid", "blog-failed"];
for (const theme of ["light", "dark"]) for (const id of cases) {
  const response = await page.goto(`http://localhost:3211/?case=${id}&theme=${theme}`, { waitUntil: "networkidle", timeout: 120000 });
  expect(response?.status()).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  if (id === "analytics-data") { await expect(page.getByText("2.524", { exact: true })).toBeVisible(); await expect(page.locator(".recharts-line-curve")).toHaveCount(2, { timeout: 30000 }); }
  if (id === "analytics-empty") await expect(page.getByText("0", { exact: true }).first()).toBeVisible();
  if (id === "blog-valid") await expect(page.locator("img")).toBeVisible();
  if (id === "blog-failed") await page.getByRole("button", { name: "Simulasikan gambar gagal" }).click();
  if (id === "blog-failed") await expect(page.locator("svg.lucide-image-off")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
  await page.screenshot({ path: `${output}/${id}-${theme}.png`, fullPage: true, animations: "disabled" });
}
await browser.close();
if (errors.length) throw new Error(errors.join("\n"));
await writeFile(`${output}/cases.json`, JSON.stringify({ viewport: [380, 844], dpr: 1, locale: "id-ID", cases, themes: ["light", "dark"] }, null, 2));

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
