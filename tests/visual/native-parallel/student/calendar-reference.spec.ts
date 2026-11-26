import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { buildFixture } from "../../fixtures/interactive-document-build";
import { calendarEvidence, calendarFixtureForScenario } from "../../../../packages/native-parity/student/community/calendar-fixture";

const source = "app/(student)/calendar/calendar-agenda-client.tsx";
const fixtureInput = "packages/native-parity/student/community/calendar-fixture.ts";
const fixtureEntry = "tests/visual/fixtures/student-calendar.tsx";
const presentation = "lib/student/agenda-presentation.ts";
const spec = "tests/visual/native-parallel/student/calendar-reference.spec.ts";
const origin = "http://calendar-reference.invalid";

const devices = [
  { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
  { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
] as const;
const fontVariants = [
  ["FixtureInter", "Inter-Regular", 400],
  ["FixtureInter", "Inter-Medium", 500],
  ["FixtureInter", "Inter-SemiBold", 600],
  ["FixtureLexend", "Lexend-SemiBold", 600],
  ["FixtureLexend", "Lexend-Bold", 700],
] as const;

function digest(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("calendar references match device records and category states", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile-380", "This fixture captures its own device viewports.");
  test.setTimeout(120_000);
  const fixture = await buildFixture(fixtureEntry, "", {
    "@/lib/auth-client": `export const authClient = {}; export const useSession = () => ({ data: null, isPending: false });`,
    "@/app/actions/google-calendar": `async function unsupported(){throw new Error("Calendar sync is outside this fixture");}
      export {unsupported as connectGoogleCalendar, unsupported as getGoogleCalendarStatus, unsupported as requestGoogleCalendarSync};`,
  });
  const fonts = await Promise.all(fontVariants.map(async ([family, name, weight]) => {
    const bytes = await readFile(`apps/mobile-native/assets/fonts/${name}.ttf`);
    return { name, family, weight, hash: digest(bytes),
      css: `@font-face{font-family:${family};src:url(data:font/ttf;base64,${bytes.toString("base64")}) format('truetype');font-weight:${weight}}` };
  }));
  const sourceDigests = Object.fromEntries(await Promise.all([source, presentation, fixtureInput, fixtureEntry, spec, "app/globals.css",
    "components/navigation/mobile-top-navbar.tsx", "lib/date-utils/jakarta-calendar.ts"]
    .map(async file => [file, digest(await readFile(file))])));
  for (const { platform, viewport, deviceScaleFactor } of devices) {
    const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, isMobile: true,
      colorScheme: calendarEvidence.theme, locale: "id-ID", timezoneId: calendarEvidence.timeZone, reducedMotion: "reduce" });
    const errors: string[] = [];
    try {
      await context.route("**/*", route => {
        if (route.request().url().startsWith(`${origin}/?scenario=`)) {
          return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>' });
        }
        errors.push(`Unexpected request ${route.request().url()}`);
        return route.abort();
      });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await mkdir(info.outputPath(platform), { recursive: true });
      const captures: Record<string, string> = {};
      const filter = page.getByRole("combobox", { name: "Kategori kegiatan" });
      const history = page.getByRole("heading", { name: "Riwayat", exact: true });
      const active = page.getByRole("heading", { name: "Agenda aktif", exact: true });
      const quiz = page.getByRole("heading", { name: "Latihan limit fungsi", exact: true });
      const tryout = page.getByRole("heading", { name: "Simulasi turunan untuk sains dan rekayasa", exact: true });
      const tutorial = page.getByRole("heading", { name: "Tutorial: Fungsi komposisi", exact: true });

      async function boot(scenario: string) {
        await page.goto(`${origin}/?scenario=${scenario}`);
        await page.addStyleTag({ content: fixture.styles + fonts.map(font => font.css).join("\n") +
          ":root{--font-inter:FixtureInter,sans-serif;--font-lexend:FixtureLexend,sans-serif}" });
        await page.addScriptTag({ content: fixture.script });
        await page.evaluate(async variants => {
          await Promise.all(variants.map(([family, , weight]) => document.fonts.load(`${weight} 16px ${family}`)));
          await document.fonts.ready;
        }, fontVariants);
        await expect(page.getByRole("heading", { name: "Agenda", exact: true })).toHaveCount(1);
        await expect(page.getByRole("link", { name: "Kelola tutorial" })).toHaveAttribute("href", "/dashboard/schedule");
        await expect(filter).toHaveText("Semua agenda");
      }
      async function save(state: keyof typeof calendarEvidence.states) {
        expect(await page.evaluate(() => ({
          viewport: { width: innerWidth, height: innerHeight },
          scale: devicePixelRatio,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          fonts: getComputedStyle(document.body).fontFamily.includes("FixtureInter") &&
            getComputedStyle(document.querySelector("h2")!).fontFamily.includes("FixtureLexend"),
        }))).toEqual({ viewport, scale: deviceScaleFactor, overflow: false, fonts: true });
        const filename = `calendar-${state}.png`;
        const bytes = await page.screenshot({ path: info.outputPath(platform, filename), animations: "disabled", scale: "device" });
        captures[filename] = digest(bytes);
        expect(errors).toEqual([]);
      }
      async function chooseTutorial() {
        await filter.click();
        await page.getByRole("option", { name: "Tutorial", exact: true }).click();
        await expect(filter).toHaveText("Tutorial");
      }
      async function expectTutorialHistory() {
        await expect(history).toBeInViewport();
        await expect(tutorial).toBeInViewport();
        await expect(page.locator('time[datetime="2030-01-01"]')).toBeVisible();
        await expect(page.getByText("10:00 - 11:00 WIB · Dibatalkan", { exact: true })).toBeInViewport();
        await expect(page.getByRole("link", { name: "Jadwal tutorial", exact: true })).toHaveAttribute("href", "/dashboard/schedule");
      }
      await boot(calendarEvidence.states.all.scenario);
      await expect(active).toBeInViewport();
      await expect(page.getByRole("heading", { name: /Hari ini/ })).toBeInViewport();
      await expect(page.locator('time[datetime="2030-01-02"]')).toHaveCount(1);
      await expect(quiz).toBeInViewport();
      await expect(tryout).toBeInViewport();
      await expect(page.getByText("Tenggat 00.30 WIB", { exact: true })).toBeInViewport();
      await expect(page.getByText("Buka 13.30 WIB", { exact: true })).toBeInViewport();
      await expect(page.getByRole("link", { name: "Kerjakan kuis", exact: true })).toHaveAttribute("href", "/courses/matematika-1/quiz/latihan-fungsi");
      await expect(page.getByRole("link", { name: "Lihat tryout", exact: true })).toHaveAttribute("href", "/courses/matematika-1/tryout/simulasi-turunan");
      await expectTutorialHistory();
      await save("all");
      await chooseTutorial();
      await expectTutorialHistory();
      for (const heading of [active, quiz, tryout]) await expect(heading).toHaveCount(0);
      await save("tutorial");
      await boot(calendarEvidence.states["empty-filter"].scenario);
      await expect(quiz).toBeInViewport();
      await chooseTutorial();
      await expect(page.getByRole("heading", { name: "Tidak ada agenda di kategori ini" })).toBeInViewport();
      for (const heading of [active, history, quiz, tryout, tutorial]) await expect(heading).toHaveCount(0);
      const reset = page.getByRole("button", { name: "Semua agenda", exact: true });
      await expect(reset).toBeInViewport();
      await save("empty-filter");
      await reset.click();
      await expect(filter).toHaveText("Semua agenda");
      await expect(quiz).toBeInViewport();
      await expect(tryout).toBeInViewport();
      await expect(history).toHaveCount(0);

      const scenarios = [...new Set(Object.values(calendarEvidence.states).map(state => state.scenario))];
      const inputs = Object.fromEntries(scenarios.map(scenario => [scenario, calendarFixtureForScenario(scenario)]));
      await writeFile(info.outputPath(platform, "calendar-reference.json"), JSON.stringify({
        platform, viewport, deviceScaleFactor, ...calendarEvidence, sourceDigests,
        fontDigests: Object.fromEntries(fonts.map(({ name, hash }) => [name, hash])),
        browser: browser.version(), inputs, captures,
      }, null, 2) + "\n");
    } finally {
      await context.close();
    }
  }
});
