import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, expect, type Locator } from "@playwright/test";
import { learningEndpoint } from "../../../../../packages/native-parity/student/courses/contract";
import { dashboardStates } from "../../../../../packages/native-parity/student/dashboard/fixtures";
import { localStudentCookie } from "./session";

const origin = new URL(process.env.BETTER_AUTH_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname), "Expected the local product origin");
const platform = process.env.STUDENT_DASHBOARD_PLATFORM;
assert.ok(platform === "android" || platform === "ios", "Set STUDENT_DASHBOARD_PLATFORM to android or ios");
const viewport = platform === "android" ? { width: 380, height: 820 } : { width: 402, height: 874 };
const deviceScaleFactor = platform === "android" ? 1 : 3;
const out = join(process.env.STUDENT_CAPTURE_DIR ?? "artifacts/student-evidence/dashboard/web", platform);
const fixturePath = "packages/native-parity/student/dashboard/responses.json";
const seedPath = "tests/visual/native-parallel/student/product/seed.ts";
const refreshPath = process.env.STUDENT_DASHBOARD_RECORD_RESPONSES;
const navigationTimeout = 240000;

const digest = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const serverSha = process.env.STUDENT_SERVER_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const content = {
  enrolled: ["Pencapaian", "Rakyat", "0 XP", "0 LP", "Kelas aktif", "Aktivasi kelas", "Matematika I", "0/4 materi", "Spaced repetition", "Semua kartu tuntas", "Buka flashcard Matematika I", "Kuis dan tryout tersedia", "Semua ujian telah selesai", "Peta penguasaan (Matematika I)"],
  preview: ["Course untukmu", "Bab pertama gratis di setiap mata kuliah.", "Paket Free", "Matematika I", "Premium", "Mulai bab 1", "1 bab gratis", "1 materi", "0 kuis", "0/1 materi", "Sistem bilangan real", "Yang tersedia di Free", "Progres tersimpan"],
};
const shellLabels = ["Dashboard Siswa", "Streak: 0 hari", "Cari", "Notifikasi"];

async function visiblyPainted(locator: Locator): Promise<boolean> {
  return locator.evaluateAll(async elements => {
    const painted = elements.filter(element => {
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      for (let node: Element | null = element; node; node = node.parentElement) {
        if (Number(getComputedStyle(node).opacity) < 0.99) return false;
      }
      return true;
    });
    if (!painted.length) return false;
    return new Promise<boolean>(resolve => {
      const observer = new IntersectionObserver(entries => {
        observer.disconnect();
        resolve(entries.some(entry => entry.intersectionRatio >= 0.9));
      }, { threshold: 0.9 });
      for (const item of painted) observer.observe(item);
    });
  });
}

await mkdir(out, { recursive: true });
await rm(join(out, "dashboard-reference.json"), { force: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
const captures: Record<string, string> = {};
const states: Record<string, unknown> = {};
const capturedResponses: Record<string, unknown> = {};

try {
  for (const state of dashboardStates) {
    const file = `dashboard-${state}.png`;
    await rm(join(out, file), { force: true });
    const owner = `student-evidence-${state}`;
    const cookie = await localStudentCookie(state);
    const context = await browser.newContext({
      viewport, deviceScaleFactor, isMobile: true, hasTouch: true, locale: "id-ID",
      colorScheme: "light", timezoneId: "Asia/Jakarta", serviceWorkers: "block",
      // The enrolled product uses animated viewport reveals even without any learning progress.
      reducedMotion: state === "enrolled" ? "no-preference" : "reduce",
    });
    try {
      await context.addInitScript(accountId => {
        sessionStorage.setItem("zyx_dismiss_profile_prompt", "1");
        // This comparison captures the returning-student dashboard after its dismissible prompts.
        const now = Date.now();
        localStorage.setItem(`zyx:download-reminder:${accountId}`, String(now));
        localStorage.setItem(`zyx:notification-permission:${accountId}`, `later:${now}`);
      }, owner);
      await context.addCookies([{ ...cookie, url: origin.origin, httpOnly: true, sameSite: "Lax" }]);
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        return url.protocol === "data:" || url.origin === origin.origin ? route.continue() : route.abort();
      });
      const headers = { cookie: `${cookie.name}=${cookie.value}`, "x-student-id": owner, "x-app-locale": "id" };
      const readJson = async (path: string) => {
        const response = await fetch(new URL(path, origin), {
          headers, redirect: "error", signal: AbortSignal.timeout(navigationTimeout),
        }).catch(() => { throw new Error(`${state}: Request failed for ${path}`); });
        assert.equal(response.status, 200, `${state}: ${path}`);
        return response.json();
      };
      const dashboard = await readJson(learningEndpoint({ view: "dashboard" }));
      const extras = await readJson(learningEndpoint({ view: "dashboard-extras" }));
      assert.equal(dashboard.enrolled.length, state === "enrolled" ? 1 : 0, state);
      assert.equal(dashboard.firstName, { enrolled: "Alya", unenrolled: "Bima", revoked: "Citra" }[state]);
      assert.ok(!extras.partial, `Incomplete dashboard extras for ${state}`);
      capturedResponses[state] = { dashboard, extras };
      // Warm the distinct route the browser navbar consumes. Its client request
      // otherwise races cold dev compilation and has automatic retry disabled.
      const today = await readJson("/api/student/today");
      assert.equal(today.streak.current, 0, `${state}/streak`);

      const page = await context.newPage();
      const recoveredErrors = new Set<string>();
      const errors: string[] = [];
      page.on("pageerror", error => {
        if (error.message.startsWith("Hydration failed because the server rendered HTML didn't match the client")) {
          recoveredErrors.add("React regenerated a mismatched server subtree.");
        } else errors.push(error.message);
      });
      const target = new URL("/dashboard", origin).href;
      const response = await page.goto(target, { timeout: navigationTimeout, waitUntil: "load" });
      assert.equal(response?.status(), 200);
      assert.equal(page.url(), target);
      await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
      await page.evaluate(() => document.fonts.ready);
      const display = await page.evaluate(() => ({ locale: document.documentElement.lang, dpr: window.devicePixelRatio }));
      assert.deepEqual(display, { locale: "id", dpr: deviceScaleFactor });
      const main = page.locator("main").last();
      const navbar = page.locator("[data-mobile-navbar]");
      const shell = [
        navbar.getByText(shellLabels[0], { exact: true }),
        navbar.getByRole("link", { name: shellLabels[1], exact: true }),
        navbar.getByRole("button", { name: shellLabels[2], exact: true }),
        navbar.getByRole("button", { name: shellLabels[3], exact: true }),
      ];
      const expected = state === "enrolled" ? content.enrolled : content.preview;
      const locators = [...expected.map(label => main.getByText(label, { exact: true })), ...shell];
      const labels = [...expected, ...shellLabels];
      const otherHeading = state === "enrolled" ? "Course untukmu" : "Kelas aktif";
      const missingContent = async () => (await Promise.all(locators.map(async (locator, index) =>
        await visiblyPainted(locator) ? "" : labels[index]))).filter(Boolean);
      let screenshot: Buffer | undefined;
      await expect.poll(async () => {
        const dialog = page.getByRole("dialog");
        if (await dialog.count()) return ["Open dialog covers dashboard", ...(await dialog.getByRole("heading").allTextContents())];
        const pending = await missingContent();
        if (pending.length) return pending;
        const pixels = await page.screenshot({ animations: "disabled", scale: "device" });
        const missing = await missingContent();
        if (!missing.length) screenshot = pixels;
        return missing;
      }, { timeout: 90000 }).toEqual([]);
      assert.ok(screenshot);
      await expect(main.getByText(otherHeading, { exact: true })).toHaveCount(0);
      if (state === "enrolled") {
        await expect(main.getByRole("link").filter({ hasText: "Matematika I" }).and(main.locator('a[href="/courses/matematika-1"]'))).toHaveCount(1);
      } else {
        await expect(main.getByRole("link", { name: "Mulai bab 1" })).toHaveAttribute("href", "/courses/matematika-1/material/dokumen-1");
      }
      assert.deepEqual(errors, []);
      assert.equal(page.url(), target);
      await writeFile(join(out, file), screenshot);
      captures[file] = digest(screenshot);
      states[state] = { enrolled: state === "enrolled", firstName: dashboard.firstName, checkedVisibleContent: expected,
        checkedVisibleShell: shellLabels, absentHeading: otherHeading, ...(recoveredErrors.size ? { hydrationWarnings: [...recoveredErrors] } : {}) };
      console.log(platform, state, response?.status());
    } finally {
      await context.close();
    }
  }
  if (refreshPath) await writeFile(refreshPath, JSON.stringify(capturedResponses, null, 2) + "\n");
  const fixture = await readFile(refreshPath || fixturePath);
  assert.deepEqual(JSON.parse(fixture.toString()), capturedResponses, "Expo fixture must match the seeded product endpoint responses");
  await writeFile(join(out, "dashboard-reference.json.tmp"), JSON.stringify({
    platform, viewport, deviceScaleFactor, locale: "id-ID", theme: "light", timezone: "Asia/Jakarta",
    route: "/dashboard", source: "authenticated Next.js product route on seeded PostgreSQL",
    serverSha, browser: browser.version(), seedSha256: digest(await readFile(seedPath)),
    fixtureSha256: digest(fixture), states, captures,
  }, null, 2) + "\n");
  await rename(join(out, "dashboard-reference.json.tmp"), join(out, "dashboard-reference.json"));
} finally {
  await browser.close();
}
