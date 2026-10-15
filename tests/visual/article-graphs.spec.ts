import { expect, test, type Locator } from "@playwright/test";

const route = "/visual-fixtures/article-graphs";

for (const theme of ["light", "dark"] as const) {
  test(`article formulas and graphs, ${theme}`, async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript(value => localStorage.setItem("theme", value), theme);
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(route);
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });

    const capture = async (element: Locator, name: string) => {
      await element.scrollIntoViewIfNeeded();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await element.screenshot({ path: testInfo.outputPath(`screenshots/${theme}-${name}.png`), animations: "disabled" });
    };

    for (const id of ["powers", "reciprocal", "trigonometry", "transform", "geometry"]) {
      const section = page.locator(`#${id}`);
      await section.scrollIntoViewIfNeeded();
      const svg = section.locator("svg[role=img]");
      await expect(svg).toBeVisible();
      await expect(section.getByRole("button", { name: "Interaksi grafik", exact: true })).toHaveAttribute("aria-pressed", "false");
      await expect(section.getByRole("button", { name: "Perbesar tampilan grafik", exact: true })).toHaveCount(0);
      await expect(svg).toHaveCSS("touch-action", "auto");
      const rows = section.locator(".article-formula-row");
      expect(await rows.count()).toBeGreaterThan(1);
      for (const row of await rows.all()) {
        await expect(row.locator(".katex-display")).toHaveCSS("text-align", "left");
        expect(await row.evaluate(element => element.clientHeight)).toBeLessThan(85);
      }
      const labelHeight = await svg.locator("text").first().evaluate(element => element.getBoundingClientRect().height);
      expect(labelHeight).toBeGreaterThanOrEqual(10);
      await capture(section, id);
    }

    const graph = page.locator("#transform");
    const svg = graph.locator("svg[role=img]");
    const curve = graph.locator('path[data-series-id="f1"]');
    await svg.scrollIntoViewIfNeeded();
    const defaultCurve = await curve.getAttribute("d");
    const bounds = (await svg.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    const beforeScroll = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 80);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeScroll);
    await expect(curve).toHaveAttribute("d", defaultCurve!);

    if (testInfo.project.name === "mobile-380") {
      await svg.scrollIntoViewIfNeeded();
      const box = (await svg.boundingBox())!;
      const cdp = await context.newCDPSession(page);
      const scroll = await page.evaluate(() => window.scrollY);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let offset = 10; offset <= 90; offset += 10) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - offset }] });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scroll);
      await expect(curve).toHaveAttribute("d", defaultCurve!);
      await cdp.detach();
    }

    await graph.getByRole("button", { name: "Parameter", exact: true }).click();
    const slider = graph.getByRole("slider", { name: "Ubah nilai a", exact: true });
    await slider.fill("2");
    await expect(curve).not.toHaveAttribute("d", defaultCurve!);
    await graph.getByRole("button", { name: "k: -1", exact: true }).click();
    await expect(graph.getByRole("slider", { name: "Ubah nilai k", exact: true })).toHaveValue("-1");
    await capture(graph, "parameters");

    await graph.getByRole("button", { name: "Interaksi grafik", exact: true }).click();
    await expect(svg).toHaveCSS("touch-action", "none");
    const beforeZoom = await curve.getAttribute("d");
    await graph.getByRole("button", { name: "Perbesar tampilan grafik", exact: true }).click();
    await expect(curve).not.toHaveAttribute("d", beforeZoom!);
    await svg.scrollIntoViewIfNeeded();
    const activeBox = (await svg.boundingBox())!;
    const buttonZoomed = await curve.getAttribute("d");
    await page.mouse.move(activeBox.x + activeBox.width / 2, activeBox.y + activeBox.height / 2);
    await page.mouse.wheel(0, -100);
    await expect(curve).not.toHaveAttribute("d", buttonZoomed!);
    if (testInfo.project.name === "mobile-380") {
      const cdp = await context.newCDPSession(page);
      const x = activeBox.x + activeBox.width / 2;
      const y = activeBox.y + activeBox.height / 2;
      const beforePinch = await curve.getAttribute("d");
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 25, y }, { x: x + 25, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 50, y }, { x: x + 50, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(curve).not.toHaveAttribute("d", beforePinch!);
      await cdp.detach();
    }
    const zoomed = await curve.getAttribute("d");
    await capture(graph, "interactive");
    await graph.getByRole("button", { name: "Selesai", exact: true }).click();
    await expect(svg).toHaveCSS("touch-action", "auto");
    await expect(curve).toHaveAttribute("d", zoomed!);
    await expect(slider).toHaveValue("2");

    await graph.getByRole("button", { name: "Interaksi grafik", exact: true }).click();
    await svg.focus();
    await page.keyboard.press("ArrowRight");
    await expect(curve).not.toHaveAttribute("d", zoomed!);
    const shifted = await curve.getAttribute("d");
    await page.keyboard.press("Escape");
    await expect(graph.getByRole("button", { name: "Interaksi grafik", exact: true })).toBeFocused();
    await expect(curve).toHaveAttribute("d", shifted!);

    await graph.getByRole("button", { name: "Interaksi grafik", exact: true }).click();
    await graph.getByRole("button", { name: "Atur ulang tampilan grafik", exact: true }).click();
    await expect(curve).toHaveAttribute("d", beforeZoom!);
    await graph.getByRole("button", { name: "Reset parameter", exact: true }).click();
    await expect(curve).toHaveAttribute("d", defaultCurve!);

    // Escape while dragging must also release native pointer capture.
    await svg.scrollIntoViewIfNeeded();
    const dragBox = (await svg.boundingBox())!;
    await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(dragBox.x + dragBox.width / 2 + 25, dragBox.y + dragBox.height / 2);
    await page.keyboard.press("Escape");
    await expect(svg).toHaveCSS("touch-action", "auto");
    expect(await svg.evaluate(element => (element as SVGSVGElement).hasPointerCapture(1))).toBe(false);
    await page.mouse.up();

    await graph.getByRole("button", { name: "Sembunyikan Fungsi 1", exact: true }).click();
    await graph.getByRole("button", { name: "Sembunyikan Fungsi 2", exact: true }).click();
    await expect(graph.getByText(/Tidak ada fungsi yang ditampilkan/)).toBeVisible();
    await capture(graph, "empty");
    await graph.getByRole("button", { name: "Tampilkan Fungsi 1", exact: true }).click();
    await graph.getByRole("button", { name: "Nilai grafik", exact: true }).click();
    await expect(graph.getByRole("table")).toBeVisible();
    await capture(graph, "values");
    await graph.getByRole("button", { name: "Sembunyikan nilai grafik", exact: true }).click();
    await expect(graph.getByRole("table")).toHaveCount(0);

    await expect(page.locator('#trigonometry [data-point-kind="closed"]')).toHaveCount(1);
    const tall = page.locator("#tall-and-wide");
    await capture(tall, "tall-and-wide");
    const wide = tall.locator(".article-formula-row .katex-display").nth(2);
    if (testInfo.project.name === "mobile-380") {
      expect(await wide.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      await wide.evaluate(element => { element.scrollLeft = element.scrollWidth; });
      expect(await wide.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    }
    const zyra = page.locator("#zyra");
    await expect(zyra.getByRole("slider").first()).toBeVisible();
    await expect(zyra.locator('svg[role="img"]')).toHaveCSS("touch-action", "none");
    await expect(zyra.getByRole("button", { name: "Interaksi grafik", exact: true })).toHaveCount(0);
    await capture(zyra, "zyra");
    expect(errors).toEqual([]);
  });
}
