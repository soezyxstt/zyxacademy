import { expect, test } from "@playwright/test";

test("quiz filters and bulk actions retain their scope", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.route("**/api/admin/questions?*", (route) => route.fulfill({
    json: [
      { id: "q1", prompt: "Limit fungsi", difficulty: "easy" },
      { id: "q2", prompt: "Turunan fungsi", difficulty: "hard" },
    ].map((question) => ({
      ...question,
      courseId: "visual-math",
      questionType: "multiple_choice",
      reviewStatus: "published",
      tags: [],
      options: ["Satu", "Dua"],
    })),
  }));
  const capture = (name: string) => page.screenshot({
    path: info.outputPath(`${name}.png`), animations: "disabled",
    style: "nextjs-portal { display: none; }",
  });
  await page.goto("/visual-fixtures/admin-quiz-picker");
  const questionTab = page.getByRole("tab", { name: /^Pilihan soal/ });
  await expect(questionTab).toHaveText("0");
  await expect(page.getByRole("button", { name: "Simpan draf", exact: true })).toBeVisible();
  await questionTab.click();
  const limit = page.getByRole("checkbox", { name: "Limit fungsi" });
  const derivative = page.getByRole("checkbox", { name: "Turunan fungsi" });
  const mode = page.getByRole("combobox", { name: /^Metode soal/ });
  const searchButton = page.getByRole("button", { name: "Cari teks pertanyaan, tag, atau ID..." });
  await expect(limit).toBeVisible();
  expect(Math.abs((await mode.boundingBox())!.y - (await searchButton.boundingBox())!.y)).toBeLessThan(2);
  await capture("admin-picker");

  const filter = page.getByRole("button", { name: /^Filter soal/ });
  await filter.click();
  await capture("admin-filters");
  await page.getByRole("combobox", { name: "Filter tingkat kesulitan" }).click();
  await page.getByRole("option", { name: "Sulit", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(filter).toHaveAccessibleName("Filter soal, 1 aktif");
  await expect(limit).toHaveCount(0);

  const bulk = page.getByRole("button", { name: "Pilihan massal" });
  await bulk.click();
  await capture("admin-bulk-actions");
  await page.getByRole("menuitem", { name: "Pilih semua hasil filter" }).click();
  await expect(questionTab).toHaveText("1");
  await expect(derivative).toBeChecked();
  await searchButton.click();
  const search = page.getByRole("textbox", { name: "Cari teks pertanyaan, tag, atau ID..." });
  await expect(search).toBeFocused();
  await search.press("Escape");
  await expect(searchButton).toBeFocused();
  await bulk.click();
  await page.getByRole("menuitem", { name: "Batalkan pilihan pada hasil filter" }).click();
  await expect(questionTab).toHaveText("0");
  await expect(derivative).not.toBeChecked();

  await mode.click();
  await expect(page.getByRole("option", { name: "Pilih manual" })).toBeVisible();
  await capture("admin-selection-mode");
  await page.getByRole("option", { name: "Distribusi otomatis" }).click();
  await expect(page.getByText("Proporsi Tingkat Kesulitan Soal")).toBeVisible();
  await capture("admin-auto-distribution");
  await mode.click();
  await page.getByRole("option", { name: "Pilih manual" }).click();
  await expect(derivative).toBeVisible();
  await expect(limit).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  expect(errors).toEqual([]);
});
