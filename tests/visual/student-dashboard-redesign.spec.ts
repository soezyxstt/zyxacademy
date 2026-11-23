import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { buildFixture } from "./fixtures/interactive-document-build";

test.setTimeout(90_000);

const origin = "http://dashboard-redesign.invalid";
let fixture: Awaited<ReturnType<typeof buildFixture>>;

test.beforeAll(async () => {
  fixture = await buildFixture("tests/visual/fixtures/student-dashboard-redesign.tsx");
});

async function renderScenario(
  page: Page,
  info: TestInfo,
  name: string,
  layout: "desktop" | "mobile",
  theme: "dark" | "light",
  viewport: { width: number; height: number },
) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", async (route) => {
    if (route.request().url() === `${origin}/`) {
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="id" class="${theme === "dark" ? "dark" : ""}"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="bg-background text-foreground"><div id="root"></div></body></html>`,
      });
    }
    return route.abort();
  });
  await page.goto(origin);
  await page.addStyleTag({ content: fixture.styles });
  await page.evaluate((value) => {
    window.dashboardRedesignFixture = value;
  }, { layout, theme });
  await page.addScriptTag({ content: fixture.script });
  await expect(page.getByRole("region", { name: "Ringkasan prioritas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matematika I", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
  expect(errors).toEqual([]);
}

test("student dashboard renders priority focus, study plan, and mastery cleanly in dark and light mode", async ({ page }, info) => {
  const isMobile = info.project.name.includes("mobile");
  const layout = isMobile ? "mobile" : "desktop";
  const viewport = isMobile ? { width: 380, height: 844 } : { width: 1536, height: 864 };
  await renderScenario(page, info, `${layout}-dark`, layout, "dark", viewport);
  await renderScenario(page, info, `${layout}-light`, layout, "light", viewport);
});
