import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { fixtureFontStyles } from "./fixtures/fonts";
import { buildFixture } from "./fixtures/interactive-document-build";
import { waitForVisualReadiness } from "./visual-readiness";

const origin = "http://tutor-dense.invalid";
let fixture: Awaited<ReturnType<typeof buildFixture>>;
const fontStyles = fixtureFontStyles();
test.use({ locale: "en-GB", contextOptions: { reducedMotion: "reduce" } });
test.setTimeout(120_000);

test.beforeAll(async () => {
  fixture = await buildFixture("tests/visual/fixtures/tutor-dense.tsx", "", {
    "@/components/providers/locale-provider": 'export const useAppLocale = () => ({ locale: "en" });',
    "next/navigation": `const router = { push() {}, replace() {}, refresh() {}, back() {} }; export const useRouter = () => router; export const usePathname = () => location.pathname;`,
  });
});

async function gotoFixture(page: Page, view: string, state?: "empty" | "loading" | "uncalculated") {
  const url = `${origin}/?view=${view}${state ? `&state=${state}` : ""}`;
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(url);
  await page.addStyleTag({ content: fixture.styles });
  await page.addStyleTag({ content: fontStyles });
  await page.addScriptTag({ content: fixture.script });
}

async function visit(page: Page, view: string, colorScheme: "light" | "dark", state?: "empty" | "loading" | "uncalculated") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await page.route(`${origin}/**`, (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html lang="en" class="${colorScheme}"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="bg-background text-foreground"><div id="root"></div></body></html>`,
  }));
  await page.emulateMedia({ colorScheme });
  await gotoFixture(page, view, state);
  return errors;
}

async function capture(page: Page, info: TestInfo, name: string) {
  await waitForVisualReadiness(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

for (const theme of ["light", "dark"] as const) {
  test(`tutor dashboard attaches totals to actions in ${theme} mode`, async ({ page }, info) => {
    const errors = await visit(page, "dashboard", theme);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Upcoming sessions" })).toBeVisible();
    await expect(main.getByText("4 sessions this week")).toHaveCount(1);
    await expect(main.getByText("3 active groups")).toHaveCount(1);
    await expect(main.getByRole("link", { name: "8 pending tickets" })).toHaveAttribute("href", "/tutor/schedule?tab=tickets");
    await expect(main.getByRole("link", { name: /MA1101.*2 related groups/ })).toHaveAttribute("href", "/tutor/fixture-math");
    await expect(main.getByRole("link", { name: "All schedules" })).toHaveAttribute("href", "/tutor/schedule");
    const sessionLink = main.getByRole("link", { name: /Kelompok persiapan ujian akhir/ });
    const [titleBounds, detailsBounds] = await Promise.all([sessionLink.locator("p").nth(0).boundingBox(), sessionLink.locator("p").nth(1).boundingBox()]);
    expect(detailsBounds!.y - titleBounds!.y - titleBounds!.height).toBeLessThanOrEqual(8);
    await capture(page, info, "dashboard");
    expect(errors).toEqual([]);
  });

  test(`tutor analytics preserves concept drilldown in ${theme} mode`, async ({ page }, info) => {
    const errors = await visit(page, "analytics", theme);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Priority concepts" })).toBeVisible();
    await expect(main.locator(".katex").first()).toBeVisible();
    if (info.project.name === "mobile-380") {
      const [watchlist, misconceptions] = await Promise.all([
        main.getByRole("heading", { name: "Needs attention" }).boundingBox(),
        main.getByRole("heading", { name: "Common misconceptions" }).boundingBox(),
      ]);
      expect(watchlist!.y).toBeLessThan(misconceptions!.y);
    }
    await expect(main.getByText("Trend increasing", { exact: true })).toBeAttached();
    const refresh = page.getByRole("button", { name: "Refresh", exact: true });
    await expect(refresh).toHaveCount(1);
    await expect((info.project.name === "mobile-380" ? page.locator("[data-mobile-navbar]") : main).getByRole("button", { name: "Refresh", exact: true })).toBeVisible();

    const additional = main.getByText("Kesinambungan pada interval tertutup");
    await expect(additional).toBeHidden();
    await capture(page, info, "analytics");
    await main.getByText("1 more concept", { exact: true }).click();
    await expect(additional).toBeVisible();
    await expect(main.getByRole("button", { name: /View concept Menentukan limit fungsi/ })).toHaveCount(1);
    await capture(page, info, "analytics-more");

    const drill = main.getByRole("button", { name: /View concept Menentukan limit fungsi/ });
    await drill.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Most frequently missed questions")).toBeVisible();
    await capture(page, info, "analytics-drilldown");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(drill).toBeFocused();
    expect(errors).toEqual([]);
  });
  test(`tutor analytics explains missing data in ${theme} mode`, async ({ page }, info) => {
    const errors = await visit(page, "analytics", theme, "empty");
    await expect(page.getByText("Not enough student data to rank concepts yet.")).toBeVisible();
    await expect(page.getByText("No students flagged for follow-up.")).toBeVisible();
    await capture(page, info, "analytics-empty");

    await gotoFixture(page, "analytics", "uncalculated");
    await expect(page.getByText("Refresh analytics to see which students need attention.")).toBeVisible();
    await expect(page.getByText("No students flagged for follow-up.")).toHaveCount(0);
    await capture(page, info, "analytics-uncalculated");

    await gotoFixture(page, "analytics", "loading");
    await expect(page.getByRole("status")).toBeAttached();
    await capture(page, info, "analytics-loading");
    expect(errors).toEqual([]);
  });

}

test("tutor dashboard retains empty and loading recovery", async ({ page }, info) => {
  const errors = await visit(page, "dashboard", "dark", "empty");
  await expect(page.getByText("No upcoming sessions")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add a slot" })).toHaveAttribute("href", "/tutor/schedule");
  await expect(page.getByText("No pending tickets")).toBeVisible();
  await capture(page, info, "dashboard-empty");

  await gotoFixture(page, "dashboard", "loading");
  await expect(page.getByRole("status")).toBeAttached();
  await capture(page, info, "dashboard-loading");
  expect(errors).toEqual([]);
});
