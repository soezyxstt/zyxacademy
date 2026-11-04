import { expect, test, type Page, type TestInfo } from "@playwright/test";

// Run only against the isolated harness described in public-demo-seeding.md.
const routes = ["/demo", "/demo/courses", "/demo/progress", "/demo/history", "/demo/article", "/demo/diktat", "/demo/flashcards", "/demo/quiz", "/demo/tryout", "/demo/zyra"];
const courses = [
  { id: "fictional-berpikir", title: "Berpikir Komputasional" },
  { id: "fictional-fisika", title: "Fisika Dasar I" },
  { id: "fictional-kimia", title: "Kimia Dasar I" },
  { id: "fictional-matematika", title: "Matematika I" },
];
const selected = courses[0];
const key = `zyx-demo:1:${selected.id}:fixture-v1`;
const withCourse = (path: string, id = selected.id) => `${path}?course=${encodeURIComponent(id)}`;

test.setTimeout(120_000);
function guard(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(`page: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`http ${response.status()}: ${response.url()}`); });
  page.on("request", request => {
    const url = new URL(request.url());
    if ((url.pathname.startsWith("/api/") && (url.pathname !== "/api/demo/quiz" || request.method() !== "POST")) || /(?:generativelanguage|openai|anthropic|inngest)/i.test(url.hostname)) failures.push(`forbidden request: ${request.method()} ${url.origin}${url.pathname}`);
    if (!["GET", "HEAD"].includes(request.method()) && !(url.pathname === "/api/demo/quiz" && request.method() === "POST")) failures.push(`unexpected mutation: ${request.method()} ${url.pathname}`);
  });
  return failures;
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const path = info.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled", caret: "hide" });
  await info.attach(name, { path, contentType: "image/png" });
}
async function visit(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(new URL(path, "http://localhost").pathname);
  expect(new URL(page.url()).search).toBe(new URL(path, "http://localhost").search);
  await expect(page.getByText("Demo belum tersedia")).toHaveCount(0);
  await expect(page.locator("body")).toBeVisible();
}
for (const path of routes) {
  test(`populated ${path}`, async ({ page }, info) => {
    const failures = guard(page);
    await visit(page, withCourse(path));
    expect(await page.locator("body").innerText()).not.toContain("correctIndices");
    await capture(page, info, `initial-${path.replaceAll("/", "-").slice(1)}`);
    expect(failures).toEqual([]);
  });
}
test("article completion persists across reload and reset", async ({ page }, info) => {
  const failures = guard(page);
  await visit(page, withCourse("/demo/article"));
  await page.getByRole("button", { name: /Tandai selesai|Mark complete/i }).click();
  await expect(page.getByRole("button", { name: /^(Selesai|Completed)$/i })).toBeDisabled();
  await capture(page, info, "article-completed");
  await page.reload();
  await expect(page.getByRole("button", { name: /^(Selesai|Completed)$/i })).toBeDisabled();
  if (info.project.name === "mobile-380") await page.getByRole("button", { name: /navigasi demo|demo navigation/i }).click();
  await page.getByRole("button", { name: /Atur ulang demo|Reset demo/i }).click();
  if (info.project.name === "mobile-380") await page.getByRole("button", { name: /Tutup sidebar|Close sidebar/i }).click();
  await expect(page.getByRole("button", { name: /Tandai selesai|Mark complete/i })).toBeEnabled();
  await capture(page, info, "article-reset");
  expect(failures).toEqual([]);
});
test("flashcard flip and explicit review", async ({ page }, info) => {
  const failures = guard(page);
  await visit(page, withCourse("/demo/flashcards"));
  await page.getByText("Pertanyaan kartu 1?", { exact: true }).click();
  await expect(page.getByText("Jawaban kartu 1")).toBeVisible();
  await capture(page, info, "flashcard-flipped");
  const grade = page.getByRole("button", { name: /^(Paham|Good)$/i });
  await expect(grade).toBeVisible();
  await grade.click();
  await expect(page.getByText("Pertanyaan kartu 2?")).toBeVisible();
  await expect.poll(() => page.evaluate(k => sessionStorage.getItem(k), key)).toContain('"grade":3');
  await capture(page, info, "flashcard-reviewed");
  expect(failures).toEqual([]);
});
test("quiz error and graded result", async ({ page }, info) => {
  const failures = guard(page);
  await page.route("**/api/demo/quiz", async route => { await route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  await visit(page, withCourse("/demo/quiz"));
  for (let index = 0; index < 3; index++) {
    await page.getByRole("radio").nth(index === 1 ? 1 : 0).click();
    if (index < 2) await page.getByRole("button", { name: /^(Lanjut|Next)$/i }).click();
  }
  await page.getByRole("button", { name: /^(Kirim jawaban|Submit answers)$/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Ya, kumpulkan|Confirm submit/i }).click();
  await expect(page.getByText(/Gagal mengumpulkan kuis|failed to submit/i).first()).toBeVisible();
  await capture(page, info, "quiz-error");
  await page.unroute("**/api/demo/quiz");
  await page.getByRole("button", { name: /^(Kirim jawaban|Submit answers)$/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Ya, kumpulkan|Confirm submit/i }).click();
  await expect(page.getByText(/Skor: 2 dari 3|Score: 2 of 3/i)).toBeVisible();
  await expect.poll(() => page.evaluate(k => sessionStorage.getItem(k), key)).toContain('"quiz"');
  await capture(page, info, "quiz-result");
  expect(failures).toEqual([]);
});
test("corrupt and unavailable storage remain usable", async ({ page }, info) => {
  const failures = guard(page);
  await page.addInitScript(k => sessionStorage.setItem(k, "{broken"), key);
  await visit(page, withCourse("/demo/article"));
  await expect(page.getByRole("button", { name: /Tandai selesai|Mark complete/i })).toBeEnabled();
  await capture(page, info, "corrupt-storage");
  expect(failures).toEqual([]);
});
test("unavailable storage remains usable", async ({ page }, info) => {
  const failures = guard(page);
  await page.addInitScript(() => { Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("Unavailable", "SecurityError"); } }); });
  await visit(page, withCourse("/demo/article"));
  await page.getByRole("button", { name: /Tandai selesai|Mark complete/i }).click();
  await expect(page.getByRole("button", { name: /^(Selesai|Completed)$/i })).toBeDisabled();
  await capture(page, info, "unavailable-storage");
  expect(failures).toEqual([]);
});
test("English navigation", async ({ page }, info) => {
  const failures = guard(page);
  await visit(page, withCourse("/en/demo"));
  await expect(page.getByText(/Hello, Pelajar Demo/i)).toBeVisible();
  if (info.project.name === "mobile-380") await page.getByRole("button", { name: /demo navigation/i }).click();
  await page.getByRole("navigation", { name: "Demo navigation" }).getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/demo\/history\?course=fictional-berpikir$/);
  await capture(page, info, "english-history");
  expect(failures).toEqual([]);
});
test("mobile navigation opens and closes", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-380", "Mobile navigation is checked on the mobile viewport.");
  const failures = guard(page);
  await visit(page, withCourse("/demo"));
  await capture(page, info, "mobile-nav-closed");
  const toggle = page.getByRole("button", { name: "Navigasi demo" });
  await toggle.click();
  await capture(page, info, "mobile-nav-open");
  await page.getByRole("button", { name: /Tutup sidebar|Close sidebar/i }).click();
  expect(failures).toEqual([]);
});

test("catalogue selects each fictional course", async ({ page }, info) => {
  const failures = guard(page);
  await visit(page, withCourse("/demo/courses"));
  for (const course of courses) {
    await expect(page.getByText(course.title, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  }
  await capture(page, info, "catalogue-four-courses");
  for (const course of courses) {
    await visit(page, withCourse("/demo/courses"));
    await page.getByRole("link", { name: new RegExp(course.title, "i") }).first().click();
    await expect(page).toHaveURL(new RegExp(`course=${course.id}`));
    await expect(page.getByText(course.title, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  }
  expect(failures).toEqual([]);
});
test("overlays are isolated by course and revision", async ({ page }, info) => {
  const failures = guard(page);
  await visit(page, withCourse("/demo/article", courses[0].id));
  await page.getByRole("button", { name: /Tandai selesai|Mark complete/i }).click();
  await visit(page, withCourse("/demo/article", courses[1].id));
  await expect(page.getByRole("button", { name: /Tandai selesai|Mark complete/i })).toBeEnabled();
  await page.getByRole("button", { name: /Tandai selesai|Mark complete/i }).click();
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith("zyx-demo:1:")).length)).toBe(2);
  await page.evaluate(() => sessionStorage.setItem("zyx-demo:1:fictional-kimia:old-revision", JSON.stringify({ version: 1, events: [{ kind: "article", id: "demo-article-fictional-kimia-article-1", date: "2026-06-30" }] })));
  await visit(page, withCourse("/demo/article", courses[2].id));
  await expect(page.getByRole("button", { name: /Tandai selesai|Mark complete/i })).toBeEnabled();
  await visit(page, withCourse("/demo/article", courses[0].id));
  await expect(page.getByRole("button", { name: /^(Selesai|Completed)$/i })).toBeDisabled();
  await capture(page, info, "course-overlay-isolation");
  expect(failures).toEqual([]);
});
test("unknown course does not show a populated course", async ({ page }, info) => {
  const failures = guard(page);
  const path = withCourse("/demo", "fictional-unknown");
  const response = await page.goto(path, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).search).toBe("?course=fictional-unknown");
  await expect(page.getByText("Mengenal konsep dasar")).toHaveCount(0);
  await expect(page.getByText(/Demo belum tersedia/i)).toBeVisible();
  await capture(page, info, "unknown-course");
  expect(failures).toEqual([]);
});
test("quiz token rejects a different course", async ({ request }) => {
  const response = await request.post("/api/demo/quiz", { data: {
    courseId: courses[1].id,
    questionSetToken: `fictional-token:${courses[0].id}:free-first-chapter:fixture-v1:0`,
    questionIds: [1, 2, 3].map(n => `${courses[1].id}-question-${n}`),
    answers: [[0], [0], [0]],
  } });
  expect(response.status()).toBe(409);
});

test("quiz token rejects an obsolete curriculum revision", async ({ request }) => {
  const course = courses[0];
  const response = await request.post("/api/demo/quiz", { data: {
    courseId: course.id,
    questionSetToken: `fictional-token:${course.id}:free-first-chapter:old-revision:0`,
    questionIds: [1, 2, 3].map(n => `${course.id}-question-${n}`),
    answers: [[0], [0], [0]],
  } });
  expect(response.status()).toBe(409);
});

test("product collections expose only fixture selections", async ({ page }, info) => {
  const failures = guard(page);
  for (const [view, first, second, key, suffix] of [
    ["article", "Mengenal konsep dasar", "Penerapan konsep", "articleId", "article-2"],
    ["diktat", "Ringkasan konsep 1", "Ringkasan konsep 2", "diktatId", "diktat-2"],
    ["flashcards", "Kumpulan kartu 1", "Kumpulan kartu 2", "flashcardSetId", "set-2"],
  ] as const) {
    await visit(page, withCourse(`/demo/${view}`));
    await page.getByRole("button", { name: first, exact: true }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("link", { name: second })).toHaveAttribute("href", new RegExp(`${key}=${selected.id}-${suffix}`));
    await expect(menu).not.toContainText("paid-out-of-scope");
    await menu.getByRole("link", { name: second }).click();
    await expect(page).toHaveURL(new RegExp(`${key}=${selected.id}-${suffix}`));
    await capture(page, info, `selected-${view}`);
  }
  expect(failures).toEqual([]);
});
test("last quiz page contains and grades one question", async ({ page }, info) => {
  const failures = guard(page);
  await visit(page, withCourse("/demo/quiz"));
  await page.getByRole("link", { name: /Halaman berikutnya|Next page/i }).click();
  await expect(page).toHaveURL(/quizOffset=3/);
  await expect(page.getByText("Pertanyaan konsep 4?")).toBeVisible();
  await page.getByRole("radio").first().click();
  await page.getByRole("button", { name: /^(Kirim jawaban|Submit answers)$/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Ya, kumpulkan|Confirm submit/i }).click();
  await expect(page.getByText(/Skor: 1 dari 1|Score: 1 of 1/i)).toBeVisible();
  await capture(page, info, "quiz-last-page-result");
  expect(failures).toEqual([]);
});
test("quiz token cannot cross pages", async ({ request }) => {
  const course = courses[0];
  const response = await request.post("/api/demo/quiz", { data: {
    courseId: course.id, quizOffset: 3,
    questionSetToken: `fictional-token:${course.id}:free-first-chapter:fixture-v1:0`,
    questionIds: [`${course.id}-question-4`], answers: [[0]],
  } });
  expect(response.status()).toBe(409);
});

test("unknown product selection does not expose another chapter", async ({ request }) => {
  for (const key of ["articleId", "diktatId", "flashcardSetId"]) {
    const response = await request.get(`/demo/article?course=${selected.id}&${key}=paid-out-of-scope`);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("paid-out-of-scope-content");
  }
});
