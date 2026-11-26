import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import postcss from "postcss";
import { createStudentFixtureRequest } from "../../../../packages/native-parity/student/fixture-request";
import { learningRequestPath, type LearningData } from "../../../../packages/native-parity/student/learning/contracts";
import { buildStudentConceptPage } from "../../fixtures/student-concept-reference-build";

const fixtureOrigin = "http://student-concept-reference.invalid";
const courseId = "matematika-1";
const slug = "limit";
const path = `/courses/${courseId}/concept/${slug}`;
const endpoint = `${learningRequestPath("concept", { id: courseId, slug }, {})}&locale=id`;
const locale = "id";
const theme = "light";
const timeZone = "Asia/Jakarta";
const entry = "tests/visual/fixtures/student-concept-reference.tsx";
const appearance = { id: "student-fixture-id-light" };
const bodyMarker = ".*Limit menjelaskan nilai yang didekati fungsi.*";
const longTitleMarker = ".*pembuktian hubungan antara pembilang dan penyebut.*";
const states = [
  { name: "populated", scenario: "enrolled", nativeMarkers: [appearance, { text: ".*Skor penguasaan 56/100.*" }, { text: ".*Fungsi real.*" }, { text: bodyMarker }] },
  { name: "long", scenario: "long", nativeMarkers: [appearance, { text: longTitleMarker }, { text: "Definisi" }, { text: bodyMarker }] },
  { name: "locked", scenario: "unenrolled", nativeMarkers: [
    appearance, { text: "Kelas memerlukan token" }, { text: "Aktifkan kelas untuk menjelajahi konsep\\." }, { text: "Aktifkan kelas" },
  ] },
] as const;
const targets = [
  { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
  { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
] as const;
const fonts = [
  ["Inter", "Regular", 400], ["Inter", "Medium", 500], ["Inter", "SemiBold", 600],
  ["Lexend", "SemiBold", 600], ["Lexend", "Bold", 700],
] as const;
const sourcePaths = [
  entry, "tests/visual/fixtures/student-concept-reference-build.ts",
  "tests/visual/native-parallel/student/concept-reference.spec.ts",
  "app/(student)/courses/[id]/concept/[slug]/page.tsx", "app/globals.css", "lib/concept-explorer-service.ts",
  "components/course/course-page-shell.tsx", "components/course/markdown-renderer.tsx", "components/enrollment-form.tsx",
  "components/ui/reveal.tsx", "components/navigation/mobile-top-navbar.tsx",
  "packages/native-parity/student/fixture-request.ts", "packages/native-parity/student/learning/contracts.ts",
  "packages/native-parity/student/learning/fixtures.ts", "packages/native-parity/student/learning/messages-id.json",
  "apps/mobile-native/features/student/StudentFixtureRoute.tsx", "apps/mobile-native/features/student/learning/knowledge.tsx",
  "apps/mobile-native/features/student/learning/index.tsx", "apps/mobile-native/features/student/learning/ui.tsx",
  ".maestro/native-parallel/student/concept-parity.yaml", "messages/id/learning.json", "messages/id/studentCourse.json",
  "messages/id/schedule.json",
];
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

test("course concept states render the canonical server page from bounded fixture reads", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile-380", "This fixture captures both device viewports directly.");
  test.setTimeout(120_000);
  const stylesPath = resolve("app/globals.css");
  const [fixture, stylesheet, fontAssets, sourceDigests] = await Promise.all([
    buildStudentConceptPage(entry),
    readFile(stylesPath, "utf8").then(content => postcss([tailwind()]).process(content, { from: stylesPath })),
    Promise.all(fonts.map(async ([family, variant, weight]) => {
      const name = `${family}-${variant}`;
      const bytes = await readFile(`apps/mobile-native/assets/fonts/${name}.ttf`);
      return { name, sha256: sha256(bytes), css: `@font-face{font-family:Fixture${family};src:url(data:font/ttf;base64,${bytes.toString("base64")}) format('truetype');font-weight:${weight}}` };
    })),
    Promise.all(sourcePaths.map(async file => [file, sha256(await readFile(file))])).then(Object.fromEntries),
  ]);
  const styles = stylesheet.css + fixture.styles + fontAssets.map(font => font.css).join("\n") +
    ":root{--font-inter:FixtureInter,sans-serif;--font-lexend:FixtureLexend,sans-serif}";
  const references = await Promise.all(states.map(async ({ name, scenario, nativeMarkers }) => {
    const response = await createStudentFixtureRequest(scenario)(endpoint);
    const data: LearningData = await response.json();
    if (!response.ok || data.view !== "concept" || (data.state !== "ready" && data.state !== "locked")) throw new Error("Invalid concept fixture");
    expect(data.state).toBe(name === "locked" ? "locked" : "ready");
    if (data.state === "ready") expect(data.concept.canonicalSlug).toBe(slug);
    else expect(data).not.toHaveProperty("concept");
    const markup = await fixture.render(data, courseId, slug);
    return { name, markup, state: { data, path, courseId, slug, scenario, nativeMarkers } };
  }));

  for (const target of targets) {
    const { platform, viewport, deviceScaleFactor } = target;
    const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, isMobile: true,
      colorScheme: theme, locale: "id-ID", timezoneId: timeZone, reducedMotion: "reduce" });
    const errors: string[] = [];
    const captures: Record<string, string> = {};
    try {
      await mkdir(info.outputPath(platform), { recursive: true });
      const page = await context.newPage();
      page.on("requestfailed", entry => errors.push(`Unexpected request ${entry.url()}`));
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", entry => { if (entry.type() === "error") errors.push(entry.text()); });
      await page.route("**/*", routed => {
        const url = new URL(routed.request().url());
        const reference = references.find(item => item.state.scenario === url.searchParams.get("scenario"));
        if (url.origin !== fixtureOrigin || url.pathname !== path || !reference) return routed.abort();
        return routed.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}" class="${theme}"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root">${reference.markup}</div></html>` });
      });
      for (const { name, state } of references) {
        const url = `${fixtureOrigin}${path}?scenario=${state.scenario}`;
        expect((await page.goto(url))?.status()).toBe(200);
        await page.addStyleTag({ content: styles });
        await expect(page).toHaveURL(url);
        if (name === "locked") {
          await expect(page.getByRole("heading", { name: "Kelas memerlukan token" })).toBeInViewport();
          await expect(page.getByText("Aktifkan kelas untuk menjelajahi konsep.")).toBeVisible();
          await expect(page.getByRole("textbox")).toBeInViewport();
          await expect(page.getByRole("button", { name: "Aktivasi kelas" })).toBeInViewport();
          await expect(page.getByRole("heading", { name: "Definisi" })).toHaveCount(0);
          await expect(page.getByText("56%", { exact: true })).toHaveCount(0);
        } else {
          await expect(page.getByRole("heading", { name: "Definisi" })).toBeInViewport();
          await expect(page.getByText("56%", { exact: true })).toBeInViewport();
          await expect(page.getByRole("link", { name: "Fungsi real" })).toHaveAttribute("href", `/courses/${courseId}/concept/fungsi`);
          await expect(page.getByText("Limit menjelaskan nilai yang didekati fungsi saat masukan mendekati suatu titik.")).toBeInViewport();
          if (name === "long") await expect(page.getByRole("heading", { level: 2, name: /pembuktian hubungan antara pembilang dan penyebut/ })).toBeInViewport();
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
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }))).toEqual({ viewport, deviceScaleFactor, lang: locale, theme, timeZone, inter: true, overflow: false });
        expect(errors).toEqual([]);
        const filename = `concept-${name}.png`;
        captures[filename] = sha256(await page.screenshot({ path: info.outputPath(platform, filename), scale: "device", animations: "disabled" }));
      }
      await writeFile(info.outputPath(platform, "concept-reference.json"), JSON.stringify({
        ...target, locale, theme, timeZone, route: "/courses/[id]/concept/[slug]", endpoint, browser: browser.version(),
        states: Object.fromEntries(references.map(({ name, state }) => [name, state])), captures, sourceDigests,
        fontDigests: Object.fromEntries(fontAssets.map(font => [font.name, font.sha256])),
      }, null, 2) + "\n");
    } finally {
      await context.close();
    }
  }
});
