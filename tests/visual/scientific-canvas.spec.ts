import { expect, test } from "@playwright/test";

test("scientific canvases typeset quantities, chemistry, vectors, and notation", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/visual-fixtures/scientific-canvas", { timeout: 90_000 });
  expect(response?.status()).toBeLessThan(400);
  expect(new URL(page.url()).pathname).toBe("/visual-fixtures/scientific-canvas");
  await page.addStyleTag({ content: "nextjs-portal { display:none !important; }" });
  await expect(page.locator(".katex-error")).toHaveCount(0);
  const kinds = ["notation", "function_plot", "data_plot", "derivation", "table", "flowchart", "concept_map", "vector_diagram", "free_body", "chemistry_reaction"];
  for (const kind of kinds) {
    const fixture = page.locator(`[data-scientific-kind="${kind}"]`);
    await fixture.scrollIntoViewIfNeeded();
    expect(await fixture.locator(".katex").count()).toBeGreaterThan(0);
    await expect(fixture.locator(".katex-html").first()).toBeVisible();
    await page.evaluate(async () => {
      await Promise.all(Array.from(document.fonts).filter(font => font.family.startsWith("KaTeX")).map(font => font.load()));
      await document.fonts.ready;
    });
    await expect.poll(() => fixture.evaluate(element => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        if (Number(getComputedStyle(node).opacity) < 0.99) return false;
      }
      return true;
    })).toBe(true);
    await fixture.screenshot({ path: testInfo.outputPath(`screenshots/scientific-${kind}.png`), animations: "disabled" });
  }
  const data = page.locator('[data-scientific-kind="data_plot"]');
  await data.getByText("Lihat tabel data", { exact: false }).click();
  await expect(data.locator("table .katex").first()).toBeVisible();
  await data.screenshot({ path: testInfo.outputPath("screenshots/scientific-data-table.png"), animations: "disabled" });
  const curve = data.locator("svg circle").first();
  const pointBeforeHover = await curve.boundingBox();
  await curve.hover({ force: true });
  await expect(data.getByRole("tooltip")).toBeVisible();
  const pointAfterHover = await curve.boundingBox();
  expect(pointBeforeHover).not.toBeNull();
  expect(pointAfterHover?.x).toBeCloseTo(pointBeforeHover!.x, 0);
  expect(pointAfterHover?.y).toBeCloseTo(pointBeforeHover!.y, 0);
  await data.screenshot({ path: testInfo.outputPath("screenshots/scientific-data-probe.png"), animations: "disabled" });
  const readable = await page.locator("main").evaluate(element => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".katex, input, textarea").forEach(node => node.remove());
    return clone.textContent ?? "";
  });
  expect(readable).not.toMatch(/\b\d+(?:\.\d+)?e[+-]\d+\b/);
  expect(readable).not.toMatch(/\\(?:frac|ce|pu|alpha|vec)\b/);
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
  if (testInfo.project.name === "mobile-380") {
    await page.setViewportSize({ width: 640, height: 844 });
    const concept = page.locator('[data-scientific-kind="concept_map"]');
    await expect.poll(() => concept.locator('[data-diagram-node]').evaluateAll(nodes => Math.abs(nodes[0].getBoundingClientRect().top - nodes[1].getBoundingClientRect().top))).toBeLessThan(1);
    await concept.screenshot({ path: testInfo.outputPath("screenshots/scientific-concept-breakpoint-640.png"), animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  expect(failures).toEqual([]);
});
