import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

test("quiz selection survives pagination and search", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto("/visual-fixtures/tutor-quiz-pagination");
  const questionTab = page.getByRole("tab", { name: "Soal", exact: true });
  await expect(questionTab).toHaveText("0");
  await expect(page.getByRole("button", { name: "Simpan draf", exact: true })).toBeVisible();
  await questionTab.click();
  await expect(page.getByRole("checkbox", { name: "Soal #1", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Soal #1", exact: true }).check();
  async function capture(name: string) {
    const path = info.outputPath(`screenshots/${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled", style: "nextjs-portal { display: none; }" });
    await info.attach(name, { path, contentType: "image/png" });
  }
  await capture("first-page");
  const pagination = page.getByRole("navigation", { name: "Halaman bank soal" });
  await pagination.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.getByRole("checkbox", { name: "Soal #21", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Soal #21", exact: true }).check();
  await expect(questionTab).toHaveText("2");
  await capture("second-page");
  await pagination.getByRole("button", { name: "Sebelumnya" }).click();
  await expect(page.getByRole("checkbox", { name: "Soal #1", exact: true })).toBeChecked();
  const openSearch = page.getByRole("button", { name: "Cari teks soal atau tag..." });
  await openSearch.click();
  const search = page.getByRole("textbox", { name: "Cari teks soal atau tag..." });
  await expect(search).toBeFocused();
  await search.fill("contoh 21");
  await expect(page.getByRole("checkbox", { name: "Soal #21", exact: true })).toBeChecked();
  await capture("filtered-selection");
  const bulkActions = page.getByRole("button", { name: "Tindakan massal", exact: true });
  await expect(bulkActions).toBeVisible();
  const clearMatching = page.getByRole("menuitem", { name: "Batalkan pilihan pada hasil filter", exact: true });
  await bulkActions.click();
  await clearMatching.click();
  await expect(questionTab).toHaveText("1");
  await bulkActions.click();
  await expect(clearMatching).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("menuitem", { name: "Pilih semua hasil filter (1)", exact: true }).click();
  await expect(questionTab).toHaveText("2");
  await search.focus();
  await search.press("Escape");
  await expect(openSearch).toBeFocused();
  await expect(page.getByRole("checkbox", { name: "Soal #1", exact: true })).toBeChecked();
  const filter = page.getByRole("button", { name: "Filter soal", exact: true });
  await filter.click();
  const filterPanel = page.getByRole("dialog", { name: "Filter soal" });
  await expect(filterPanel.getByText("Semua tingkat kesulitan")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("question-filters.png"), animations: "disabled",
    style: "nextjs-portal { display: none; }",
  });
  await filterPanel.getByRole("button", { name: "Semua soal" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Filter soal, Filter aktif" })).toBeFocused();
  await expect(page.getByRole("checkbox", { name: "Soal #2", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
