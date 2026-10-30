import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

test("quiz selection survives pagination and search", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto("/visual-fixtures/tutor-quiz-pagination");
  await page.getByRole("tab", { name: "Soal" }).click();
  await expect(page.getByRole("checkbox", { name: "Soal #1", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Soal #1", exact: true }).check();
  async function capture(name: string) {
    const path = info.outputPath(`screenshots/${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    await info.attach(name, { path, contentType: "image/png" });
  }
  await capture("first-page");
  const pagination = page.getByRole("navigation", { name: "Halaman bank soal" });
  await pagination.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.getByRole("checkbox", { name: "Soal #21", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Soal #21", exact: true }).check();
  await capture("second-page");
  await pagination.getByRole("button", { name: "Sebelumnya" }).click();
  await expect(page.getByRole("checkbox", { name: "Soal #1", exact: true })).toBeChecked();
  await page.getByRole("textbox", { name: "Cari teks soal atau tag..." }).fill("contoh 21");
  await expect(page.getByRole("checkbox", { name: "Soal #21", exact: true })).toBeChecked();
  await capture("filtered-selection");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
