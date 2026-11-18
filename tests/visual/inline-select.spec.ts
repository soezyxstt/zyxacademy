import { expect, test } from "@playwright/test";

test("inline filter keeps selection, focus and long options usable", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  expect((await page.goto("/visual-fixtures/control-contrast"))?.status()).toBe(200);
  await expect(page).toHaveURL(/\/visual-fixtures\/control-contrast$/);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

  const filter = page.getByRole("combobox", { name: "Filter mata kuliah" });
  await expect(page.getByRole("combobox", { name: "Rentang waktu" })).toBeDisabled();
  await expect(filter).toHaveCSS("border-top-width", "0px");
  const capture = async (state: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    await page.screenshot({ path: info.outputPath(`${state}.png`), animations: "disabled" });
  };

  await capture("closed");
  await filter.click();
  const options = page.getByRole("listbox");
  await expect(options).toBeVisible();
  await expect(options.getByRole("option", { name: "Kimia dasar" })).toBeDisabled();
  const optionBounds = await options.boundingBox();
  expect(optionBounds!.x).toBeGreaterThanOrEqual(0);
  expect(optionBounds!.x + optionBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await capture("open");

  await page.keyboard.press("Escape");
  await expect(options).toBeHidden();
  await expect(filter).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(options.getByRole("option", { name: "Semua mata kuliah" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(options.getByRole("option", { name: "Matematika dasar" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(filter).toHaveText("Matematika dasar");
  await expect(filter).toBeFocused();
  await capture("selected");
  expect(errors).toEqual([]);
});
