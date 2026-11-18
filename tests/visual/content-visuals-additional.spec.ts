import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { stubVisualTelemetry } from "./telemetry-stubs";
import { waitForVisualReadiness } from "./visual-readiness";

async function openFixture(page: Page, mode: string) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await stubVisualTelemetry(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(`/visual-fixtures/content-visuals?mode=${mode}`, { timeout: 90_000 });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/visual-fixtures/content-visuals");
  expect(new URL(page.url()).searchParams.get("mode")).toBe(mode);
  await waitForVisualReadiness(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  return errors;
}

async function capture(page: Page, testInfo: TestInfo, state: string) {
  await page.evaluate(async () => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`screenshots/${state}.png`), fullPage: true, animations: "disabled" });
}

test("tryout visual controls preserve the selected answer", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = await openFixture(page, "tryout");
  const graph = page.getByRole("figure", { name: "Grafik pilihan jawaban", exact: true });
  await graph.scrollIntoViewIfNeeded();
  await expect(graph.locator('svg[role="img"]')).toBeVisible();
  const answer = page.getByRole("radio").first();
  await expect(answer).not.toBeChecked();
  await graph.getByRole("button", { name: "Parameter", exact: true }).click();
  const slider = graph.getByRole("slider", { name: "Ubah nilai Kemiringan", exact: true });
  await slider.fill("-1");
  await expect(slider).toHaveValue("-1");
  await expect(answer).not.toBeChecked();
  await capture(page, testInfo, "tryout-visual-unselected");
  await answer.click();
  await expect(answer).toBeChecked();
  await slider.fill("2");
  await expect(slider).toHaveValue("2");
  await expect(answer).toBeChecked();
  await capture(page, testInfo, "tryout-visual-selected");
  expect(errors).toEqual([]);
});

test("daily quiz visual controls do not select or submit an answer", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = await openFixture(page, "daily");
  const dialog = page.getByRole("dialog", { name: "Kemiringan garis Trivia" });
  await expect(dialog).toBeVisible();
  const graph = dialog.getByRole("figure", { name: "Grafik pilihan jawaban", exact: true });
  await expect(graph.locator('svg[role="img"]')).toBeVisible();
  const answer = dialog.locator('button[aria-labelledby="daily-quiz-letter-0 daily-quiz-option-0"]');
  const send = dialog.getByRole("button", { name: /kirim/i });
  await expect(answer).toHaveAttribute("aria-pressed", "false");
  await graph.getByRole("button", { name: "Parameter", exact: true }).click();
  const slider = graph.getByRole("slider", { name: "Ubah nilai Kemiringan", exact: true });
  await slider.fill("-1");
  await expect(slider).toHaveValue("-1");
  await expect(answer).toHaveAttribute("aria-pressed", "false");
  await expect(send).toBeDisabled();
  await capture(page, testInfo, "daily-visual-unselected");
  await answer.click();
  await expect(answer).toHaveAttribute("aria-pressed", "true");
  await slider.fill("2");
  await expect(slider).toHaveValue("2");
  await expect(answer).toHaveAttribute("aria-pressed", "true");
  await capture(page, testInfo, "daily-visual-selected");
  await send.click();
  const explanation = dialog.getByRole("figure", { name: "Grafik pembahasan", exact: true });
  await explanation.scrollIntoViewIfNeeded();
  await expect(explanation.locator('svg[role="img"]')).toBeVisible();
  await explanation.getByRole("button", { name: "Parameter", exact: true }).click();
  await explanation.getByRole("slider", { name: "Ubah nilai Kemiringan", exact: true }).fill("0");
  await capture(page, testInfo, "daily-explanation");
  expect(errors).toEqual([]);
});

test("flashcard visual interaction preserves the active face", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = await openFixture(page, "flashcard");
  const front = page.locator('[data-flashcard-face="front"]');
  const back = page.locator('[data-flashcard-face="back"]');
  const graph = front.getByRole("figure", { name: "Grafik soal", exact: true });
  await graph.scrollIntoViewIfNeeded();
  await expect(graph.locator('svg[role="img"]')).toBeVisible();
  await expect(front).not.toHaveAttribute("inert", "");
  await expect(back).toHaveAttribute("inert", "");
  await graph.getByRole("button", { name: "Parameter", exact: true }).click();
  const slider = graph.getByRole("slider", { name: "Ubah nilai Kemiringan", exact: true });
  await slider.fill("2");
  await expect(slider).toHaveValue("2");
  await expect(back).toHaveAttribute("inert", "");
  await capture(page, testInfo, "flashcard-front-visual");
  await front.getByText("Ketuk untuk membalik", { exact: false }).click();
  await expect(front).toHaveAttribute("inert", "");
  await expect(back).not.toHaveAttribute("inert", "");
  const answerGraph = back.getByRole("figure", { name: "Grafik pembahasan", exact: true });
  await answerGraph.scrollIntoViewIfNeeded();
  await expect(answerGraph.locator('svg[role="img"]')).toBeVisible();
  await answerGraph.getByRole("button", { name: "Parameter", exact: true }).click();
  const answerSlider = answerGraph.getByRole("slider", { name: "Ubah nilai Kemiringan", exact: true });
  await answerSlider.fill("-1");
  await expect(answerSlider).toHaveValue("-1");
  await expect(front).toHaveAttribute("inert", "");
  await capture(page, testInfo, "flashcard-back-visual");
  expect(errors).toEqual([]);
});

test("tryout question map stays reachable at both widths", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const failures = await openFixture(page, "tryout");
  const map = page.getByRole("button", { name: "Navigasi soal", exact: true });
  if (page.viewportSize()!.width >= 1024) {
    await expect(map).toBeHidden();
    await expect(page.getByRole("button", { name: "Navigasi soal 1, Belum diisi" })).toHaveAttribute("aria-current", "step");
    await capture(page, testInfo, "tryout-desktop-map");
    expect(failures).toEqual([]);
    return;
  }
  await expect(map).toBeInViewport();
  await capture(page, testInfo, "tryout-mobile-map-closed");
  await map.click();
  const sheet = page.getByRole("dialog", { name: "Navigasi soal" });
  const question = sheet.getByRole("button", { name: "Navigasi soal 1, Belum diisi" });
  await expect(question).toHaveAttribute("aria-current", "step");
  await capture(page, testInfo, "tryout-mobile-map-open");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(map).toBeFocused();
  await expect(page.getByRole("button", { name: "Kumpulkan ujian", exact: true })).toBeVisible();
  expect(failures).toEqual([]);
});

test("PDF keeps one open action and respects download access", async ({ page }, info) => {
  test.setTimeout(120_000);
  const fixture = "/visual-fixtures/content-visuals?mode=legacy-pdf";
  await page.goto(fixture);
  const open = page.getByRole("link", { name: "Buka berkas asli", exact: true });
  const download = page.getByRole("link", { name: "Unduh PDF", exact: true });
  await expect(open).toHaveCount(1);
  await expect(open).toBeVisible();
  await expect(download).toHaveCount(0);
  await page.goto(`${fixture}&download=1`);
  await expect(open).toHaveCount(1);
  await expect(download).toBeVisible();
  await expect(download).toHaveAttribute("download", "");
  await page.screenshot({ path: info.outputPath("pdf-actions.png"), style: "nextjs-portal { display: none }" });
});
