import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { assessmentApiPath, type AssessmentPage } from "../../../../packages/native-parity/student/assessment/contract";
import { assessmentFixturePaths, resultsEvidence, resultsScenario } from "../../../../packages/native-parity/student/assessment/fixtures";
import { createStudentFixtureRequest } from "../../../../packages/native-parity/student/fixture-request";
import { buildFixture } from "../../fixtures/interactive-document-build";

const origin = "http://student-results-reference.invalid";
const path = assessmentFixturePaths.results;
const targets = [
  { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
  { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
] as const;
const fonts = [
  ["Inter", "Regular", 400], ["Inter", "Medium", 500], ["Inter", "SemiBold", 600],
  ["Lexend", "SemiBold", 600], ["Lexend", "Bold", 700],
] as const;
const expected = {
  mixed: [
    { id: "native-tryout-submission", title: "Simulasi turunan untuk sains dan rekayasa", metadata: "Tryout, 6 Okt 2026, 13.30", status: null, mark: "Menunggu penilaian" },
    { id: "native-completed-attempt", title: "Fungsi, limit, dan turunan", metadata: "Kuis, 5 Okt 2026, 12.00", status: "Selesai", mark: "80%" },
  ],
  empty: [],
  graded: [
    { id: "native-tryout-submission", title: "Simulasi Ujian Tengah Semester", metadata: "Tryout, 6 Okt 2026, 14.05", status: "Sudah dinilai", mark: "0%" },
    { id: "native-late-tryout-submission", title: "Simulasi limit fungsi", metadata: "Tryout, 5 Okt 2026, 12.00", status: "Terlambat", mark: "Menunggu" },
  ],
} as const;

test("course results references match Student transport records and row navigation", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile-380", "This fixture captures both device viewports directly.");
  test.setTimeout(120_000);
  const fixture = await buildFixture("tests/visual/fixtures/student-results.tsx");
  const fontFaces = await Promise.all(fonts.map(async ([family, name, weight]) => {
    const bytes = await readFile(`apps/mobile-native/assets/fonts/${family}-${name}.ttf`);
    return `@font-face{font-family:Fixture${family};src:url(data:font/ttf;base64,${bytes.toString("base64")}) format('truetype');font-weight:${weight}}`;
  }));
  const styles = fixture.styles + fontFaces.join("\n") + ":root{--font-inter:FixtureInter,sans-serif;--font-lexend:FixtureLexend,sans-serif}";
  const { locale, theme, timeZone } = resultsEvidence;

  for (const target of targets) {
    const { platform, viewport, deviceScaleFactor } = target;
    const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, isMobile: true,
      colorScheme: theme, locale: "id-ID", timezoneId: timeZone, reducedMotion: "reduce" });
    await mkdir(info.outputPath(platform), { recursive: true });
    const captures: Record<string, string> = {};
    const states: Record<string, unknown> = {};
    try {
      for (const state of resultsEvidence.states) {
        const scenario = resultsScenario(state);
        const request = createStudentFixtureRequest(scenario);
        const response = await request(assessmentApiPath(path));
        const data = await response.json() as AssessmentPage;
        expect(response.status).toBe(200);
        if (data.kind !== "results") throw new Error("Unexpected Student results response");
        expect(data).toMatchObject({ courseTitle: "Kalkulus dasar", fullAccess: true });
        expect(data.results.map(result => result.id)).toEqual(expected[state].map(row => row.id));
        for (const result of data.results) {
          expect(Object.keys(result).sort()).toEqual([
            "assessmentId", "assessmentTitle", ...(result.kind === "quiz" ? ["durationSeconds"] : []),
            "id", "kind", "score", "status", "submittedAt",
          ].sort());
        }
        if (state === "mixed") {
          const detail = await request(assessmentApiPath(`${path}/native-completed-attempt`));
          expect(detail.status).toBe(200);
          expect(await detail.json()).toEqual({ kind: "review", courseTitle: data.courseTitle,
            review: { result: data.results[1], discussionAvailable: false, items: [] } });
          const summary = await request(assessmentApiPath(`${path}/native-completed-attempt/summary`));
          expect(await summary.json()).toEqual({ kind: "summary", courseTitle: data.courseTitle, result: data.results[1],
            discussionAvailable: false, analytics: { status: "not_available", aiDiagnosis: null, computedMetrics: null } });
        }

        const page = await context.newPage();
        const errors: string[] = [];
        const url = `${origin}${path}?state=${state}`;
        await page.route("**/*", route => route.request().url() === url
          ? route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}" class="${theme}"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div></html>` })
          : route.abort());
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", entry => { if (entry.type() === "error") errors.push(entry.text()); });
        page.on("response", entry => { if (entry.status() >= 400) errors.push(`${entry.status()} ${entry.url()}`); });
        page.on("requestfailed", entry => errors.push(`Unexpected request ${entry.url()}`));
        expect((await page.goto(url))?.status()).toBe(200);
        await page.addStyleTag({ content: styles });
        await page.addScriptTag({ content: fixture.script });
        await expect(page).toHaveURL(url);
        await expect(page.getByRole("heading", { level: 1, name: "Hasil ujian: Kalkulus dasar" })).toHaveCount(1);

        const list = page.getByRole("listitem");
        const practice = page.getByRole("link", { name: "Mulai latihan kuis" });
        await expect(list).toHaveCount(expected[state].length);
        if (state === "empty") {
          await expect(page.getByRole("heading", { name: "Belum ada riwayat ujian" })).toBeInViewport();
          await expect(page.getByText("Selesaikan kuis atau tryout untuk melihat hasil.")).toBeInViewport();
          await expect(practice).toHaveAttribute("href", assessmentFixturePaths.quizList);
        } else {
          await expect(practice).toHaveCount(0);
          for (const [index, row] of expected[state].entries()) {
            const link = list.nth(index).getByRole("link");
            await expect(link.getByRole("heading", { name: row.title })).toBeInViewport();
            await expect(link).toHaveAttribute("href", `${path}/${row.id}`);
            await expect(link).toContainText(row.metadata);
            if (row.status) await expect(link.getByText(row.status, { exact: true })).toBeVisible();
            await expect(link.getByText(row.mark, { exact: true })).toHaveCount(1);
          }
        }

        await page.evaluate(async variants => {
          await Promise.all(variants.map(([family, , weight]) => document.fonts.load(`${weight} 16px Fixture${family}`)));
          await document.fonts.ready;
        }, fonts);
        expect(await page.evaluate(() => ({
          viewport: { width: innerWidth, height: innerHeight }, deviceScaleFactor: devicePixelRatio,
          lang: document.documentElement.lang, theme: document.documentElement.className,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          inter: getComputedStyle(document.body).fontFamily.includes("FixtureInter"),
          lexend: getComputedStyle(document.querySelector("main h2, main h3")!).fontFamily.includes("FixtureLexend"),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }))).toEqual({ viewport, deviceScaleFactor, lang: locale, theme, timeZone, inter: true, lexend: true, overflow: false });

        const filename = `results-${state}.png`;
        const bytes = await page.screenshot({ path: info.outputPath(platform, filename), animations: "disabled", scale: "device" });
        captures[filename] = createHash("sha256").update(bytes).digest("hex");
        states[state] = { scenario, path, courseTitle: data.courseTitle, fullAccess: data.fullAccess, results: data.results };
        expect(errors).toEqual([]);
        await page.close();
      }

      await writeFile(info.outputPath(platform, "results-reference.json"), JSON.stringify({
        ...target, locale, theme, timeZone, states, captures,
      }, null, 2) + "\n");
    } finally {
      await context.close();
    }
  }
});
