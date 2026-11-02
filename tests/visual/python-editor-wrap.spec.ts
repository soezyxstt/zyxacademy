import { expect, test } from "@playwright/test";
import { mockTerminal } from "./terminal-fixture";

for (const surface of ["playground", "article"] as const) {
  test(`${surface} editor wraps long lines and scrolls vertically`, async ({ page }, info) => {
    await mockTerminal(page);
    await page.goto(surface === "article" ? "/visual-fixtures/coding?tab=article" : "/visual-fixtures/coding?terminal=1");
    const container = surface === "article" ? page.locator('[data-part-id="example"]') : page.locator('section[aria-label="Playground Python"]');
    const editor = container.getByRole("textbox", { name: "Kode Python" });
    await editor.fill(`print("${"x".repeat(300)}")`);
    const scroller = container.locator(".cm-scroller");
    await expect.poll(() => scroller.evaluate(el => ({ horizontal: el.scrollWidth - el.clientWidth, lineHeight: el.querySelector(".cm-line")!.getBoundingClientRect().height }))).toMatchObject({ horizontal: 0 });
    expect(await scroller.locator(".cm-line").first().evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(40);
    await container.screenshot({ path: info.outputPath(`screenshots/${surface}-wrap.png`) });
    await editor.fill(Array.from({ length: 80 }, (_, i) => `print(${i})`).join("\n"));
    await expect.poll(() => scroller.evaluate(el => el.scrollHeight > el.clientHeight && el.clientHeight <= 400)).toBe(true);
    await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await container.screenshot({ path: info.outputPath(`screenshots/${surface}-scroll.png`) });
  });
}
