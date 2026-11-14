import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { stubVisualTelemetry } from "./telemetry-stubs";
import { waitForVisualReadiness } from "./visual-readiness";

async function openFixture(page: Page, mode = "quiz") {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await stubVisualTelemetry(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(`/visual-fixtures/content-visuals?mode=${mode}`, { timeout: 90_000 });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/visual-fixtures/content-visuals");
  expect(new URL(page.url()).searchParams.get("mode")).toBe(mode);
  await waitForVisualReadiness(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  return failures;
}

async function capture(page: Page, testInfo: TestInfo, state: string) {
  await page.evaluate(async () => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`screenshots/${state}.png`), fullPage: true, animations: "disabled" });
}

test("quiz prompt and options support independent visuals without changing the answer", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const failures = await openFixture(page);
  const prompt = page.getByRole("figure", { name: "Grafik soal", exact: true });
  const option = page.getByRole("figure", { name: "Grafik pilihan jawaban", exact: true });
  await expect(prompt.locator('svg[role="img"]')).toBeVisible();
  await option.scrollIntoViewIfNeeded();
  await expect(option.locator('svg[role="img"]')).toBeVisible();
  await expect(page.getByText("Amati grafik", { exact: false })).toBeVisible();
  await expect(page.getByText("Apa yang terjadi ketika koefisien", { exact: false })).toBeVisible();
  const answer = page.locator("[data-question-option]").first().getByRole("radio");
  await expect(answer).toHaveAttribute("aria-checked", "false");
  await capture(page, testInfo, "quiz-default");

  await prompt.getByRole("button", { name: "Parameter", exact: true }).click();
  await option.getByRole("button", { name: "Parameter", exact: true }).click();
  const promptSlider = prompt.getByRole("slider", { name: "Ubah nilai Kemiringan", exact: true });
  const optionSlider = option.getByRole("slider", { name: "Ubah nilai Kemiringan", exact: true });
  const initialCurve = await prompt.locator("path[data-series-id]").first().getAttribute("d");
  await promptSlider.fill("2");
  await optionSlider.fill("-1");
  await expect(promptSlider).toHaveValue("2");
  await expect(optionSlider).toHaveValue("-1");
  expect(await prompt.locator("path[data-series-id]").first().getAttribute("d")).not.toBe(initialCurve);
  await expect(answer).toHaveAttribute("aria-checked", "false");
  await capture(page, testInfo, "quiz-independent-parameters");

  await prompt.getByRole("button", { name: "Reset parameter", exact: true }).click();
  await expect(promptSlider).toHaveValue("1");
  await expect(optionSlider).toHaveValue("-1");
  await capture(page, testInfo, "quiz-reset");

  await prompt.getByRole("button", { name: "Tampilkan tabel nilai", exact: true }).click();
  await expect(prompt.getByRole("table")).toBeVisible();
  await expect(prompt.locator('svg[role="img"]')).toBeHidden();
  await expect(option.locator('svg[role="img"]')).toBeVisible();
  await expect(answer).toHaveAttribute("aria-checked", "false");
  await capture(page, testInfo, "quiz-table-fallback");
  await answer.click();
  await expect(answer).toHaveAttribute("aria-checked", "true");
  await optionSlider.fill("0");
  await expect(optionSlider).toHaveValue("0");
  await expect(answer).toHaveAttribute("aria-checked", "true");
  await capture(page, testInfo, "quiz-answer-selected");
  expect(failures).toEqual([]);
});

test("quiz review explanation renders an interactive visual between its paragraphs", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const failures = await openFixture(page, "review");
  const visual = page.getByRole("figure", { name: "Grafik pembahasan", exact: true });
  await visual.scrollIntoViewIfNeeded();
  await expect(visual.locator('svg[role="img"]')).toBeVisible();
  await expect(page.locator("p").filter({ hasText: "menentukan kemiringan garis." })).toBeVisible();
  await expect(page.getByText("diikuti kenaikan nilai", { exact: false })).toBeVisible();
  await capture(page, testInfo, "review-default");
  await visual.getByRole("button", { name: "Parameter", exact: true }).click();
  const slider = visual.getByRole("slider", { name: "Ubah nilai Kemiringan", exact: true });
  await slider.fill("-2");
  await expect(slider).toHaveValue("-2");
  await capture(page, testInfo, "review-changed");
  expect(failures).toEqual([]);
});

test("invalid embedded visuals preserve surrounding learning content", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const failures = await openFixture(page, "invalid");
  await expect(page.locator("[data-content-visual-error]")).toBeVisible();
  await expect(page.getByText("Teks sebelum visual tetap terbaca.", { exact: true })).toBeVisible();
  await expect(page.getByText("Teks setelah visual tetap terbaca.", { exact: true })).toBeVisible();
  await expect(page.getByRole("figure")).toHaveCount(0);
  await expect(page.locator("pre")).toHaveCount(0);
  await capture(page, testInfo, "invalid-payload");
  expect(failures).toEqual([]);
});
