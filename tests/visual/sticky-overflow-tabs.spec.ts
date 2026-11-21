import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test.describe("Sticky full-width horizontal tabs with GitHub-style More popover", () => {
  test("mobile 380x844: flush sticky bar, overflow More popover, active overflow indicator, and scroll stickiness", async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 380, height: 844 });
    await page.goto("/visual-fixtures/sticky-tabs", { waitUntil: "domcontentloaded" });

    const tabList = page.locator('[data-slot="tabs-list"]');
    await expect(tabList).toBeVisible();

    // 1. Verify full-width 100vw without horizontal overflow
    const metrics = await page.evaluate(() => {
      const list = document.querySelector('[data-slot="tabs-list"]')!;
      const nav = document.querySelector("[data-mobile-navbar]")!;
      const listRect = list.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        listLeft: Math.round(listRect.left),
        listRight: Math.round(listRect.right),
        listTop: Math.round(listRect.top),
        navBottom: Math.round(navRect.bottom),
      };
    });

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expect(metrics.listLeft).toBe(0);
    expect(metrics.listRight).toBe(380);
    // Flush directly below MobileNavbar
    expect(Math.abs(metrics.listTop - metrics.navBottom)).toBeLessThanOrEqual(1);

    // 2. More button should be visible because 7 tabs exceed 380px
    const moreTrigger = page.locator('[data-slot="tabs-more-trigger"]');
    await expect(moreTrigger).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath("mobile-default.png") });

    // 3. Open More popover
    await moreTrigger.click();
    const responsesOption = page.getByRole("menuitemradio", { name: /Responses/i });
    await expect(responsesOption).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("mobile-more-open.png") });

    // 4. Select an overflowed tab -> More gets active underline & content switches
    await responsesOption.click();
    await expect(page.getByRole("heading", { name: "Responses" })).toBeVisible();
    await expect(moreTrigger).toHaveAttribute("data-active", "true");
    await page.screenshot({ path: testInfo.outputPath("mobile-overflow-active.png") });

    // 5. Re-open More to verify active left-bar indicator inside popover
    await moreTrigger.click();
    await expect(page.getByRole("menuitemradio", { name: /Responses/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await page.screenshot({ path: testInfo.outputPath("mobile-more-active-open.png") });
    await page.keyboard.press("Escape");

    // 6. Scroll down and verify tab bar remains sticky directly below MobileNavbar
    await page.evaluate(() => window.scrollTo(0, 420));
    await page.waitForTimeout(150);
    const stickyMetrics = await page.evaluate(() => {
      const list = document.querySelector('[data-slot="tabs-list"]')!;
      const nav = document.querySelector("[data-mobile-navbar]")!;
      return {
        listTop: Math.round(list.getBoundingClientRect().top),
        navBottom: Math.round(nav.getBoundingClientRect().bottom),
      };
    });
    expect(Math.abs(stickyMetrics.listTop - stickyMetrics.navBottom)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("mobile-scrolled-sticky.png") });
  });

  test("desktop 1536x864: full main-column sticky bar without overflow", async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.goto("/visual-fixtures/sticky-tabs", { waitUntil: "domcontentloaded" });

    const tabList = page.locator('[data-slot="tabs-list"]');
    await expect(tabList).toBeVisible();

    // All 7 tabs should fit comfortably on 1536px desktop -> More trigger hidden
    await expect(page.locator('[data-slot="tabs-more-trigger"]')).toHaveCount(0);

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      listTop: Math.round(document.querySelector('[data-slot="tabs-list"]')!.getBoundingClientRect().top),
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expect(metrics.listTop).toBe(0);

    await page.screenshot({ path: testInfo.outputPath("desktop-default.png") });

    // Scroll down -> sticks at top: 0
    await page.evaluate(() => window.scrollTo(0, 420));
    await page.waitForTimeout(150);
    const scrolledTop = await page.evaluate(() =>
      Math.round(document.querySelector('[data-slot="tabs-list"]')!.getBoundingClientRect().top)
    );
    expect(scrolledTop).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("desktop-scrolled-sticky.png") });
  });

  test("question bank toolbar has flush sticky tabs with zero overflow on mobile and desktop", async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 380, height: 844 });
    await page.goto("/visual-fixtures/question-bank-toolbar", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-slot="tabs-list"]')).toBeVisible({ timeout: 60_000 });
    const qbMobile = await page.evaluate(() => {
      const list = document.querySelector('[data-slot="tabs-list"]')!;
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        listTop: Math.round(list.getBoundingClientRect().top),
      };
    });
    expect(qbMobile.scrollWidth).toBeLessThanOrEqual(qbMobile.clientWidth);
    expect(qbMobile.listTop).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("mobile-question-bank.png") });

    await page.setViewportSize({ width: 1536, height: 864 });
    await page.waitForTimeout(100);
    const qbDesktop = await page.evaluate(() => {
      const list = document.querySelector('[data-slot="tabs-list"]')!;
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        listTop: Math.round(list.getBoundingClientRect().top),
      };
    });
    expect(qbDesktop.scrollWidth).toBeLessThanOrEqual(qbDesktop.clientWidth);
    expect(qbDesktop.listTop).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("desktop-question-bank.png") });
  });
});
