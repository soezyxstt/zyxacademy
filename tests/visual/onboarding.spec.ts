import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { getTourSteps } from "../../lib/onboarding/tour-steps";
import type { TourRole } from "../../lib/onboarding/tour-state";
import id from "../../messages/id/onboarding.json";
import en from "../../messages/en/onboarding.json";

/**
 * Run against the local fixture server, not a deployed app:
 * bunx playwright test --config=playwright.onboarding.config.ts
 *
 * Production tour/navigation/settings/schedule components use fictional data.
 * The Zyra trigger/provider is real; the conversation pane is a local composition
 * of the production chat-frame primitives. No credentials or remote writes.
 */

const currentTarget = (page: Page) => page.locator("[data-tour-current]").first();
const panel = (page: Page) => page.locator("[data-tour-panel]");

test.beforeEach(async ({ baseURL }, info) => {
  test.skip(info.config.metadata.onboardingFixture !== true, "Use playwright.onboarding.config.ts for the isolated fixture");
  expect(baseURL).toBe("http://127.0.0.1:4319");
});

function checkBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  return errors;
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => { await document.fonts.ready; });
  // The guide moves its four scrims with a 220 ms animation. Capture the resting
  // position, after the menu's own entrance motion has also finished.
  if (!(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches))) await page.waitForTimeout(350);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = info.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

async function assertTargetLayout(page: Page) {
  await expect(currentTarget(page)).toBeVisible();
  await expect(page.locator("[data-tour-highlight]")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("[data-tour-current]");
    const card = document.querySelector<HTMLElement>("[data-tour-panel]");
    const outline = document.querySelector<HTMLElement>("[data-tour-highlight]");
    if (!target || !card || !outline) return false;
    const a = target.getBoundingClientRect();
    const b = card.getBoundingClientRect();
    const c = outline.getBoundingClientRect();
    const inside = b.left >= 0 && b.top >= 0 && b.right <= window.innerWidth + 1 && b.bottom <= window.innerHeight + 1;
    const separate = b.right <= a.left || b.left >= a.right || b.bottom <= a.top || b.top >= a.bottom;
    const outlined = c.left <= a.left + 1 && c.right >= a.right - 1 && c.top <= a.top + 1 && c.bottom >= a.bottom - 1;
    return inside && separate && outlined;
  }), { message: "The guide stays inside the viewport and leaves its target unobscured", timeout: 5000 }).toBe(true);
}

async function targetMatches(target: Locator, selector: string) {
  return target.evaluate((element, value) => element.matches(value), selector);
}

async function showStepTarget(page: Page, info: TestInfo, selector: string, name: string) {
  for (let reveal = 0; reveal < 4; reveal++) {
    await assertTargetLayout(page);
    const target = currentTarget(page);
    if (await targetMatches(target, selector)) return target;
    const oldDescription = await target.evaluate(element => `${element.tagName}|${element.getAttribute("data-tour")}|${element.getAttribute("href")}|${element.getAttribute("data-slot")}`);
    await capture(page, info, `${name}-reveal-${reveal + 1}`);
    // A native dialog may finish mounting while a reveal capture is taken.
    // Recheck the current target so this helper never clicks the new goal
    // as though it were still the menu trigger.
    if (await targetMatches(currentTarget(page), selector)) return currentTarget(page);
    const latest = await currentTarget(page).evaluate(element => `${element.tagName}|${element.getAttribute("data-tour")}|${element.getAttribute("href")}|${element.getAttribute("data-slot")}`);
    if (latest !== oldDescription) continue;
    await target.click();
    await expect.poll(async () => {
      const next = currentTarget(page);
      if (!(await next.count())) return false;
      return next.evaluate((element, old) => `${element.tagName}|${element.getAttribute("data-tour")}|${element.getAttribute("href")}|${element.getAttribute("data-slot")}` !== old, oldDescription);
    }, { timeout: 5000 }).toBe(true);
  }
  throw new Error(`Tour did not reveal ${selector}`);
}

async function openFixture(page: Page, options: { role: TourRole; course?: boolean; locale?: "id" | "en"; theme?: "light" | "dark"; path?: string }) {
  const query = new URLSearchParams({ role: options.role, course: options.course === false ? "0" : "1", locale: options.locale ?? "id", theme: options.theme ?? "light" });
  const response = await page.goto(`${options.path ?? "/"}?${query}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await page.waitForFunction(() => Boolean(window.__tourFixture));
}

for (const role of ["student", "tutor"] as const) {
  for (const course of [true, false]) {
    const variant = `${role}-${course ? "course" : "general"}`;
    test(`${variant}: invitation and all nine steps`, async ({ page }, info) => {
      test.setTimeout(90_000);
      const errors = checkBrowserErrors(page);
      await openFixture(page, { role, course });
      await expect(page.getByRole("button", { name: id.actions.start, exact: true })).toBeVisible();
      await capture(page, info, `${variant}-00-invitation`);
      await page.getByRole("button", { name: id.actions.start, exact: true }).click();
      const steps = getTourSteps(role, course ? "matematika-1" : null, (page.viewportSize()?.width ?? 0) < 768);
      for (const [index, step] of steps.entries()) {
        await expect(panel(page)).toHaveAttribute("data-tour-step", String(index));
        const name = `${variant}-${String(index + 1).padStart(2, "0")}-${step.id}`;
        const target = await showStepTarget(page, info, step.selector, name);
        await capture(page, info, name);
        const before = await page.evaluate(() => window.__tourFixture.readState()?.stepIndex);
        await page.mouse.click(2, 2);
        expect(await page.evaluate(() => window.__tourFixture.readState()?.stepIndex)).toBe(before);
        await target.click();
      }
      await expect(panel(page)).toHaveCount(0);
      expect(await page.evaluate(() => window.__tourFixture.readState()?.status)).toBe("completed");
      await capture(page, info, `${variant}-10-completed`);
      expect(errors).toEqual([]);
    });
  }

  test(`${role}: English and dark theme`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const errors = checkBrowserErrors(page);
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await openFixture(page, { role, locale: "en", theme: "dark" });
    await expect(page.getByRole("button", { name: en.actions.start, exact: true })).toBeVisible();
    await capture(page, info, `${role}-en-dark-invitation`);
    await page.getByRole("button", { name: en.actions.start, exact: true }).click();
    const steps = getTourSteps(role, "matematika-1", (page.viewportSize()?.width ?? 0) < 768);
    for (const [index, step] of steps.entries()) {
      await expect(panel(page)).toHaveAttribute("data-tour-step", String(index));
      const target = await showStepTarget(page, info, step.selector, `${role}-en-dark-${index + 1}`);
      if ([0, 3, 8].includes(index)) await capture(page, info, `${role}-en-dark-${String(index + 1).padStart(2, "0")}-${step.id}`);
      await target.click();
    }
    await expect(panel(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__tourFixture.readState()?.status)).toBe("completed");
    expect(errors).toEqual([]);
  });
}

test("skip persists and preferences can restart the tour", async ({ page }, info) => {
  const errors = checkBrowserErrors(page);
  await openFixture(page, { role: "student", course: false });
  await page.getByRole("button", { name: id.actions.skip, exact: true }).click();
  await expect(page.getByRole("button", { name: id.actions.start, exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__tourFixture.readState()?.status)).toBe("skipped");
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__tourFixture));
  await expect(page.getByRole("button", { name: id.actions.start, exact: true })).toHaveCount(0);
  await openFixture(page, { role: "student", course: false, path: "/settings" });
  await page.getByRole("button", { name: id.actions.replay, exact: true }).click();
  await expect(page.getByRole("button", { name: id.actions.start, exact: true })).toBeVisible();
  await capture(page, info, "restart-invitation");
  await page.getByRole("button", { name: id.actions.start, exact: true }).click();
  await expect(panel(page)).toHaveAttribute("data-tour-step", "0");
  await assertTargetLayout(page);
  await page.getByRole("button", { name: id.actions.end, exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__tourFixture.readState()?.status)).toBe("skipped");
  expect(errors).toEqual([]);
});

test("reload resumes saved progress and keyboard activation stays in the guide", async ({ page }, info) => {
  const errors = checkBrowserErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page, { role: "student", course: false });
  await page.getByRole("button", { name: id.actions.start, exact: true }).click();
  await assertTargetLayout(page);
  await currentTarget(page).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: id.actions.end, exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(currentTarget(page)).toBeFocused();
  await capture(page, info, "keyboard-target-focus");
  await page.keyboard.press("Enter");
  await expect(panel(page)).toHaveAttribute("data-tour-step", "1");
  await page.reload();
  await expect(page.getByRole("button", { name: id.actions.resume, exact: true })).toBeVisible();
  await capture(page, info, "resume-invitation");
  await page.getByRole("button", { name: id.actions.resume, exact: true }).click();
  await expect(panel(page)).toHaveAttribute("data-tour-step", "1");
  await assertTargetLayout(page);
  await capture(page, info, "resumed-step");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__tourFixture.readState()?.status)).toBe("skipped");
  expect(await page.evaluate(() => document.querySelectorAll("[data-tour-inert]").length)).toBe(0);
  expect(errors).toEqual([]);
});

test("failed progress save offers retry without advancing", async ({ page }, info) => {
  const errors = checkBrowserErrors(page);
  await openFixture(page, { role: "student", course: false });
  await page.getByRole("button", { name: id.actions.start, exact: true }).click();
  await assertTargetLayout(page);
  await page.evaluate(() => { window.__tourFixture.failNextSave = true; });
  await currentTarget(page).click();
  await expect(page.getByRole("button", { name: id.actions.retry, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__tourFixture.readState()?.stepIndex)).toBe(0);
  await capture(page, info, "save-failure");
  await page.getByRole("button", { name: id.actions.retry, exact: true }).click();
  await expect(panel(page)).toHaveAttribute("data-tour-step", "1");
  await assertTargetLayout(page);
  await capture(page, info, "save-retry-success");
  expect(errors).toEqual([]);
});

for (const role of ["student", "tutor"] as const) test(`${role} menu targets support keyboard activation`, async ({ page }, info) => {
  const errors = checkBrowserErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page, { role, course: false });
  await page.getByRole("button", { name: id.actions.start, exact: true }).click();
  const steps = getTourSteps(role, null, (page.viewportSize()?.width ?? 0) < 768);
  for (const [index, step] of steps.entries()) {
    await expect(panel(page)).toHaveAttribute("data-tour-step", String(index));
    const target = await showStepTarget(page, info, step.selector, `keyboard-${role}-${step.id}`);
    await target.focus();
    await expect(target).toBeFocused();
    if ((role === "tutor" && index === 3) || (role === "student" && index === 8)) await capture(page, info, `keyboard-${role}-${step.id}-focus`);
    await page.keyboard.press("Enter");
  }
  await expect(panel(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__tourFixture.readState()?.status)).toBe("completed");
  expect(errors).toEqual([]);
});

test("a restarted tour in another tab requires a fresh choice before navigation", async ({ page }) => {
  const errors = checkBrowserErrors(page);
  await openFixture(page, { role: "student", course: false });
  await page.getByRole("button", { name: id.actions.start, exact: true }).click();
  await assertTargetLayout(page);
  const before = new URL(page.url()).pathname;
  await page.evaluate(() => {
    const state = window.__tourFixture.readState()!;
    window.__tourFixture.seedState({ ...state, generation: state.generation + 1, courseId: "matematika-1", stepIndex: 1 });
  });
  await currentTarget(page).click();
  await expect(page.getByRole("button", { name: id.actions.resume, exact: true })).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe(before);
  expect(await page.evaluate(() => window.__tourFixture.readState()?.stepIndex)).toBe(1);
  expect(errors).toEqual([]);
});

test("resume finds the language control from the Appearance tab", async ({ page }, info) => {
  const errors = checkBrowserErrors(page);
  await openFixture(page, { role: "student", course: false, path: "/settings" });
  await page.evaluate(() => {
    window.__tourFixture.seedState({ version: 1, generation: 1, status: "in_progress", stepIndex: 8, courseId: null, updatedAt: "2026-11-25T12:00:00.000Z" });
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "appearance");
    window.history.replaceState({}, "", url);
  });
  await page.reload();
  await page.getByRole("button", { name: id.actions.resume, exact: true }).click();
  await expect(panel(page)).toHaveAttribute("data-tour-step", "8");
  const target = await showStepTarget(page, info, '[data-tour="language"]', "resume-language");
  await capture(page, info, "resume-language-general");
  await target.click();
  await expect(panel(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__tourFixture.readState()?.status)).toBe("completed");
  expect(errors).toEqual([]);
});
