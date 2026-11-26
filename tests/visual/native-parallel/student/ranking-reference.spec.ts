import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import type { CourseRanking, LeaderboardPage } from "../../../../packages/native-parity/student/community/contracts";
import { courseFixtureRows, rankingCourse, rankingEvidence } from "../../../../packages/native-parity/student/community/ranking-fixture";
import { createStudentFixtureRequest } from "../../../../packages/native-parity/student/fixture-request";
import { buildFixture } from "../../fixtures/interactive-document-build";

const origin = "http://student-ranking-reference.invalid";
const endpoint = "/api/native/student/community/";
const { locale, theme, timeZone, coursePath, participationPath, scenario, unrankedScenario } = rankingEvidence;
const devices = [
  { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
  { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
] as const;
const fonts = [
  ["FixtureInter", "Inter-Regular", 400], ["FixtureInter", "Inter-Medium", 500], ["FixtureInter", "Inter-SemiBold", 600],
  ["FixtureLexend", "Lexend-SemiBold", 600], ["FixtureLexend", "Lexend-Bold", 700],
] as const;
const navigation = `
  import { useSyncExternalStore } from "react";
  const subscribe = (callback) => {
    addEventListener("popstate", callback);
    return () => removeEventListener("popstate", callback);
  };
  const href = () => location.href;
  const useLocation = () => new URL(useSyncExternalStore(subscribe, href));
  export const usePathname = () => useLocation().pathname;
  export const useSearchParams = () => useLocation().searchParams;
  export const useRouter = () => ({
    push(url) { history.pushState(null, "", url); dispatchEvent(new PopStateEvent("popstate")); },
  });
`;
const socialBoundary = `
  async function unsupported() { throw new Error("Use the visual fixture social adapter"); }
  export { unsupported as followStudentAction, unsupported as getPublicStudentProfileAction,
    unsupported as getStudentFollowListAction, unsupported as removeFollowerAction,
    unsupported as searchVisibleStudentsAction, unsupported as unfollowStudentAction };
`;

let bundle: Awaited<ReturnType<typeof buildFixture>>;
let styles: string;
test.describe.configure({ timeout: 120_000 });

test.beforeAll(async ({}, info) => {
  test.skip(info.project.name !== "mobile-380", "These references capture both device extents directly.");
  bundle = await buildFixture("tests/visual/fixtures/student-ranking.tsx", "", {
    "next/navigation": navigation,
    "@/lib/gamification/social-actions": socialBoundary,
  });
  const fontFaces = await Promise.all(fonts.map(async ([family, file, weight]) => {
    const bytes = await readFile(`apps/mobile-native/assets/fonts/${file}.ttf`);
    return `@font-face{font-family:${family};src:url(data:font/ttf;base64,${bytes.toString("base64")}) format('truetype');font-weight:${weight}}`;
  }));
  styles = bundle.styles + fontFaces.join("\n") +
    ":root{--font-inter:FixtureInter,sans-serif;--font-lexend:FixtureLexend,sans-serif}";
});

type Capture = (state: string, input: Record<string, unknown>) => Promise<void>;

async function captureDevices(browser: Browser, info: TestInfo, group: string, flow: (page: Page, save: Capture) => Promise<void>) {
  for (const device of devices) {
    const { platform, viewport, deviceScaleFactor } = device;
    const errors: string[] = [];
    const captures: Record<string, string> = {};
    const states: Record<string, unknown> = {};
    const output = info.outputPath(platform);
    const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, isMobile: true,
      colorScheme: theme, locale: "id-ID", timezoneId: timeZone, reducedMotion: "reduce" });
    try {
      await mkdir(output, { recursive: true });
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) {
          if (url.pathname === "/fixture.js") return route.fulfill({ contentType: "application/javascript", body: bundle.script });
          if (url.pathname === "/fixture.css") return route.fulfill({ contentType: "text/css", body: styles });
          if (url.pathname === coursePath || url.pathname === participationPath) {
            return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}" class="${theme}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js" defer></script></body></html>` });
          }
        }
        errors.push(`Unexpected request ${url.href}`);
        return route.abort();
      });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

      await flow(page, async (state, input) => {
        await page.evaluate(async variants => {
          await Promise.all(variants.map(([family, , weight]) => document.fonts.load(`${weight} 14px ${family}`)));
          await document.fonts.ready;
        }, fonts);
        expect(await page.evaluate(() => ({
          viewport: { width: innerWidth, height: innerHeight }, scale: devicePixelRatio,
          lang: document.documentElement.lang, theme: document.documentElement.className,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          inter: getComputedStyle(document.body).fontFamily.includes("FixtureInter"),
          lexend: getComputedStyle(document.querySelector(".font-heading")!).fontFamily.includes("FixtureLexend"),
        }))).toEqual({ viewport, scale: deviceScaleFactor, lang: locale, theme, overflow: false, inter: true, lexend: true });
        const filename = `${group}-${state}.png`;
        const bytes = await page.screenshot({ path: info.outputPath(platform, filename), animations: "disabled", scale: "device" });
        captures[filename] = createHash("sha256").update(bytes).digest("hex");
        states[state] = input;
      });
      expect(errors).toEqual([]);
      await writeFile(info.outputPath(platform, `${group}-reference.json`), JSON.stringify({
        ...device, locale, theme, timeZone, motion: "reduced", fonts: "Inter and Lexend from native assets", states, captures,
      }, null, 2) + "\n");
    } finally {
      await context.close();
    }
  }
}

test("course ranking reference preserves the podium and own rank", async ({ browser }, info) => {
  await captureDevices(browser, info, "course-ranking", async (page, save) => {
    async function expectCourse(state: string, type: "quiz" | "simulation", fixtureScenario: string, expectedRank: number | null, total: number) {
      const request = createStudentFixtureRequest(fixtureScenario);
      const response = await request(`${endpoint}course-ranking?id=${rankingCourse.id}&type=${type}`);
      expect(response.ok).toBe(true);
      const data: CourseRanking = await response.json();
      expect(data).toMatchObject({ assessment: type, ownRank: expectedRank, totalStudents: total });
      await expect(page.getByRole("heading", { name: "Peringkat kelas: Matematika I" })).toHaveCount(1);
      await expect(page.getByRole("link", { name: type === "quiz" ? "Kuis" : "Tryout" })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { name: "Peringkat Anda" })).toBeInViewport();
      const label = type === "quiz" ? "kuis" : "tryout";
      const summary = expectedRank === null ? `- dari ${total} (Belum ada skor ${label})` : `${expectedRank} dari ${total}`;
      await expect(page.getByText(summary, { exact: true })).toBeInViewport();
      await expect(page.getByText(`Berdasarkan rata-rata skor ${label} dan kriteria pemecah seri.`)).toBeInViewport();
      if (type === "simulation") {
        expect(data.rows).toEqual([]);
        await expect(page.getByRole("heading", { name: "Belum ada peringkat tryout" })).toBeInViewport();
        await expect(page.getByText("Selesaikan tryout untuk masuk peringkat.")).toBeInViewport();
        await expect(page.getByRole("listitem")).toHaveCount(0);
      } else {
        await expect(page.getByRole("heading", { name: "3 teratas" })).toBeInViewport();
        await expect(page.getByRole("listitem")).toHaveCount(3);
        expect(data.rows.map(row => row.name)).toEqual(["Nara Putri", "Raisa Dewi", "Gilang Pratama"]);
        for (const [index, row] of data.rows.entries()) {
          const line = page.getByRole("listitem").nth(index);
          await expect(line).toBeInViewport();
          await expect(line.getByText(row.name, { exact: true })).toBeVisible();
          await expect(line.getByText(`${row.average}%`, { exact: true })).toBeVisible();
          expect(row).not.toHaveProperty("studentId");
        }
        await expect(page.getByText("4 percobaan kuis · 2m 12s", { exact: true })).toBeVisible();
        await expect(page.getByText("3 soal sulit benar · 6 soal sedang dikerjakan", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: /Nara Putri/ })).toHaveCount(1);
        await expect(page.getByRole("button", { name: /Raisa Dewi|Gilang Pratama/ })).toHaveCount(0);
        for (const hidden of courseFixtureRows.slice(3)) {
          await expect(page.getByText(hidden.studentName, { exact: true })).toHaveCount(0);
          expect(JSON.stringify(data)).not.toContain(hidden.studentName);
        }
      }
      await expect(page.getByText(/\bXP\b/)).toHaveCount(0);
      await save(state, { scenario: fixtureScenario, path: coursePath + (type === "simulation" ? "?type=simulation" : ""), data, summary });
    }

    await page.goto(origin + coursePath);
    await expectCourse("quiz", "quiz", scenario, 5, 5);
    await page.getByRole("link", { name: "Tryout" }).click();
    await expect(page).toHaveURL(origin + coursePath + "?type=simulation");
    await expectCourse("simulation", "simulation", scenario, null, 0);
    await page.getByRole("link", { name: "Kuis" }).click();
    await expect(page.getByText("5 dari 5")).toBeInViewport();
    await page.goto(`${origin}${coursePath}?scenario=${unrankedScenario}`);
    await expectCourse("unranked", "quiz", unrankedScenario, null, 5);
  });
});

test("participation ranking reference follows scope and period", async ({ browser }, info) => {
  await captureDevices(browser, info, "participation-ranking", async (page, save) => {
    const request = createStudentFixtureRequest(scenario);
    const explanation = page.getByText("Peringkat berdasarkan XP dasar. XP sama mendapat posisi yang sama.", { exact: true });
    const rank = page.getByRole("tab", { name: "Rank", exact: true });
    const empty = page.getByText("Belum ada peringkat", { exact: true });
    const profile = await (await request(endpoint + "profile")).json();
    expect(profile.customization.settings.leaderboardOptIn).toBe(false);

    async function expectParticipation(state: string, scope: "global" | "following", period: "all" | "month", names: string[]) {
      const response = await request(`${endpoint}participation-ranking?${new URLSearchParams({ scope, period })}`);
      expect(response.ok).toBe(true);
      const data: LeaderboardPage = await response.json();
      expect(data.entries.map(row => row.displayName)).toEqual(names);
      expect(data.ownEntry).toBeNull();
      await expect(rank).toHaveAttribute("aria-selected", "true");
      await expect(explanation).toBeInViewport();
      await expect(page.getByRole("listitem")).toHaveCount(names.length);
      for (const [index, entry] of data.entries.entries()) {
        const line = page.getByRole("listitem").nth(index);
        await expect(line).toBeInViewport();
        await expect(line.getByRole("button", { name: new RegExp(entry.displayName) })).toBeVisible();
        await expect(line.getByText(`${entry.baseXpMicro / 1_000_000} XP`, { exact: true })).toBeVisible();
        expect(entry).not.toHaveProperty("average");
      }
      await expect(empty).toHaveCount(names.length ? 0 : 1);
      await expect(page.getByText(/Posisi Anda|Aruni Rasyid|3 teratas|Peringkat Anda/)).toHaveCount(0);
      await save(state, { scenario, path: new URL(page.url()).pathname + new URL(page.url()).search, data, scope, period });
    }

    await page.goto(origin + participationPath);
    await expectParticipation("global", "global", "all", ["Nara Putri", "Satrio Wibowo"]);
    const filter = page.getByRole("button", { name: /^Filter/ });
    async function closeFilter() {
      await expect(page.getByRole("option")).toHaveCount(0);
      if (await filter.getAttribute("aria-expanded") === "true") await filter.click();
      await expect(filter).toHaveAttribute("aria-expanded", "false");
    }
    await filter.click();
    await page.getByRole("combobox", { name: "Cakupan" }).click();
    await page.getByRole("option", { name: "Diikuti" }).click();
    await closeFilter();
    await expect(page).toHaveURL(origin + participationPath + "?scope=following");
    await expectParticipation("following", "following", "all", ["Nara Putri"]);

    await filter.click();
    await page.getByRole("combobox", { name: "Periode" }).click();
    await page.getByRole("option", { name: "Bulan" }).click();
    await closeFilter();
    await expect(page).toHaveURL(origin + participationPath + "?scope=following&period=month");
    await expectParticipation("empty", "following", "month", []);

    await page.getByRole("tab", { name: "Akademik" }).click();
    await expect(page.getByRole("heading", { name: "Matematika I" })).toBeInViewport();
    await expect(page.getByText("94.5%", { exact: false })).toBeVisible();
    await expect(explanation).toHaveCount(0);
    await rank.click();
    await expect(empty).toBeInViewport();
    await expect(page).toHaveURL(origin + participationPath + "?scope=following&period=month");
  });
});
