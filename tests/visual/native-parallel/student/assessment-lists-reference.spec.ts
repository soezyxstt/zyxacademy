import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { assessmentApiPath, type AssessmentPage } from "../../../../packages/native-parity/student/assessment/contract";
import { assessmentFixturePaths } from "../../../../packages/native-parity/student/assessment/fixtures";
import { createStudentFixtureRequest } from "../../../../packages/native-parity/student/fixture-request";
import { buildFixture } from "../../fixtures/interactive-document-build";

type ListData = Extract<AssessmentPage, { rows: unknown }>;
const origin = "http://student-assessment-lists-reference.invalid";
const locale = "id";
const theme = "light";
const timeZone = "Asia/Jakarta";
const scenarioByState = { published: "populated", locked: "locked", empty: "empty" } as const;
type State = keyof typeof scenarioByState;
type Kind = "quiz" | "tryout";

const targets = [
  { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
  { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
] as const;
const fonts = [
  ["FixtureInter", "Inter-Regular", 400], ["FixtureInter", "Inter-Medium", 500], ["FixtureInter", "Inter-SemiBold", 600],
  ["FixtureLexend", "Lexend-SemiBold", 600], ["FixtureLexend", "Lexend-Bold", 700],
] as const;
const entry = "tests/visual/fixtures/student-assessment-lists.tsx";
const commonSources = [
  entry, "tests/visual/native-parallel/student/assessment-lists-reference.spec.ts",
  "tests/visual/fixtures/interactive-document-build.ts", "components/course/course-page-shell.tsx", "app/globals.css",
  "components/enrollment-form.tsx", "components/ui/reveal.tsx", "messages/id/learning.json", "messages/id/schedule.json",
  "packages/native-parity/student/assessment/fixtures.ts", "packages/native-parity/student/assessment/contract.ts",
  "packages/native-parity/student/fixture-request.ts", "apps/mobile-native/features/student/StudentFixtureRoute.tsx",
  "apps/mobile-native/features/student/assessment/pages.tsx", "apps/mobile-native/features/student/assessment/ui.tsx",
  "apps/mobile-native/features/student/ListRow.tsx", "apps/mobile-native/features/shared-ui/layout.tsx",
];
const quiz = {
  path: assessmentFixturePaths.quizList,
  title: "Latihan kuis: Kalkulus dasar", rowTitle: "Fungsi, limit, dan turunan", duration: 900, id: "native-quiz",
  emptyTitle: "Belum ada kuis", emptyDescription: "Kuis untuk mata kuliah ini belum tersedia.",
  view: "components/course/student-quiz-list-view.tsx",
} as const;
const tryout = {
  path: assessmentFixturePaths.tryoutList,
  title: "Tryout ujian: Kalkulus dasar", rowTitle: "Simulasi Ujian Tengah Semester", duration: 3600, id: "native-tryout",
  emptyTitle: "Belum ada tryout terjadwal", emptyDescription: "Simulasi ujian resmi UTS dan UAS akan dibuka menjelang pekan ujian semester.",
  view: "components/course/student-tryouts-view.tsx",
} as const;

const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
let bundle: Awaited<ReturnType<typeof buildFixture>>;
let styles: string;
let fontDigests: Record<string, string>;
test.describe.configure({ timeout: 120_000 });
test.beforeAll(async ({}, info) => {
  test.skip(info.project.name !== "mobile-380", "These references capture both device extents directly.");
  bundle = await buildFixture(entry, "", {
    "@/app/(student)/dashboard/actions": 'export async function enrollWithToken(){ throw new Error("Enrollment RPC is outside the visual fixture"); }',
  });
  const faces = await Promise.all(fonts.map(async ([family, file, weight]) => {
    const bytes = await readFile(`apps/mobile-native/assets/fonts/${file}.ttf`);
    return { file, sha256: digest(bytes), css: `@font-face{font-family:${family};src:url(data:font/ttf;base64,${bytes.toString("base64")}) format('truetype');font-weight:${weight}}` };
  }));
  fontDigests = Object.fromEntries(faces.map(({ file, sha256 }) => [file, sha256]));
  styles = bundle.styles + faces.map(face => face.css).join("\n") +
    ":root{--font-inter:FixtureInter,sans-serif;--font-lexend:FixtureLexend,sans-serif}";
});

async function fixture(kind: Kind, state: State) {
  const config = kind === "quiz" ? quiz : tryout;
  const endpoint = assessmentApiPath(config.path);
  const scenario = scenarioByState[state];
  const response = await createStudentFixtureRequest(scenario)(endpoint);
  expect(response.status).toBe(200);
  const data: ListData = await response.json();
  expect(data).toEqual({ kind: `${kind}-list`, courseTitle: "Kalkulus dasar", fullAccess: state !== "locked",
    rows: state === "empty" ? [] : [{
      id: config.id, title: config.rowTitle, availability: state === "locked" ? "locked" : "open",
      durationSeconds: config.duration, questionCount: 3, openAt: null, closeAt: null, maxAttempts: 3, attempts: 1,
      ...(kind === "quiz" ? { bestScore: 80, visibility: "free", discussionAvailable: state !== "locked" } : {}),
    }],
  });
  return { endpoint, scenario, data };
}

function nativeMarkers(kind: Kind, state: State) {
  const config = kind === "quiz" ? quiz : tryout;
  const fixture = { id: "student-fixture-id-light" };
  if (state === "empty") return [{ text: config.emptyTitle }, fixture];
  const metadata = `3 soal · ${config.duration / 60} menit`;
  const quizMetadata = kind === "quiz" ? (state === "published" ? " · Gratis · Nilai 80%" : " · Nilai 80%") : "";
  const status = state === "published" ? "Mulai" : "Terkunci";
  const visibleRow = { id: `student-assessment-${config.id}`, text: `${config.rowTitle}, ${metadata}${quizMetadata}, ${status}` };
  return state === "locked" ? [visibleRow, { text: "Aktivasi token kelas" }, fixture] : [visibleRow, fixture];
}

async function assertList(page: Page, kind: Kind, state: State, data: ListData) {
  const config = kind === "quiz" ? quiz : tryout;
  await expect(page.getByRole("heading", { name: config.title, exact: true })).toHaveCount(1);
  await expect(page.getByRole("listitem")).toHaveCount(data.rows.length);
  if (kind === "quiz") {
    for (const [label, href] of [["Semua", config.path], ["Gratis", config.path + "?access=free"], ["Premium", config.path + "?access=premium"]]) {
      const filter = page.getByRole("link", { name: label, exact: true });
      await expect(filter).toBeInViewport();
      await expect(filter).toHaveAttribute("href", href);
    }
    await expect(page.getByRole("link", { name: "Semua", exact: true })).toHaveAttribute("aria-current", "page");
  }
  if (state === "empty") {
    await expect(page.getByRole("heading", { name: config.emptyTitle, exact: true })).toBeInViewport();
    await expect(page.getByText(config.emptyDescription, { exact: true })).toBeInViewport();
    if (kind === "tryout") await expect(page.getByRole("link", { name: "Latihan dengan Kuis", exact: true })).toHaveAttribute("href", assessmentFixturePaths.quizList);
  } else {
    const row = page.getByRole("listitem").first();
    await expect(row.getByRole("heading", { name: config.rowTitle, exact: true })).toBeInViewport();
    await expect(row.getByText(/3 soal/)).toBeInViewport();
    await expect(row.getByText(new RegExp(`${config.duration / 60} menit`))).toBeInViewport();
    const detail = `${config.path}/${config.id}`;
    if (kind === "quiz") {
      await expect(row.getByRole("link")).toHaveAttribute("href", detail);
      await expect(row.getByText("Nilai 80%", { exact: true })).toBeInViewport();
      if (state === "published") await expect(row.getByText("Gratis", { exact: true })).toBeInViewport();
      else await expect(row.getByRole("link")).toHaveAccessibleName(/Terkunci/);
    } else {
      await expect(row).toContainText(/1\s*\/\s*3 percobaan/);
      await expect(row.getByRole("link", { name: state === "published" ? "Mulai" : "Buka", exact: true })).toHaveAttribute("href", detail);
      if (state === "locked") await expect(row.getByText("Terkunci", { exact: true })).toBeInViewport();
    }
    await expect(row.getByText("Mulai", { exact: true })).toHaveCount(state === "published" ? 1 : 0);
  }
  const activation = page.getByRole("heading", { name: "Aktivasi token kelas", exact: true });
  await expect(activation).toHaveCount(data.fullAccess ? 0 : 1);
  if (!data.fullAccess) {
    await expect(activation).toBeInViewport();
    await expect(page.getByPlaceholder("Masukkan token kelas (misal: Zyx-CALC-ABCD)")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Aktivasi kelas", exact: true })).toBeInViewport();
  }
}

async function captureLists(browser: Browser, info: TestInfo, kind: Kind) {
  const config = kind === "quiz" ? quiz : tryout;
  const group = `${kind}-list`;
  const source = `app/(student)/courses/[id]/${kind}`;
  const paths = [...commonSources, config.view, `${source}/page.tsx`, `${source}/${group}-client.tsx`, `.maestro/native-parallel/student/${group}.yaml`];
  const sourceDigests = Object.fromEntries(await Promise.all(paths.map(async path => [path, digest(await readFile(path))])));
  for (const target of targets) {
    const context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor, hasTouch: true, isMobile: true, colorScheme: theme,
      locale: "id-ID", timezoneId: timeZone, reducedMotion: "reduce" });
    const captures: Record<string, string> = {};
    const states: Record<string, unknown> = {};
    try {
      await mkdir(info.outputPath(target.platform), { recursive: true });
      for (const state of Object.keys(scenarioByState) as State[]) {
        const { data, scenario, endpoint } = await fixture(kind, state);
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.addInitScript(({ kind, rows }) => {
          if (kind === "tryout") {
            for (const row of rows) localStorage.setItem(`zyx-tryout-attempts-${row.id}`, String(row.attempts));
          }
        }, { kind, rows: data.rows });
        await page.route("**/*", route => {
          if (route.request().url() === origin + config.path) {
            const payload = JSON.stringify(data).replaceAll("<", "\\u003c");
            return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}" class="${theme}"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="application/json" id="assessment-list-input">${payload}</script></body></html>` });
          }
          errors.push(`Unexpected request ${route.request().url()}`);
          return route.abort();
        });
        expect((await page.goto(origin + config.path))?.status()).toBe(200);
        await page.addStyleTag({ content: styles });
        await page.addScriptTag({ content: bundle.script });
        await assertList(page, kind, state, data);
        const received = await page.locator("#assessment-list-input").textContent();
        expect(JSON.parse(received!)).toEqual(data);
        const layout = await page.evaluate(async variants => {
          await Promise.all(variants.map(([family, , weight]) => document.fonts.load(`${weight} 14px ${family}`)));
          await document.fonts.ready;
          return { viewport: { width: innerWidth, height: innerHeight }, scale: devicePixelRatio, lang: document.documentElement.lang,
            theme: document.documentElement.className, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            bodyFont: getComputedStyle(document.body).fontFamily.includes("FixtureInter"),
            headingFont: getComputedStyle(document.querySelector(".font-heading")!).fontFamily.includes("FixtureLexend") };
        }, fonts);
        expect(layout).toEqual({ viewport: target.viewport, scale: target.deviceScaleFactor, lang: locale, theme,
          overflow: false, bodyFont: true, headingFont: true });
        const png = `${group}-${state}.png`;
        captures[png] = digest(await page.screenshot({ path: info.outputPath(target.platform, png), animations: "disabled", scale: "device" }));
        expect(errors).toEqual([]);
        states[state] = { scenario, request: endpoint, data, nativeMarkers: nativeMarkers(kind, state) };
        await page.close();
      }
      await writeFile(info.outputPath(target.platform, `${group}-reference.json`), JSON.stringify({
        ...target, locale, theme, timeZone, path: config.path, motion: "reduced",
        composition: "Production list view and list client with the exact native Student fixture response projected into production props",
        sourceDigests, fontDigests, states, captures,
      }, null, 2) + "\n");
    } finally {
      await context.close();
    }
  }
}

test("quiz list references published, locked, and empty course data", async ({ browser }, info) => {
  await captureLists(browser, info, "quiz");
});

test("tryout list references published, locked, and empty course data", async ({ browser }, info) => {
  await captureLists(browser, info, "tryout");
});
