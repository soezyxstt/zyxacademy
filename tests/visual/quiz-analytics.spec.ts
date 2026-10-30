import { expect, test } from "@playwright/test";

test.setTimeout(120_000);
const metrics = {
  quizTitle: "Kuis matematika dasar", score: 75, correctCount: 3, incorrectCount: 1, unansweredCount: 0, totalQuestions: 4, durationSeconds: 180,
  conceptMastery: [], cognitiveSkills: [], difficultyBreakdown: [],
  timeAnalysis: { avgTimePerQuestionSeconds: 45, fastAnswerCount: 1, fastIncorrectCount: 1 },
  historicalComparison: { overallImprovementDelta: 5 },
};
const diagnosis = {
  headline: "Hasil latihan", overall_summary: "Terus latih penerapan konsep.", performance_level: "good",
  strengths: [{ title: "Konsep dasar", description: "Pemahaman dasar baik.", evidence: [{ observation: "Jawaban benar pada tiga soal." }] }],
  focus_areas: [{ title: "Ketelitian", description: "Periksa langkah perhitungan.", importance: "Tinjau kembali jawaban sebelum mengirim." }],
  error_patterns: [], time_insights: [],
  study_plan: [{ priority: 1, focus: "Turunan fungsi", reason: "Perlu latihan tambahan.", action: "Kerjakan soal turunan.", success_check: "Jawab dengan benar." }],
};

test("quiz analysis controls fit the processing state", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route("**/api/quiz/attempts/visual-attempt/analytics", route => route.fulfill({ json: { status: "processing", computedMetrics: metrics, aiDiagnosis: diagnosis } }));
  await page.goto("/visual-fixtures/quiz-analytics", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Hasil latihan")).toBeVisible({ timeout: 60_000 });
  const path = info.outputPath("screenshots/processing.png");
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach("processing", { path, contentType: "image/png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
