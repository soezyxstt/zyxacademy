import { expect, test } from "@playwright/test";

test.setTimeout(180_000);
test("tryout question selection and bank pagination", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto("/visual-fixtures/tutor-tryouts");
  async function capture(name: string) {
    const path = info.outputPath(`screenshots/${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    await info.attach(name, { path, contentType: "image/png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await expect(page.getByText("Draf (disembunyikan)")).toBeVisible();
  await capture("tryout-list");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Status publikasi")).toBeVisible();
  await capture("tryout-edit");
  await page.getByRole("dialog").getByRole("button", { name: "Batal" }).click();
  await page.getByRole("button", { name: "Hapus", exact: true }).click();
  await capture("delete-tryout");
  await page.getByRole("dialog").getByRole("button", { name: "Batal" }).click();
  await page.getByRole("button", { name: "Kelola soal" }).click();
  await capture("questions");
  await page.getByRole("button", { name: "Hapus pertanyaan nomor 1" }).click();
  await capture("delete-question");
  await page.getByRole("dialog").getByRole("button", { name: "Batal" }).click();
  await page.getByRole("button", { name: "Tambah pertanyaan" }).click();
  const editor = page.getByRole("dialog");
  await expect(editor.getByLabel("Tipe soal")).toBeVisible();
  const option = editor.getByRole("button", { name: "Tandai opsi B sebagai jawaban benar" });
  await option.click();
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await capture("answer-selected");
  await editor.getByRole("button", { name: "Batal" }).click();
  await page.getByRole("button", { name: "Ambil dari bank soal" }).click();
  const bank = page.getByRole("dialog");
  const first = bank.getByRole("checkbox", { name: /Pertanyaan bank 1$/ });
  await first.check();
  await capture("bank-selected");
  await bank.getByRole("button", { name: "Berikutnya" }).click();
  await expect(bank.getByRole("checkbox", { name: /Pertanyaan bank 21$/ })).toBeVisible();
  await bank.getByRole("button", { name: "Sebelumnya" }).click();
  await expect(first).toBeChecked();
  await bank.getByRole("button", { name: "Berikutnya" }).click();
  await bank.getByRole("button", { name: "Batal" }).click();
  await page.getByRole("button", { name: "Ambil dari bank soal" }).click();
  await expect(bank.getByRole("checkbox", { name: /Pertanyaan bank 1$/ })).not.toBeChecked();
  expect(errors).toEqual([]);
});

test("tryout answer preview is readable in dark mode", async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto("/visual-fixtures/tutor-tryouts");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Kelola soal" }).click();
  const path = info.outputPath("screenshots/questions-dark.png");
  await page.screenshot({ path, animations: "disabled" });
  await info.attach("questions-dark", { path, contentType: "image/png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
