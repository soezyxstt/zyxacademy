import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { quizStorageKeys } from "../../../../lib/quiz/player-state";
import { quizPlayerEvidence, quizPlayerFixture } from "../../../../packages/native-parity/student/assessment/quiz-player-fixture";
import { buildFixture } from "../../fixtures/interactive-document-build";

const origin = "http://student-quiz-player-reference.invalid";
const targets = [
  { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
  { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
] as const;
const fontFiles = [["Inter", "Regular", 400], ["Inter", "Medium", 500], ["Inter", "SemiBold", 600], ["Lexend", "Bold", 700]] as const;
const fixtureFile = "tests/visual/fixtures/student-quiz-player.tsx";
const sourceFiles = [fixtureFile, "components/course/quiz-player.tsx", "components/course/course-page-shell.tsx",
  "features/student-assessment/ui/mobile/quiz-player-mobile.tsx", "features/student-assessment/ui/shared/quiz-player-parts.tsx",
  "app/(student)/courses/[id]/quiz/[quizId]/page.tsx", "app/globals.css", "messages/id/learning.json", "messages/id/studentCourse.json",
  "tests/visual/native-parallel/student/quiz-player-reference.spec.ts", "tests/visual/fixtures/interactive-document-build.ts",
  "hooks/use-quiz-player.ts", "lib/quiz/player-state.ts", "packages/native-parity/student/assessment/quiz-player-fixture.ts",
  "packages/native-parity/student/fixture-request.ts", "apps/mobile-native/features/student/assessment/player.tsx",
  "apps/mobile-native/features/student/assessment-draft-store.ts", ".maestro/native-parallel/student/quiz-player.yaml"];
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const { attemptId, path: route, locale, theme } = quizPlayerEvidence;
const [first, second] = quizPlayerFixture.player.questions;
const keys = quizStorageKeys(attemptId);
type State = (typeof quizPlayerEvidence.states)[number];

const states = {
  unanswered: { answers: {}, flags: {}, index: 0, nativeMarkers: [{ text: "0/3 Sudah diisi" }] },
  answered: { answers: { [first.id]: 1 }, flags: {}, index: 0, nativeMarkers: [{ text: "1/3 Sudah diisi" }] },
  "flagged-restored": { answers: { [first.id]: 1 }, flags: { [first.id]: true }, index: 0,
    nativeMarkers: [{ text: "Hapus tanda ragu-ragu" }] },
} satisfies Record<State, unknown>;

test("quiz player captures answer selection and real draft recovery at both device extents", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile-380", "The comparison captures both device extents directly.");
  test.setTimeout(120_000);
  const fixture = await buildFixture(fixtureFile);
  const fonts = await Promise.all(fontFiles.map(async ([family, name, weight]) => {
    const filename = `${family}-${name}`;
    const bytes = await readFile(`apps/mobile-native/assets/fonts/${filename}.ttf`);
    return { filename, sha256: digest(bytes), css: `@font-face{font-family:Fixture${family};src:url(data:font/ttf;base64,${bytes.toString("base64")}) format('truetype');font-weight:${weight}}` };
  }));
  const fontDigests = Object.fromEntries(fonts.map(font => [font.filename, font.sha256]));
  const sourceDigests = Object.fromEntries(await Promise.all(sourceFiles.map(async name => [name, digest(await readFile(name))])));
  const styles = fixture.styles + fonts.map(font => font.css).join("\n") + "\n:root{--font-inter:FixtureInter,sans-serif;--font-lexend:FixtureLexend,sans-serif}";

  for (const target of targets) {
    const context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor,
      hasTouch: true, isMobile: true, colorScheme: theme, locale: "id-ID", timezoneId: "Asia/Jakarta", reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => {
        if (route.request().url() !== `${origin}${quizPlayerEvidence.path}`) {
          errors.push(`Unexpected network request: ${route.request().url()}`);
          return route.abort();
        }
        return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}" class="${theme}"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div></html>` });
      });
      const option = page.getByRole("radio").nth(1);
      const flag = page.getByRole("button", { name: "Ragu-ragu atau tandai soal", exact: true });
      const progress = page.getByRole("progressbar");
      const captures: Record<string, string> = {};
      await mkdir(info.outputPath(target.platform), { recursive: true });

      async function load() {
        expect((await page.goto(`${origin}${route}`))?.status()).toBe(200);
        await page.addStyleTag({ content: styles });
        await page.addScriptTag({ content: fixture.script });
        await expect(page.locator('[data-quiz-layout="mobile"]')).toBeVisible();
        await expect(page.getByRole("timer")).toHaveCount(0);
        const layout = await page.evaluate(async () => {
          await Promise.all([400, 500, 600].map(weight => document.fonts.load(`${weight} 14px FixtureInter`)));
          await document.fonts.load("700 16px FixtureLexend");
          await document.fonts.ready;
          return { viewport: { width: innerWidth, height: innerHeight }, scale: devicePixelRatio,
            lang: document.documentElement.lang, theme: document.documentElement.className,
            font: getComputedStyle(document.body).fontFamily.includes("FixtureInter"),
            noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth };
        });
        expect(layout).toEqual({ viewport: target.viewport, scale: target.deviceScaleFactor, lang: locale, theme, font: true, noOverflow: true });
      }

      async function capture(state: State) {
        const expected = states[state];
        const marked = Object.keys(expected.flags).length > 0;
        const answered = Object.keys(expected.answers).length > 0;
        await expect(page.getByText("Soal 1/3", { exact: true })).toBeVisible();
        await expect(page.getByText(first.prompt, { exact: true })).toBeVisible();
        await expect(page.getByRole("radio")).toHaveCount(first.options.length);
        await expect(option).toHaveAccessibleName(/^B\.?\s+4$/);
        await expect(option).toHaveAttribute("aria-checked", String(answered));
        await expect(flag).toHaveAttribute("aria-pressed", String(marked));
        await expect(progress).toHaveAttribute("aria-valuenow", answered ? "33" : "0");
        await expect.poll(() => page.evaluate(({ answers, index, flags }) => ({
          answers: JSON.parse(localStorage.getItem(answers) ?? "{}"), flags: JSON.parse(localStorage.getItem(flags) ?? "{}"),
          index: Number(localStorage.getItem(index)),
        }), keys)).toEqual({ answers: expected.answers, flags: expected.flags, index: expected.index });
        const name = `quiz-player-${state}.png`;
        captures[name] = digest(await page.screenshot({ path: info.outputPath(target.platform, name), animations: "disabled", scale: "device" }));
        expect(errors).toEqual([]);
      }

      await load();
      await capture("unanswered");
      await option.tap();
      await capture("answered");
      await flag.tap();
      await expect(flag).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Lanjut", exact: true }).tap();
      await expect(page.getByText(second.prompt, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Sebelumnya", exact: true }).tap();
      await expect(page.getByText(first.prompt, { exact: true })).toBeVisible();
      await load();
      await capture("flagged-restored");

      await writeFile(info.outputPath(target.platform, "quiz-player-reference.json"), JSON.stringify({
        ...target, scenario: quizPlayerEvidence.scenario, path: route, locale, theme,
        nativeStore: quizPlayerEvidence.store, webStore: "production browser localStorage", motion: "reduced", timeZone: "Asia/Jakarta",
        composition: "Production mobile QuizPlayer plus CoursePageShell, isolated component fixture transport",
        data: quizPlayerFixture, sourceDigests, fontDigests, states, captures,
      }, null, 2) + "\n");
    } finally {
      await context.close();
    }
  }
});
