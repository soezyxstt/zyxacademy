import { expect, test, type Page, type TestInfo } from "@playwright/test";

test.setTimeout(180_000);

async function contrast(page: Page, selector: string) {
  return page.locator(selector).evaluate(element => {
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    function luminance(color: string, background?: string) {
      context.clearRect(0, 0, 1, 1);
      if (background) {
        context.fillStyle = background;
        context.fillRect(0, 0, 1, 1);
      }
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }
    const surface = getComputedStyle(element.parentElement!.parentElement!).backgroundColor;
    const values = [luminance(style.color), luminance(style.backgroundColor, surface)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  });
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => document.fonts.ready);
  const path = info.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

test("control colors remain readable in both themes and on hover", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  expect((await page.goto("/visual-fixtures/control-contrast"))?.status()).toBe(200);
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Ganti tema" }).click();
    for (const selector of ["[data-testid=primary]", "[data-testid=secondary]", "[data-testid=brand]", "[data-testid=destructive]"]) {
      await page.mouse.move(0, 0);
      expect(await contrast(page, selector)).toBeGreaterThanOrEqual(4.5);
      await page.locator(selector).hover();
      await expect.poll(() => contrast(page, selector)).toBeGreaterThanOrEqual(4.5);
      await capture(page, info, `${theme}-${selector.match(/testid=(\w+)/)?.[1]}-hover`);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
