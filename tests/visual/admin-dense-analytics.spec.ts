import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { QuizDetailResponse } from "@/app/(admin)/admin/(eval)/quiz-insights/quiz-insight-detail-client";
import { buildFixture } from "./fixtures/interactive-document-build";
import { fixtureFontStyles } from "./fixtures/fonts";
import { waitForVisualReadiness } from "./visual-readiness";

const longPrompt = String.raw`Bandingkan fungsi pada kedua sisi interval. Jelaskan bagaimana nilai $\frac{x^3 - 2x + 1}{x^2+1}$ berubah ketika mendekati titik kritis, lalu tuliskan alasannya.`;
const quiz: QuizDetailResponse = {
  template: {
    id: "visual-quiz",
    title: "Analisis kekontinuan dan limit rasional pada interval terbuka",
    category: "chapter",
    courseId: "fixture-math",
    courseName: "Matematika I",
    timeLimitSeconds: 900,
    status: "published",
    createdAt: "2026-11-14T09:00:00.000Z",
  },
  summary: {
    totalStarted: 17,
    totalCompleted: 15,
    completionRate: 88,
    avgScore: 72,
    minScore: 19,
    maxScore: 100,
    medianScore: 76,
    avgDurationSeconds: 390,
    scoreRanges: { range0_20: 1, range21_40: 0, range41_60: 4, range61_80: 6, range81_100: 4 },
  },
  questionAnalysis: [{
    questionId: "visual-question",
    prompt: longPrompt,
    options: ["Kedua sisi mencapai nilai yang sama.", String.raw`Kedua sisi menghasilkan nilai $\frac{x^3 - 2x + 1}{x^2+1}$ yang berbeda.`],
    correctIndices: [0],
    tags: ["Limit rasional"],
    difficulty: "hard",
    explanation: "Periksa pembilang dan penyebut secara terpisah.",
    totalAnswers: 15,
    correctCount: 6,
    accuracyRate: 40,
    optionCounts: { 0: 6, 1: 9 },
  }],
  conceptAnalysis: [
    { tag: String.raw`Limit rasional pada $\frac{x^3 - 2x + 1}{x^2+1}$ dengan titik kritis yang berbeda`, totalAnswered: 15, correctCount: 6, accuracyRate: 40 },
    { tag: "Titik kritis", totalAnswered: 15, correctCount: 11, accuracyRate: 73 },
  ],
  latestAiInsight: {
    id: "visual-insight",
    sampleSize: 15,
    summary: "Periksa perubahan pemahaman pada titik kritis.",
    createdAt: "2026-11-23T09:00:00.000Z",
    insights: {
      summaryOverview: "Sebagian besar siswa mampu mengenali bentuk rasional. Kesulitan utama muncul ketika siswa harus menjelaskan kekontinuan dari dua sisi interval.",
      misconceptions: [
        { concept: "Bentuk rasional di titik kritis", description: "Siswa menyamakan nilai fungsi pada titik dengan nilai limit satu sisi.", frequency: "high" },
      ],
      teachingRecommendations: [
        { topic: "Bandingkan representasi", actionItem: "Sandingkan grafik, tabel nilai, dan bentuk aljabar.", rationale: "Siswa dapat memeriksa tanda dan arah perubahan dari tiap sisi." },
      ],
      hardestQuestionsAnalysis: [
        { questionId: "visual-question", promptSnippet: longPrompt, accuracyRate: 40, diagnosis: "Sebagian siswa menggunakan substitusi langsung tanpa mengecek tiap sisi.", distractorTrap: "Nilai fungsi di titik dibaca sebagai nilai limit." },
      ],
      easiestQuestionsAnalysis: [],
      actionableNextSteps: [],
    },
  },
};

const origin = "http://admin-dense.invalid";
const fontStyles = fixtureFontStyles();
let fixture: Awaited<ReturnType<typeof buildFixture>>;

test.beforeAll(async () => {
  fixture = await buildFixture("tests/visual/fixtures/admin-dense-analytics.tsx", "", {
    "@/lib/auth-client": `const session = { data: { user: { id: "fixture-admin" } }, isPending: false }; export const useSession = () => session; export const authClient = {};`,
  });
});

async function visit(page: Page, query: string) {
  const response = await page.goto(`${origin}/?${query}`);
  expect(response?.status()).toBe(200);
  await page.addStyleTag({ content: fixture.styles });
  await page.addStyleTag({ content: fontStyles });
  await page.addScriptTag({ content: fixture.script });
}

async function prepare(page: Page, colorScheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await page.route(`${origin}/**`, (route) => {
    if (route.request().resourceType() !== "document") return route.abort();
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="id" class="${colorScheme}"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="bg-background text-foreground"><div id="root"></div></body></html>`,
    });
  });
  return errors;
}

async function capture(page: Page, info: TestInfo, name: string) {
  await waitForVisualReadiness(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

async function selectTab(page: Page, name: RegExp) {
  const tab = page.getByRole("tab", { name });
  if (await tab.isVisible()) {
    await tab.click();
    return;
  }
  await page.locator('[data-slot="tabs-more-trigger"]').click();
  await page.getByRole("menuitem", { name }).click();
}

test.setTimeout(120_000);

for (const theme of ["light", "dark"] as const) {
  test(`web analytics keeps traffic and rankings readable in ${theme}`, async ({ page }, info) => {
    const errors = await prepare(page, theme);
    await visit(page, "view=web");
    const daily = page.getByRole("heading", { name: /tren pengunjung|visitor trends/i });
    const topPages = page.getByRole("heading", { name: /halaman terpopuler|top pages/i });
    await expect(daily).toBeVisible();
    await expect(topPages).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Agenda" })).toContainText(/0$/);
    await expect(page.getByText(/limit-fungsi-rasional-dan-kekontinuan/)).toBeVisible();
    await capture(page, info, "traffic");

    await visit(page, "view=web&state=empty");
    await expect(page.getByText(/belum ada lalu lintas harian|no daily traffic yet/i)).toBeVisible();
    await expect(page.getByText(/belum ada halaman terpopuler|no top pages yet/i)).toBeVisible();
    await capture(page, info, "empty");
    expect(errors).toEqual([]);
  });

  test(`course quiz analytics keeps formulas and answer context in ${theme}`, async ({ page }, info) => {
    const errors = await prepare(page, theme);
    await page.route("**/api/admin/quiz-insights/visual-quiz", (route) => route.fulfill({ json: quiz }));
    await visit(page, "view=course");
    await expect(page.getByText(/lalu tuliskan alasannya/)).toBeVisible({ timeout: 45_000 });
    const action = page.getByRole("button", { name: "Jalankan analisis performa" });
    const toolbar = info.project.name === "mobile-380" ? page.locator("[data-mobile-navbar]") : page.getByRole("main");
    await expect(toolbar.getByRole("button", { name: "Jalankan analisis performa" })).toBeVisible();
    await expect(action).toHaveCount(1);
    await expect(action).toHaveText("");
    await expect(page.locator(".katex:visible")).toHaveCount(1);
    await capture(page, info, "evaluation");

    await selectTab(page, /analisis soal|question analysis/i);
    await expect(page).toHaveURL(/tab=questions/);
    await expect(page.getByText(/jawaban benar|correct answer/i, { exact: true })).toBeAttached();
    await expect(page.locator(".katex:visible")).toHaveCount(2);
    await capture(page, info, "questions");

    await selectTab(page, /distribusi nilai|score distribution/i);
    await expect(page).toHaveURL(/tab=score-dist/);
    await expect(page.getByText(/dengan titik kritis yang berbeda/)).toBeVisible();
    await capture(page, info, "scores");
    await page.route("**/api/admin/quiz-insights/visual-quiz/analyze", (route) => route.fulfill({ json: {} }));
    const submitted = page.waitForRequest((request) => request.url().endsWith("/visual-quiz/analyze") && request.method() === "POST");
    await action.click();
    await submitted;
    await expect(action).toBeEnabled();
    await expect(page).toHaveURL(/tab=score-dist/);
    expect(errors).toEqual([]);
  });

  test(`feature usage shows one ranking with distinct daily activity in ${theme}`, async ({ page }, info) => {
    const errors = await prepare(page, theme);
    await visit(page, "view=usage");
    await expect(page.getByRole("heading", { name: /aktivitas harian|daily activity/i })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("heading", { name: /sorotan penggunaan|usage highlights/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /rincian fitur|feature details/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /peringkat fitur|feature ranking/i })).toHaveCount(0);
    const detailedTable = page.getByRole("table");
    if (info.project.name === "mobile-380") {
      await expect(detailedTable).toHaveCount(0);
      await expect(page.getByRole("listitem").filter({ hasText: /186/ })).toBeVisible();
    } else {
      await expect(detailedTable).toBeVisible();
      await expect(detailedTable.getByText(/186/)).toBeVisible();
    }
    await capture(page, info, "feature-usage");
    expect(errors).toEqual([]);
  });

  test(`Zyra analytics distinguishes outcomes in ${theme}`, async ({ page }, info) => {
    const errors = await prepare(page, theme);
    const recentLogs = [
      { timestamp: "2026-11-05T08:30:00.000Z", operation: "generateContent", model: "gemini-3.5-flash-lite", viaGateway: true, latencyMs: 1200, success: true },
      { timestamp: "2026-11-05T08:30:01.000Z", operation: "interactions", model: "fixture-model-with-a-long-name", viaGateway: false, latencyMs: 1500, success: false },
    ];
    const stats = { totalRequests: 2, successfulRequests: 1, failedRequests: 1, gatewayRequests: 1, directRequests: 1, averageLatencyMs: 1350, gatewaySuccessRate: 100, directSuccessRate: 0, recentLogs };
    await page.route("**/api/admin/ai-analytics", (route) => route.fulfill({ json: stats }));
    await page.route("**/api/admin/ai-analytics/usage?**", (route) => route.fulfill({
      json: { success: true, data: { users: [
        { userId: "fixture-user", name: "Nama Pengguna dengan Nama Lengkap yang Panjang", email: "fixture-user@example.test", requests: 2, inputTokens: 1230, outputTokens: 620, totalTokens: 1850 },
      ], daily: [
        { date: "2026-11-04", requests: 12, inputTokens: 920, outputTokens: 200 },
        { date: "2026-11-05", requests: 24, inputTokens: 1100, outputTokens: 480 },
      ] } },
    }));
    await visit(page, "view=zyra");
    await expect(page.getByRole("heading", { name: "Model aktif" })).toBeVisible();
    const requests = page.getByRole("heading", { name: "Permintaan terbaru" }).locator("xpath=ancestor::section[1]");
    await expect(requests.getByText("generateContent", { exact: true }).filter({ visible: true })).toBeVisible();
    await capture(page, info, "zyra");
    await requests.getByRole("button", { name: "Gagal", exact: true }).click();
    await expect(requests.getByText("generateContent", { exact: true })).toHaveCount(0);
    await expect(requests.getByText("interactions", { exact: true }).filter({ visible: true })).toBeVisible();
    await capture(page, info, "zyra-failed-requests");
    expect(errors).toEqual([]);
  });
}
