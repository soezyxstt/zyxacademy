import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { assessmentApiPath, type AssessmentPage } from "../../../../packages/native-parity/student/assessment/contract";
import { assessmentFixturePaths, createAssessmentFixtureRequest, quizGatewayEvidence, quizGatewayScenario } from "../../../../packages/native-parity/student/assessment/fixtures";
import { buildFixture } from "../../fixtures/interactive-document-build";

const origin = "http://student-quiz-gateway-reference.invalid";
const targets = [
  { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
  { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
] as const;
const fonts = [
  ["Inter", "Regular", 400], ["Inter", "Medium", 500], ["Inter", "SemiBold", 600], ["Lexend", "Bold", 700],
] as const;
const exhaustedMessage = "Batas percobaan maksimal telah tercapai. Anda tidak dapat memulai kuis ini lagi.";

test("quiz gateway reference matches the device inputs", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile-380", "The comparison captures both device extents directly.");
  test.setTimeout(120_000);
  const fixture = await buildFixture("tests/visual/fixtures/student-quiz-gateway.tsx");
  const fontFaces = await Promise.all(fonts.map(async ([family, name, weight]) => {
    const bytes = await readFile(`apps/mobile-native/assets/fonts/${family}-${name}.ttf`);
    return `@font-face{font-family:Fixture${family};src:url(data:font/ttf;base64,${bytes.toString("base64")}) format('truetype');font-weight:${weight}}`;
  }));
  const typefaces = fontFaces.join("\n") + "\n:root{--font-inter:FixtureInter,sans-serif;--font-lexend:FixtureLexend,sans-serif}";
  const quizPath = assessmentFixturePaths.quiz;
  const listPath = assessmentFixturePaths.quizList;
  const courseId = quizPath.split("/")[2];
  const { locale, theme } = quizGatewayEvidence;

  for (const target of targets) {
    const { platform, viewport, deviceScaleFactor } = target;
    const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, isMobile: true,
      colorScheme: theme, locale: "id-ID", timezoneId: "Asia/Jakarta", reducedMotion: "reduce" });
    const output = info.outputPath(platform);
    await mkdir(output, { recursive: true });
    const captures: Record<string, string> = {};
    const states: Record<string, unknown> = {};
    try {
      for (const state of quizGatewayEvidence.states) {
        const scenario = quizGatewayScenario(state);
        const read = await createAssessmentFixtureRequest(scenario)(assessmentApiPath(quizPath));
        const data: AssessmentPage = await read.json();
        if (!read.ok || data.kind !== "quiz-detail") throw new Error(`Unavailable ${scenario} fixture`);
        const { assessment, history } = data;
        expect(assessment).toMatchObject({ id: "native-quiz", title: "Fungsi, limit, dan turunan", questionCount: 3,
          availability: "open", durationSeconds: 900, discussionAvailable: false });
        expect(data.courseTitle).toBe("Kalkulus dasar");
        expect(assessment.activeAttemptId).toBe(state === "resumable" ? "native-active-attempt" : undefined);
        expect(assessment.maxAttempts).toBe(state === "exhausted" ? 1 : 2);
        expect(assessment.attempts).toBe({ new: 0, resumable: 2, exhausted: 1 }[state]);
        expect(history).toEqual(state === "new" ? [] : [{ id: "native-completed-attempt", assessmentId: assessment.id,
          assessmentTitle: assessment.title, kind: "quiz", status: "completed", score: 80,
          submittedAt: "2026-10-05T12:00:00.000Z", durationSeconds: 301 }]);

        const page = await context.newPage();
        const errors: string[] = [];
        const starts: unknown[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route(`${origin}${quizPath}?state=${state}`, route => route.fulfill({ contentType: "text/html",
          body: `<!doctype html><html lang="${locale}" class="${theme}"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div></html>` }));
        await page.route(`${origin}/api/quiz/attempts`, async route => {
          expect(route.request().method()).toBe("POST");
          starts.push(route.request().postDataJSON());
          await route.fulfill({ json: { attemptId: "native-active-attempt" } });
        });
        expect((await page.goto(`${origin}${quizPath}?state=${state}`))?.status()).toBe(200);
        await page.addStyleTag({ content: fixture.styles + typefaces });
        await page.addScriptTag({ content: fixture.script });
        await expect(page.getByRole("heading", { name: "Instruksi kuis" })).toBeVisible();
        const facts = ["3", "15 menit", { new: "2 dari 2", resumable: "1 dari 2", exhausted: "0 dari 1" }[state]];
        await expect(page.locator("dl dd")).toHaveText(facts);
        await expect(page.getByText("Kuis ini bersifat mandiri dan dinilai secara otomatis setelah pengumpulan.")).toBeVisible();
        await expect(page.getByText("Waktu pengerjaan dimulai saat Anda memulai kuis.")).toBeVisible();
        await expect(page.getByText("Draf jawaban tersimpan otomatis di browser secara berkala.")).toBeVisible();
        await expect(page.getByText("Jika tab browser tertutup, Anda dapat melanjutkan kuis selama batas waktu belum habis.")).toBeVisible();
        await expect(page.getByRole("link", { name: "Batal" })).toHaveAttribute("href", listPath);
        await expect(page.getByRole("heading", { name: "Riwayat percobaan" })).toBeVisible();
        const start = page.getByRole("button", { name: "Mulai kuis" });
        const resume = page.getByRole("link", { name: "Lanjutkan" });
        const warning = page.getByText(exhaustedMessage, { exact: true });
        await expect(start).toHaveCount(state === "new" ? 1 : 0);
        await expect(resume).toHaveCount(state === "resumable" ? 1 : 0);
        await expect(warning).toHaveCount(state === "exhausted" ? 1 : 0);
        if (state === "new") {
          await expect(start).toBeEnabled();
          await expect(page.getByText("Belum ada percobaan selesai.")).toBeVisible();
          await expect(page.getByRole("link", { name: "Lihat pembahasan soal" })).toHaveCount(0);
        } else {
          for (const value of ["Percobaan #1", "80%", "5 Okt 2026", "Durasi: 5 menit 1 detik"]) {
            await expect(page.getByText(value, { exact: true })).toBeVisible();
          }
          await expect(page.getByRole("link", { name: "Lihat pembahasan soal" })).toHaveAttribute("href", `${quizPath}?attemptId=${history[0].id}`);
          if (state === "resumable") await expect(resume).toHaveAttribute("href", `${quizPath}?attemptId=${assessment.activeAttemptId}`);
          if (state === "exhausted") await expect(warning).toBeVisible();
        }

        await page.evaluate(async () => {
          await Promise.all([400, 500, 600].map(weight => document.fonts.load(`${weight} 14px FixtureInter`)));
          await document.fonts.load("700 16px FixtureLexend");
          await document.fonts.ready;
        });
        expect(await page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight }, deviceScaleFactor: devicePixelRatio,
          lang: document.documentElement.lang, theme: document.documentElement.className,
          inter: getComputedStyle(document.body).fontFamily.includes("FixtureInter"),
          lexend: getComputedStyle(document.querySelector("h2")!).fontFamily.includes("FixtureLexend"),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }))).toEqual({ viewport, deviceScaleFactor, lang: locale, theme, inter: true, lexend: true, overflow: false });
        const filename = `quiz-gateway-${state}.png`;
        const bytes = await page.screenshot({ path: info.outputPath(platform, filename), animations: "disabled", scale: "device" });
        captures[filename] = createHash("sha256").update(bytes).digest("hex");
        states[state] = { scenario, path: quizPath, courseId, courseTitle: data.courseTitle, assessment, history, displayedFacts: facts };
        expect(starts).toHaveLength(0);
        if (state === "new") {
          await start.click();
          await expect.poll(() => starts).toEqual([{ courseId, templateId: assessment.id }]);
          await expect(start).toBeEnabled();
        }
        expect(errors).toEqual([]);
        await page.close();
      }
      await writeFile(info.outputPath(platform, "quiz-gateway-reference.json"), JSON.stringify({
        ...target, locale, theme, timeZone: "Asia/Jakarta", motion: "reduced", fonts: "Inter and Lexend from native assets", states, captures,
      }, null, 2) + "\n");
    } finally {
      await context.close();
    }
  }
});
