import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { fixtureFontStyles } from "./fixtures/fonts";
import { buildFixture } from "./fixtures/interactive-document-build";

test.setTimeout(90_000);

const origin = "http://dashboard-redesign.invalid";
let fixture: Awaited<ReturnType<typeof buildFixture>>;
const fontStyles = fixtureFontStyles();

test.beforeAll(async () => {
  test.setTimeout(90_000);
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
  await page.addStyleTag({ content: fontStyles });
  await page.evaluate((value) => {
    window.dashboardRedesignFixture = value;
  }, { layout, theme });
  await page.addScriptTag({ content: fixture.script });
  await expect(page.getByRole("heading", { name: "Rencana belajar hari ini" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matematika I", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 16px "Inter"') && document.fonts.check('700 16px "Lexend"'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(
    await page.evaluate(() => {
      const section = document.querySelector('[data-testid="review-queue-section"]');
      const link = section?.querySelector("a");
      if (!section || !link) return false;
      const sectionRect = section.getBoundingClientRect();
      const linkRect = link.getBoundingClientRect();
      return linkRect.right <= sectionRect.right + 1 && linkRect.left >= sectionRect.left - 1;
    }),
  ).toBe(true);
  const checkboxBorderContrast = await page.evaluate(() => {
    const checkbox = document.querySelector('[role="checkbox"][aria-checked="false"]');
    if (!checkbox) return 0;
    const parseColor = (css: string) => {
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.fillStyle = "#000000";
      ctx.fillStyle = css;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const bg = parseColor(getComputedStyle(document.body).backgroundColor);
    const border = parseColor(getComputedStyle(checkbox).borderTopColor);
    const comp = {
      r: border.r * border.a + bg.r * (1 - border.a),
      g: border.g * border.a + bg.g * (1 - border.a),
      b: border.b * border.a + bg.b * (1 - border.a),
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const [rs, gs, bs] = [c.r, c.g, c.b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    const l1 = lum(comp);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  });
  expect(checkboxBorderContrast).toBeGreaterThanOrEqual(3);

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
