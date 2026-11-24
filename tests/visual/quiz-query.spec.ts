import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";
import { buildFixture } from "./fixtures/interactive-document-build";
import type { QuizFixtureConfig } from "./fixtures/quiz-query";

const origin = "http://quiz-query.invalid";
let fixture: Awaited<ReturnType<typeof buildFixture>>;
test.beforeAll(async () => { fixture = await buildFixture("tests/visual/fixtures/quiz-query.tsx"); });

async function boot(page: Page, config: QuizFixtureConfig, respond?: (route: Route) => Promise<void>) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.clock.install({ time: new Date("2026-11-18T00:00:00.000Z") });
  await page.route("**/*", async (route) => {
    if (route.request().url() === `${origin}/`) {
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>' });
    }
    if (respond) return respond(route);
    errors.push(`Unexpected ${route.request().method()} ${route.request().url()}`);
    return route.abort();
  });
  await page.goto(origin);
  await page.addStyleTag({ content: fixture.styles });
  await page.evaluate((value) => { window.quizFixture = value; }, config);
  await page.addScriptTag({ content: fixture.script });
  return errors;
}

async function capture(page: Page, info: TestInfo, name: string, errors: string[]) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
  expect(errors).toEqual([]);
}

test("quiz keeps recovery after an invalid acknowledgement, then clears it after a valid retry", async ({ page }, info) => {
  const posts: Record<string, unknown>[] = [];
  let acknowledge = false;
  const errors = await boot(page, { mode: "player" }, async (route) => {
    expect(route.request().url()).toBe(`${origin}/api/quiz/attempts/fixture-attempt`);
    expect(route.request().method()).toBe("POST");
    posts.push(route.request().postDataJSON());
    await route.fulfill({ json: acknowledge ? { score: null, correct: 1, total: 2, gradingStatus: "pending" } : { unexpected: true } });
  });
  await expect(page.getByRole("checkbox", { name: /Dua/ })).toBeEnabled();
  const bottomBar = page.locator("[data-quiz-mobile-bottombar]");
  if (page.viewportSize()!.width < 768) {
    await expect(bottomBar.getByRole("button")).toHaveCount(2);
    await expect(bottomBar.getByRole("button", { name: "Sebelumnya" })).toBeDisabled();
    const next = bottomBar.getByRole("button", { name: "Lanjut", exact: true });
    await expect(next).toBeEnabled();
    await expect(bottomBar.getByRole("button", { name: /kuis|kirim/i })).toHaveCount(0);
    expect(await next.evaluate(button => {
      const row = button.parentElement!;
      return Math.abs(row.getBoundingClientRect().right - button.getBoundingClientRect().right);
    })).toBeLessThanOrEqual(1);
  } else {
    const earlySubmit = page.getByRole("button", { name: "Kumpulkan kuis", exact: true });
    await earlySubmit.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cek kembali", exact: true }).click();
    await expect(earlySubmit).toBeFocused();
    expect(posts).toHaveLength(0);
  }
  await capture(page, info, "quiz-empty", errors);
  await page.getByRole("checkbox", { name: /Dua/ }).click();
  await page.getByRole("checkbox", { name: /Empat/ }).click();
  await capture(page, info, "quiz-selected", errors);
  const originalViewport = page.viewportSize()!;
  if (originalViewport.width < 1024) {
    const mapTrigger = page.getByRole("button", { name: "Navigasi pertanyaan", exact: true });
    await mapTrigger.click();
    const map = page.getByRole("dialog", { name: "Navigasi pertanyaan", exact: true });
    const current = map.getByRole("button", { name: "Soal 1, Terjawab", exact: true });
    await expect(current).toHaveAttribute("aria-current", "step");
    await expect(map.getByRole("button", { name: "Soal 2, Belum diisi", exact: true })).toBeEnabled();
    await capture(page, info, "quiz-question-map", errors);
    await current.click();
    await expect(map).toBeHidden();
    await expect(mapTrigger).toBeFocused();
    await expect(page.getByRole("checkbox", { name: /Dua/ })).toBeChecked();
    try {
      await page.setViewportSize({ width: 1023, height: 844 });
      await expect(mapTrigger).toBeInViewport();
      await mapTrigger.click();
      await expect(map).toBeVisible();
      await expect(current).toHaveAttribute("aria-current", "step");
      await expect(map.getByRole("button", { name: "Soal 2, Belum diisi", exact: true })).toBeEnabled();
      await capture(page, info, "quiz-map-width-1023", errors);
      await current.click();
      await expect(map).toBeHidden();
      await expect(mapTrigger).toBeFocused();
      await expect(page.getByRole("checkbox", { name: /Dua/ })).toBeChecked();
      await expect(page.getByRole("checkbox", { name: /Empat/ })).toBeChecked();

      await page.setViewportSize({ width: 1024, height: 844 });
      await expect(mapTrigger).toBeHidden();
      await expect(page.getByRole("button", { name: "Soal 1, Terjawab", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Soal 1, Terjawab", exact: true })).toHaveAttribute("aria-current", "step");
      await expect(page.getByRole("button", { name: "Soal 2, Belum diisi", exact: true })).toBeEnabled();
      await expect(page.getByRole("checkbox", { name: /Dua/ })).toBeChecked();
      await expect(page.getByRole("checkbox", { name: /Empat/ })).toBeChecked();
      await capture(page, info, "quiz-map-width-1024", errors);
    } finally {
      await page.setViewportSize(originalViewport);
    }
    await expect(mapTrigger).toBeInViewport();
    await expect(page.getByRole("checkbox", { name: /Dua/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Empat/ })).toBeChecked();
  }
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.locator("textarea").fill("Jawaban terakhir sebelum dikumpulkan.");
  if (originalViewport.width < 768) {
    await expect(bottomBar.getByRole("button")).toHaveCount(2);
    await expect(bottomBar.getByRole("button", { name: "Lanjut", exact: true })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, info, "quiz-confirm", errors);
  await page.getByRole("button", { name: "Ya, kumpulkan", exact: true }).click();
  await expect(page.getByText("Gagal mengumpulkan kuis. Silakan coba kembali.", { exact: true })).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0].answers).toEqual({ q1: [0, 2], q2: { text: "Jawaban terakhir sebelum dikumpulkan." } });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zyx-quiz-answers-fixture-attempt")!))).toEqual({ q1: [0, 2], q2: { text: "Jawaban terakhir sebelum dikumpulkan." } });
  await capture(page, info, "quiz-recovery", errors);
  acknowledge = true;
  await page.getByRole("button", { name: "Ya, kumpulkan", exact: true }).click();
  await expect.poll(() => posts.length).toBe(2);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("zyx-quiz-answers-fixture-attempt"))).toBeNull();
  // The fixture stubs navigation. The confirmed attempt stays locked until it leaves this page.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeHidden();
  const submitControl = originalViewport.width < 768
    ? page.locator("[data-quiz-mobile-bottombar] button").last()
    : page.getByRole("button", { name: /^(Kirim jawaban|Mengirim…)$/ });
  await expect(submitControl).toBeDisabled();
  await expect(page.locator("textarea")).toBeDisabled();
  await capture(page, info, "quiz-submitted", errors);
});

test("timeout waits for the active upload and sends one latest answer snapshot", async ({ page }, info) => {
  let completeUpload: (() => Promise<void>) | undefined;
  const posts: Record<string, unknown>[] = [];
  const errors = await boot(page, { mode: "player", seconds: 10 }, async (route) => {
    if (route.request().url().endsWith("/attachments")) {
      completeUpload = () => route.fulfill({ json: { success: true, key: "fixture/answer.pdf", fileName: "answer.pdf", fileSize: "10 B" } });
      return;
    }
    posts.push(route.request().postDataJSON());
    await route.fulfill({ json: { score: null, correct: 0, total: 2, gradingStatus: "pending" } });
  });
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.locator("textarea").fill("Penjelasan dengan lampiran.");
  await page.locator('input[type="file"]').setInputFiles({ name: "answer.pdf", mimeType: "application/pdf", buffer: Buffer.from("fixture") });
  await expect.poll(() => Boolean(completeUpload)).toBe(true);
  await capture(page, info, "quiz-uploading", errors);
  const mobile = page.viewportSize()!.width < 1024;
  const map = page.getByRole("dialog", { name: "Navigasi pertanyaan", exact: true });
  if (mobile) {
    await page.getByRole("button", { name: "Navigasi pertanyaan", exact: true }).click();
    await expect(map).toBeVisible();
    await expect(map.getByRole("button", { name: "Soal 2, Terjawab", exact: true })).toHaveAttribute("aria-current", "step");
  }
  await page.clock.fastForward(10_000);
  await expect(page.locator("textarea")).toBeDisabled();
  expect(posts).toHaveLength(0);
  if (mobile) {
    await expect(map.getByRole("button", { name: "Soal 1, Belum diisi", exact: true })).toBeDisabled();
    await expect(map.getByRole("button", { name: "Soal 2, Terjawab", exact: true })).toBeDisabled();
    await capture(page, info, "quiz-timeout-map-locked", errors);
  }
  await completeUpload!();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].answers).toEqual({ q1: [], q2: { text: "Penjelasan dengan lampiran.", fileName: "answer.pdf", fileSize: "10 B", fileKey: "fixture/answer.pdf" } });
  if (mobile) {
    await expect(map.getByRole("button", { name: "Soal 1, Belum diisi", exact: true })).toBeDisabled();
    const current = map.getByRole("button", { name: "Soal 2, Terjawab", exact: true });
    await expect(current).toBeDisabled();
    await expect(current).toHaveAttribute("aria-current", "step");
    await page.keyboard.press("Escape");
    await expect(map).toBeHidden();
  }
  await page.clock.fastForward(10_000);
  expect(posts).toHaveLength(1);
  await capture(page, info, "quiz-timeout-submitted", errors);
});

test("demo submission stays local", async ({ page }, info) => {
  const errors = await boot(page, { mode: "demo" });
  await page.getByRole("checkbox", { name: /Dua/ }).click();
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
  await page.getByRole("button", { name: "Ya, kumpulkan", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Jawaban demo tersimpan");
  await capture(page, info, "quiz-demo-submitted", errors);
});

test("untimed quiz stays open past 15 minutes and still advances per question", async ({ page }, info) => {
  await page.addInitScript(() => {
    localStorage.setItem("zyx-quiz-timer-deadline-fixture-attempt", String(Date.now() + 900_000));
  });
  const errors = await boot(page, { mode: "demo", seconds: null, perQuestionSeconds: 30 });
  const totalTimer = page.getByRole("timer", { name: "Total sisa waktu kuis" });
  await expect(page.getByRole("timer")).toHaveCount(1);
  await expect(totalTimer).toHaveCount(0);
  await page.clock.fastForward(901_000);
  await expect(page.locator("textarea")).toBeEditable();
  await expect(page.getByText("Jawaban demo tersimpan", { exact: true })).toHaveCount(0);
  await expect(totalTimer).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("zyx-quiz-timer-deadline-fixture-attempt"))).toBeNull();
  await capture(page, info, "quiz-untimed-per-question", errors);

  await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Sisa waktu", { exact: true })).toHaveCount(0);
  await capture(page, info, "quiz-untimed-confirm", errors);
});

test("a scheduled close ends an otherwise untimed quiz", async ({ page }, info) => {
  const errors = await boot(page, { mode: "demo", seconds: null, closeAtMs: Date.parse("2026-11-18T00:01:00.000Z") });
  await expect(page.getByRole("timer", { name: "Total sisa waktu kuis" })).toBeVisible();
  await capture(page, info, "quiz-untimed-with-close", errors);
  await page.clock.fastForward(60_000);
  await expect(page.getByRole("status").filter({ hasText: "Jawaban demo tersimpan" })).toBeVisible();
  await capture(page, info, "quiz-scheduled-close-submitted", errors);
});

test("a different signed-in account cannot restore the server owner's quiz draft", async ({ page }, info) => {
  const errors = await boot(page, { mode: "player", expectedUserId: "other-student" });
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  await expect(page.getByText("Pilih bilangan genap.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kirim jawaban", exact: true })).toHaveCount(0);
  await capture(page, info, "quiz-account-guard", errors);
});

test("review polling stops at the time limit even when responses arrive quickly", async ({ page }, info) => {
  let reads = 0;
  const errors = await boot(page, { mode: "review" }, async (route) => {
    reads++;
    await route.fulfill({ json: {
      id: "fixture-attempt", studentId: "fixture-student", templateId: "fixture-quiz", score: 0, durationSeconds: 10,
      status: "completed", submittedAt: "2026-11-18T00:00:00.000Z", strongAreas: [], weakAreas: ["Bilangan"],
      questionsSnapshot: [{ id: "q1", prompt: "Pilih bilangan genap.", options: ["Dua", "Tiga"], correct_indices: [0] }],
      answersSnapshot: { q1: [1] }, recommendedNextSteps: [], feedback: [], remediation: null,
    } });
  });
  await expect(page.getByText("Pilih bilangan genap.")).toBeVisible();
  await capture(page, info, "quiz-review-pending", errors);
  await page.clock.runFor(31_000);
  const stoppedAt = reads;
  expect(reads).toBeGreaterThan(1);
  await page.clock.runFor(12_000);
  expect(reads).toBe(stoppedAt);
  await capture(page, info, "quiz-review-timeout", errors);
});
