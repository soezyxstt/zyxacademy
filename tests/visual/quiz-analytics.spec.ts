import { expect, test } from "@playwright/test";

test.setTimeout(120_000);
const metrics = {
  quizTitle: "Kuis matematika dasar", courseId: "visual-math", templateId: "visual-quiz", attemptId: "visual-attempt", score: 75, correctCount: 3, incorrectCount: 1, unansweredCount: 0, totalQuestions: 4, durationSeconds: 180,
  conceptMastery: [{ concept: "Limit fungsi aljabar dan kekontinuan pada interval", totalQuestions: 4, correctCount: 3, incorrectCount: 1, accuracyPercent: 75, status: "adequate", previousAccuracyPercent: 70, trend: "improving", subconcepts: ["Substitusi langsung"] }],
  cognitiveSkills: [], difficultyBreakdown: [],
  timeAnalysis: { totalDurationSeconds: 180, avgTimePerQuestionSeconds: 45, fastAnswerCount: 1, fastIncorrectCount: 1, slowAnswerCount: 0 },
  historicalComparison: { totalAttemptsAnalyzed: 1, scoreTrend: [75], overallImprovementDelta: 5, consistentlyWeakConcepts: [], improvedConcepts: [] },
};
const diagnosis = {
  headline: "Hasil latihan", overall_summary: "Terus latih penerapan konsep.", performance_level: "good",
  strengths: [{ title: "Konsep dasar", description: "Pemahaman dasar baik.", evidence: [{ observation: "Jawaban benar pada tiga soal." }] }],
  focus_areas: [{ title: "Ketelitian", description: "Periksa langkah perhitungan.", importance: "Tinjau kembali jawaban sebelum mengirim.", evidence: [] }],
  error_patterns: [], time_insights: [], concept_diagnostics: [], skill_diagnostics: [], progress_insights: [], encouragement: "", limitations: [],
  study_plan: [{ priority: 1, focus: "Turunan fungsi", reason: "Perlu latihan tambahan.", action: "Kerjakan soal turunan.", success_check: "Jawab dengan benar." }],
};

test("quiz analysis controls fit the processing state", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: {
    user: { id: "fixture-student", name: "Fixture student", email: "fixture@example.test" },
    session: { id: "fixture-session", userId: "fixture-student", expiresAt: "2099-01-01T00:00:00.000Z" },
  } }));
  await page.route("**/api/quiz/attempts/visual-attempt/analytics", route => route.fulfill({ json: { status: "processing", computedMetrics: metrics, aiDiagnosis: diagnosis } }));
  await page.goto("/visual-fixtures/quiz-analytics", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Hasil latihan")).toBeVisible({ timeout: 60_000 });
  const navbar = page.locator("[data-mobile-navbar]");
  const refresh = page.getByRole("button", { name: /refresh status|perbarui status|muat ulang status|segarkan status/i });
  await expect(refresh).toHaveCount(1);
  const metricsList = page.locator("[data-quiz-analysis-metrics]");
  await expect(metricsList.locator("dt")).toHaveCount(5);
  await expect(metricsList).toHaveCSS("display", "block");
  await expect(page.getByText(metrics.conceptMastery[0].concept, { exact: true }).filter({ visible: true })).toBeVisible();
  if (info.project.name === "mobile-380") {
    await expect(navbar.getByRole("button", { name: await refresh.getAttribute("aria-label") ?? "" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  } else {
    await expect(page.getByRole("main").getByRole("button", { name: await refresh.getAttribute("aria-label") ?? "" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  }
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const path = info.outputPath("screenshots/processing.png");
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach("processing", { path, contentType: "image/png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
