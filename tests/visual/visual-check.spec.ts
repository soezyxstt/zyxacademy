import { expect, test, type Page } from "@playwright/test";

const routes = (process.env.VISUAL_CHECK_PATHS ?? "/")
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);

function routeSlug(route: string) {
  return (
    route
      .replace(/^https?:\/\//, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "home"
  ).toLowerCase();
}

function routePathname(route: string) {
  return new URL(route, "http://visual-check.local").pathname;
}

async function prepareForScreenshot(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      nextjs-portal { display: none !important; }
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition: none !important;
      }
    `,
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

for (const route of routes) {
  test(`visual quality check for ${route}`, async ({ page }, testInfo) => {
    const runtimeErrors: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        runtimeErrors.push(`console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      runtimeErrors.push(`page: ${error.message}`);
    });

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    // Pricing deliberately hydrates from a neutral server snapshot. Wait for
    // hydration before changing media preferences or capturing its final state.
    await expect(page.getByRole("status").filter({ hasText: "Memuat harga..." })).toHaveCount(0);
    await prepareForScreenshot(page);

    const screenshotPath = testInfo.outputPath(
      `screenshots/${routeSlug(route)}.png`,
    );
    await page.screenshot({
      animations: "disabled",
      caret: "hide",
      fullPage: true,
      path: screenshotPath,
      scale: "css",
    });
    await testInfo.attach(`visual-${routeSlug(route)}`, {
      contentType: "image/png",
      path: screenshotPath,
    });

    expect(response, "The route must return an HTTP response").not.toBeNull();
    expect(response?.status(), "The route must return a status below 400").toBeLessThan(
      400,
    );
    expect(
      new URL(page.url()).pathname,
      "The route must not redirect to an unexpected page",
    ).toBe(routePathname(route));

    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(
      overflow.scrollWidth,
      `Horizontal overflow: ${overflow.scrollWidth}px content in ${overflow.clientWidth}px viewport`,
    ).toBeLessThanOrEqual(overflow.clientWidth);
    expect(runtimeErrors, "The page must not emit console or runtime errors").toEqual(
      [],
    );
  });
}
