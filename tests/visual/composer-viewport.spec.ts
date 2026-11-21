import { expect, test } from "@playwright/test";

test.use({ contextOptions: { reducedMotion: "reduce" } });

for (const scenario of [
  { name: "Diskusi", path: "discussions?question=function", width: 380, panel: "[data-discussion-frame]" },
  { name: "Ops AI", path: "admin-ops-ai?state=empty", width: 1024, panel: "#ops-ai-panel" },
  { name: "Zyra", path: "coding", width: 844, panel: "aside[data-state=open]" },
]) {
  test(`${scenario.name} fits a shortened and panned visual viewport`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: 800 });
    if (scenario.name === "Ops AI") {
      await page.addInitScript(() => localStorage.setItem("zyx_ops_ai_panel_open_v2", "true"));
    }
    await page.goto(`/visual-fixtures/${scenario.path}`);
    if (scenario.name === "Zyra") await page.getByRole("button", { name: "Buka Zyra" }).click();
    const panel = page.locator(scenario.panel);
    await panel.locator("textarea:visible, [contenteditable=true]:visible").last().fill("Pertanyaan");
    const original = await panel.boundingBox();
    await page.evaluate(() => {
      const viewport = window.visualViewport!;
      Object.defineProperties(viewport, {
        height: { configurable: true, value: 440 },
        offsetTop: { configurable: true, value: 160 },
      });
      viewport.dispatchEvent(new Event("resize"));
    });
    await expect.poll(async () => {
      const box = await panel.boundingBox();
      return box && box.y >= 159 && box.y + box.height <= 601;
    }).toBe(true);
    await page.evaluate(() => {
      const viewport = window.visualViewport!;
      Reflect.deleteProperty(viewport, "height");
      Reflect.deleteProperty(viewport, "offsetTop");
      viewport.dispatchEvent(new Event("resize"));
    });
    await expect.poll(() => panel.boundingBox()).toMatchObject({ y: original!.y, height: original!.height });
  });
}
