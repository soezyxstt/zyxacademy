import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

test("document workspace edit controls are responsive and labelled", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto("/visual-fixtures/admin-document-workspace");
  await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("#workspace-pdf-title")).toBeVisible();
  async function capture(name: string) {
    const path = info.outputPath(`screenshots/${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    await info.attach(name, { path, contentType: "image/png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await capture("edit");
  await page.locator("#workspace-pdf-category").click();
  await capture("category-open");
  await page.keyboard.press("Escape");
  const chapter = page.getByRole("checkbox", { name: /Aplikasi integral/ });
  await chapter.check();
  await expect(chapter).toBeChecked();
  await capture("chapter-selected");
  expect(errors).toEqual([]);
});
