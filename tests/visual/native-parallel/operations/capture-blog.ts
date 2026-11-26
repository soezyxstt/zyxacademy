import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
async function main() {
  const out = "artifacts/native-parity/operations-web";
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE, args: ["--force-color-profile=srgb"] });
  const page = await browser.newPage({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 1, locale: "id-ID", timezoneId: "UTC", reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  for (const theme of ["light", "dark"]) {
    const response = await page.goto("http://localhost:3211/blog", { waitUntil: "networkidle", timeout: 120000 });
    expect(response?.status()).toBe(200);
    await page.evaluate((value) => { document.documentElement.classList.toggle("dark", value === "dark"); }, theme);
    await page.evaluate(() => document.fonts.ready);
    const link = page.getByRole("link", { name: /Belajar dengan latihan terarah/ }).first();
    await expect(link).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
    await page.screenshot({ path: `${out}/blog-list-${theme}.png`, fullPage: true, animations: "disabled" });
    await link.click();
    await page.waitForURL("**/blog/belajar-dengan-latihan-terarah");
    await expect(page.getByRole("heading", { name: "Belajar dengan latihan terarah" })).toBeVisible();
    await page.evaluate((value) => { document.documentElement.classList.toggle("dark", value === "dark"); }, theme);
    await page.screenshot({ path: `${out}/blog-detail-${theme}.png`, fullPage: true, animations: "disabled" });
    await page.goBack();
    await page.waitForURL("**/blog");
    await expect(page.getByRole("link", { name: /Belajar dengan latihan terarah/ }).first()).toBeVisible();
    await page.evaluate((value) => { document.documentElement.classList.toggle("dark", value === "dark"); }, theme);
    await page.screenshot({ path: `${out}/blog-back-${theme}.png`, fullPage: true, animations: "disabled" });
  }
  await browser.close();
  if (errors.length) throw new Error(errors.join("\n"));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
