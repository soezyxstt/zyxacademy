import { expect, test } from "@playwright/test";

test("V4 approval needs current verification, explicit sections and complete anchored rubric", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/visual-fixtures/v4-pedagogic-review");
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/visual-fixtures/v4-pedagogic-review");
  await expect(page.locator("[data-fixture-ready=true]")).toBeVisible({ timeout: 30_000 });
  const approve = page.getByRole("button", { name: "Setujui bundle", exact: true });
  await expect(approve).toBeDisabled();
  await page.evaluate(async () => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: testInfo.outputPath("screenshots/v4-review-unreviewed.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("checkbox", { name: "Setujui bagian Definisi", exact: true }).check();
  for (const criterion of ["Ketepatan konsep", "Kelengkapan prasyarat", "Urutan penjelasan", "Simbol dan syarat", "Alasan pada contoh", "Representasi dan visual", "Miskonsepsi dan batasan", "Cek pemahaman dan pembahasan"]) {
    await page.getByRole("combobox", { name: `Penilaian ${criterion}`, exact: true }).click();
    await page.getByRole("option", { name: "Terpenuhi", exact: true }).click();
    await page.getByRole("combobox", { name: `Bukti ${criterion}`, exact: true }).click();
    await page.getByRole("option", { name: "Definisi", exact: true }).click();
    await page.getByRole("textbox", { name: `Alasan ${criterion}`, exact: true }).fill(`Bagian definisi memberi bukti untuk ${criterion.toLowerCase()}.`);
  }
  await expect(approve).toBeDisabled();
  await page.getByRole("checkbox", { name: "Setujui bagian Contoh", exact: true }).check();
  await expect(approve).toBeEnabled();
  await approve.click();
  const request = JSON.parse(await page.locator("[data-submitted-review]").getAttribute("data-submitted-review") ?? "null");
  expect(request.sectionDecisions.map((decision: { sectionId: string }) => decision.sectionId)).toEqual(["definition", "example"]);
  expect(request.criteria).toHaveLength(8);
  expect(request.verificationReceiptSignature).toBe("d".repeat(64));
  await page.screenshot({ path: testInfo.outputPath("screenshots/v4-review-complete.png"), fullPage: true, animations: "disabled" });
  await page.goto("/visual-fixtures/v4-pedagogic-review?verified=0");
  await expect(page.locator("[data-fixture-ready=true]")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: "Verifikasi revisi" })).toBeVisible();
  await expect(approve).toBeDisabled();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: testInfo.outputPath("screenshots/v4-review-verification-pending.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(failures).toEqual([]);
});
