import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { stubVisualTelemetry } from "./telemetry-stubs";
import { waitForVisualReadiness } from "./visual-readiness";

const fixture = "/visual-fixtures/student-polish";
test.use({ locale: "en-GB", colorScheme: "dark", reducedMotion: "reduce" });
test.setTimeout(180_000);

async function prepare(page: Page) {
  await stubVisualTelemetry(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  return errors;
}

async function visit(page: Page, view: string) {
  expect((await page.goto(`${fixture}?view=${view}`, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(fixture);
  await expect(page.locator("[data-student-fixture-ready]")).toBeAttached({ timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

async function capture(page: Page, info: TestInfo, name: string) {
  await waitForVisualReadiness(page);
  await expect.poll(() => page.locator("[data-page-transition]").evaluate(el => getComputedStyle(el).opacity)).toBe("1");
  await expect.poll(() => page.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: "disabled", caret: "initial" });
  await info.attach(name, { path, contentType: "image/png" });
}

test("quiz keeps focus, selections, flags, progress and submit confirmation", async ({ page }, info) => {
  const errors = await prepare(page);
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));
  await visit(page, "quiz");
  const mobile = info.project.name === "mobile-380";
  await expect(page.locator(`[data-quiz-layout="${mobile ? "mobile" : "desktop"}"]`)).toBeVisible();
  const appNavigation = page.locator("[data-mobile-bottom-nav]");
  const quizNavigation = page.locator("[data-quiz-mobile-bottombar]");
  if (mobile) {
    await expect(appNavigation).toBeHidden();
    await expect(quizNavigation.getByRole("button")).toHaveCount(2);
    await expect(quizNavigation.getByRole("button", { name: "Previous" })).toBeDisabled();
    await expect(quizNavigation.getByRole("button", { name: "Next", exact: true })).toBeVisible();
    expect(await quizNavigation.evaluate(element => {
      return Math.abs(element.getBoundingClientRect().bottom - window.innerHeight);
    })).toBeLessThanOrEqual(1);
  }
  await expect(page.getByRole("button", { name: /submit/i })).toHaveCount(0);
  await expect(page.getByRole("timer")).toHaveCount(2);
  const progress = page.getByRole("progressbar");
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  const firstOption = page.locator("[data-question-option]").first();
  await expect(firstOption).toHaveCSS("border-top-width", "0px");
  expect((await firstOption.boundingBox())?.height).toBeLessThanOrEqual(48);
  await capture(page, info, "quiz-unanswered");

  const answer = page.getByRole("radio", { name: /Lima/ });
  await answer.click();
  await expect(answer).toBeChecked();
  await expect(progress).toHaveAttribute("aria-valuenow", "50");
  const flag = page.getByRole(mobile ? "button" : "checkbox", { name: /flag question/i }).first();
  await flag.click();
  if (mobile) {
    await expect(flag).toHaveAttribute("aria-pressed", "true");
    const map = page.getByRole("button", { name: "Question navigation" });
    await map.click();
    const active = page.getByRole("dialog").locator('button[aria-current="step"]');
    await expect(active).toHaveAccessibleName(/flagged/i);
    await capture(page, info, "quiz-question-map");
    await active.click();
    await expect(map).toBeFocused();
  } else {
    await expect(flag).toBeChecked();
  }
  await capture(page, info, "quiz-selected-and-flagged");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const submit = page.getByRole("button", { name: "Submit answers", exact: true });
  await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
  if (mobile) {
    await expect(quizNavigation.getByRole("button")).toHaveCount(2);
    expect(await submit.evaluate(button => {
      return Math.abs(button.getBoundingClientRect().right - button.parentElement!.getBoundingClientRect().right);
    })).toBeLessThanOrEqual(1);
  }
  const review = page.getByRole("button", { name: "Review again" });
  await submit.click();
  await expect(page.getByRole("dialog").getByText(/unanswered/i)).toBeVisible();
  await expect(review).toBeFocused();
  await capture(page, info, "quiz-confirmation-incomplete");
  await review.click();
  await expect(submit).toBeFocused();
  await page.locator("textarea").fill("Substitusi langsung pada fungsi kontinu.");
  await capture(page, info, "quiz-written-answer");
  await submit.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, info, "quiz-confirmation");
  await page.getByRole("button", { name: "Yes, submit" }).click();
  await expect(page.getByText("Fixture answer submitted")).toBeVisible();
  if (mobile) await expect(appNavigation).toBeHidden();
  expect(errors).toEqual([]);
});

test.describe("quiz first paint", () => {
  test.use({ javaScriptEnabled: false });

  test("quiz shows a loading state without navigation before hydration", async ({ page }, info) => {
    const quizFixture = `${fixture}?view=quiz`;
    await page.route(url => url.pathname === fixture && url.searchParams.get("view") === "quiz", async route => {
      const response = await route.fetch();
      // Keep the fixture's route transition visible without running hydration.
      const html = (await response.text()).replace("</head>", "<style>[data-page-transition]{opacity:1!important;transform:none!important}</style></head>");
      await route.fulfill({ status: response.status(), contentType: "text/html", body: html });
    });
    expect((await page.goto(quizFixture, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
    await expect(page.locator("[data-quiz-pending]")).toBeVisible();
    await expect(page.locator("[data-quiz-layout]")).toHaveCount(0);
    await expect(page.locator("[data-mobile-bottom-nav]")).toBeHidden();
    await page.screenshot({ path: info.outputPath("quiz-loading.png"), animations: "disabled" });
  });
});

test("student pages share a neutral shell and responsive content", async ({ page }, info) => {
  const errors = await prepare(page);
  for (const [view, marker] of [
    ["settings", "Appearance"], ["notifications", "aly@example.test"],
    ["feedback", "aly@example.test"], ["calendar", "Latihan limit fungsi"],
    ["groups", "Join"], ["leaderboard", "No rankings yet"], ["reflections", "Week"], ["achievements", "Badges"],
  ]) {
    await visit(page, view);
    const main = page.getByRole("main");
    if (view === "feedback") await expect(main.locator("input[type=email]")).toHaveValue(marker);
    else await expect(main.getByText(marker, { exact: false }).first()).toBeVisible();
    expect(await main.evaluate(el => getComputedStyle(el).getPropertyValue("--workspace-tab-indicator").trim())).not.toBe("");
    await capture(page, info, view);
  }
  expect(errors).toEqual([]);
});

test("agenda groups dates and keeps assessment and tutorial actions distinct", async ({ page }, info) => {
  const errors = await prepare(page);
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));
  await visit(page, "calendar");
  await expect(page.getByRole("heading", { name: /Today/ })).toHaveCount(1);
  await expect(page.getByText("Opens at 13:30 WIB")).toBeVisible();
  const takeQuiz = page.getByRole("link", { name: "Take quiz" });
  await expect(takeQuiz).toHaveAttribute("href", "/courses/fixture/quiz/limits");
  await expect(takeQuiz).toHaveCSS("height", "32px");
  await expect(page.getByRole("link", { name: "View tryout" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Past events" })).toBeVisible();
  const meet = page.getByRole("link", { name: "Google Meet" });
  await expect(meet).toHaveAttribute("href", "https://meet.google.com/fixture");
  await expect(meet).toHaveCSS("height", "32px");
  await capture(page, info, "agenda");

  const filter = page.getByRole("combobox", { name: "Event category" });
  await expect(filter).toHaveCSS("border-top-width", "0px");
  const scheduleLink = page.getByRole("link", { name: "Manage tutorials", exact: true });
  if (info.project.name === "mobile-380") {
    await expect(page.locator("[data-mobile-navbar]").getByRole("link", { name: "Manage tutorials", exact: true })).toBeVisible();
  }
  await expect(scheduleLink).toHaveCount(1);
  await filter.click();
  await page.getByRole("option", { name: "Tutorials" }).click();
  await expect(page.getByText("Limit dan kontinuitas", { exact: false })).toBeVisible();
  await expect(page.getByText("Latihan limit fungsi")).toHaveCount(0);
  await capture(page, info, "agenda-tutorials");

  await visit(page, "calendar-empty");
  await filter.click();
  await page.getByRole("option", { name: "Tutorials" }).click();
  await expect(page.getByRole("heading", { name: "No events in this category" })).toBeVisible();
  await capture(page, info, "agenda-filter-empty");
  await page.getByRole("button", { name: "All events" }).click();
  await expect(page.getByText("Latihan limit fungsi")).toBeVisible();
  expect(errors).toEqual([]);
});

test("settings mobile controls fit and preferences persist", async ({ page }, info) => {
  const errors = await prepare(page);
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));
  await visit(page, "settings");
  const main = page.getByRole("main");
  await expect(main.getByRole("tab", { name: "Appearance", selected: true })).toBeVisible();
  const mode = main.getByRole("combobox", { name: "Color mode" });
  await expect(mode).toHaveCSS("border-top-width", "0px");
  const language = main.getByRole("combobox", { name: "Language" });
  await expect(language).toHaveCSS("border-top-width", "0px");
  await expect(language).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const label = main.locator("label").filter({ hasText: "Color mode" });
  const [labelBox, modeBox] = await Promise.all([label.boundingBox(), mode.boundingBox()]);
  expect(labelBox && modeBox && modeBox.x > labelBox.x && modeBox.y < labelBox.y + labelBox.height).toBeTruthy();
  await expect(main.getByText("Reading preview")).toBeVisible();
  await capture(page, info, "settings-appearance");

  const spacing = main.getByRole("combobox", { name: "Spacing" });
  await spacing.click();
  await capture(page, info, "settings-spacing-options");
  await page.getByRole("option", { name: "Tight", exact: true }).click();
  await expect(spacing).toHaveText("Tight");

  await main.getByRole("tab", { name: "Email notifications" }).click();
  await expect(main.getByText("aly@example.test", { exact: false })).toBeVisible();
  await expect(page).toHaveURL(/tab=email/);
  await capture(page, info, "settings-email");

  await visit(page, "settings");
  await expect(spacing).toHaveText("Tight");
  expect(errors).toEqual([]);
});
