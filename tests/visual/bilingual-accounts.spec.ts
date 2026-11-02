import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { stubVisualTelemetry } from "@/tests/visual/telemetry-stubs";
import { waitForVisualReadiness } from "@/tests/visual/visual-readiness";

test.setTimeout(90_000);
test.use({ reducedMotion: "reduce" });

test.beforeEach(async ({ page }) => {
  await stubVisualTelemetry(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
});

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const localBase = ["127.0.0.1", "localhost", "::1"].includes(new URL(baseURL).hostname);
const statePath = (role: "student" | "admin" | "tutor") => resolve(`artifacts/bilingual/${role}-auth.json`);
const accountFixturesReady = localBase
  && process.env.BILINGUAL_ACCOUNT_STORAGE_STATES === "1"
  && (["student", "admin", "tutor"] as const).every((role) => existsSync(statePath(role)));

type PageDiagnostics = { runtime: string[]; console: string[]; failedRequests: string[]; badResponses: string[] };

function collectDiagnostics(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = { runtime: [], console: [], failedRequests: [], badResponses: [] };
  page.on("pageerror", (error) => diagnostics.runtime.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.console.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (!request.failure()?.errorText.includes("ERR_ABORTED")) {
      diagnostics.failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) diagnostics.badResponses.push(`${response.status()} ${response.url()}`);
  });
  return diagnostics;
}

async function expectNoOverflowAndErrors(page: Page, diagnostics: PageDiagnostics) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document, "horizontal page overflow").toBeLessThanOrEqual(dimensions.viewport);
  expect(diagnostics.runtime, "uncaught browser errors").toEqual([]);
  expect(diagnostics.console, "console errors").toEqual([]);
  expect(diagnostics.failedRequests, "failed network requests").toEqual([]);
  expect(diagnostics.badResponses, "HTTP responses with status >= 400").toEqual([]);
}

async function openAccountLanguageMenu(page: Page, role: "student" | "admin" | "tutor") {
  const mobileNavigation = page.getByRole("button", { name: /open navigation|buka navigasi/i });
  if (await mobileNavigation.isVisible()) await mobileNavigation.click();
  const emailTrigger = page.getByRole("button", { name: new RegExp(`bilingual-${role}@example\\.invalid`) });
  if (await emailTrigger.count() === 1) {
    await emailTrigger.click();
  } else {
    const displayName = role[0].toUpperCase() + role.slice(1);
    await page.getByRole("button", { name: new RegExp(`(?:Account|Akun) \\(Bilingual ${displayName} Fixture\\)`, "i") }).click();
  }
}

async function switchAccountLanguage(page: Page, language: "English" | "Bahasa Indonesia", role: "student" | "admin" | "tutor") {
  await openAccountLanguageMenu(page, role);
  await page.getByRole("menuitemradio", { name: language, exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", language === "English" ? "en" : "id");
  const mobileNavigation = page.getByRole("button", { name: /open navigation|buka navigasi/i });
  if (await mobileNavigation.isVisible()) {
    const closeSidebar = page.getByRole("button", { name: /close sidebar|tutup sidebar/i });
    if (await closeSidebar.isVisible()) await closeSidebar.click();
  }
}

test.describe("student account locale and profile draft", () => {
  test.use({ storageState: existsSync(statePath("student")) ? statePath("student") : undefined });
  test.skip(!accountFixturesReady, "Set BILINGUAL_ACCOUNT_STORAGE_STATES=1 and seed the ignored local-only auth fixtures to run account browser checks.");

  test("/profile/edit keeps academic draft selections while account language saves and rerenders", async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    await page.goto("/profile/edit");
    await expect(page).toHaveURL(/\/profile\/edit$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
    await expect(page.getByRole("heading", { name: "Edit profil akademis" })).toBeVisible();

    const facultyId = page.getByRole("combobox", { name: "Fakultas atau sekolah ITB" });
    await facultyId.click();
    await page.getByRole("option").first().click();
    const majorId = page.getByRole("combobox", { name: "Jurusan atau program studi" });
    await majorId.click();
    await page.getByRole("option").first().click();
    const facultyDraft = (await facultyId.innerText()).trim();
    const majorDraft = (await majorId.innerText()).trim();
    await waitForVisualReadiness(page);
    await page.screenshot({ path: testInfo.outputPath("student-profile-draft-id.png"), fullPage: true });

    await switchAccountLanguage(page, "English", "student");
    await expect(page.getByRole("heading", { name: "Edit academic profile" })).toBeVisible();
    const facultyEn = page.getByRole("combobox", { name: "ITB faculty or school" });
    const majorEn = page.getByRole("combobox", { name: "Major or study program" });
    await expect(facultyEn).toHaveText(facultyDraft);
    await expect(majorEn).toHaveText(majorDraft);
    await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === "zyx_locale")?.value).toBe("en");
    await waitForVisualReadiness(page);
    await page.screenshot({ path: testInfo.outputPath("student-profile-draft-en.png"), fullPage: true });

    await switchAccountLanguage(page, "Bahasa Indonesia", "student");
    await expect(page.getByRole("heading", { name: "Edit profil akademis" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Fakultas atau sekolah ITB" })).toHaveText(facultyDraft);
    await expect(page.getByRole("combobox", { name: "Jurusan atau program studi" })).toHaveText(majorDraft);
    await expectNoOverflowAndErrors(page, diagnostics);
  });

  test("saved account language wins a conflicting locale cookie after reload", async ({ page, context }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
    await context.addCookies([{ name: "zyx_locale", value: "en", url: baseURL, sameSite: "Lax" }]);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
    await expect.poll(async () => (await context.cookies()).find((cookie) => cookie.name === "zyx_locale")?.value).toBe("id");
    await waitForVisualReadiness(page);
    await page.screenshot({ path: testInfo.outputPath("student-account-preference-wins.png"), fullPage: true });
    await expectNoOverflowAndErrors(page, diagnostics);
  });
});

test.describe("bilingual real quiz and file state fixture", () => {
  // This test mounts the production QuizPlayer and FileUploadField under the real locale provider. The reading pane is a synthetic scroll-state fixture, and both quiz upload/submit endpoints are intercepted; it does not exercise authored course content or live APIs.
  test("actual QuizPlayer answers, timer, attachment, FileUploadField, and reader position survive a locale switch", async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    const apiPosts: string[] = [];
    await page.addInitScript(() => { try { localStorage.clear(); } catch { /* about:blank has no storage origin */ } });
    await page.route("**/api/quiz/attachments", async (route) => {
      if (route.request().method() === "POST") {
        apiPosts.push("attachment");
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, fileName: "essay-answer.pdf", fileSize: "12 B", key: "fixture/essay-answer.pdf" }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    });
    await page.route("**/api/quiz/attempts/**", async (route) => {
      if (route.request().method() === "POST") apiPosts.push("attempt");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    });

    await page.goto("/visual-fixtures/bilingual?locale=id&mode=quiz");
    await expect(page.getByTestId("locale-heading")).toHaveText("Fixture status kuis");
    const reader = page.getByTestId("reader-scroll");
    await reader.evaluate((element) => { element.scrollTop = 60; });

    await page.getByRole("radio", { name: /Choice B/ }).click();
    await expect(page.getByRole("radio", { name: /Choice B/ })).toHaveAttribute("aria-checked", "true");
    const timer = page.locator('[title="Total sisa waktu kuis"], [title="Total quiz time remaining"]');
    const secondsBefore = (await timer.innerText()).trim();
    await page.getByRole("button", { name: /^(Lanjut|Next)$/ }).click();
    await page.locator('input[type="file"][accept=".pdf,image/*"]').setInputFiles({
      name: "essay-answer.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("synthetic quiz fixture"),
    });
    await expect(page.getByText("essay-answer.pdf", { exact: true })).toBeVisible();

    await page.locator("#fixture-file-upload").setInputFiles({
      name: "reader-handout.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("synthetic FileUploadField fixture"),
    });
    await expect(page.getByTestId("fixture-uploaded-files")).toHaveText("reader-handout.pdf");
    await expect(page.locator("p").filter({ hasText: "reader-handout.pdf" })).toHaveText("reader-handout.pdf");
    await waitForVisualReadiness(page);
    await page.screenshot({ path: testInfo.outputPath("real-quiz-state-before-switch.png"), fullPage: true });

    const languageToggle = page.getByRole("button", {
      name: /(?:Switch language to|Ganti bahasa ke) English/i,
    });
    await expect(languageToggle).toBeVisible();
    await languageToggle.click();
    await expect(page.getByTestId("locale-heading")).toHaveText("Quiz state fixture");
    await expect(page.getByText("essay-answer.pdf", { exact: true })).toBeVisible();
    await expect(page.getByTestId("fixture-uploaded-files")).toHaveText("reader-handout.pdf");
    await expect(page.locator("p").filter({ hasText: "reader-handout.pdf" })).toHaveText("reader-handout.pdf");
    await expect(reader).toHaveJSProperty("scrollTop", 60);

    await page.getByRole("button", { name: /^(Previous|Sebelumnya)$/ }).click();
    await expect(page.getByRole("radio", { name: /Choice B/ })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: /^(Next|Lanjut)$/ }).click();
    await expect(page.getByText("essay-answer.pdf", { exact: true })).toBeVisible();
    const secondsAfter = (await timer.innerText()).trim();
    expect(secondsAfter).toMatch(/^\d+:\d{2}$/);
    expect(secondsBefore).toMatch(/^\d+:\d{2}$/);
    const toSeconds = (time: string) => { const [minutes, seconds] = time.split(":").map(Number); return minutes * 60 + seconds; };
    expect(toSeconds(secondsAfter)).toBeLessThanOrEqual(toSeconds(secondsBefore));
    expect(toSeconds(secondsBefore) - toSeconds(secondsAfter)).toBeLessThan(20);
    expect(apiPosts).toEqual(["attachment"]);
    await waitForVisualReadiness(page);
    await page.screenshot({ path: testInfo.outputPath("real-quiz-state-after-switch.png"), fullPage: true });
    await expectNoOverflowAndErrors(page, diagnostics);
  });
});

test.describe("admin and tutor app headers follow their account locale", () => {
  for (const role of ["admin", "tutor"] as const) {
    test.describe(role, () => {
      test.use({ storageState: existsSync(statePath(role)) ? statePath(role) : undefined });
      test.skip(!accountFixturesReady, "Set BILINGUAL_ACCOUNT_STORAGE_STATES=1 and seed the ignored local-only auth fixtures to run account browser checks.");

      test(`${role} route title and account language menu update in both locales`, async ({ page }, testInfo) => {
        const diagnostics = collectDiagnostics(page);
        const route = role === "admin" ? "/admin/schedules" : "/tutor";
        const englishHeading = role === "admin" ? "Academic schedule and calendar" : "Tutor dashboard";
        const indonesianHeading = role === "admin" ? "Jadwal & Kalender Akademik" : "Dashboard pengajar";
        const englishMobileTitle = role === "admin" ? "Shared schedule" : "Tutor dashboard";
        const indonesianMobileTitle = role === "admin" ? "Jadwal umum" : "Dashboard pengajar";

        await page.goto(route);
        await expect(page).toHaveURL(new RegExp(`${route.replaceAll("/", "\\/")}$`));
        await expect(page.locator("html")).toHaveAttribute("lang", role === "admin" ? "en" : "id");
        if (testInfo.project.name === "mobile-380") {
          const header = page.getByRole("banner");
          await expect(header.getByText(role === "admin" ? englishMobileTitle : indonesianMobileTitle, { exact: true })).toBeVisible();
        } else {
          await expect(page.getByRole("heading", { name: role === "admin" ? englishHeading : indonesianHeading })).toBeVisible();
        }
        await waitForVisualReadiness(page);
        await page.screenshot({ path: testInfo.outputPath(`${role}-route-before-switch.png`), fullPage: true });

        const target = role === "admin" ? "Bahasa Indonesia" : "English";
        await switchAccountLanguage(page, target, role);
        if (testInfo.project.name === "mobile-380") {
          const header = page.getByRole("banner");
          await expect(header.getByText(role === "admin" ? indonesianMobileTitle : englishMobileTitle, { exact: true })).toBeVisible();
        } else {
          await expect(page.getByRole("heading", { name: role === "admin" ? indonesianHeading : englishHeading })).toBeVisible();
        }
        await waitForVisualReadiness(page);
        await page.screenshot({ path: testInfo.outputPath(`${role}-route-after-switch.png`), fullPage: true });

        const restore = role === "admin" ? "English" : "Bahasa Indonesia";
        await switchAccountLanguage(page, restore, role);
        await openAccountLanguageMenu(page, role);
        await expect(page.getByRole("menuitemradio", { name: restore, exact: true })).toHaveAttribute("aria-checked", "true");
        await expectNoOverflowAndErrors(page, diagnostics);
      });
    });
  }
});
