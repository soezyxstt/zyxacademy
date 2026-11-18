import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";
import { buildLearningFixture } from "./fixtures/learning-query-build";

const origin = "http://learning-query.invalid";
const reviewReceipt = { nextReviewDue: "2026-11-19T00:00:00.000Z", nextIntervalDays: 1, nextBox: 1 };
let fixture: Awaited<ReturnType<typeof buildLearningFixture>>;
test.beforeAll(async () => { fixture = await buildLearningFixture(); });

async function boot(page: Page, config: Window["learningFixture"], respond?: (route: Route) => Promise<void>) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.clock.install({ time: new Date("2026-11-18T00:00:00.000Z") });
  // Pause the reading clocks. Query batches observer updates with setTimeout(0),
  // so mutation assertions below advance one millisecond at each transition.
  await page.clock.pauseAt(new Date("2026-11-18T00:00:01.000Z"));
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
  await page.evaluate((value) => { window.learningFixture = value; }, config);
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

test("flashcards keep the active card on an invalid receipt and accept one explicit retry", async ({ page }, info) => {
  const posts: Record<string, unknown>[] = [];
  const acknowledge: Array<(json: unknown) => Promise<void>> = [];
  const errors = await boot(page, { mode: "flashcards" }, async (route) => {
    expect(route.request().url()).toBe(`${origin}/fixture/flashcard-review`);
    posts.push(route.request().postDataJSON());
    acknowledge.push((json) => route.fulfill({ json }));
  });
  const firstCard = page.getByText("Apa turunan fungsi kuadrat?", { exact: true });
  await expect(firstCard).toBeVisible();
  await capture(page, info, "flashcard-question", errors);
  await firstCard.click();
  const grade = page.getByRole("button", { name: "Paham", exact: true });
  await grade.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => posts.length).toBe(1);
  await page.clock.runFor(1);
  expect(posts[0]).toMatchObject({ studentId: "fixture-student", courseId: "fixture-course", flashcardId: "card-0", grade: 3, isExamMode: false });
  await expect(grade).toBeDisabled();
  await capture(page, info, "flashcard-review-pending", errors);
  await acknowledge[0]({ unexpected: true });
  await page.clock.runFor(1);
  await expect(page.getByText("Ulasan kartu tidak dapat disimpan.", { exact: true })).toBeVisible();
  await expect(grade).toBeEnabled();
  await expect(page.getByText("Apa arti limit fungsi?", { exact: true })).toHaveCount(0);
  expect(posts).toHaveLength(1);
  await capture(page, info, "flashcard-review-failed", errors);
  await page.clock.runFor(6_000);
  await grade.click();
  await expect.poll(() => posts.length).toBe(2);
  await acknowledge[1](reviewReceipt);
  await page.clock.runFor(1);
  await expect(page.getByText("Apa arti limit fungsi?", { exact: true })).toBeVisible();
  // The toast schedules its own timer after the mutation advances the card.
  await page.clock.runFor(1);
  await expect(page.getByText("Penilaian berhasil disimpan.", { exact: true })).toBeVisible();
  await capture(page, info, "flashcard-review-saved", errors);
});

test("a late flashcard receipt cannot reveal or advance a previous account's session", async ({ page }, info) => {
  let acknowledge: (() => Promise<void>) | undefined;
  const errors = await boot(page, { mode: "flashcards" }, async (route) => {
    acknowledge = () => route.fulfill({ json: reviewReceipt });
  });
  await page.getByText("Apa turunan fungsi kuadrat?", { exact: true }).click();
  await page.getByRole("button", { name: "Paham", exact: true }).click();
  await expect.poll(() => Boolean(acknowledge)).toBe(true);
  await page.clock.runFor(1);
  await page.evaluate(() => window.changeLearningAccount("other-student"));
  await expect(page.locator("[data-flashcard-face]")).toHaveCount(0);
  await acknowledge!();
  await page.clock.runFor(1);
  await expect(page.getByText("Apa arti limit fungsi?", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Penilaian berhasil disimpan.", { exact: true })).toHaveCount(0);
  await capture(page, info, "flashcard-account-switch", errors);
});

test("demo flashcard reviews keep the shared presentation and stay local", async ({ page }, info) => {
  const errors = await boot(page, { mode: "flashcards", demo: true });
  await page.getByText("Apa turunan fungsi kuadrat?", { exact: true }).click();
  await page.getByRole("button", { name: "Paham", exact: true }).click();
  await page.clock.runFor(1);
  await expect(page.getByText("1 ulasan demo", { exact: true })).toBeVisible();
  await expect(page.getByText("Apa arti limit fungsi?", { exact: true })).toBeVisible();
  await capture(page, info, "flashcard-demo-saved", errors);
});

test("article receipts validate the revision and elapsed time flushes only once across completion and exit", async ({ page }, info) => {
  const posts: Record<string, unknown>[] = [];
  const acknowledge: Array<(valid: boolean) => Promise<void>> = [];
  let elapsed = 0;
  const errors = await boot(page, { mode: "article" }, async (route) => {
    expect(route.request().url()).toBe(`${origin}/api/student/articles/fixture-article/progress`);
    expect(route.request().method()).toBe("PUT");
    expect(route.request().headers()["x-student-id"]).toBe("fixture-student");
    const input = route.request().postDataJSON();
    posts.push(input);
    elapsed += input.timeSpentSeconds;
    const receipt = { success: true, articleId: "fixture-article", articleVersion: 3, sectionId: "section", maxReadPercent: 100, completed: true, timeSpentSeconds: elapsed, completedAt: "2026-11-18T00:00:00.000Z" };
    const reply = (valid: boolean) => route.fulfill({ json: { ...receipt, articleVersion: valid ? 3 : 2 } });
    acknowledge.push(reply);
    if (posts.length > 2) await reply(true);
  });
  await expect(page.getByRole("heading", { name: "Mengukur perubahan", exact: true })).toBeVisible();
  await expect(page.getByTitle("Progres membaca: 0%", { exact: true })).toHaveCount(1);
  await capture(page, info, "article-reading", errors);
  await page.clock.runFor(12_000);
  const finish = page.getByRole("button", { name: "Kembali ke daftar materi", exact: true });
  await finish.click();
  await expect.poll(() => posts.length).toBe(1);
  await page.clock.runFor(1);
  expect(posts[0]).toMatchObject({ sectionId: "section", articleVersion: 3, percent: 100, completed: true, timeSpentSeconds: 12 });
  await expect(page.getByTitle("Progres membaca: 100%", { exact: true })).toHaveCount(1);
  await capture(page, info, "article-completion-pending", errors);
  await acknowledge[0](false);
  await page.clock.runFor(1);
  await expect(page.getByTitle("Progres membaca: 0%", { exact: true })).toHaveCount(1);
  await capture(page, info, "article-completion-unconfirmed", errors);
  await finish.click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].timeSpentSeconds).toBe(0);
  await acknowledge[1](true);
  await page.clock.runFor(1);
  await expect(page.getByTitle("Progres membaca: 100%", { exact: true })).toHaveCount(1);
  await capture(page, info, "article-completed", errors);
  await page.clock.runFor(4_000);
  await page.evaluate(() => { window.dispatchEvent(new Event("pagehide")); window.closeLearningFixture(); });
  await expect(page.getByRole("status")).toHaveText("Pembaca ditutup");
  await expect.poll(() => posts.length).toBe(3);
  expect(posts.map((post) => post.timeSpentSeconds)).toEqual([12, 0, 4]);
  expect(elapsed).toBe(16);
  expect(errors).toEqual([]);
});

test("legacy reading batches position writes and consumes the exit delta once", async ({ page }, info) => {
  const posts: Record<string, unknown>[] = [];
  const statuses: Record<string, unknown>[] = [];
  let elapsed = 0;
  const errors = await boot(page, { mode: "material" }, async (route) => {
    if (route.request().url() === `${origin}/fixture/material-status`) {
      statuses.push(route.request().postDataJSON());
      return route.fulfill({ json: { success: true } });
    }
    expect(route.request().url()).toBe(`${origin}/api/student/material-progress`);
    expect(route.request().headers()["x-student-id"]).toBe("fixture-student");
    const input = route.request().postDataJSON();
    posts.push(input);
    elapsed += input.timeSpentSeconds;
    await route.fulfill({ json: { ...input, studentId: "fixture-student", timeSpentSeconds: elapsed } });
  });
  await expect(page.getByRole("heading", { name: "Ringkasan fungsi", exact: true }).first()).toBeVisible();
  await expect.poll(() => statuses.length).toBe(1);
  await page.clock.runFor(1);
  expect(statuses[0]).toMatchObject({ materialId: "fixture-material", status: "in_progress", expectedUserId: "fixture-student" });
  await capture(page, info, "material-reading", errors);
  await page.clock.runFor(20_000);
  await expect.poll(() => posts.length).toBe(1);
  await page.clock.runFor(1);
  expect(posts[0].timeSpentSeconds).toBe(20);
  await capture(page, info, "material-progress-saved", errors);
  await page.clock.runFor(24_000);
  expect(posts).toHaveLength(1);
  await page.evaluate(() => { window.dispatchEvent(new Event("pagehide")); window.closeLearningFixture(); });
  await expect(page.getByRole("status")).toHaveText("Pembaca ditutup");
  await expect.poll(() => posts.length).toBe(2);
  expect(posts.map((post) => post.timeSpentSeconds)).toEqual([20, 24]);
  expect(elapsed).toBe(44);
  expect(errors).toEqual([]);
});

test("canonical material serializes completion and only generates a summary on a user request", async ({ page }, info) => {
  const statuses: Record<string, unknown>[] = [];
  const acknowledgeStatus: Array<() => Promise<void>> = [];
  const summaries: Record<string, unknown>[] = [];
  const acknowledgeSummary: Array<(json: unknown) => Promise<void>> = [];
  const errors = await boot(page, { mode: "canonical-material" }, async (route) => {
    if (route.request().url() === `${origin}/fixture/material-status`) {
      statuses.push(route.request().postDataJSON());
      acknowledgeStatus.push(() => route.fulfill({ json: { success: true } }));
      return;
    }
    expect(route.request().url()).toBe(`${origin}/api/student/summarize-chapter`);
    expect(route.request().headers()["x-student-id"]).toBe("fixture-student");
    summaries.push(route.request().postDataJSON());
    acknowledgeSummary.push((json) => route.fulfill({ json }));
  });
  await expect.poll(() => statuses.length).toBe(1);
  await page.clock.runFor(1);
  const complete = page.getByRole("button", { name: "Tandai selesai", exact: true }).first();
  await complete.click();
  await page.clock.runFor(1);
  await expect(complete).toBeDisabled();
  expect(statuses.map((status) => status.status)).toEqual(["in_progress"]);
  await acknowledgeStatus[0]();
  await expect.poll(() => statuses.length).toBe(2);
  await page.clock.runFor(1);
  expect(statuses[1].status).toBe("completed");
  await capture(page, info, "material-completion-pending", errors);
  await acknowledgeStatus[1]();
  await page.clock.runFor(1);
  await expect(page.getByText("Materi berhasil ditandai selesai!", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Selesai", exact: true }).first()).toBeDisabled();
  await capture(page, info, "material-completed", errors);
  await page.clock.runFor(40_000);
  expect(statuses).toHaveLength(2);
  expect(summaries).toHaveLength(0);
  const summarize = page.getByRole("button", { name: "Ringkas", exact: true });
  await summarize.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => summaries.length).toBe(1);
  await page.clock.runFor(1);
  expect(summaries[0]).toEqual({ chapterId: "chapter" });
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, info, "chapter-summary-loading", errors);
  await acknowledgeSummary[0]({ unexpected: true });
  await page.clock.runFor(1);
  await expect(page.getByText("Gagal memuat ringkasan.", { exact: true })).toBeVisible();
  await capture(page, info, "chapter-summary-failed", errors);
  await page.clock.runFor(20_000);
  expect(summaries).toHaveLength(1);
  await page.keyboard.press("Escape");
  await page.clock.runFor(300);
  await summarize.click();
  await expect.poll(() => summaries.length).toBe(2);
  await acknowledgeSummary[1]({ cached: false, budgetExhausted: false, summary: { keyConcepts: ["Setiap masukan memiliki satu keluaran."], commonMistakes: ["Menyamakan fungsi dengan nilainya."], importantFormulas: ["f(x) = x^2"], practiceRecommendations: ["Bandingkan nilai fungsi pada dua masukan."] } });
  await page.clock.runFor(1);
  await expect(page.getByText("Setiap masukan memiliki satu keluaran.", { exact: true })).toBeVisible();
  await capture(page, info, "chapter-summary-ready", errors);
});
