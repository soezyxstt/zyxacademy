import { expect, test } from "@playwright/test";
import { waitForVisualReadiness } from "./visual-readiness";

test.setTimeout(120_000);
const metrics = {
  quizTitle: "Kuis matematika dasar", courseId: "visual-math", templateId: "visual-quiz", attemptId: "visual-attempt", score: 75, correctCount: 3, incorrectCount: 1, unansweredCount: 0, totalQuestions: 4, durationSeconds: 180,
  conceptMastery: [
    { concept: "Limit fungsi aljabar dan kekontinuan pada interval", totalQuestions: 4, correctCount: 3, incorrectCount: 1, accuracyPercent: 75, status: "adequate", previousAccuracyPercent: 70, trend: "improving", subconcepts: ["Substitusi langsung"] },
    { concept: String.raw`Turunan berantai untuk $\frac{d}{dx}\left(\sin(x^2) + \ln(1+x^2) + \frac{x^3}{x^2+1}\right)$ pada interval terbuka`, totalQuestions: 2, correctCount: 0, incorrectCount: 2, accuracyPercent: 0, status: "needs_reinforcement", previousAccuracyPercent: 50, trend: "declining" },
  ],
  cognitiveSkills: [{ skill: "Menafsirkan representasi simbolik dan menerapkan aturan turunan", totalQuestions: 4, correctCount: 3, accuracyPercent: 75, status: "adequate" }], difficultyBreakdown: [],
  timeAnalysis: { totalDurationSeconds: 180, avgTimePerQuestionSeconds: 45, fastAnswerCount: 1, fastIncorrectCount: 1, slowAnswerCount: 0 },
  historicalComparison: { totalAttemptsAnalyzed: 1, scoreTrend: [75], overallImprovementDelta: 5, consistentlyWeakConcepts: [], improvedConcepts: [] },
};
const diagnosis = {
  headline: "Hasil latihan", overall_summary: "Terus latih penerapan konsep.", performance_level: "good",
  strengths: [{ title: "Konsep dasar", description: "Pemahaman dasar baik.", evidence: [{ observation: "Jawaban benar pada tiga soal." }] }],
  focus_areas: [{ title: "Ketelitian", description: "Periksa langkah perhitungan.", importance: "Tinjau kembali jawaban sebelum mengirim.", evidence: [] }],
  error_patterns: [{ category: "procedural_error", title: "Menerapkan aturan rantai", description: "Faktor turunan fungsi bagian dalam terlewat.", confidence: "high", supporting_questions: [], correction_strategy: "Tulis turunan komponen dalam secara terpisah sebelum mengalikan hasilnya." }],
  time_insights: [{ observation: "Satu jawaban salah dipilih dalam 9 detik.", interpretation: "Pengecekan terlalu singkat.", suggestion: "Sisakan waktu untuk memeriksa faktor turunan bagian dalam." }],
  concept_diagnostics: [], skill_diagnostics: [], progress_insights: [], encouragement: "", limitations: [],
  study_plan: [{ priority: 1, focus: "Turunan fungsi", reason: "Perlu latihan tambahan.", action: "Kerjakan soal turunan.", success_check: "Jawab dengan benar." }],
};

for (const colorScheme of ["light", "dark"] as const) {
  test(`quiz analysis prioritizes the study plan and readable metrics in ${colorScheme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
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
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
    const navbar = page.locator("[data-mobile-navbar]");
    const refresh = page.getByRole("button", { name: /refresh status|perbarui status|muat ulang status|segarkan status/i });
    await expect(refresh).toHaveCount(1);
    const metricsList = page.locator("[data-quiz-analysis-metrics]");
    await expect(metricsList.locator("dt")).toHaveCount(5);
    await expect(metricsList).toHaveCSS("display", "block");
    await expect(page.getByText(metrics.conceptMastery[0].concept, { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.locator(".katex:visible")).toHaveCount(1);
    const studyPlan = page.getByRole("heading", { name: /rencana belajar|study plan/i });
    const mastery = page.getByRole("heading", { name: /penguasaan konsep|concept mastery/i });
    const [planBounds, masteryBounds, metricsBounds] = await Promise.all([studyPlan.boundingBox(), mastery.boundingBox(), metricsList.boundingBox()]);
    expect(planBounds!.y).toBeLessThan(masteryBounds!.y);
    await expect(page.getByText(/menurun dari 50%|down from 50%/i).filter({ visible: true })).toBeVisible();
    if (info.project.name === "mobile-380") {
      expect(metricsBounds!.y + metricsBounds!.height).toBeLessThan(planBounds!.y);
      await expect(navbar.getByRole("button", { name: await refresh.getAttribute("aria-label") ?? "" })).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);
    } else {
      expect(planBounds!.x).toBeLessThan(metricsBounds!.x);
      await expect(page.getByRole("main").getByRole("button", { name: await refresh.getAttribute("aria-label") ?? "" })).toBeVisible();
      await expect(page.getByRole("table")).toBeVisible();
    }
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await waitForVisualReadiness(page);
    const path = info.outputPath(`screenshots/processing-${colorScheme}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    await info.attach("processing", { path, contentType: "image/png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
