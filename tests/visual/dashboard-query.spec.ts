import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";
import type { TodayData } from "../../lib/student/today-query";
import type { StudyPathStep } from "../../lib/student/study-path-query";
import { buildFixture } from "./fixtures/interactive-document-build";

test.setTimeout(90_000);

const origin = "http://dashboard-query.invalid";
let fixture: Awaited<ReturnType<typeof buildFixture>>;
test.beforeAll(async () => {
  fixture = await buildFixture("tests/visual/fixtures/dashboard-query.tsx");
});

async function boot(
  page: Page,
  mode: Window["dashboardFixture"]["mode"],
  respond: (route: Route) => Promise<void>,
) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", async route => {
    if (route.request().url() === `${origin}/`) {
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>',
      });
    }
    return respond(route);
  });
  await page.goto(origin);
  await page.addStyleTag({ content: fixture.styles });
  await page.evaluate(value => { window.dashboardFixture = { mode: value }; }, mode);
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

test("Today shares its initial read, rolls back an invalid completion, then accepts a confirmed retry", async ({ page }, info) => {
  let reads = 0;
  let initialRead: Route | undefined;
  const writes: Route[] = [];
  let completed = false;
  const data = (): TodayData => ({
    streak: { current: 3, longest: 5 },
    items: [
      { id: "module-one", kind: "module", title: "Baca gerak lurus", href: "/courses/fixture-course/material/one", done: completed },
      { id: "quiz-one", kind: "quiz", title: "Latihan vektor", href: "/courses/fixture-course/quiz/one", done: false },
    ],
  });
  const errors = await boot(page, "today", async route => {
    const request = route.request();
    expect(request.headers()["x-student-id"]).toBe("fixture-student");
    if (request.method() === "GET") {
      expect(request.url()).toBe(`${origin}/api/student/today`);
      reads++;
      if (reads === 1) { initialRead = route; return; }
      return route.fulfill({ json: data() });
    }
    expect(request.method()).toBe("POST");
    expect(request.url()).toBe(`${origin}/api/student/today/complete`);
    expect(request.postDataJSON()).toEqual({ itemId: "module-one" });
    writes.push(route);
  });
  const probe = page.getByTestId("today-query-probe");
  await expect(page.getByRole("heading", { name: "Halo, Ayu" })).toBeVisible();
  await expect(probe).toHaveAttribute("data-status", "pending");
  await expect.poll(() => reads).toBe(1);
  await capture(page, info, "today-loading", errors);
  await initialRead!.fulfill({ json: data() });
  await expect(probe).toHaveAttribute("data-status", "success");
  await expect(probe).toHaveAttribute("data-fetching", "false");
  await expect(page.getByText("0 dari 2 selesai", { exact: true })).toBeVisible();
  expect(reads).toBe(1);
  await capture(page, info, "today-ready", errors);

  const firstItem = page.getByRole("listitem").filter({ hasText: "Baca gerak lurus" });
  await firstItem.getByRole("button", { name: "Tandai selesai", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  await expect(firstItem.getByRole("button", { name: "Selesai", exact: true })).toBeVisible();
  await expect(probe).toHaveAttribute("data-completed", "1");
  await expect(probe).toHaveAttribute("data-mutating", "1");
  await capture(page, info, "today-completion-pending", errors);
  await firstItem.getByRole("button", { name: "Selesai", exact: true }).click();
  expect(writes).toHaveLength(1);
  await writes[0].fulfill({ json: { ok: false } });
  await expect(firstItem.getByRole("button", { name: "Tandai selesai", exact: true })).toBeVisible();
  await expect(probe).toHaveAttribute("data-completed", "0");
  await expect(probe).toHaveAttribute("data-mutating", "0");
  await expect(probe).toHaveAttribute("data-fetching", "false");
  expect(reads).toBe(2);
  await capture(page, info, "today-completion-rolled-back", errors);

  await firstItem.getByRole("button", { name: "Tandai selesai", exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  completed = true;
  await writes[1].fulfill({ json: { ok: true } });
  await expect(probe).toHaveAttribute("data-mutating", "0");
  await expect(probe).toHaveAttribute("data-completed", "1");
  await expect(probe).toHaveAttribute("data-fetching", "false");
  await expect(page.getByText("1 dari 2 selesai", { exact: true })).toBeVisible();
  await expect.poll(() => reads).toBe(3);
  expect(writes).toHaveLength(2);
  await capture(page, info, "today-completion-confirmed", errors);
});

const studySteps: StudyPathStep[] = [
  {
    stepId: "step-one", ideaId: "idea-one", chapterId: "chapter-one", chapterTitle: "Kinematika", chapterOrder: 1,
    conceptName: "Gerak lurus", status: "in_progress", actions: { moduleHref: "/courses/fixture-course/material/one" },
    estimatedMinutes: 12, prerequisites: [], priorityReason: "Lanjutkan materi terakhir",
  },
  {
    stepId: "step-two", ideaId: "idea-two", chapterId: "chapter-one", chapterTitle: "Kinematika", chapterOrder: 1,
    conceptName: "Kecepatan rata-rata", status: "available", actions: { quizTemplateId: "quiz-one" },
    estimatedMinutes: 10, prerequisites: [], priorityReason: "Latih konsep dasar",
  },
  {
    stepId: "step-three", ideaId: "idea-three", chapterId: "chapter-one", chapterTitle: "Kinematika", chapterOrder: 1,
    conceptName: "Gerak berubah beraturan", status: "locked", actions: { moduleHref: "/courses/fixture-course/material/three" },
    estimatedMinutes: 15, prerequisites: ["Gerak lurus"], priorityReason: "Selesaikan prasyarat",
  },
];

function plannedPath(days: 2 | 3) {
  const groups = days === 2 ? [studySteps.slice(0, 2), studySteps.slice(2)] : studySteps.map(step => [step]);
  return {
    steps: studySteps,
    dayPlan: groups.map((steps, index) => ({ day: index + 1, steps, totalMinutes: steps.reduce((total, step) => total + step.estimatedMinutes, 0) })),
  };
}

test("study plans retain the earlier view while changing duration and recover after an invalid response", async ({ page }, info) => {
  const requests = new Map<string, Route[]>();
  const errors = await boot(page, "study-path", async route => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.method()).toBe("GET");
    expect(url.pathname).toBe("/api/student/study-path");
    expect(url.searchParams.get("courseId")).toBe("fixture-course");
    expect(request.headers()["x-student-id"]).toBe("fixture-student");
    const key = url.searchParams.get("days") ?? "roadmap";
    requests.set(key, [...(requests.get(key) ?? []), route]);
  });
  await expect(page.getByTestId("course-study-path-skeleton")).toBeVisible();
  await expect.poll(() => requests.get("roadmap")?.length).toBe(1);
  await capture(page, info, "study-path-loading", errors);
  await requests.get("roadmap")![0].fulfill({ json: { steps: studySteps, dayPlan: null } });
  await expect(page.getByRole("heading", { name: "Gerak lurus", exact: true })).toBeVisible();
  await capture(page, info, "study-path-roadmap", errors);

  await page.getByLabel("Target selesai dalam", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Buat rencana", exact: true }).click();
  await expect.poll(() => requests.get("2")?.length).toBe(1);
  await expect(page.getByRole("button", { name: "Menyusun...", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Gerak lurus", exact: true })).toBeVisible();
  await expect(page.getByTestId("course-study-path-skeleton")).toHaveCount(0);
  await capture(page, info, "study-path-first-plan-pending", errors);
  await requests.get("2")![0].fulfill({ json: plannedPath(2) });
  await expect(page.getByText("Hari 2", { exact: true })).toBeVisible();
  await capture(page, info, "study-path-two-days", errors);

  await page.getByLabel("Target selesai dalam", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Buat rencana", exact: true }).click();
  await expect.poll(() => requests.get("3")?.length).toBe(1);
  await expect(page.getByRole("button", { name: "Menyusun...", exact: true })).toBeDisabled();
  await expect(page.getByText("Hari 2", { exact: true })).toBeVisible();
  await expect(page.getByText("Hari 3", { exact: true })).toHaveCount(0);
  await capture(page, info, "study-path-duration-pending", errors);
  await requests.get("3")![0].fulfill({ json: { steps: [] } });
  await expect(page.getByText("Terjadi kesalahan koneksi.", { exact: true })).toBeVisible();
  await expect(page.getByText("Hari 2", { exact: true })).toHaveCount(0);
  await capture(page, info, "study-path-error", errors);

  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect.poll(() => requests.get("3")?.length).toBe(2);
  await requests.get("3")![1].fulfill({ json: plannedPath(3) });
  await expect(page.getByText("Hari 3", { exact: true })).toBeVisible();
  await capture(page, info, "study-path-recovered", errors);
  await page.getByRole("button", { name: "Lihat roadmap", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Gerak lurus", exact: true })).toBeVisible();
  expect(requests.get("roadmap")).toHaveLength(1);
  await capture(page, info, "study-path-cached-roadmap", errors);
});

test("an intervention remains after an invalid dismissal and closes after a confirmed retry", async ({ page }, info) => {
  let reads = 0;
  const writes: Route[] = [];
  const errors = await boot(page, "intervention", async route => {
    const request = route.request();
    expect(request.headers()["x-student-id"]).toBe("fixture-student");
    if (request.method() === "GET") {
      reads++;
      expect(request.url()).toBe(`${origin}/api/student/interventions`);
      return route.fulfill({ json: [{
        id: "suggestion-one", studentId: "fixture-student", courseId: "fixture-course",
        conceptName: "Vektor", reason: "Ulangi latihan terakhir", status: "active",
        payload: { moduleHref: "/courses/fixture-course/material/one", quizTemplateIds: ["quiz-one"], flashcardCount: 4 },
        createdAt: "2026-11-18T00:00:00.000Z",
      }] });
    }
    expect(request.method()).toBe("POST");
    expect(request.url()).toBe(`${origin}/api/student/interventions/suggestion-one/dismiss`);
    writes.push(route);
  });
  await expect(page.getByText("Ulangi Vektor", { exact: true })).toBeVisible();
  await capture(page, info, "intervention-ready", errors);
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  await expect(page.getByRole("button", { name: "Tutup", exact: true })).toBeDisabled();
  await capture(page, info, "intervention-dismiss-pending", errors);
  await writes[0].fulfill({ json: { success: false } });
  await expect(page.getByRole("alert")).toHaveText("Belum dapat menutup saran. Coba lagi.");
  await expect(page.getByText("Ulangi Vektor", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Latihan kuis", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tutup", exact: true })).toBeEnabled();
  expect(reads).toBe(1);
  await capture(page, info, "intervention-dismiss-error", errors);
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  await writes[1].fulfill({ json: { success: true } });
  await expect(page.getByText("Ulangi Vektor", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tutup", exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(reads).toBe(1);
  expect(writes).toHaveLength(2);
  await capture(page, info, "intervention-dismiss-confirmed", errors);
});
