import { chromium, expect, type BrowserContext, type ConsoleMessage, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assessmentEvidence as data } from "./assessment-data";
import { localStudentCookie } from "./session";

const origin = new URL(process.env.BETTER_AUTH_URL ?? "").origin;
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Local product origin required");
const serverSha = process.env.STUDENT_SERVER_SHA;
if (!serverSha || !/^[a-f0-9]{7,40}$/.test(serverSha)) throw new Error("Set STUDENT_SERVER_SHA to the local Next checkout");
const output = process.env.STUDENT_CAPTURE_DIR ?? "artifacts/student-evidence/product/assessment";
const theme = process.env.STUDENT_ASSESSMENT_THEME === "dark" ? "dark" : "light";
const requestedCases = new Set(process.env.STUDENT_ASSESSMENT_CAPTURE_CASES?.split(",").filter(Boolean));
const viewport = { width: 380, height: 820 };
const course = `/courses/${data.course}`;
const quiz = `${course}/quiz/${data.quiz}`;
const tryout = `${course}/tryout/${data.tryout}`;
const results = `${course}/my-results`;
const resultReport: Record<string, unknown>[] = [];

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
await mkdir(output, { recursive: true });

async function saveReport() {
  await writeFile(join(output, "web.json"), JSON.stringify({ serverSha, browser: browser.version(), theme, locale: "id-ID",
    timeZone: "Asia/Jakarta", ...viewport, dpr: 1, results: resultReport }, null, 2) + "\n");
}

async function ready(page: Page, marker: Locator) {
  await marker.first().waitFor({ state: "visible", timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal { display:none !important }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function capture(page: Page, id: string, path: string, marker: (page: Page) => Locator, action?: (page: Page) => Promise<void>) {
  if (requestedCases.size && !requestedCases.has(id)) return;
  const start = Date.now();
  const hydration: string[] = [];
  const runtimeErrors: string[] = [];
  const onPageError = (error: Error) => runtimeErrors.push(error.message.slice(0, 240));
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === "error" && /hydrat/i.test(message.text())) hydration.push(message.text().slice(0, 240));
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  let status: number | undefined;
  try {
    const response = await page.goto(origin + path, { timeout: 240000, waitUntil: "domcontentloaded" });
    status = response?.status();
    const rendered = new URL(page.url());
    const expected = new URL(path, origin);
    if (!response?.ok() || rendered.pathname !== expected.pathname || rendered.search !== expected.search) {
      throw new Error(`HTTP ${response?.status()} at ${rendered.pathname}`);
    }
    await ready(page, marker(page));
    if (action) await action(page);
    await page.screenshot({ path: join(output, `${id}.png`), animations: "disabled" });
    if (hydration.length || runtimeErrors.length) throw new Error("Browser runtime or hydration errors");
    resultReport.push({ id, path, status, elapsedMs: Date.now() - start });
    console.log(id, status);
  } catch (error) {
    resultReport.push({ id, path, status, error: String(error).slice(0, 550), hydration, runtimeErrors, elapsedMs: Date.now() - start });
    console.log(id, "capture unavailable");
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
  }
  await saveReport();
}

async function contextFor(account: (typeof data.accounts)[number]): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    locale: "id-ID", timezoneId: "Asia/Jakarta", colorScheme: theme, reducedMotion: "reduce" });
  await context.addCookies([{ ...await localStudentCookie(account), url: origin, httpOnly: true, sameSite: "Lax" }]);
  // The synthetic account already deferred the reminder. This keeps the assessment in focus.
  await context.addInitScript(id => localStorage.setItem(`zyx:notification-permission:${id}`, "later:" + Date.now()), `student-evidence-${account}`);
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    return url.protocol === "data:" || url.origin === origin ? route.continue() : route.abort();
  });
  return context;
}

try {
  const enrolled = await contextFor("assessment-enrolled");
  const page = await enrolled.newPage();
  await capture(page, "quiz-list", `${course}/quiz`, p => p.getByText(data.quizTitle, { exact: true }));
  await capture(page, "quiz-gateway", quiz, p => p.getByRole("heading", { name: "Instruksi kuis" }));
  await capture(page, "quiz-draft-restored", `${quiz}?attemptId=${data.active}`, p => p.getByRole("radio", { name: /Lima/ }), async p => {
    const answer = p.getByRole("radio", { name: /Lima/ });
    await p.waitForFunction(id => localStorage.getItem(`zyx-quiz-timer-deadline-${id}`) !== null, data.active);
    await answer.click();
    await expect(answer).toBeChecked();
    await p.waitForFunction(id => localStorage.getItem(`zyx-quiz-answers-${id}`) !== null, data.active);
    await p.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await ready(p, answer);
    await expect(answer).toBeChecked();
  });
  await capture(page, "quiz-summary", `${quiz}/summary/${data.finished}`, p => p.locator("[data-quiz-analysis-metrics]"));
  await capture(page, "tryout-list", `${course}/tryout`, p => p.getByText(data.tryoutTitle, { exact: true }));
  await capture(page, "tryout-draft-restored", tryout, p => p.getByRole("radio", { name: /\bDua\b/ }), async p => {
    const answer = p.getByRole("radio", { name: /\bDua\b/ });
    await answer.click();
    await p.waitForFunction(id => Object.entries(localStorage).some(([key, value]) => key.includes(id) && value.includes('"index":1')), data.tryout);
    await p.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await ready(p, answer);
    await expect(answer).toBeChecked();
  });
  await capture(page, "results-list", results, p => p.getByText(data.tryoutTitle, { exact: true }));
  await capture(page, "tryout-review", `${results}/${data.submission}`, p => p.getByText("Pilih bilangan genap.", { exact: true }));
  await capture(page, "results-diagnosis", `${results}/${data.finished}/summary`, p => p.locator("[data-quiz-analysis-metrics]"));
  await capture(page, "solution-reveal", `${course}/solutions/${data.solution}`, p => p.getByRole("button", { name: "Lihat pembahasan", exact: true }), async p => {
    await expect(p.getByRole("heading", { name: data.solutionTitle, exact: true })).toBeVisible();
    await expect(p.getByRole("heading", { name: "Jawaban", exact: true })).toHaveCount(0);
    await p.getByRole("button", { name: "Lihat pembahasan", exact: true }).click();
    await expect(p.getByRole("heading", { name: "Jawaban", exact: true })).toBeVisible();
  });
  await enrolled.close();
  const unenrolled = await contextFor("assessment-unenrolled");
  const restricted = await unenrolled.newPage();
  for (const [id, path] of [["quiz-locked", quiz], ["tryout-locked", tryout], ["results-locked", results]]) {
    await capture(restricted, id, path, p => p.getByText("Kelas memerlukan token", { exact: true }));
  }
  await unenrolled.close();
} finally {
  await browser.close();
}
if (!resultReport.length || resultReport.some(result => result.error)) process.exitCode = 1;
