import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createStudentFixtureRequest } from "../../../../packages/native-parity/student/fixture-request";
import { buildStudentProfileReference } from "../../fixtures/student-profile-reference-build";
import { fixtureFontStyles } from "../../fixtures/fonts";

const origin = "http://student-profile-reference.invalid";
const transport = "/api/native/student/community/";
const sources = [
  "app/globals.css",
  "apps/mobile-native/features/student/StudentFixtureRoute.tsx",
  "apps/mobile-native/features/student/community/profile.tsx",
  "apps/mobile-native/features/student/community/ui.tsx",
  "packages/native-parity/student/community/fixtures.ts",
  "packages/native-parity/student/fixture-request.ts",
  "tests/visual/fixtures/interactive-document-build.ts",
  "tests/visual/fixtures/student-profile-reference.tsx",
  "tests/visual/fixtures/student-profile-reference-build.ts",
  "tests/visual/fixtures/fonts/inter-latin.woff2",
  "tests/visual/fixtures/fonts/lexend-latin.woff2",
  "tests/visual/native-parallel/student/profile-reference.spec.ts",
];
const targets = [
  { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
  { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
] as const;
const cases = {
  "profile-edit": {
    route: "/profile/edit", operation: "profile?view=edit",
    files: ["app/(student)/profile/edit/page.tsx", "app/(student)/profile/edit/profile-edit-form.tsx", "packages/student-community/itb-academic-data.ts", "messages/id/student.json"],
    states: [
      { id: "existing", locale: "id", theme: "light", scenario: "loaded", faculty: "FMIPA", major: "Matematika" },
      { id: "major-reset", locale: "id", theme: "light", scenario: "loaded", faculty: "FITB", major: null },
      { id: "revised", locale: "id", theme: "light", scenario: "loaded", faculty: "FITB", major: "Teknik Geologi" },
    ],
  },
  reflections: {
    route: "/profile/reflections", operation: "reflections",
    files: ["app/(student)/profile/reflections/page.tsx", "components/student-reflections-view.tsx", "messages/id/student.json", "messages/en/student.json"],
    states: [
      { id: "owned-id-light", locale: "id", theme: "light", scenario: "loaded" },
      { id: "empty-id-light", locale: "id", theme: "light", scenario: "empty" },
      { id: "owned-en-dark", locale: "en", theme: "dark", scenario: "loaded" },
    ],
  },
} as const;
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

async function choose(page: Page, trigger: ReturnType<Page["getByRole"]>, name: RegExp) {
  await trigger.click();
  await page.getByRole("option", { name }).click();
}

test("Student academic profile and owned reflection references match native fixture inputs", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile-380", "Captures both matched viewports directly.");
  test.setTimeout(240_000);
  const bundles = await Promise.all([buildStudentProfileReference("id"), buildStudentProfileReference("en")]);
  for (const [group, config] of Object.entries(cases)) {
    const maestro = `.maestro/native-parallel/student/${group}-parity.yaml`;
    const sourceDigests = Object.fromEntries(await Promise.all([...sources, ...config.files, maestro].map(async path =>
      [path, sha(await readFile(path))])));
    const flow = await readFile(maestro, "utf8");
    const nativeLinks = [...flow.matchAll(/^- openLink: "([^"]+)"$/gm)].map(([, href]) => Object.fromEntries(new URL(href).searchParams));
    expect(nativeLinks).toHaveLength(group === "profile-edit" ? 1 : 3);
    for (const target of targets) {
      const states: Record<string, unknown> = {};
      const captures: Record<string, string> = {};
      await mkdir(info.outputPath(group, target.platform), { recursive: true });
      for (const [index, state] of config.states.entries()) {
        const { id, locale, theme, scenario } = state;
        const fixture = bundles[locale === "id" ? 0 : 1];
        const native = { path: config.route, locale, theme, scenario };
        expect(nativeLinks[group === "profile-edit" ? 0 : index]).toEqual(native);
        expect(flow).toContain(`- takeScreenshot: student-${group}-${id}`);
        const nativeMarkers: Array<{ id?: string; text?: string; selected?: boolean }> = [{ id: `student-fixture-${locale}-${theme}` }];
        const request = createStudentFixtureRequest(scenario);
        const url = origin + config.route + `?locale=${locale}`;
        const context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor,
          hasTouch: true, isMobile: true, colorScheme: theme, locale: locale === "id" ? "id-ID" : "en-GB",
          timezoneId: "Asia/Jakarta", reducedMotion: "reduce" });
        try {
          const page = await context.newPage();
          const errors: string[] = [];
          let received: unknown;
          page.on("pageerror", error => errors.push(error.message));
          await page.route("**/*", async route => {
            const http = route.request();
            const addressed = new URL(http.url());
            if (addressed.origin === origin) {
              if (http.url() === url && http.resourceType() === "document") {
                return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}" class="${theme}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script>document.documentElement.style.colorScheme="${theme}";</script><link rel="stylesheet" href="/__profile.css"><body class="bg-background text-foreground"><div id="root"></div><script defer src="/__profile.js"></script></body></html>` });
              }
              if (addressed.pathname === "/__profile.css") return route.fulfill({ contentType: "text/css", body: fixture.styles + fixtureFontStyles() });
              if (addressed.pathname === "/__profile.js") return route.fulfill({ contentType: "application/javascript", body: fixture.script });
              if (/^\/brand\/zyx-logo-(?:horizontal|symbol)-(?:color|reversed)\.svg$/.test(addressed.pathname)) {
                return route.fulfill({ contentType: "image/svg+xml", body: await readFile("public" + addressed.pathname) });
              }
              if (http.method() === "GET" && addressed.pathname + addressed.search === transport + config.operation) {
                const response = await request(transport + config.operation);
                expect(response.status).toBe(200);
                const body = await response.text();
                const payload = JSON.parse(body);
                received = group === "profile-edit" ? payload.account : payload.entries;
                return route.fulfill({ status: response.status, contentType: "application/json", body });
              }
            }
            errors.push(`Unexpected profile request ${http.method()} ${addressed.pathname}`);
            return route.abort();
          });
          expect((await page.goto(url))?.status()).toBe(200);
          let web: Record<string, unknown>;
          if ("faculty" in state) {
            const faculty = page.getByRole("combobox", { name: "Fakultas atau sekolah ITB" });
            const major = page.getByRole("combobox", { name: "Jurusan atau program studi" });
            const year = page.getByRole("combobox", { name: "Tahun masuk ITB (angkatan)" });
            await expect(page.getByRole("heading", { name: "Edit profil" })).toBeVisible();
            await expect(faculty).toContainText("FMIPA");
            await expect(major).toHaveText("Matematika");
            await expect(year).toHaveText("2025");
            if (state.faculty === "FITB") await choose(page, faculty, /^FITB -/);
            if (state.major === "Teknik Geologi") await choose(page, major, /^Teknik Geologi$/);
            await expect(faculty).toContainText(state.faculty);
            await expect(major).toHaveText(state.major ?? "Pilih jurusan atau program studi…");
            await expect(year).toBeInViewport();
            await expect(page.getByRole("button", { name: "Simpan profil" })).toBeInViewport();
            expect(received).toMatchObject({ name: "Aruni Rasyid", email: "aruni@example.invalid", faculty: "FMIPA", major: "Matematika", entryYear: 2025 });
            nativeMarkers.push({ text: `^${state.faculty}$`, selected: true },
              { text: `^${state.major ?? "Teknik Geologi"}$`, selected: Boolean(state.major) });
            if (state.major) nativeMarkers.push({ text: "^2025$" });
            web = { faculty: state.faculty, major: state.major, entryYear: 2025 };
          } else {
            const en = locale === "en";
            const content = page.getByRole("main");
            await expect(content.getByRole("heading", { name: en ? /^Weekly reflections$/i : /^Refleksi mingguan$/i, level: 1 })).toBeVisible();
            if (scenario === "empty") {
              await expect(content.getByRole("heading", { name: "Belum ada catatan refleksi mingguan" })).toBeInViewport();
              expect(received).toEqual([]);
              nativeMarkers.push({ text: "^Belum ada refleksi mingguan\\.$" });
              web = { entries: 0 };
            } else {
              for (const label of en ? ["2 quizzes", "12 flashcards", "3 materials", "+12"] : ["2 kuis", "12 flashcard", "3 materi", "+12"]) {
                await expect(content.getByText(label, { exact: true })).toBeInViewport();
              }
              expect(received).toMatchObject([{ id: "week-1", weekStart: "2026-11-23",
                payload: { completed: { quizzes: 2, flashcards: 12, modules: 3 }, masteryGrowth: 12 } }]);
              nativeMarkers.push({ text: en ? "^Quizzes 2 · Flashcards 12 · Materials 3$" : "^Kuis 2 · Flashcard 12 · Materi 3$" },
                { text: en ? "^Mastery growth 12$" : "^Pertumbuhan penguasaan 12$" });
              web = { entries: 1, weekStart: "2026-11-23", quizzes: 2, flashcards: 12, materials: 3, masteryGrowth: 12 };
            }
          }
          await page.evaluate(async () => {
            await Promise.all([document.fonts.load("400 14px Inter"), document.fonts.load("700 18px Lexend")]);
            await document.fonts.ready;
          });
          const presentation = await page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight },
            deviceScaleFactor: devicePixelRatio, locale: document.documentElement.lang,
            theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
          expect(presentation).toEqual({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor, locale, theme, overflow: false });
          expect(errors).toEqual([]);
          const filename = `${group}-${id}.png`;
          captures[filename] = sha(await page.screenshot({ path: info.outputPath(group, target.platform, filename), animations: "disabled", scale: "device" }));
          states[id] = { native, nativeMarkers, web: { ...web, ...presentation, route: config.route }, response: received };
        } finally {
          await context.close();
        }
      }
      await writeFile(info.outputPath(group, target.platform, `${group}-reference.json`), JSON.stringify({
        ...target, locale: "per-state", theme: "per-state", timeZone: "Asia/Jakarta", motion: "reduced",
        scope: group === "profile-edit" ? "Owned academic form and dependent faculty/major controls" : "Owned weekly archive with native details expanded before capture",
        sourceDigests, states, captures,
      }, null, 2) + "\n");
    }
  }
});
