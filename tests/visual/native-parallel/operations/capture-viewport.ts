import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
async function main() {
  const out = "tests/visual/native-parallel/operations/references";
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE, args: ["--force-color-profile=srgb"] });
  try {
    for (const { width, height, dpr } of [{ width: 380, height: 844, dpr: 1 }, { width: 402, height: 874, dpr: 3 }]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, locale: "id-ID", timezoneId: "UTC", reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      for (const item of [
        { id: "blog-list-light", path: "/blog", theme: "light", text: "Belajar dengan latihan terarah" },
        { id: "blog-detail-light", path: "/blog/belajar-dengan-latihan-terarah", theme: "light", text: "Mulai dari satu konsep" },
        { id: "blog-empty-dark", path: "/blog?category=kegiatan_zyx", theme: "dark", text: "Belum ada artikel" },
      ]) {
        const response = await page.goto(`http://localhost:3211${item.path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
        expect(response?.status()).toBe(200);
        await page.evaluate(theme => document.documentElement.classList.toggle("dark", theme === "dark"), item.theme);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.getByText(item.text, { exact: false }).first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: `${out}/${item.id}-${width}-dpr${dpr}.png`, fullPage: false, animations: "disabled", scale: "device" });
      }
      await page.close();
      if (errors.length) throw new Error(errors.join("\n"));
    }
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
