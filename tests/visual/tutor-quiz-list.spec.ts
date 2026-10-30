import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

test("quiz list and question bank pages are readable and navigable", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto("/visual-fixtures/tutor-quiz-list");
  await expect(page.getByText("Kuis turunan dan penerapannya")).toBeVisible();
  await expect(page.getByText(/Durasi: 30 menit/)).toBeVisible();
  async function capture(name: string) {
    const path = info.outputPath(`screenshots/${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    await info.attach(name, { path, contentType: "image/png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await capture("quiz-list");
  await page.getByRole("tab", { name: /bank soal/i }).click();
  await expect(page.getByText("Pertanyaan contoh 1", { exact: true })).toBeVisible();
  await capture("bank-first-page");
  await page.getByRole("navigation", { name: "Halaman bank soal" }).getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.getByText("Pertanyaan contoh 21", { exact: true })).toBeVisible();
  await capture("bank-second-page");
  await page.getByRole("button", { name: "Tambah Soal Baru" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await capture("question-dialog");
  const correct = dialog.getByRole("button", { name: "Tandai opsi B sebagai jawaban benar" });
  await correct.click();
  await expect(correct).toHaveAttribute("aria-pressed", "true");
  await capture("question-dialog-selected");
  expect(errors).toEqual([]);
});

test("question bank remains readable in dark mode", async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto("/visual-fixtures/tutor-quiz-list");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("tab", { name: /bank soal/i }).click();
  await expect(page.getByText("Pertanyaan contoh 1", { exact: true })).toBeVisible();
  const path = info.outputPath("screenshots/bank-dark.png");
  await page.screenshot({ path, animations: "disabled" });
  await info.attach("bank-dark", { path, contentType: "image/png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
