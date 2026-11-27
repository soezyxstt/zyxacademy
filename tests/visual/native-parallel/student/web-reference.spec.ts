import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { stubVisualTelemetry } from "../../telemetry-stubs";
import { waitForVisualReadiness } from "../../visual-readiness";

// These captures exercise existing web components with synthetic fixture data.
// They are web references, not evidence of native parity or backend authorization.
test.use({ locale: "en-GB", colorScheme: "dark", contextOptions: { reducedMotion: "reduce" } });
test.setTimeout(180_000);

async function prepare(page: Page) {
  await stubVisualTelemetry(page);
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: null }));
}

async function capture(page: Page, info: TestInfo, id: string) {
  await waitForVisualReadiness(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = info.outputPath(`${id}.png`);
  await page.screenshot({ path, animations: "disabled", fullPage: true });
  await info.attach(id, { path, contentType: "image/png" });
}

test("course catalog: populated, filtered, and loading", async ({ page }, info) => {
  await prepare(page);
  await page.clock.setFixedTime(new Date("2030-01-02T00:00:00Z"));
  expect((await page.goto("/visual-fixtures/course-catalog"))?.status()).toBe(200);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const main = page.getByRole("main");
  await expect(main.getByRole("tab", { name: "All (5)" })).toHaveAttribute("aria-selected", "true");
  await expect(main.getByRole("link", { name: /Matematika I/ })).toBeVisible();
  await capture(page, info, "catalog-populated");
  await main.getByRole("tab", { name: "PKA", exact: true }).click();
  await expect(main.getByRole("link", { name: /Tutorial PKA/ })).toBeVisible();
  await expect(main.getByRole("link", { name: /Matematika I/ })).toHaveCount(0);
  await capture(page, info, "catalog-filtered");
  expect((await page.goto("/visual-fixtures/course-catalog?state=loading"))?.status()).toBe(200);
  await expect(page.getByRole("status", { name: "Memuat" })).toBeVisible();
  await capture(page, info, "catalog-loading");
});

async function visitStudent(page: Page, view: string) {
  expect((await page.goto(`/visual-fixtures/student-polish?view=${view}`, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
  await expect(page.locator("[data-student-fixture-ready]")).toBeAttached({ timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await expect.poll(() => page.locator("[data-page-transition]").evaluate(el => getComputedStyle(el).opacity)).toBe("1");
}

test("calendar: all events and tutorial filter", async ({ page }, info) => {
  await prepare(page);
  await visitStudent(page, "calendar");
  await expect(page.getByRole("link", { name: "Take quiz" })).toHaveAttribute("href", "/courses/fixture/quiz/limits");
  await capture(page, info, "calendar-all");
  await page.getByRole("combobox", { name: "Event category" }).click();
  await page.getByRole("option", { name: "Tutorials" }).click();
  await expect(page.getByText("Latihan limit fungsi")).toHaveCount(0);
  await capture(page, info, "calendar-tutorials");
});

test("calendar: empty filter", async ({ page }, info) => {
  await prepare(page);
  await visitStudent(page, "calendar-empty");
  await page.getByRole("combobox", { name: "Event category" }).click();
  await page.getByRole("option", { name: "Tutorials" }).click();
  await expect(page.getByRole("heading", { name: "No events in this category" })).toBeVisible();
  await capture(page, info, "calendar-empty-filter");
});

test("quiz: unanswered, selected, and incomplete confirmation", async ({ page }, info) => {
  await prepare(page);
  expect((await page.goto("/visual-fixtures/student-polish?view=quiz", { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
  await expect(page.locator("[data-student-fixture-ready]")).toBeAttached({ timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await expect.poll(() => page.locator("[data-page-transition]").evaluate(el => getComputedStyle(el).opacity)).toBe("1");
  const progress = page.getByRole("progressbar");
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await capture(page, info, "quiz-unanswered");
  const answer = page.getByRole("radio", { name: /Lima/ });
  await answer.click();
  await expect(answer).toBeChecked();
  await expect(progress).toHaveAttribute("aria-valuenow", "50");
  await capture(page, info, "quiz-selected");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Submit answers", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/unanswered/i)).toBeVisible();
  await capture(page, info, "quiz-incomplete-confirmation");
});
