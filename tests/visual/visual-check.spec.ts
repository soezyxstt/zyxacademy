import { expect, test, type Page } from "@playwright/test";
import { mockTerminal } from "./terminal-fixture";

test.setTimeout(120_000);

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
    if (routePathname(route) === "/visual-fixtures/zyra-learning") test.setTimeout(90_000);
    const runtimeErrors: string[] = [];
    const failedResponses: string[] = [];
    if (routePathname(route) === "/visual-fixtures/coding") await mockTerminal(page);

    // Local visual fixtures do not provision Firebase or request push permission.
    if (process.env.VISUAL_CHECK_DISABLE_PUSH === "1") {
      await page.addInitScript(() => {
        delete (Navigator.prototype as { serviceWorker?: unknown }).serviceWorker;
      });
    }

    page.on("console", (message) => {
      if (message.type() === "error") {
        runtimeErrors.push(`console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      runtimeErrors.push(`page: ${error.message}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }
    });

    await page.emulateMedia({ reducedMotion: "reduce" });
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    if (routePathname(route) === "/tutor" || routePathname(route).startsWith("/tutor/")) {
      await expect(page.locator("#main-content h1")).toHaveCount(1);
      await expect.poll(() => page.locator("#main-content > div").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    }
    if (routePathname(route).startsWith("/tutor/") && routePathname(route).endsWith("/participants")) {
      await expect.poll(async () => (await page.locator("#main-content [role=combobox]").first().innerText()).trim()).not.toBe("");
    }
    if (routePathname(route).startsWith("/courses/")) {
      await expect(page.getByText("Memuat mata kuliah…")).toHaveCount(0, { timeout: 30_000 });
    }
    // Pricing deliberately hydrates from a neutral server snapshot. Wait for
    // hydration before changing media preferences or capturing its final state.
    await expect(page.getByRole("status").filter({ hasText: "Memuat harga..." })).toHaveCount(0);
    if (routePathname(route) === "/visual-fixtures/zyra-learning") {
      await expect(page.locator('[data-zyra-hydrated="true"]')).toBeVisible();
    }
    if (routePathname(route) === "/visual-fixtures/article-graphs") {
      for (const figure of await page.getByRole("figure").all()) {
        await figure.scrollIntoViewIfNeeded();
        await expect(figure.locator('svg[role="img"]')).toBeVisible();
      }
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await prepareForScreenshot(page);

    const screenshotPath = testInfo.outputPath(
      `screenshots/${routeSlug(route)}.png`,
    );
    await page.screenshot({
      animations: "disabled",
      caret: "initial",
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
    expect(failedResponses, "The page must not receive failed HTTP responses").toEqual([]);
  });
}
