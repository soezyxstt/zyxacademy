import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createStudentFixtureRequest } from "../../../../packages/native-parity/student/fixture-request";
import { learningApi, type LearningData } from "../../../../packages/native-parity/student/learning/contracts";
import { buildFixture } from "../../fixtures/interactive-document-build";

const origin = "http://student-mastery-reference.invalid";
const route = "/courses/[id]/mastery";
const courseId = "matematika-1";
const path = `/courses/${courseId}/mastery`;
const locale = "id";
const theme = "light";
const timeZone = "Asia/Jakarta";
const fixtureEntry = "tests/visual/fixtures/student-mastery.tsx";
const nativeMarkers = {
  review: [{ text: "Topik untuk diulang" }, { text: ".*Skor penguasaan 56/100.*" }, { text: "Topik per bab" }],
  expanded: [{ text: ".*Dasar yang bisa diulang: Fungsi real.*" }, { text: ".*56/100 · Meningkat.*" }, { text: ".*Limit sepihak.*" }],
  empty: [{ text: "Belum ada hasil per topik" }, { text: "Buka alur belajar" }],
};
const targets = [
  { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
  { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
] as const;
const fonts = [
  ["Inter", "Regular", 400], ["Inter", "Medium", 500], ["Inter", "SemiBold", 600],
  ["Lexend", "SemiBold", 600], ["Lexend", "Bold", 700],
] as const;
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

test("course mastery references preserve scores, chapter disclosure and empty-state actions", async ({ browser }, info) => {
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
  const sourceDigests = Object.fromEntries(await Promise.all([
    fixtureEntry, "tests/visual/native-parallel/student/mastery-reference.spec.ts",
    "tests/visual/fixtures/interactive-document-build.ts",
    "app/(student)/courses/[id]/mastery/page.tsx", "app/globals.css",
    "components/course/concept-map.tsx", "components/course/course-page-shell.tsx",
    "components/navigation/mobile-top-navbar.tsx",
    "packages/native-parity/student/fixture-request.ts", "packages/native-parity/student/learning/contracts.ts",
    "packages/native-parity/student/learning/fixtures.ts",
    "apps/mobile-native/features/student/learning/knowledge.tsx", "apps/mobile-native/features/student/learning/index.tsx",
    "apps/mobile-native/features/student/learning/ui.tsx",
    ".maestro/native-parallel/student/mastery-parity.yaml", "messages/id/learning.json",
  ].map(async file => [file, sha256(await readFile(file))])));

  const endpoint = learningApi + "?" + new URLSearchParams({ view: "mastery", courseId, locale });
  async function load(scenario: "enrolled" | "empty") {
    const response = await createStudentFixtureRequest(scenario)(endpoint);
    const data: LearningData = await response.json();
    if (!response.ok || data.view !== "mastery" || data.state !== "ready") throw new Error("Unexpected mastery fixture response");
    return data;
  }
  const enrolled = await load("enrolled");
  const empty = await load("empty");
  expect(enrolled).toEqual({ view: "mastery", state: "ready", courseTitle: "Kalkulus Dasar", groups: [{
    chapter: { id: "chapter-1", title: "Fungsi dan limit", orderIndex: 1 },
    concepts: [
      { conceptName: "Limit fungsi", conceptSlug: "limit", masteryScore: 56, confidence: 72, trend: "improving", blockedBy: ["Fungsi real"] },
      { conceptName: "Limit sepihak", conceptSlug: "sepihak", masteryScore: null, confidence: null, trend: null, blockedBy: [] },
    ],
  }] });
  expect(empty).toEqual({ view: "mastery", state: "ready", courseTitle: "Kalkulus Dasar", groups: [] });

  for (const target of targets) {
    const { platform, viewport, deviceScaleFactor } = target;
    const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, isMobile: true,
      colorScheme: theme, locale: "id-ID", timezoneId: timeZone, reducedMotion: "reduce" });
    const errors: string[] = [];
    const captures: Record<string, string> = {};
    const states: Record<string, unknown> = {};
    try {
      await mkdir(info.outputPath(platform), { recursive: true });
      const page = await context.newPage();
      page.on("requestfailed", entry => errors.push(`Unexpected request ${entry.url()}`));
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", entry => { if (entry.type() === "error") errors.push(entry.text()); });
      await page.route("**/*", request => {
        const url = new URL(request.request().url());
        if (url.origin === origin && url.pathname === path) {
          return request.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}" class="${theme}"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div></html>` });
        }
        return request.abort();
      });

      async function open(scenario: "enrolled" | "empty") {
        const url = `${origin}${path}?scenario=${scenario}`;
        expect((await page.goto(url))?.status()).toBe(200);
        await page.addStyleTag({ content: styles });
        await page.addScriptTag({ content: fixture.script });
        await expect(page).toHaveURL(url);
        await expect(page.getByRole("heading", { level: 1, name: "Penguasaan materi: Kalkulus Dasar" })).toHaveCount(1);
      }

      async function save(state: keyof typeof nativeMarkers, scenario: "enrolled" | "empty", openChapters: string[] = [], openUnassessed: string[] = []) {
        await page.evaluate(async variants => {
          await Promise.all(variants.map(([family, , weight]) => document.fonts.load(`${weight} 16px Fixture${family}`)));
          await document.fonts.ready;
        }, fonts);
        expect(await page.evaluate(() => ({
          viewport: { width: innerWidth, height: innerHeight }, deviceScaleFactor: devicePixelRatio,
          lang: document.documentElement.lang, theme: document.documentElement.className,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          inter: getComputedStyle(document.body).fontFamily.includes("FixtureInter"),
          lexend: [...document.querySelectorAll("main h2, main h3")].some(node => getComputedStyle(node).fontFamily.includes("FixtureLexend")),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }))).toEqual({ viewport, deviceScaleFactor, lang: locale, theme, timeZone, inter: true, lexend: state !== "empty", overflow: false });
        const filename = `mastery-${state}.png`;
        const bytes = await page.screenshot({ path: info.outputPath(platform, filename), scale: "device", animations: "disabled" });
        captures[filename] = sha256(bytes);
        states[state] = { scenario, path, courseId, data: scenario === "enrolled" ? enrolled : empty, openChapters, openUnassessed, nativeMarkers: nativeMarkers[state] };
        expect(errors).toEqual([]);
      }

      await open("enrolled");
      await expect(page.getByText("Topik untuk diulang")).toBeInViewport();
      await expect(page.getByRole("heading", { name: "Limit fungsi" })).toBeInViewport();
      await expect(page.getByText("Skor penguasaan 56/100", { exact: true })).toBeInViewport();
      await expect(page.getByText("Coba kerjakan lagi soal tentang topik ini sebelum lanjut.")).toBeVisible();
      const review = page.getByRole("link", { name: "Pelajari kembali topik" });
      await expect(review).toHaveAttribute("href", `/courses/${courseId}/concept/limit`);
      const chapter = page.getByRole("button", { name: /Fungsi dan limit.*1 dari 2 dinilai/ });
      await expect(chapter).toHaveAttribute("aria-expanded", "false");
      const prerequisite = page.getByText("Dasar yang bisa diulang: Fungsi real");
      await expect(prerequisite).toHaveCount(0);
      await save("review", "enrolled");

      await chapter.click();
      await expect(chapter).toHaveAttribute("aria-expanded", "true");
      await expect(prerequisite).toBeInViewport();
      await expect(page.getByText("56/100", { exact: true })).toBeInViewport();
      await expect(page.getByText("Meningkat", { exact: true })).toHaveClass(/sr-only/);
      const unassessed = page.getByRole("button", { name: "Belum dinilai (1)" });
      await expect(unassessed).toHaveAttribute("aria-expanded", "false");
      await unassessed.click();
      await expect(unassessed).toHaveAttribute("aria-expanded", "true");
      const topic = page.getByRole("link", { name: "Limit sepihak" });
      await expect(topic).toBeInViewport();
      await expect(topic).toHaveAttribute("href", `/courses/${courseId}/concept/sepihak`);
      await save("expanded", "enrolled", ["chapter-1"], ["chapter-1"]);

      await open("empty");
      await expect(page.getByText("Belum ada hasil per topik", { exact: true })).toBeInViewport();
      await expect(page.getByText("Mulai dari latihan di alur belajar. Hasilnya muncul di sini saat topik terkait sudah dinilai.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Buka alur belajar" })).toHaveAttribute("href", `/courses/${courseId}/path`);
      await expect(page.getByRole("heading", { name: "Topik per bab" })).toHaveCount(0);
      await save("empty", "empty");

      await writeFile(info.outputPath(platform, "mastery-reference.json"), JSON.stringify({
        ...target, locale, theme, timeZone, route, endpoint, browser: browser.version(), states, captures, sourceDigests,
        fontDigests: Object.fromEntries(fontFiles.map(font => [font.name, font.hash])),
      }, null, 2) + "\n");
    } finally {
      await context.close();
    }
  }
});
