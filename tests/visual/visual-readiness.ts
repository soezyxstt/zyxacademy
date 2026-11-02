import { expect, type Page } from "@playwright/test";

/** Wait for the global route-cover layer to be removed before visual checks. */
export async function waitForVisualReadiness(page: Page) {
  const routeCover = page.locator("div.fixed.inset-0").filter({
    has: page.locator('svg[viewBox="0 0 2182 1275"]'),
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });

  try {
    await expect(routeCover).toHaveCount(0, { timeout: 10_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const matches = Array.from(document.querySelectorAll("div.fixed.inset-0"));
      const cover = matches.find((element) => element.querySelector('svg[viewBox="0 0 2182 1275"]'));
      return {
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        routeCover: cover ? {
          display: getComputedStyle(cover).display,
          opacity: getComputedStyle(cover).opacity,
          outerHTML: cover.outerHTML.slice(0, 800),
        } : null,
        userAgent: navigator.userAgent,
      };
    });
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nReadiness diagnostics: ${JSON.stringify(diagnostics)}`);
  }
}
