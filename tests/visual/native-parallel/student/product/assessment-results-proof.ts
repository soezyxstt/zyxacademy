import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, expect, type BrowserContext, type ConsoleMessage, type Page } from "@playwright/test";
import type { AssessmentPage } from "../../../../../packages/native-parity/student/assessment/contract";
import { assessmentEvidence as data } from "./assessment-data";
import { assessmentResultCases as cases } from "./assessment-results-seed";
import { localStudentCookie } from "./session";

const origin = new URL(process.env.BETTER_AUTH_URL ?? "");
const database = new URL(process.env.DATABASE_URL ?? "");
if (![origin.hostname, database.hostname].every(host => ["127.0.0.1", "localhost"].includes(host)) ||
    database.pathname !== "/student_evidence") throw new Error("Expected the disposable loopback Student evidence environment");
const serverSha = process.env.STUDENT_SERVER_SHA;
if (!serverSha || !/^[a-f0-9]{40}$/.test(serverSha)) throw new Error("Set STUDENT_SERVER_SHA to the actual local Next checkout");

const output = process.env.STUDENT_CAPTURE_DIR ?? "artifacts/student-evidence/product/assessment-results";
const course = `/courses/${data.course}`;
const results = `${course}/my-results`;
const quiz = `${course}/quiz/${data.quiz}`;
const held = `${course}/quiz/${cases.heldTemplate}`;
const native = `/api/native/student/assessment/${data.course}`;
const tryoutPrompt = "Pilih bilangan genap.";
const quizPrompt = /Pilih nilai limit dari/;
const timeout = 180_000;
const requested = new Set(process.env.STUDENT_ASSESSMENT_RESULTS_CASES?.split(",").filter(Boolean));
const exercised = new Set<string>();
const evidence: { http: unknown[]; browser: unknown[]; captures: Record<string, string> } = { http: [], browser: [], captures: {} };
const nativeSnapshots: Record<string, AssessmentPage> = {};
const [owner, peer] = await Promise.all(data.accounts.map(async account => ({
  account, cookie: await localStudentCookie(account), id: `student-evidence-${account}`,
})));
type Student = typeof owner;

async function save() {
  await writeFile(join(output, "authorization.json"), JSON.stringify({ serverSha, ...evidence }, null, 2) + "\n");
}

async function readJson(path: string, status: number, student: Student | null = owner) {
  const headers: HeadersInit = student ? { cookie: `${student.cookie.name}=${student.cookie.value}`, "x-student-id": student.id } : {};
  const response = await fetch(new URL(path, origin), { headers, redirect: "manual", signal: AbortSignal.timeout(timeout) });
  assert.equal(response.status, status, path);
  if (path.startsWith(native)) assert.equal(response.headers.get("cache-control"), "private, no-store", path);
  const payload = await response.json();
  evidence.http.push({ path, account: student ? student === owner ? "owner" : "enrolled-peer" : "anonymous", status, cacheControl: response.headers.get("cache-control") });
  return payload;
}

async function nativeRead(path: string, status = 200, student: Student | null = owner) {
  const payload = await readJson(native + path, status, student);
  if (status === 200 && student === owner) nativeSnapshots[native + path] = payload;
  return payload;
}

async function verifyAuthorization() {
  const peerHistory = await nativeRead("/my-results", 200, peer);
  assert.equal(peerHistory.fullAccess, true);
  assert.deepEqual(peerHistory.results, []);

  const released = await nativeRead(`/my-results/${cases.completed}`);
  assert.equal(released.review.result.score, 85);
  assert.equal(released.review.discussionAvailable, true);
  assert.equal(released.review.items[0].expected, "C. Lima");
  const pending = await nativeRead(`/my-results/${cases.pendingTryout}`);
  assert.equal(pending.review.result.status, "pending_review");
  assert.equal(pending.review.result.score, null);
  assert.equal(pending.review.items[0].expected, "B. Dua");
  assert.equal(pending.review.teacherNotes, undefined);
  const graded = await nativeRead(`/my-results/${cases.gradedTryout}`);
  assert.equal(graded.review.result.score, cases.gradedTryoutScore);
  assert.equal(graded.review.teacherNotes, cases.gradedTryoutNote);

  const unreleased = await nativeRead(`/my-results/${cases.heldQuiz}`);
  assert.equal(unreleased.review.result.score, cases.heldScore);
  assert.equal(unreleased.review.discussionAvailable, false);
  assert.deepEqual(unreleased.review.items, []);

  for (const family of ["/my-results", `/quiz/${data.quiz}`]) {
    const summaryPath = (id: string) => family === "/my-results" ? `${family}/${id}/summary` : `${family}/summary/${id}`;
    const complete = await nativeRead(summaryPath(cases.completed));
    assert.equal(complete.analytics.status, "completed");
    assert.equal(complete.analytics.computedMetrics.attemptId, cases.completed);
    assert.equal(complete.analytics.computedMetrics.score, 85);
    const waiting = await nativeRead(summaryPath(cases.pendingQuiz));
    assert.equal(waiting.result.status, "pending_review");
    assert.deepEqual(waiting.analytics, { status: "not_available", aiDiagnosis: null, computedMetrics: null });
    const failed = await nativeRead(summaryPath(cases.missingAnalytics));
    assert.equal(failed.analytics.status, "failed");
    assert.equal(failed.analytics.computedMetrics, null);
    assert.equal(failed.analytics.aiDiagnosis, null);
    assert.deepEqual(await nativeRead(summaryPath(cases.completed), 404, peer), { error: "Asesmen tidak tersedia." });
  }
  for (const path of [`/my-results/${cases.heldQuiz}/summary`, `/quiz/${cases.heldTemplate}/summary/${cases.heldQuiz}`]) {
    const response = await nativeRead(path);
    assert.equal(response.discussionAvailable, false);
    assert.deepEqual(response.analytics, { status: "not_available", aiDiagnosis: null, computedMetrics: null });
  }
  for (const id of [cases.completed, cases.pendingTryout, cases.gradedTryout, cases.heldQuiz]) {
    assert.deepEqual(await nativeRead(`/my-results/${id}`, 404, peer), { error: "Asesmen tidak tersedia." });
  }
  await nativeRead(`/my-results/${cases.completed}`, 401, null);

  const webAttempt = `/api/quiz/attempts/${cases.heldQuiz}`;
  const webHeld = await readJson(webAttempt, 200);
  assert.equal(webHeld.score, cases.heldScore);
  assert.ok(!JSON.stringify(webHeld).includes(cases.heldExplanation));
  assert.ok(!JSON.stringify(webHeld.questionsSnapshot).includes('"correct_indices"'));
  assert.deepEqual(webHeld.feedback, []);
  const blocked = await readJson(`${webAttempt}/analytics`, 403);
  assert.equal(blocked.status, "not_available");
  assert.ok(!blocked.computedMetrics && !blocked.aiDiagnosis);
  await readJson(webAttempt, 404, peer);
  await readJson(`/api/quiz/attempts/${cases.completed}/analytics`, 403, peer);
  await writeFile(join(output, "native-responses.json"), JSON.stringify(nativeSnapshots, null, 2) + "\n");
  await save();
}

const allProfiles = [
  { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
  { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
] as const;
type Profile = (typeof allProfiles)[number];
const selected = new Set((process.env.STUDENT_ASSESSMENT_RESULTS_PROFILES ?? "android").split(","));
const profiles = allProfiles.filter(profile => selected.has(profile.platform));
if (profiles.length !== selected.size) throw new Error("Set STUDENT_ASSESSMENT_RESULTS_PROFILES to android, ios, or android,ios");
const privateText = [tryoutPrompt, /Pilih nilai limit dari/, cases.heldExplanation, cases.gradedTryoutNote, "85%", "95%"];
const analytics = (page: Page) => page.locator("[data-quiz-analysis-metrics]");

async function open(context: BrowserContext, id: string, path: string, profile: Profile,
  verify: (page: Page, status: number) => Promise<void>, capture = false) {
  if (requested.size && !requested.has(id)) return;
  exercised.add(id);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message.slice(0, 300)));
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error" && /hydrat/i.test(message.text())) errors.push(message.text().slice(0, 300));
  });
  try {
    const response = await page.goto(new URL(path, origin).href, { waitUntil: "domcontentloaded", timeout });
    assert.ok(response, path);
    const status = response.status();
    await verify(page, status);
    const { pathname, search } = new URL(page.url());
    if (capture) {
      expect(status).toBe(200);
      expect(pathname + search).toBe(path);
      await page.getByRole("button", { name: "Ganti mata kuliah: Memuat mata kuliah…", exact: true }).waitFor({ state: "hidden", timeout });
      await page.waitForFunction(() => document.fonts.status === "loaded", undefined, { timeout });
      await page.addStyleTag({ content: "nextjs-portal { display:none !important }" });
      expect(await page.evaluate(() => ({
        deviceScaleFactor: devicePixelRatio, viewport: { width: innerWidth, height: innerHeight },
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        light: matchMedia("(prefers-color-scheme: light)").matches, locale: document.documentElement.lang,
      }))).toEqual({ deviceScaleFactor: profile.deviceScaleFactor, viewport: profile.viewport, overflow: false, light: true, locale: "id" });
      expect(errors).toEqual([]);
      const filename = `${profile.platform}/${id}.png`;
      const bytes = await page.screenshot({ path: join(output, filename), animations: "disabled", scale: "device" });
      expect(errors).toEqual([]);
      evidence.captures[filename] = createHash("sha256").update(bytes).digest("hex");
    }
    evidence.browser.push({ id, path, finalPath: pathname + search, status, ...profile, captured: capture, ...(errors.length ? { errors } : {}) });
    console.log(profile.platform, id, status, capture ? "captured" : "asserted");
  } catch (error) {
    evidence.browser.push({ id, path, ...profile, error: String(error).slice(0, 1200), runtimeErrors: errors });
    console.error(profile.platform, id, String(error));
    process.exitCode = 1;
  } finally {
    await page.close();
    await save();
  }
}

async function verifyBrowser() {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  try {
    for (const profile of profiles) {
      const browserContext = (student: Student) => browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor,
        hasTouch: true, isMobile: true, locale: "id-ID", timezoneId: "Asia/Jakarta", colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block" })
        .then(async context => {
          await context.addCookies([{ ...student.cookie, url: origin.origin, httpOnly: true, sameSite: "Lax" }]);
          await context.addInitScript(id => localStorage.setItem(`zyx:notification-permission:${id}`, "later:" + Date.now()), student.id);
          await context.route("**/*", route => {
            const url = new URL(route.request().url());
            return url.origin === origin.origin || url.protocol === "data:" ? route.continue() : route.abort();
          });
          return context;
        });
      async function check(student: Student, id: string, path: string, verify: (page: Page, status: number) => Promise<void>, capture = false) {
        if (requested.size && !requested.has(id)) return;
        const context = await browserContext(student);
        try { await open(context, id, path, profile, verify, capture); }
        finally { await context.close(); }
      }
      const capture = (id: string, path: string, verify: (page: Page) => Promise<void>) => check(owner, id, path, verify, true);
      // Both sources use the same seeded attempt or submission ids and scores.
      await capture("review-released-quiz", `${results}/${cases.completed}`, async page => {
        await expect(page.getByRole("heading", { name: /85\s*\/100/ })).toBeVisible({ timeout });
        await expect(page.getByText(quizPrompt)).toBeVisible({ timeout });
        await expect(page.getByRole("link", { name: "Lihat diagnosis dan rencana belajar" })).toHaveAttribute("href", `${results}/${cases.completed}/summary`);
      });
      await capture("review-pending-tryout", `${results}/${cases.pendingTryout}`, async page => {
        await expect(page.getByRole("heading", { name: data.tryoutTitle })).toBeVisible({ timeout });
        await expect(page.getByText("Menunggu", { exact: true })).toBeVisible({ timeout });
        await expect(page.getByText(tryoutPrompt, { exact: true })).toBeVisible({ timeout });
        await expect(page.getByText(cases.gradedTryoutNote, { exact: true })).toHaveCount(0);
      });
      await capture("review-graded-tryout", `${results}/${cases.gradedTryout}`, async page => {
        await expect(page.getByRole("heading", { name: data.tryoutTitle })).toBeVisible({ timeout });
        await expect(page.getByText("95%", { exact: true })).toBeVisible({ timeout });
        await expect(page.getByText(tryoutPrompt, { exact: true })).toBeVisible({ timeout });
        await expect(page.getByText(cases.gradedTryoutNote, { exact: true }).first()).toBeVisible({ timeout });
      });
      for (const [family, summary] of [
        ["results-summary", (id: string) => `${results}/${id}/summary`],
        ["quiz-summary", (id: string) => `${quiz}/summary/${id}`],
      ] as const) {
        await capture(`${family}-released`, summary(cases.completed), async page => {
          await expect(analytics(page).filter({ hasText: "85%" })).toBeVisible({ timeout });
          await expect(analytics(page).getByText("1 / 2", { exact: true })).toBeVisible({ timeout });
        });
        await capture(`${family}-analytics-unavailable`, summary(cases.missingAnalytics), async page => {
          await expect(page.getByRole("heading", { name: "Diagnosis pembelajaran belum dibuat" })).toBeVisible({ timeout });
          await expect(analytics(page)).toHaveCount(0);
        });
        await check(peer, `${family}-foreign-denied`, summary(cases.completed), async (page, status) => {
          expect([200, 404]).toContain(status);
          await expect(page.getByText("404", { exact: true })).toBeVisible({ timeout });
          await expect(analytics(page)).toHaveCount(0);
          for (const text of privateText) await expect(page.getByText(text, { exact: typeof text === "string" })).toHaveCount(0);
        });
      }
      await capture("quiz-summary-grading-pending", `${quiz}/summary/${cases.pendingQuiz}`, async page => {
        await expect(page.getByRole("heading", { name: "Menunggu penilaian" })).toBeVisible({ timeout });
        await expect(analytics(page)).toHaveCount(0);
      });
      await check(owner, "quiz-summary-unreleased-redirect", `${held}/summary/${cases.heldQuiz}`, async page => {
        await expect(page).toHaveURL(new URL(`${held}?attemptId=${cases.heldQuiz}`, origin).href, { timeout });
        await expect(analytics(page)).toHaveCount(0);
        await expect(page.getByText(cases.heldExplanation, { exact: true })).toHaveCount(0);
      });
      for (const [id, target] of [["released-quiz", cases.completed], ["pending-tryout", cases.pendingTryout], ["graded-tryout", cases.gradedTryout]] as const) {
        await check(peer, `review-${id}-foreign-denied`, `${results}/${target}`, async (page, status) => {
          expect([200, 404]).toContain(status);
          await expect(page.getByText("404", { exact: true })).toBeVisible({ timeout });
          for (const text of privateText) await expect(page.getByText(text, { exact: typeof text === "string" })).toHaveCount(0);
        });
      }
    }
  } finally {
    await browser.close();
  }
}

await mkdir(output, { recursive: true });
await verifyAuthorization();
if (process.env.STUDENT_ASSESSMENT_RESULTS_HTTP_ONLY !== "1") {
  await verifyBrowser();
  const unknown = [...requested].filter(id => !exercised.has(id));
  if (unknown.length) throw new Error(`Unknown assessment result cases: ${unknown.join(", ")}`);
}
