import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ROUTE = "/visual-fixtures/tryout-authoring";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`http: ${response.status()} ${response.url()}`);
  });
  return errors;
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finiteAnimations = document.getAnimations().filter((animation) => {
      const endTime = animation.effect?.getComputedTiming().endTime;
      return animation.playState === "running" && typeof endTime === "number" && Number.isFinite(endTime);
    });
    await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => undefined)));
  });
  await page.screenshot({
    path: testInfo.outputPath(`screenshots/${name}.png`),
  });
}

test("admin can create a tryout from the empty state", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  const response = await page.goto(`${ROUTE}?view=empty-admin`, { waitUntil: "networkidle" });
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByText("Belum Ada Tryout")).toBeVisible();
  await capture(page, testInfo, `${testInfo.project.name}-tryout-empty-state`);

  await page.getByRole("button", { name: "Tambah Tryout Baru" }).click();
  await expect(page.getByRole("dialog", { name: "Buat Tryout Baru" })).toBeVisible();
  await expect(page.getByLabel("Judul Tryout")).toHaveValue("");
  await capture(page, testInfo, `${testInfo.project.name}-tryout-create-dialog`);
  expect(errors).toEqual([]);
});

test("admin can manage UTS questions and the essay upload setting", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  const response = await page.goto(`${ROUTE}?view=admin`, { waitUntil: "networkidle" });
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByText("Tryout UTS Kimia Dasar I")).toBeVisible();
  await capture(page, testInfo, `${testInfo.project.name}-tryout-list`);

  await page.getByRole("button", { name: "Kelola Soal" }).click();
  await expect(page.getByText("Kelola Soal: Tryout UTS Kimia Dasar I")).toBeVisible();
  await capture(page, testInfo, `${testInfo.project.name}-tryout-questions`);

  await page.getByRole("button", { name: "Ambil dari bank soal" }).click();
  await expect(page.getByRole("dialog", { name: "Ambil soal dari bank soal" })).toBeVisible();
  await expect(page.getByText("Tentukan pereaksi pembatas dan tunjukkan perhitungannya.")).toBeVisible();
  await capture(page, testInfo, `${testInfo.project.name}-tryout-question-bank`);
  await page.getByRole("button", { name: "Batal" }).click();

  await page.getByRole("button", { name: "Edit pertanyaan 1" }).click();
  await expect(page.getByRole("switch", { name: "Izinkan siswa mengunggah berkas coretan pendukung (PDF/Gambar)" })).toBeChecked();
  await capture(page, testInfo, `${testInfo.project.name}-tryout-essay-upload-setting`);

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  expect(errors).toEqual([]);
});

test("students can type an essay and see the PDF or image upload control", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  const response = await page.goto(`${ROUTE}?view=student`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  const answer = page.getByPlaceholder("Ketik penjelasan runut, penjabaran matematika, atau esai Anda di sini...");
  await expect(answer).toBeVisible();
  await capture(page, testInfo, `${testInfo.project.name}-tryout-student-empty-answer`);
  await answer.fill("Kalor yang masuk lebih besar daripada kerja yang dilakukan.");

  const upload = page.locator('input[type="file"]');
  await expect(upload).toHaveAttribute("accept", ".pdf,image/*");
  await expect(page.getByText("Mendukung PDF, PNG, JPG (Maks. 10 MB)")).toBeVisible();
  await capture(page, testInfo, `${testInfo.project.name}-tryout-student-typed-answer-and-upload`);

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  expect(errors).toEqual([]);
});
