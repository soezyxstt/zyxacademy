import { PYTHON_RUNTIME_ASSETS, PYTHON_RUNTIME_REVISION } from "@/lib/coding/runtime-assets";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
const routes = ["", "courses", "overview", "documents", "progress", "results", "article", "diktat", "flashcards", "quiz-list", "quiz-start", "quiz", "tryout-list", "tryout", "tryout-review", "zyra", "feedback", "profile", "profile-edit", "reflections", "quiz-review", "quiz-summary", "settings", "notifications", "groups", "schedule", "video", "path", "mastery", "leaderboard", "course-leaderboard", "live", "playground"];
const course = "fictional-berpikir";
test.setTimeout(180_000);
test.use({ actionTimeout: 15000 });
function guard(page: Page) {
 const failures: string[] = [];
 page.on("pageerror", error => failures.push(`page: ${error.message}`));
 page.on("console", message => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
 page.context().on("response", response => { if (response.status() >= 400) failures.push(`http ${response.status()}: ${response.url()}`); });
 page.context().on("request", request => {
   const url = new URL(request.url());
   const runtimeAsset = request.method() === "GET" && url.pathname.startsWith(`/api/coding/runtime/${PYTHON_RUNTIME_REVISION}/`) && Object.hasOwn(PYTHON_RUNTIME_ASSETS, url.pathname.split("/").at(-1)!);
   if ((url.pathname.startsWith("/api/") && !runtimeAsset && (url.pathname !== "/api/demo/quiz" || request.method() !== "POST")) || /(?:generativelanguage|openai|anthropic|inngest)/i.test(url.hostname)) failures.push(`private request: ${request.method()} ${url.pathname}`);
   if (!["GET", "HEAD"].includes(request.method()) && !(url.pathname === "/api/demo/quiz" && request.method() === "POST")) failures.push(`mutation: ${request.method()} ${url.pathname}`);
 });
 return failures;
}
async function visit(page: Page, view: string) {
 await page.emulateMedia({ reducedMotion: "reduce" });
 const path = `/id/demo${view ? `/${view}` : ""}?course=${course}`;
 const response = await page.goto(path, { waitUntil: "networkidle" });
 expect(response?.status()).toBe(200);
 expect(new URL(page.url()).pathname).toBe(new URL(path, "http://localhost").pathname);
 await expect(page.locator("#main-content")).toBeVisible();
 await expect(page.getByText("Demo belum tersedia")).toHaveCount(0);
}
async function capture(page: Page, info: TestInfo, name: string) {
 await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
 await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
 await page.waitForLoadState("networkidle");
 await expect.poll(async () => (await page.locator("#main-content").innerText()).trim().length).toBeGreaterThan(5);
 await expect(page.locator("#main-content > div").first()).toHaveCSS("opacity", "1");
 await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
 await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
 const path = info.outputPath(`screenshots/${name}.png`);
 await page.screenshot({ path, fullPage: true, caret: "initial", animations: "disabled" });
 await info.attach(name, { path, contentType: "image/png" });
}
for (const view of routes) test(`student page ${view || "dashboard"}`, async ({ page }, info) => {
 const failures = guard(page);
 await visit(page, view);
 if (view === "playground") await expect(page.getByRole("button", { name: "Jalankan", exact: true })).toBeVisible();
 if (view === "quiz") await expect(page.getByRole("radio").first()).toBeVisible();
 if (view === "zyra") await expect(page.getByRole("textbox").last()).toBeVisible();
 await capture(page, info, `student-${view || "dashboard"}`);
 expect(failures).toEqual([]);
});

const courses = [
 { id: "fictional-berpikir", title: "Berpikir Komputasional" },
 { id: "fictional-fisika", title: "Fisika Dasar I" },
 { id: "fictional-kimia", title: "Kimia Dasar I" },
 { id: "fictional-matematika", title: "Matematika I" },
];
const selected = courses[0];
const withCourse = (path: string, id = selected.id) => `${path}?course=${encodeURIComponent(id)}`;
async function openNavigation(page: Page, info: TestInfo) {
 if (info.project.name === "mobile-380") await page.getByRole("button", { name: "Buka navigasi", exact: true }).click();
}
test("article completion returns to the student document list and logout resets the fictional account", async ({ page }, info) => {
 const failures = guard(page);
 await visit(page, "article");
 await page.getByRole("button", { name: "Kembali ke daftar materi", exact: true }).click();
 await expect(page).toHaveURL(/\/demo\/documents\?course=/);
 await expect.poll(() => page.evaluate(id => sessionStorage.getItem(`zyx-demo:1:${id}:fixture-v1`), course)).toContain('"article"');
 await capture(page, info, "documents-completed");
 await visit(page, "article");
 await capture(page, info, "article-completed");
 await visit(page, "");
 await openNavigation(page, info);
 await page.getByRole("button", { name: /Pelajar Demo/ }).click();
 await capture(page, info, "account-menu-open");
 await page.getByRole("menuitem", { name: "Keluar", exact: true }).click();
 await expect(page).toHaveURL(/\/demo\?course=/);
 await expect.poll(() => page.evaluate(id => sessionStorage.getItem(`zyx-demo:1:${id}:fixture-v1`), course)).toBeNull();
 await capture(page, info, "account-reset");
 expect(failures).toEqual([]);
});
test("flashcard flip and local review use the student controls", async ({ page }, info) => {
 const failures = guard(page); await visit(page, "flashcards");
 await page.getByText("Pertanyaan kartu 1?", { exact: true }).click();
 await expect(page.getByText("Jawaban kartu 1", { exact: true })).toBeVisible();
 await capture(page, info, "flashcard-answer");
 await page.getByRole("button", { name: /^(Paham|Baik|Good)$/i }).click();
 await expect(page.getByText("Pertanyaan kartu 2?", { exact: true })).toBeVisible();
 await capture(page, info, "flashcard-reviewed"); expect(failures).toEqual([]);
});
test("four-question student quiz grades the signed three-question and one-question pages", async ({ page }, info) => {
 const failures = guard(page); const requests: { quizOffset: number; questionIds: string[] }[] = [];
 page.context().on("request", request => { if (new URL(request.url()).pathname === "/api/demo/quiz") requests.push(request.postDataJSON()); });
 await page.route("**/api/demo/quiz", route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
 await visit(page, "quiz-start");
 await page.getByRole("button", { name: /^Mulai kuis$/i }).click();
 await expect(page).toHaveURL(/\/demo\/quiz\?course=.*&attempt=/);
 for (let index = 0; index < 4; index++) {
   await expect(page.getByText(`Pertanyaan konsep ${index+1}?`, { exact: true })).toBeVisible();
   await page.getByRole("radio").nth(index === 1 ? 1 : 0).click();
   if (index < 3) await page.getByRole("button", { name: /^Lanjut$/ }).click();
 }
 await capture(page, info, "quiz-final-question");
 await page.getByRole("button", { name: /^Kumpulkan kuis$/i }).click();
 await capture(page, info, "quiz-confirm");
 await page.getByRole("dialog").getByRole("button", { name: "Ya, kumpulkan", exact: true }).click();
 await expect(page.getByText(/Gagal mengumpulkan kuis/).first()).toBeVisible();
 await capture(page, info, "quiz-error");
 await page.unroute("**/api/demo/quiz");
 await page.getByRole("dialog").getByRole("button", { name: "Ya, kumpulkan", exact: true }).click();
 await expect(page.getByText("Soal yang Anda Kerjakan", { exact: true })).toBeVisible();
 expect(requests.at(-2)?.quizOffset).toBe(0); expect(requests.at(-2)?.questionIds).toHaveLength(3);
 expect(requests.at(-1)?.quizOffset).toBe(3); expect(requests.at(-1)?.questionIds).toHaveLength(1);
 await capture(page, info, "quiz-reviewed");
 await page.getByRole("link", { name: "Lihat Diagnosis & Rencana Belajar", exact: true }).click();
 await expect(page).toHaveURL(/\/demo\/quiz-summary/);
 await capture(page, info, "quiz-diagnosis");
 await visit(page, "quiz-start");
 await expect(page.getByRole("link", { name: "Lihat Pembahasan", exact: true })).toHaveCount(2);
 await capture(page, info, "quiz-history-updated");
 expect(failures).toEqual([]);
});
test("student Zyra drawer responds locally and exposes no private chat service", async ({ page }, info) => {
 const failures = guard(page); await visit(page, "zyra");
 const input = page.getByRole("textbox").last(); await input.fill("Bagaimana cara mengulang materi?");
 await page.getByRole("button", { name: /Kirim pesan/i }).click();
 await expect(page.getByText("Bagaimana cara mengulang materi?", { exact: true }).first()).toBeVisible();
 await capture(page, info, "zyra-local-response"); expect(failures).toEqual([]);
});
test("student tryout submits locally and opens its pending review", async ({ page }, info) => {
 const failures = guard(page); await visit(page, "tryout");
 await page.getByRole("radio").first().click(); await capture(page, info, "tryout-choice");
 await page.getByRole("button", { name: /^Lanjut$/ }).click();
 await page.getByRole("checkbox").first().click(); await capture(page, info, "tryout-multiple");
 await page.getByRole("button", { name: /^Lanjut$/ }).click();
 await page.getByRole("textbox").first().fill("Menyusun rencana belajar"); await capture(page, info, "tryout-text");
 await page.getByRole("button", { name: /^Kumpulkan jawaban$/i }).click(); await capture(page, info, "tryout-confirm");
 await page.getByRole("dialog").getByRole("button", { name: /Ya, kumpulkan/i }).click();
 await expect(page).toHaveURL(/\/demo\/results/); await capture(page, info, "tryout-submitted");
 await page.getByRole("link", { name: /Tryout latihan/ }).click();
 await expect(page).toHaveURL(/\/demo\/tryout-review/);
 await expect(page.getByText("Menyusun rencana belajar", { exact: true })).toBeVisible();
 await capture(page, info, "tryout-review"); expect(failures).toEqual([]);
});
test("student mobile navigation opens and closes", async ({ page }, info) => {
 test.skip(info.project.name !== "mobile-380", "Mobile only");
 const failures = guard(page); await visit(page, "overview"); await capture(page, info, "navigation-closed");
 await openNavigation(page, info); await capture(page, info, "navigation-open");
 await page.getByRole("button", { name: "Tutup sidebar", exact: true }).click(); expect(failures).toEqual([]);
});

test("unknown course does not show a populated course", async ({ request }) => {
  const response = await request.get(withCourse("/demo", "fictional-unknown"));
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain("Mengenal konsep dasar");
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

test("corrupt and unavailable storage keep student pages usable", async ({ page }, info) => {
 const failures = guard(page);
 await page.addInitScript(() => { sessionStorage.setItem("zyx-demo:1:fictional-berpikir:fixture-v1", "{broken"); });
 await visit(page, ""); await capture(page, info, "corrupt-storage");
 await page.addInitScript(() => { Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("Unavailable", "SecurityError"); } }); });
 await visit(page, "article"); await page.getByRole("button", { name: "Kembali ke daftar materi", exact: true }).click();
 await expect(page).toHaveURL(/\/demo\/documents/); await capture(page, info, "unavailable-storage");
 expect(failures).toEqual([]);
});
test("English student navigation remains inside the demo", async ({ page }, info) => {
 const failures = guard(page); await page.emulateMedia({ reducedMotion: "reduce" });
 const response = await page.goto(`/en/demo?course=${course}`, { waitUntil: "networkidle" }); expect(response?.status()).toBe(200);
 if (info.project.name === "mobile-380") await page.getByRole("button", { name: "Open navigation", exact: true }).click();
 await page.getByRole("link", { name: "Profile", exact: true }).first().click();
 await expect(page).toHaveURL(/\/en\/demo\/profile/); await capture(page, info, "english-profile"); expect(failures).toEqual([]);
});
test("student catalogue selects four courses with isolated local progress", async ({ page }, info) => {
 const failures = guard(page);
 await visit(page, "courses"); await capture(page, info, "catalogue-four-courses");
 for (const item of courses) {
   await visit(page, "courses");
   await page.locator("#main-content").getByRole("link", { name: new RegExp(item.title, "i") }).first().click();
   await expect(page).toHaveURL(new RegExp(`course=${item.id}`)); await capture(page, info, `selected-${item.id}`);
 }
 await page.goto(withCourse("/id/demo/article", courses[0].id), { waitUntil: "networkidle" });
 await page.getByRole("button", { name: "Kembali ke daftar materi", exact: true }).click();
 await page.goto(withCourse("/id/demo/article", courses[1].id), { waitUntil: "networkidle" });
 expect(await page.evaluate(id => sessionStorage.getItem(`zyx-demo:1:${id}:fixture-v1`), courses[1].id)).toBeNull();
 await capture(page, info, "isolated-course-article");
 expect(await page.evaluate(id => sessionStorage.getItem(`zyx-demo:1:${id}:fixture-v1`), courses[0].id)).toContain('"article"');
 expect(failures).toEqual([]);
});
test("student document list opens the second eligible article and Diktat", async ({ page }, info) => {
 const failures = guard(page); await visit(page, "documents");
 await page.locator("#main-content").getByRole("link", { name: /Penerapan konsep/i }).first().click();
 await expect(page).toHaveURL(/articleId=fictional-berpikir-article-2/); await capture(page, info, "second-article");
 await visit(page, "documents");
 await page.locator("#main-content").getByRole("link", { name: /Ringkasan konsep 2/i }).first().click();
 await expect(page).toHaveURL(/diktatId=fictional-berpikir-diktat-2/); await capture(page, info, "second-diktat");
 expect(failures).toEqual([]);
});

test("student profile edits validate and save only fictional academic data", async ({ page }, info) => {
 const failures = guard(page); await visit(page, "profile-edit");
 await page.getByRole("combobox", { name: "Fakultas atau sekolah ITB", exact: true }).click();
 await page.getByRole("option", { name: /FMIPA - Fakultas/ }).click();
 await page.getByRole("button", { name: "Simpan profil", exact: true }).click();
 await expect(page.getByText("Pilih jurusan atau program studi Anda.", { exact: true })).toBeVisible();
 await capture(page, info, "profile-validation");
 await page.getByRole("combobox", { name: "Fakultas atau sekolah ITB", exact: true }).click();
 await page.getByRole("option", { name: /STEI - Sekolah/ }).click();
 await page.getByRole("combobox", { name: "Jurusan atau program studi", exact: true }).click();
 await page.getByRole("option", { name: "Teknik Informatika", exact: true }).click();
 await capture(page, info, "profile-selected");
 await page.getByRole("button", { name: "Simpan profil", exact: true }).click();
 await expect(page).toHaveURL(/\/demo\/profile\?course=/);
 await expect(page.getByText("Teknik Informatika", { exact: true })).toBeVisible();
 await capture(page, info, "profile-saved"); expect(failures).toEqual([]);
});
test("student notification preferences stay local", async ({ page }, info) => {
 const failures = guard(page); await visit(page, "notifications");
 await page.getByRole("checkbox").first().click(); await capture(page, info, "notifications-disabled");
 await page.getByRole("checkbox").first().click();
 await page.getByRole("button", { name: "Simpan preferensi", exact: true }).click();
 await expect(page.getByText("Preferensi notifikasi berhasil disimpan.", { exact: true })).toBeVisible();
 await capture(page, info, "notifications-saved"); expect(failures).toEqual([]);
});
test("student search and Zyra uploads never access private services", async ({ page }, info) => {
 const failures = guard(page); await visit(page, "");
 await page.keyboard.press("Control+k");
 const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
 await dialog.getByRole("combobox").fill("Fisika");
 await expect(dialog.getByText("Fisika Dasar I", { exact: true }).first()).toBeVisible();
 await capture(page, info, "search-local-results"); await page.keyboard.press("Escape");
 await visit(page, "zyra");
 await page.locator('input[type="file"]').setInputFiles({ name: "fictional.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1sAAAAASUVORK5CYII=", "base64") });
 await expect(page.getByText("Unggahan gambar memerlukan akun.", { exact: true })).toBeVisible();
 await capture(page, info, "zyra-upload-unavailable"); expect(failures).toEqual([]);
});

test("public demo product views expose no download or paid storage destination", async ({ page }) => {
 const failures = guard(page);
 for (const view of ["article", "diktat", "documents"]) {
   await visit(page, view);
   await expect(page.locator('#main-content a[download], #main-content a[href*="/api/storage/"], #main-content a[href*="download=1"]')).toHaveCount(0);
 }
 expect(failures).toEqual([]);
});

test("fabricated quiz history opens the shared student review", async ({ page }, info) => {
 const failures = guard(page); await visit(page, "quiz-start");
 await page.getByRole("link", { name: "Lihat Pembahasan", exact: true }).first().click();
 await expect(page).toHaveURL(/\/demo\/quiz-review.*attempt=fictional-result-/);
 await capture(page, info, "baseline-quiz-review"); expect(failures).toEqual([]);
});


test("Diktat summary and completion use fictional account state", async ({ page }, info) => {
 const failures = guard(page); await visit(page, "diktat");
 await page.getByRole("button", { name: "Ringkas", exact: true }).click();
 await expect(page.getByRole("dialog")).toBeVisible(); await capture(page, info, "diktat-summary");
 await page.keyboard.press("Escape");
 await page.getByRole("button", { name: "Tandai selesai", exact: true }).click();
 await expect(page.getByRole("button", { name: "Selesai", exact: true }).first()).toBeDisabled();
 await capture(page, info, "diktat-completed");
 await visit(page, "documents"); await capture(page, info, "diktat-list-completed");
 expect(failures).toEqual([]);
});
