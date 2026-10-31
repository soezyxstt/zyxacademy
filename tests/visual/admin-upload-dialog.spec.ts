import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

test("document upload controls remain usable across document types", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto("/visual-fixtures/admin-upload");
  await page.getByRole("button", { name: "Unggah dokumen" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const type = dialog.locator("#upload-document-type");

  async function capture(name: string) {
    const path = info.outputPath(`screenshots/${name}.png`);
    await page.screenshot({ path, animations: "disabled" });
    await info.attach(name, { path, contentType: "image/png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }

  await capture("material");
  await type.click();
  await capture("type-menu");
  await page.getByRole("option", { name: "Ujian" }).click();
  await expect(dialog.locator("#upload-year")).toBeVisible();
  const chapter = dialog.getByRole("button", { name: /Bab 1/ }).first();
  await expect(chapter).toHaveAttribute("aria-pressed", "true");
  await chapter.click();
  await expect(chapter).toHaveAttribute("aria-pressed", "false");
  await chapter.click();
  await expect(chapter).toHaveAttribute("aria-pressed", "true");
  await capture("exam-selected");
  await type.click();
  await page.getByRole("option", { name: "Latihan" }).click();
  await expect(dialog.locator("#upload-subtype")).toBeVisible();
  await capture("practice");
  expect(errors).toEqual([]);
});
