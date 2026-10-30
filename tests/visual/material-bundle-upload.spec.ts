import { expect, test } from "@playwright/test";

test("bundle picker displays the chosen file", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto("/visual-fixtures/material-bundle-upload");
  await page.getByRole("button", { name: "Unggah bundle" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Pilih File ZIP" })).toBeVisible();
  async function capture(name: string) {
    const path = info.outputPath(`screenshots/${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    await info.attach(name, { path, contentType: "image/png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await capture("empty");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "bundle-materi.zip", mimeType: "application/zip", buffer: Buffer.from("fixture") });
  await expect(dialog.getByText("bundle-materi.zip")).toBeVisible();
  await capture("selected");
  expect(errors).toEqual([]);
});
