import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
async function main() {
  const directory = "tests/visual/native-parallel/operations/references";
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE, args: ["--force-color-profile=srgb"] });
  try {
    for (const { width, height, dpr } of [{ width: 380, height: 844, dpr: 1 }, { width: 402, height: 874, dpr: 3 }]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", extraHTTPHeaders: { "x-fixture-locale": "en" } });
      const errors: string[] = [];
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      const response = await page.goto("http://localhost:3211/blog?category=kegiatan_zyx", { waitUntil: "domcontentloaded", timeout: 300000 });
      expect(response?.status()).toBe(200);
      await expect(page.getByText("No articles yet", { exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `${directory}/blog-empty-dark-en-${width}-dpr${dpr}.png`, animations: "disabled", scale: "device" });
      await page.close();
      if (errors.length) throw new Error(errors.join("\n"));
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
