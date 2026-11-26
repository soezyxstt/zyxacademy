import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createStudentFixtureRequest } from "../../../../packages/native-parity/student/fixture-request";
import { learningRequestPath, type LearningData, type StudyPathData } from "../../../../packages/native-parity/student/learning/contracts";
import { buildFixture } from "../../fixtures/interactive-document-build";

const origin = "http://student-learning-reference.invalid";
const courseId = "matematika-1";
const locale = "id";
const theme = "light";
const timeZone = "Asia/Jakarta";
const webClock = "2026-07-23T07:00:00Z";
const fixtureEntry = "tests/visual/fixtures/student-learning-reference.tsx";
const observedFixture = { id: "student-fixture-id-light" };
const longTitleMarker = ".*pembuktian hubungan antara pembilang dan penyebut.*";
const targets = [
  { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
  { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
] as const;
const fonts = [
  ["Inter", "Regular", 400], ["Inter", "Medium", 500], ["Inter", "SemiBold", 600],
  ["Lexend", "SemiBold", 600], ["Lexend", "Bold", 700],
] as const;
const sources = [
  fixtureEntry, "tests/visual/native-parallel/student/learning-reference.spec.ts",
  "tests/visual/fixtures/interactive-document-build.ts", "app/globals.css",
  "components/course/course-page-shell.tsx", "components/navigation/mobile-top-navbar.tsx",
  "packages/native-parity/student/fixture-request.ts", "packages/native-parity/student/learning/contracts.ts",
  "packages/native-parity/student/learning/fixtures.ts", "packages/native-parity/student/learning/messages-id.json",
  "apps/mobile-native/features/student/StudentFixtureRoute.tsx", "apps/mobile-native/features/student/learning/knowledge.tsx",
  "apps/mobile-native/features/student/learning/index.tsx", "apps/mobile-native/features/student/learning/ui.tsx",
  "messages/id/learning.json", "messages/id/studentCourse.json",
];
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const studyPathEndpoint = "/api/student/study-path";
const studyPathRequest = (days?: number) => {
  const params = new URLSearchParams({ courseId });
  if (days !== undefined) params.set("days", String(days));
  return `${studyPathEndpoint}?${params}`;
};

type Scenario = "enrolled" | "long" | "empty";
type Marker = { id: string; text?: string } | { text: string };
type Capture = (state: string, nativeMarkers: Marker[], days?: number) => Promise<void>;
type Playback = { open(scenario: Scenario): Promise<void>; capture: Capture; page: Page };
type Configuration = {
  group: "progress" | "study-path";
  view: "progress" | "path";
  title: string;
  dependencies: string[];
  exercise(playback: Playback): Promise<void>;
};

const progress: Configuration = {
  group: "progress",
  view: "progress",
  title: "Progres belajar: Kalkulus Dasar",
  dependencies: [
    "app/(student)/courses/[id]/progress/page.tsx", "components/course/student-course-progress-view.tsx",
    "components/course/study-statistics-card.tsx", "components/course/recent-activity-card.tsx",
    ".maestro/native-parallel/student/progress-parity.yaml",
  ],
  async exercise({ open, capture, page }) {
    await open("enrolled");
    const time = page.getByText("35 menit", { exact: true });
    await expect(time).toBeInViewport();
    for (const value of ["2 materi", "12 ulasan", "3 hari", "Limit fungsi"]) {
      await expect(page.getByText(value, { exact: true })).toBeInViewport();
    }
    await expect(page.getByText("3 hari yang lalu", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Hasil per topik" })).toHaveAttribute("href", `/courses/${courseId}/mastery`);
    await capture("populated", [{ text: ".*35 menit.*" }, { text: ".*12 ulasan.*" }, { text: ".*Limit fungsi.*" }]);

    await open("long");
    await expect(page.getByRole("heading", { name: "Aktivitas terbaru" })).toBeInViewport();
    await expect(page.getByText(/pembuktian hubungan antara pembilang dan penyebut/)).toBeInViewport();
    await capture("long", [{ text: "Aktivitas terbaru" }, { text: longTitleMarker }]);

    await open("empty");
    await expect(time).toHaveCount(0);
    await expect(page.getByText("Belum ada aktivitas belajar.", { exact: true })).toBeInViewport();
    await expect(page.getByRole("link", { name: "Hasil kuis dan ujian" })).toHaveAttribute("href", `/courses/${courseId}/my-results`);
    await capture("empty", [{ text: "Statistik belajar" }, { text: "Belum ada aktivitas belajar\\." }, { text: "Hasil kuis dan ujian" }]);
  },
};

const studyPath: Configuration = {
  group: "study-path",
  view: "path",
  title: "Alur belajar: Kalkulus Dasar",
  dependencies: [
    "app/(student)/courses/[id]/path/page.tsx", "components/course/study-path-timeline.tsx",
    "components/student-account-boundary.tsx", "hooks/use-study-path.ts", "lib/student/study-path-query.ts",
    ".maestro/native-parallel/student/study-path-parity.yaml",
  ],
  async exercise({ open, capture, page }) {
    await open("enrolled");
    const duration = page.getByLabel("Target selesai dalam");
    const createPlan = page.getByRole("button", { name: "Buat rencana" });
    await expect(createPlan).toBeDisabled();
    await expect(page.getByRole("link", { name: "Mulai" })).toHaveAttribute("href", `/courses/${courseId}/material/pengantar`);
    await expect(page.getByText("Perlu diulang, sekitar 8 menit.", { exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "1 konsep terkunci" }).click();
    await expect(page.getByText("Kekontinuan", { exact: true })).toBeInViewport();
    await expect(page.getByRole("link", { name: /Kekontinuan/ })).toHaveCount(0);
    await expect(page.getByText(/Prasyarat:.*Limit fungsi/)).toBeInViewport();
    await capture("roadmap", [{ text: "Lanjutkan belajar" }, { text: ".*Prasyarat: Limit fungsi.*" }]);

    await duration.fill("7");
    await createPlan.click();
    await expect(page.getByRole("button", { name: "Hari 1 8 menit" })).toBeInViewport();
    await expect(page.getByRole("link", { name: /Limit fungsi/ })).toHaveAttribute("href", `/courses/${courseId}/material/pengantar`);
    await expect(page.getByText("Kekontinuan", { exact: true })).toHaveCount(0);
    const returnToRoadmap = page.getByRole("button", { name: "Lihat roadmap" });
    await expect(returnToRoadmap).toBeInViewport();
    await capture("plan", [
      { id: "student-study-path-duration", text: "7" },
      { text: ".*Hari 1.*" }, { text: ".*8 menit.*" }, { text: "Lihat roadmap" },
    ], 7);
    await returnToRoadmap.click();
    await expect(page.getByRole("link", { name: "Mulai" })).toBeVisible();

    await open("empty");
    await expect(page.getByText("Alur belajar akan tersedia setelah konten kelas diproses.", { exact: true })).toBeInViewport();
    await expect(createPlan).toHaveCount(0);
    await capture("empty", [{ text: "Alur belajar: Kalkulus Dasar" }, { text: "Alur belajar akan tersedia setelah konten kelas diproses\\." }]);
  },
};

for (const config of [progress, studyPath]) {
  test(`course ${config.group} references use production Student views and shared data`, async ({ browser }, info) => {
    test.skip(info.project.name !== "mobile-380", "This fixture captures both device viewports directly.");
    test.setTimeout(120_000);
    const fixture = await buildFixture(fixtureEntry);
    const fontFiles = await Promise.all(fonts.map(async ([family, weightName, weight]) => {
      const name = `${family}-${weightName}`;
      const bytes = await readFile(`apps/mobile-native/assets/fonts/${name}.ttf`);
      return { name, hash: sha256(bytes), css: `@font-face{font-family:Fixture${family};src:url(data:font/ttf;base64,${bytes.toString("base64")}) format('truetype');font-weight:${weight}}` };
    }));
    const styles = fixture.styles + fontFiles.map(font => font.css).join("\n") +
      ":root{--font-inter:FixtureInter,sans-serif;--font-lexend:FixtureLexend,sans-serif}";
    const sourceDigests = Object.fromEntries(await Promise.all([...sources, ...config.dependencies]
      .map(async file => [file, sha256(await readFile(file))])));
    const path = `/courses/${courseId}/${config.view}`;
    const endpoint = `${learningRequestPath(config.view, { id: courseId }, {})}&locale=${locale}`;

    for (const target of targets) {
      const { platform, viewport, deviceScaleFactor } = target;
      const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, isMobile: true,
        colorScheme: theme, locale: "id-ID", timezoneId: timeZone, reducedMotion: "reduce" });
      const errors: string[] = [];
      const captures: Record<string, string> = {};
      const states: Record<string, unknown> = {};
      let scenario: Scenario = "enrolled";
      let request = createStudentFixtureRequest(scenario);
      const visited: string[] = [];
      try {
        await mkdir(info.outputPath(platform), { recursive: true });
        const page = await context.newPage();
        await page.clock.setFixedTime(new Date(webClock));
        page.on("requestfailed", entry => errors.push(`Unexpected request ${entry.url()}`));
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", entry => { if (entry.type() === "error") errors.push(entry.text()); });
        await page.route("**/*", async routed => {
          const url = new URL(routed.request().url());
          if (url.origin !== origin) return routed.abort();
          if (url.pathname === path) {
            return routed.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}" class="${theme}"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div></html>` });
          }
          const localPath = url.pathname + url.search;
          if (localPath !== endpoint && !(config.view === "path" && url.pathname === studyPathEndpoint)) return routed.abort();
          visited.push(localPath);
          const response = await request(localPath);
          return routed.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
        });

        async function open(nextScenario: Scenario) {
          scenario = nextScenario;
          request = createStudentFixtureRequest(scenario);
          visited.length = 0;
          const url = `${origin}${path}?scenario=${scenario}`;
          expect((await page.goto(url))?.status()).toBe(200);
          await page.addStyleTag({ content: styles });
          await page.addScriptTag({ content: fixture.script });
          await expect(page).toHaveURL(url);
          await expect(page.getByRole("heading", { level: 1, name: config.title })).toHaveCount(1);
        }

        async function capture(state: string, markers: Marker[], days?: number) {
          const endpointResponse = await request(endpoint);
          const data: LearningData = await endpointResponse.json();
          expect(data).toMatchObject({ view: config.view, state: "ready", courseTitle: "Kalkulus Dasar" });
          expect(visited).toContain(endpoint);
          let study: StudyPathData | undefined;
          if (config.view === "path") {
            const pathDataRequest = studyPathRequest(days);
            expect(visited).toContain(pathDataRequest);
            study = await (await request(pathDataRequest)).json();
          }
          await page.evaluate(async variants => {
            await Promise.all(variants.map(([family, , weight]) => document.fonts.load(`${weight} 16px Fixture${family}`)));
            await document.fonts.ready;
          }, fonts);
          expect(await page.evaluate(() => ({
            viewport: { width: innerWidth, height: innerHeight }, deviceScaleFactor: devicePixelRatio,
            lang: document.documentElement.lang, theme: document.documentElement.className,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, clock: new Date().toISOString(),
            inter: getComputedStyle(document.body).fontFamily.includes("FixtureInter"),
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          }))).toEqual({ viewport, deviceScaleFactor, lang: locale, theme, timeZone, clock: new Date(webClock).toISOString(), inter: true, overflow: false });
          const filename = `${config.group}-${state}.png`;
          const bytes = await page.screenshot({ path: info.outputPath(platform, filename), scale: "device", animations: "disabled" });
          captures[filename] = sha256(bytes);
          states[state] = { scenario, path, courseId, data, study, days, nativeMarkers: [observedFixture, ...markers] };
          expect(errors).toEqual([]);
        }

        await config.exercise({ open, capture, page });
        await writeFile(info.outputPath(platform, `${config.group}-reference.json`), JSON.stringify({
          ...target, locale, theme, timeZone, route: path.replace(courseId, "[id]"), endpoint, browser: browser.version(),
          webClock, states, captures, sourceDigests, fontDigests: Object.fromEntries(fontFiles.map(font => [font.name, font.hash])),
        }, null, 2) + "\n");
      } finally {
        await context.close();
      }
    }
  });
}
