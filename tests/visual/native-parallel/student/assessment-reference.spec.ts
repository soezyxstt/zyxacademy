import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { buildFixture } from "../../fixtures/interactive-document-build";

const origin = "http://student-assessment-reference.invalid";
let fixture: Awaited<ReturnType<typeof buildFixture>>;
const fontDirectory = "apps/mobile-native/assets/fonts";
const fonts = [
  { family: "Assessment Inter", filename: "Inter-Regular.ttf", weight: 400 },
  { family: "Assessment Inter", filename: "Inter-Medium.ttf", weight: 500 },
  { family: "Assessment Inter", filename: "Inter-SemiBold.ttf", weight: 600 },
  { family: "Assessment Lexend", filename: "Lexend-Bold.ttf", weight: 700 },
];
const typefaces = fonts.map(({ family, filename, weight }) => `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url(data:font/ttf;base64,${readFileSync(`${fontDirectory}/${filename}`).toString("base64")}) format("truetype"); }`).join("\n")
  + ':root { --font-inter: "Assessment Inter"; --font-lexend: "Assessment Lexend"; }';

const cases = [
  { state: "resume", title: "Instruksi kuis", copy: "Lanjutkan", image: "quiz-gateway" },
  { state: "exhausted", title: "Instruksi kuis", copy: "Batas percobaan maksimal", image: "quiz-exhausted" },
  { state: "results", title: "Kuis limit dan kekontinuan fungsi", copy: "Menunggu penilaian", image: "results-populated" },
  { state: "empty", title: "Belum ada riwayat ujian", copy: "Selesaikan kuis atau tryout", image: "results-empty" },
];

test.beforeAll(async () => {
  test.setTimeout(120_000);
  fixture = await buildFixture("tests/visual/fixtures/student-assessment-layout.tsx", "", {
    "../daftar/actions": "export async function registerPkaAction() { throw new Error('Fixture action unavailable'); }",
    "next/image": "import React from 'react'; export default function Image({unoptimized,fill,...props}) { return React.createElement('img',props); }",
  });
});

for (const theme of ["light", "dark"] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme, locale: "id-ID", timezoneId: "Asia/Jakarta", contextOptions: { reducedMotion: "reduce" } });
    test("student quiz gateway and results reference states", async ({ page }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route(`${origin}/**`, (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="id" class="${theme}"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div></html>` }));
      for (const row of cases) {
        expect((await page.goto(`${origin}/?state=${row.state}`))?.status()).toBe(200);
        await page.addStyleTag({ content: fixture.styles + typefaces });
        await page.addScriptTag({ content: fixture.script });
        await expect(page.getByRole("heading", { name: row.title, exact: true })).toBeVisible();
        await expect(page.getByText(row.copy, { exact: row.state === "resume" })).toBeVisible();
        await page.evaluate(async () => { await document.fonts.ready; });
        expect(await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          bodyFont: document.fonts.check('400 14px "Assessment Inter"'),
          headingFont: document.fonts.check('700 18px "Assessment Lexend"'),
        }))).toEqual({ overflow: false, bodyFont: true, headingFont: true });
        const path = info.outputPath(`${row.image}-${theme}.png`);
        await page.screenshot({ path, animations: "disabled" });
        await info.attach(`${row.image}-${theme}`, { path, contentType: "image/png" });
      }
      expect(errors).toEqual([]);
    });
  });
}
