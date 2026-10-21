import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { inspectDiktatPrintReadiness } from "@/lib/materials/diktat-print-readiness";

test("authored V4 Diktat renders traced formulas and conditions at fixed print size", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  execFileSync("bun", ["tests/fixtures/product-learning/generate-v4-print.ts"], { cwd: process.cwd() });
  const folder = "artifacts/visual-quality/diktat-v4";
  const html = await readFile(`${folder}/diktat.html`, "utf8");
  const width = testInfo.project.use.viewport?.width ?? 1536;
      const failures: string[] = [];
      page.on("pageerror", error => failures.push(error.message));
      page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
      page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()}`); });
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(inspectDiktatPrintReadiness)).toEqual([]);
      expect(await page.locator(".diktat-static-visual svg").count()).toBe(1);
      expect(await page.locator(".katex-error").count()).toBe(0);
      expect(await page.locator(".diktat-unit").count()).toBe(1);
      const readingOrder = await page.locator(".diktat-unit").evaluate(element => {
        const formula = element.querySelector(".formula-display")!.getBoundingClientRect();
        const explanation = element.querySelector("p")!.getBoundingClientRect();
        return explanation.top >= formula.bottom;
      });
      expect(readingOrder).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`screenshots/diktat-${width}.png`), fullPage: true });
      expect(failures).toEqual([]);
      if (width === 1536) await page.pdf({ path: `${folder}/diktat.pdf`, format: "A4", preferCSSPageSize: true, printBackground: true });
});

test("Diktat print rejects oversized content and invalid mathematics", async ({ page }) => {
  await page.setContent('<style>body{font-size:14px}</style><main class="diktat"><section class="diktat-unit" style="height:2000px"><span class="katex-error">Invalid formula</span></section></main>');
  const errors = await page.evaluate(inspectDiktatPrintReadiness);
  expect(errors).toContain("DIKTAT_MATH_RENDER_INVALID");
  expect(errors).toContain("DIKTAT_PRINT_UNIT_TOO_TALL_SPLIT_CONTENT");
});
