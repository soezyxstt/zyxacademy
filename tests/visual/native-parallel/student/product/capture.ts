import { chromium, expect, type Locator, type Page } from "@playwright/test";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { localStudentCookie } from "./session";

const origin = new URL(process.env.BETTER_AUTH_URL ?? "").origin;
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Local product origin required");
const out = process.env.STUDENT_CAPTURE_DIR ?? "artifacts/student-evidence/product";
await mkdir(out, { recursive: true });
const platform = process.env.STUDENT_CAPTURE_PLATFORM ?? "android";
if (platform !== "android" && platform !== "ios") throw new Error("Expected android or ios capture target");
const viewport = platform === "android" ? { width: 380, height: 820 } : { width: 402, height: 874 };
const deviceScaleFactor = platform === "android" ? 1 : 3;

const scenarios = ["enrolled", "unenrolled", "revoked"] as const;
type Scenario = (typeof scenarios)[number];
const coursePath = "/courses/matematika-1";
const materialPath = coursePath + "/material";
const articleBody = "Catatan belajar mengenai Turunan.";
const routes = {
  dashboard: "/dashboard",
  catalog: "/courses",
  course: coursePath,
  "material-list": materialPath,
  "material-detail": materialPath + "/dokumen-4",
} as const;
type View = keyof typeof routes;
const selected = process.env.STUDENT_CAPTURE_CASES?.split(",").map(id => id.trim()).filter(Boolean);
const allCases = scenarios.flatMap(scenario => Object.keys(routes).map(view => `student-${scenario}-${view}`));
if (selected?.some(id => !allCases.includes(id))) throw new Error("Unknown Student course capture case");

function expectedContent(page: Page, view: View, scenario: Scenario): Record<string, Locator> {
  const main = page.locator("main").last();
  const courseLink = main.locator(`a[href="${coursePath}"]`).filter({ hasText: "Matematika I" });
  const activate = main.getByRole("button", { name: "Aktivasi kelas", exact: true });
  const courseSwitcher = page.getByRole("button", { name: "Ganti mata kuliah: Matematika I", exact: true });
  const enrolled = scenario === "enrolled";

  switch (view) {
    case "dashboard":
      return enrolled ? {
        "Kelas aktif": main.getByRole("heading", { name: "Kelas aktif", exact: true }),
        "Matematika I": courseLink,
      } : {
        "Course untukmu": main.getByRole("heading", { name: "Course untukmu", exact: true }),
        "Mulai bab 1": main.getByRole("link", { name: "Mulai bab 1", exact: true }),
      };
    case "catalog":
      return { "Matematika I": courseLink };
    case "course":
      return {
        "Ganti mata kuliah: Matematika I": courseSwitcher,
        "Silabus kelas": main.locator("h2").filter({ hasText: /^Silabus kelas$/ }),
        "Sistem bilangan real": main.getByText("Sistem bilangan real", { exact: true }),
        ...(enrolled
          ? { "Materi": main.locator(`a[href="${materialPath}/dokumen-1"]`).filter({ hasText: "4 dokumen tersedia" }) }
          : { "Aktivasi kelas": activate }),
      };
    case "material-list":
      return {
        "Ganti mata kuliah: Matematika I": courseSwitcher,
        "Semua": main.getByRole("tab", { name: "Semua", exact: true, selected: true }),
        "Sistem bilangan real": main.locator(`a[href="${materialPath}/dokumen-1"]`).filter({ hasText: "Sistem bilangan real" }),
        ...(enrolled ? {} : { "Aktivasi kelas": activate }),
      };
    case "material-detail":
      return enrolled ? {
        [articleBody]: main.locator("p").filter({ hasText: /^Catatan belajar mengenai Turunan\.$/ }),
        "Tandai selesai dan simpan": main.getByRole("button", { name: "Tandai selesai dan simpan", exact: true }),
        "Tandai selesai": page.getByRole("button", { name: "Tandai selesai", exact: true }),
      } : {
        "Ganti mata kuliah: Matematika I": courseSwitcher,
        "Aktifkan kelas untuk membuka \"Turunan\".": main.getByText('Aktifkan kelas untuk membuka "Turunan".', { exact: true }),
        "Aktivasi kelas": activate,
        "Masukkan token kelas": main.getByPlaceholder(/^Masukkan token kelas\b/),
      };
  }
}

async function isPaintedInViewport(locator: Locator): Promise<boolean> {
  return locator.evaluateAll(async elements => {
    // Playwright considers opacity: 0 visible. Wait for the app's reveal
    // animation and require the actual content to fit in the initial viewport.
    const painted = elements.filter(element => {
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        if (Number(getComputedStyle(ancestor).opacity) < 0.99) return false;
      }
      const rect = element.getBoundingClientRect();
      const front = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return Boolean(front && (element.contains(front) || front.contains(element)));
    });
    if (!painted.length) return false;

    return new Promise<boolean>(resolve => {
      const observer = new IntersectionObserver(entries => {
        observer.disconnect();
        resolve(entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.9));
      }, { threshold: 0.9 });
      for (const element of painted) observer.observe(element);
    });
  });
}

async function missingContent(expected: Record<string, Locator>): Promise<string[]> {
  const checks = await Promise.all(Object.entries(expected).map(async ([label, locator]) =>
    await isPaintedInViewport(locator) ? null : label
  ));
  return checks.filter(label => label !== null);
}

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
const results: Record<string, unknown>[] = [];
const serverSha = process.env.STUDENT_SERVER_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

try {
  for (const scenario of scenarios) {
    if (selected?.length && !selected.some(id => id.startsWith(`student-${scenario}-`))) continue;
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor,
      isMobile: true,
      hasTouch: true,
      locale: "id-ID",
      timezoneId: "Asia/Jakarta",
      colorScheme: "light",
      serviceWorkers: "block",
    });
    // Capture the course flows after the student has dismissed the profile prompt.
    await context.addInitScript(() => sessionStorage.setItem("zyx_dismiss_profile_prompt", "1"));
    await context.addCookies([{ ...await localStudentCookie(scenario), url: origin, httpOnly: true, sameSite: "Lax" }]);
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      return url.protocol === "data:" || url.origin === origin ? route.continue() : route.abort();
    });
    for (const [view, path] of Object.entries(routes) as [View, string][]) {
      const id = "student-" + scenario + "-" + view;
      if (selected?.length && !selected.includes(id)) continue;
      const reducedMotion = scenario === "enrolled" && (view === "dashboard" || view === "material-detail")
        ? "no-preference" : "reduce";
      const screenshotPath = join(out, id + ".png");
      await rm(screenshotPath, { force: true });
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion });
      const pageErrors: string[] = [];
      const hydrationWarnings = new Set<string>();
      page.on("pageerror", error => {
        if (error.message.startsWith("Hydration failed because the server rendered HTML didn't match the client")) {
          hydrationWarnings.add("React regenerated part of the server-rendered tree after a hydration mismatch.");
        } else {
          pageErrors.push(error.message);
        }
      });
      page.on("console", message => {
        if (message.text().startsWith("A tree hydrated but some attributes")) {
          hydrationWarnings.add("React reported server/client attribute differences during hydration.");
        }
      });
      try {
        const response = await page.goto(origin + path, { timeout: 240000, waitUntil: "load" });
        if (!response?.ok() || page.url() !== origin + path) {
          throw new Error(`HTTP ${response?.status()} at ${page.url()}`);
        }
        await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
        const expected = expectedContent(page, view, scenario);
        await page.evaluate(() => document.fonts.ready);
        let screenshot: Buffer | undefined;
        await expect.poll(async () => {
          if (await page.getByRole("dialog").count()) return ["An open dialog covers the course content"];
          const pending = await missingContent(expected);
          if (pending.length) return pending;

          const pixels = await page.screenshot({ animations: "disabled" });
          const missing = await missingContent(expected);
          if (!missing.length) screenshot = pixels;
          return missing;
        }, { timeout: 45000 }).toEqual([]);
        if (!screenshot) throw new Error("Screenshot unavailable");
        if (page.url() !== origin + path) throw new Error(`Unexpected navigation to ${page.url()}`);
        if (pageErrors.length) throw new Error(pageErrors.join(", "));
        if (scenario !== "enrolled" && view === "material-detail") {
          await expect(page.getByText(articleBody, { exact: true })).toHaveCount(0);
        }
        await writeFile(screenshotPath + ".tmp", screenshot);
        await rename(screenshotPath + ".tmp", screenshotPath);
        results.push({
          id, path, reducedMotion, status: response.status(), visibleContent: Object.keys(expected),
          ...(hydrationWarnings.size ? { hydrationWarnings: [...hydrationWarnings] } : {}),
        });
      } catch (error) {
        results.push({ id, path, reducedMotion, error: String(error).slice(0, 500) });
      } finally {
        await page.close();
      }
      console.log(id, results.at(-1)?.status ?? "capture unavailable", results.at(-1)?.error ?? "");
      await writeFile(join(out, "web.json.tmp"), JSON.stringify({
        serverSha, browser: browser.version(), theme: "light", locale: "id-ID",
        timezone: "Asia/Jakarta", ...viewport, dpr: deviceScaleFactor, results,
      }, null, 2) + "\n");
      await rename(join(out, "web.json.tmp"), join(out, "web.json"));
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (results.some(item => item.error)) process.exitCode = 1;
