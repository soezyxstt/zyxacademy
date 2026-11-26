import { resolve } from "node:path";
import { build, type Plugin } from "esbuild";
import { expect, test, type Page } from "@playwright/test";
import { assessmentApiPath, type AssessmentPage } from "../../../../packages/native-parity/student/assessment/contract";
import { assessmentFixturePaths, createAssessmentFixtureRequest } from "../../../../packages/native-parity/student/assessment/fixtures";

const path = assessmentFixturePaths.results;
const screenPath = "apps/mobile-native/features/student/assessment";
const origin = "http://student-results-refocus.invalid";

type PendingRead = { path: string; student: string | null; aborted: boolean; cache: string | undefined };

declare global {
  interface Window {
    resultsRefocus: {
      render(focused: boolean, pathname?: string): void;
      reads(): PendingRead[];
      answer(index: number, status: number, payload: unknown): Promise<void>;
    };
  }
}

// Render the real assessment route, focus gate and transport with DOM output at the React Native UI boundary.
const nativeViews: Plugin = {
  name: "student-results-native-views",
  setup(builder) {
    const modules: Record<string, string> = {
      "./pages": `import React from "react";
        export function ResultsPage({ data }) { return React.createElement("p", {}, data.results[0].score + "%"); }
        export function ReviewPage({ review }) { return React.createElement("p", {}, review.items[0]?.expected); }
        export function SummaryPage({ data }) { return React.createElement("p", {}, "Correct: " + data.analytics.computedMetrics.correctCount); }
        export function QuizDetail({ data }) { return React.createElement("p", {}, data.assessment.title); }
        export function AssessmentList() {} export function TryoutDetail() {}`,
      "./solutions": "export function SolutionReader() {}",
      "./ui": `import React from "react";
        export const AssessmentContext = React.createContext(null);
        export const useAssessment = () => React.useContext(AssessmentContext);
        export const useAssessmentCopy = () => ({ tx: (_id, en) => en, messages: {} });
        export const Frame = ({ children }) => children;
        export const Busy = () => React.createElement("p", { role: "status" }, "Loading");
        export const Message = ({ title }) => React.createElement("p", { role: "alert" }, title);`,
    };
    builder.onResolve({ filter: /^\.\/(pages|solutions|ui)$/ }, args => {
      if (args.importer.endsWith(`/${screenPath}/index.tsx`)) return { path: args.path, namespace: "native-views" };
    });
    builder.onLoad({ filter: /.*/, namespace: "native-views" }, args => ({
      contents: modules[args.path], loader: "js", resolveDir: process.cwd(),
    }));
  },
};

let compiled: Promise<string> | undefined;
function browserScript() {
  return compiled ??= build({
    stdin: {
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { AssessmentScreen } from "./${screenPath}/index";
        import { bindStudentRequest } from "./apps/mobile-native/features/student/transport";
        import { matchStudentRoute } from "./apps/mobile-native/features/student/routes";
        const session = { userId: "student-refocus", sessionId: "same-session", role: "student", locale: "en", origin: "${origin}" };
        let currentPath = "${path}";
        const pending = [];
        const request = bindStudentRequest(session, (path, init) => new Promise(resolve => {
          // Deliberately return late responses even if aborted to exercise the reader's stale-response handling.
          pending.push({ path, init, resolve });
        }));
        const root = createRoot(document.getElementById("root"));
        const noop = () => {};
        window.resultsRefocus = {
          render(focused, pathname = currentPath) {
            currentPath = pathname;
            const route = matchStudentRoute(pathname);
            root.render(<AssessmentScreen {...{ session, route, request, focused }}
              back={noop} navigate={noop} replace={noop} initialScrollY={0} onScrollY={noop} />);
          },
          reads() { return pending.map(({ path, init }) => ({ path, student: init.headers.get("x-student-id"),
            aborted: init.signal.aborted, cache: init.cache })); },
          answer(index, status, payload) {
            return new Promise(consumed => pending[index].resolve(Object.assign(Response.json(payload, { status }), { dispose: consumed })));
          },
        };`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    alias: { react: resolve("node_modules/react") },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [nativeViews],
  }).then(bundle => bundle.outputFiles[0].text);
}

async function openResults(page: Page, pathname: string) {
  const script = await browserScript();
  await page.route(`${origin}/`, route => route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' }));
  await page.goto(`${origin}/`);
  await page.addScriptTag({ content: script });
  await page.evaluate(value => window.resultsRefocus.render(true, value), pathname);
  return {
    count: () => page.evaluate(() => window.resultsRefocus.reads().length),
    focus: (focused: boolean) => page.evaluate(value => window.resultsRefocus.render(value), focused),
    respond: (index: number, status: number, payload: unknown) =>
      page.evaluate(args => window.resultsRefocus.answer(...args), [index, status, payload] as const),
  };
}

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "mobile-380", "Focus lifecycle does not depend on viewport.");
});

test("private course results reauthorize when the signed-in route regains focus", async ({ page }) => {
  const { count, focus, respond } = await openResults(page, path);
  const loading = page.getByRole("status");
  const data = (score: number): AssessmentPage => ({
    kind: "results", courseTitle: "Calculus", fullAccess: true,
    results: [{ id: "own-result", assessmentId: "own-quiz", assessmentTitle: "Limits", kind: "quiz", score,
      status: "completed", submittedAt: "2026-10-05T12:00:00.000Z" }],
  });

  await expect(loading).toHaveText("Loading");
  await expect.poll(count).toBe(1);
  await respond(0, 200, data(80));
  await expect(page.getByText("80%", { exact: true })).toBeVisible();

  await focus(false);
  await expect(page.locator("#root")).toBeEmpty();
  expect(await count()).toBe(1);
  await focus(true);
  await expect(loading).toHaveText("Loading");
  await expect(page.getByText("80%", { exact: true })).toHaveCount(0);
  await expect.poll(count).toBe(2);

  await focus(false);
  await expect(page.locator("#root")).toBeEmpty();
  await focus(true);
  await expect.poll(count).toBe(3);
  await respond(2, 200, data(95));
  await expect(page.getByText("95%", { exact: true })).toBeVisible();
  await respond(1, 200, data(81));
  expect(await page.evaluate(() => window.resultsRefocus.reads()[1].aborted)).toBe(true);
  await expect(page.getByText("95%", { exact: true })).toBeVisible();
  await expect(page.getByText("81%", { exact: true })).toHaveCount(0);

  await focus(false);
  await expect(page.locator("#root")).toBeEmpty();
  await focus(true);
  await expect(loading).toHaveText("Loading");
  await expect(page.getByText("95%", { exact: true })).toHaveCount(0);
  await expect.poll(count).toBe(4);
  await respond(3, 403, { error: "Access denied" });
  await expect(page.getByRole("alert")).toHaveText("Assessment unavailable");
  await expect(page.getByText(/\d+%/)).toHaveCount(0);
  expect(await page.evaluate(() => window.resultsRefocus.reads())).toEqual([true, true, true, false].map(aborted => ({
    aborted, path: assessmentApiPath(path), student: "student-refocus", cache: "no-store",
  })));
});


const protectedDetails = [
  assessmentFixturePaths.review,
  `${path}/native-completed-attempt`,
  assessmentFixturePaths.summary,
  assessmentFixturePaths.quizSummary,
];
for (const target of protectedDetails) {
  test(`private assessment rereads ${target} before showing previously authorized content`, async ({ page }) => {
    const { count, focus, respond } = await openResults(page, target);
    const request = createAssessmentFixtureRequest("populated");
    const response = await request(assessmentApiPath(target));
    expect(response.ok).toBe(true);
    const payload: AssessmentPage = await response.json();
    const privateText = payload.kind === "review" ? payload.review.items[0]?.expected : "Correct: 2";
    if (!privateText) throw new Error("Missing authorized fixture content");
    await expect.poll(count).toBe(1);
    await respond(0, 200, payload);
    const privateValue = page.getByText(privateText, { exact: true });
    await expect(privateValue).toBeVisible();

    await focus(false);
    await expect(page.locator("#root")).toBeEmpty();
    await focus(true);
    await expect(page.getByRole("status")).toHaveText("Loading");
    await expect(privateValue).toHaveCount(0);
    await expect.poll(count).toBe(2);
    await respond(1, 403, { error: "Access denied" });
    await expect(page.getByRole("alert")).toHaveText("Assessment unavailable");
    await expect(privateValue).toHaveCount(0);
  });
}

test("focusing an active quiz preserves its existing player read", async ({ page }) => {
  const target = assessmentFixturePaths.quizPlayer;
  const { count, focus, respond } = await openResults(page, target);
  const request = createAssessmentFixtureRequest("populated");
  const response = await request(assessmentApiPath(target));
  expect(response.ok).toBe(true);
  const payload: AssessmentPage = await response.json();
  if (payload.kind !== "quiz-detail" || !payload.player) throw new Error("Expected an active quiz fixture");
  await expect.poll(count).toBe(1);
  await respond(0, 200, payload);
  const title = page.getByText(payload.assessment.title, { exact: true });
  await expect(title).toBeVisible();
  await focus(false);
  await expect(title).toBeVisible();
  await focus(true);
  await expect(title).toBeVisible();
  expect(await count()).toBe(1);
});
