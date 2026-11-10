import { expect, test } from "@playwright/test";

test("bounded reciprocal plots retain their scale through zoom and reset", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  const response = await page.goto("/authoring-verification", { timeout: 90_000 });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/authoring-verification");
  await expect(page.locator('html[data-verification-ready="true"]')).toHaveCount(1);
  await page.evaluate(() => window.postMessage({
    type: "zyx-verification-preview.v1", title: "Grafik kebalikan", sections: [], visualId: "bounded",
    visuals: [{ id: "bounded", kind: "learning_canvas", label: "Grafik kebalikan", description: "Bandingkan cabang fungsi di sekitar asimtot.", interactive: true,
      canvas: { version: "zyra-learning-canvas-v1", type: "function_plot", title: "Grafik kebalikan", purpose: "Membandingkan cabang fungsi kebalikan.", variables: [], controls: [], claimRefs: [], altText: "Dua cabang fungsi kebalikan.",
        fallback: { summary: "Fungsi tidak terdefinisi pada nol.", columns: [{ id: "x", label: "$x$" }, { id: "y", label: "$y$" }], rows: [["1", "1"]] },
        domain: { min: -5, max: 5, sampleCount: 160 }, yBounds: { min: -4, max: 4 },
        series: [{ id: "f", label: "$1/x$", expression: "1/x", excludedX: [0] }, { id: "g", label: "$1/x^2$", expression: "1/x^2", excludedX: [0] }] } }],
  }, window.location.origin));
  const graph = page.locator('svg[id^="graph-plot-"]');
  await graph.scrollIntoViewIfNeeded();
  await expect(graph).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });
  const defaultPaths = await graph.locator('path[clip-path]').evaluateAll(paths => paths.map(path => path.getAttribute("d")));
  expect(defaultPaths.length).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath("screenshots/default.png"), fullPage: true });
  const activate = page.getByRole("button", { name: "Interaksi grafik", exact: true });
  if (await activate.count()) await activate.click();
  await page.getByRole("button", { name: "Perbesar tampilan grafik", exact: true }).click();
  await expect.poll(() => graph.locator('path[clip-path]').evaluateAll(paths => paths.map(path => path.getAttribute("d")))).not.toEqual(defaultPaths);
  await page.screenshot({ path: testInfo.outputPath("screenshots/zoom.png"), fullPage: true });
  await graph.focus();
  await page.keyboard.press("ArrowRight");
  await page.screenshot({ path: testInfo.outputPath("screenshots/keyboard-pan.png"), fullPage: true });
  await page.getByRole("button", { name: "Atur ulang tampilan grafik", exact: true }).click();
  await expect.poll(() => graph.locator('path[clip-path]').evaluateAll(paths => paths.map(path => path.getAttribute("d")))).toEqual(defaultPaths);
  await page.screenshot({ path: testInfo.outputPath("screenshots/reset.png"), fullPage: true });
  expect(await page.locator(".katex-error").count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(failures).toEqual([]);
});
