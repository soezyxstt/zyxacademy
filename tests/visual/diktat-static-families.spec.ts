import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { inspectDiktatPrintReadiness } from "@/lib/materials/diktat-print-readiness";

test("all static scientific families retain labels and lineage at fixed print size", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  execFileSync("bun", ["tests/fixtures/product-learning/generate-static-family-print.ts"], { cwd: process.cwd() });
  const folder = "artifacts/visual-quality/diktat-static-families";
  const files = JSON.parse(await readFile(`${folder}/index.json`, "utf8")) as { file: string; visualIds: string[] }[];
  const width = testInfo.project.use.viewport?.width ?? 1536;
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(String(response.status())); });
  for (const entry of files) {
    const html = await readFile(`${folder}/${entry.file}.html`, "utf8");
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(async () => { await Promise.all(Array.from(document.fonts).filter(font => font.family.startsWith("KaTeX")).map(font => font.load())); await document.fonts.ready; });
    expect(await page.evaluate(inspectDiktatPrintReadiness)).toEqual([]);
    expect(await page.locator(".diktat-unit").count()).toBe(entry.visualIds.length);
    expect(await page.locator(".diktat-static-visual").count()).toBe(entry.visualIds.length);
    for (const id of entry.visualIds) {
      const figure = page.locator(`[data-visual-id="${id}"]`);
      expect(await figure.getAttribute("data-state-hash")).toMatch(/^[a-f0-9]{64}$/);
      expect(await figure.getAttribute("data-visual-hash")).toMatch(/^[a-f0-9]{64}$/);
      expect(await figure.locator(".katex").count()).toBeGreaterThan(0);
    }
    await page.screenshot({ path: testInfo.outputPath(`screenshots/${entry.file}-${width}.png`), fullPage: true });
    if (width === 1536) {
      await page.setViewportSize({ width: 794, height: 1123 });
      await page.emulateMedia({ media: "print" });
      expect(await page.evaluate(inspectDiktatPrintReadiness)).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`screenshots/${entry.file}-a4.png`), fullPage: true });
      const pdfPath = `${folder}/${entry.file}.pdf`;
      await page.pdf({ path: pdfPath, format: "A4", preferCSSPageSize: true, printBackground: true });
      const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
      const count = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(4);
      await page.emulateMedia({ media: "screen" });
      await page.setViewportSize({ width: 1536, height: 864 });
    }
  }
  expect(failures).toEqual([]);
});
