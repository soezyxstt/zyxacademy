import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { fixtureFontStyles } from "../../fixtures/fonts";
import { buildFixture } from "../../fixtures/interactive-document-build";
import { waitForVisualReadiness } from "../../visual-readiness";
import { referenceItems } from "./cases";

const root = "tests/visual/native-parallel/academic";
const origin = "http://academic.invalid";
const locale = "id-ID";
const timezoneId = "Asia/Jakarta";
const clock = "2026-11-28T02:00:00.000Z";
const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const deviceScaleFactor = Number(process.env.PARITY_DPR ?? "1");
if (![1, 3].includes(deviceScaleFactor)) throw new Error("PARITY_DPR must be 1 or 3");

const desktop = process.env.PARITY_VIEWPORT === "desktop";
const customViewport = process.env.PARITY_WIDTH !== undefined || process.env.PARITY_HEIGHT !== undefined;
const viewport = {
  width: Number(process.env.PARITY_WIDTH ?? (desktop ? "1536" : "380")),
  height: Number(process.env.PARITY_HEIGHT ?? (desktop ? "864" : "844")),
};
if (Object.values(viewport).some((value) => !Number.isInteger(value) || value <= 0)) {
  throw new Error("PARITY_WIDTH and PARITY_HEIGHT must be positive CSS-pixel integers");
}
const mobile = !desktop && viewport.width < 768;
const subset = process.env.PARITY_CASES?.split(",").filter(Boolean);
const snapshotDir = process.env.PARITY_OUTPUT_DIR ?? (customViewport
  ? `artifacts/native-parity/academic/web/${viewport.width}x${viewport.height}/dpr${deviceScaleFactor}`
  : desktop
  ? "artifacts/native-parity/academic/web/desktop"
  : subset
    ? "artifacts/native-parity/academic/web/subset"
    : `${root}/web/dpr${deviceScaleFactor}`);
await mkdir(snapshotDir, { recursive: true });

// The original modules import Next.js server RPCs. Only the few reads that
// affect these captures receive fixture data. Unexpected mutations fail locally.
const stubActions = (names: string) => names.split(" ").map((name) =>
  `export async function ${name}() { throw new Error("Outside academic fixture: ${name}"); }`).join("\n");

const fixture = await buildFixture(`${root}/fixture.tsx`, "", {
  "@/lib/auth-client": `
    export const authClient = {};
    export const useSession = () => ({ data: null, isPending: false });
  `,
  "@/components/providers/locale-provider": 'export const useAppLocale = () => ({ locale: "id" });',
  "@/components/navigation": `
    export * from "@/components/navigation/mobile-chrome-context";
    export * from "@/components/navigation/mobile-top-navbar";
    export * from "@/components/navigation/viewport-switch";
  `,
  "next/navigation": `
    const router = {
      push: (href) => location.assign(href),
      replace: (href) => history.replaceState(null, "", href),
      refresh() {},
      prefetch() {},
      back: () => history.back(),
    };
    export const useRouter = () => router;
    export const usePathname = () => location.pathname;
    export const useSearchParams = () => new URLSearchParams(location.search);
  `,
  "next/link": `
    import React from "react";
    export default function Link({ href, children, prefetch, replace, scroll, ...props }) {
      return React.createElement("a", { href: typeof href === "string" ? href : href.pathname, ...props }, children);
    }
  `,
  "@/app/(admin)/admin/(academic)/courses/actions": stubActions("saveCourse deleteCourse saveChapter deleteChapter reorderChapters"),
  "@/app/(admin)/admin/(academic)/groups/actions": stubActions(
    "getAdminStudyGroups getAdminGroupDetail createStudyGroup updateStudyGroup deleteStudyGroup addGroupMember removeGroupMember searchStudents",
  ),
  "@/app/(admin)/admin/(academic)/tokens/actions": stubActions("generateEnrollmentToken deleteEnrollmentToken"),
  "@/app/(admin)/admin/(academic)/users/actions": `
    ${stubActions("updateUserRolesAction updateUserStatusAction")}
    export { getAdminUsersData } from "./${root}/administration";
  `,
  "@/app/actions/tutor-management": stubActions(
    "gradeSubmissionAction getQuizTemplatePreviewAction deleteQuizTemplateAction toggleQuizTemplateStatusAction saveQuestionBankAction deleteQuestionBankAction saveTryoutAction deleteTryoutAction saveTryoutQuestionAction deleteTryoutQuestionAction importQuestionBankToTryoutAction",
  ),
  "@/app/actions/tutor-quiz-grading": `
    ${stubActions("gradeQuizAttemptAction")}
    export { getQuizAttemptDetailsAction } from "./${root}/quiz-attempt";
  `,
  "@/app/actions/google-calendar": `
    ${stubActions("connectGoogleCalendar requestGoogleCalendarSync")}
    export async function getGoogleCalendarStatus() {
      return { connected: false, configured: true, pending: false, error: null, lastSyncedAt: null };
    }
  `,
  "@/app/(tutor)/tutor/schedule/slot-note-actions": `
    ${stubActions("addTutorSlotWithNotesAction updateTutorSlotWithNotesAction")}
    export async function getTutorSlotCoursesAction(ids) {
      return Object.fromEntries(ids.map((id) => [id, ["academic-course-1"]]));
    }
    export async function getTutorSlotNotesAction() { return {}; }
  `,
  "@/app/(tutor)/tutor/schedule/actions": stubActions(
    "copyTutorAvailabilityAction decideTutorRescheduleTicketAction deleteTutorSlotAction moveTutorSessionAction replyTutorTicketMessageAction",
  ),
  "@/app/(student)/dashboard/schedule/actions": stubActions(
    "addSessionResourceAction completeTutorSessionAction deleteSessionResourceAction updatePreSessionContextAction submitRescheduleTicket sendTicketMessage tutorDecideTicket",
  ),
});
const fontStyles = fixtureFontStyles();
const browser = await chromium.launch({
  args: ["--force-color-profile=srgb"],
  executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
const browserVersion = browser.version();
const failures: string[] = [];
const captures = [];

const assets: Record<string, string> = {
  ".avif": "image/avif", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp",
};
const fixturePaths = new Set([
  ...Object.values(referenceItems).flatMap(({ route, cases }) => [
    route,
    ...cases.flatMap(({ path }) => path ? [path.split("?")[0]] : []),
  ]),
]);

try {
  for (const [group, item] of Object.entries(referenceItems)) {
    for (const scenario of item.cases) {
      const id = `${group}-${scenario.name}-${scenario.theme}`;
      if (subset && !subset.includes(id) && !subset.includes(group)) continue;
      const path = scenario.path ?? item.route;
      const context = await browser.newContext({
        viewport, deviceScaleFactor, locale, timezoneId,
        isMobile: mobile, hasTouch: mobile, colorScheme: scenario.theme, reducedMotion: "reduce",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      await page.clock.setFixedTime(new Date(clock));
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin && fixturePaths.has(url.pathname) && route.request().resourceType() === "document") {
          await route.fulfill({
            contentType: "text/html",
            body: `<!doctype html><html lang="id" class="${scenario.theme}"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="bg-background text-foreground font-sans"><div id="root"></div></body></html>`,
          });
          return;
        }
        const ext = url.pathname.slice(url.pathname.lastIndexOf("."));
        if (url.origin === origin && assets[ext] && /^[a-zA-Z0-9/_.-]+$/.test(url.pathname) && !url.pathname.includes("..")) {
          try {
            await route.fulfill({ body: await readFile(resolve("public", `.${url.pathname}`)), contentType: assets[ext] });
            return;
          } catch {
            // An unavailable fixture asset is reported by the response gate.
          }
        }
        await route.fulfill({ status: 404, body: `Unmapped academic reference request ${url.pathname}` });
      });

      try {
        const response = await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBe(200);
        await page.addStyleTag({ content: fixture.styles });
        await page.addStyleTag({ content: fontStyles });
        await page.addScriptTag({ content: fixture.script });
        await expect(page.locator("main").first()).toBeVisible({ timeout: 4000 });
        if (scenario.prepare) await scenario.prepare(page);
        await expect(page.getByText(scenario.ready, { exact: true }).filter({ visible: true }).first()).toBeVisible();
        await page.evaluate(async () => {
          await Promise.all([document.fonts.load("400 14px Inter"), document.fonts.load("700 18px Lexend")]);
        });
        await waitForVisualReadiness(page);
        expect(await page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          dpr: devicePixelRatio,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          fonts: document.fonts.check("400 14px Inter") && document.fonts.check("700 18px Lexend"),
        }))).toEqual({ width: viewport.width, dpr: deviceScaleFactor, overflow: false, fonts: true });
        const png = await page.screenshot({ animations: "disabled", caret: "hide", scale: "device", timeout: 20_000 });
        expect(errors).toEqual([]);
        const pngPath = `${id}.png`;
        await writeFile(resolve(snapshotDir, pngPath), png);
        captures.push({
          id, component: item.component, source: item.source, route: path, theme: scenario.theme,
          image: pngPath,
          width: png.readUInt32BE(16), height: png.readUInt32BE(20),
          bounds: { x: 0, y: 0, width: png.readUInt32BE(16), height: png.readUInt32BE(20) },
          sha256: createHash("sha256").update(png).digest("hex"),
        });
        console.log(`PASS ${id}`);
      } catch (error) {
        const failure = `${id}: ${error instanceof Error ? error.message : String(error)}${errors.length ? `\n${errors.join("\n")}` : ""}`;
        failures.push(failure);
        console.error(`FAIL ${failure}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

if (captures.length === 0 && failures.length === 0) throw new Error("No academic cases matched PARITY_CASES");
if (failures.length) throw new Error(failures.join("\n\n"));

const manifest = {
  sourceRevision,
  viewport, deviceScaleFactor, locale, timezoneId, clock,
  browser: `Chromium ${browserVersion}`,
  fonts: ["Inter 400-700", "Lexend 700"],
  captures,
};
await writeFile(resolve(snapshotDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
