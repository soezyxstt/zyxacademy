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
    await expect(page.getByRole("tab", { name: "Question Editor" })).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath("mobile-default.png") });

    // 3. Open More popover
    await moreTrigger.click();
    const responsesOption = page.getByRole("menuitem", { name: /Responses/i });
    await expect(responsesOption).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("mobile-more-open.png") });

    // 4. Select an overflowed tab -> More gets active underline & content switches
    await responsesOption.click();
    await expect(page.getByRole("heading", { name: "Responses" })).toBeVisible();
    await expect(moreTrigger).toHaveAttribute("data-active", "true");
    await page.screenshot({ path: testInfo.outputPath("mobile-overflow-active.png") });

    // 5. Re-open More to verify active left-bar indicator inside popover
    await moreTrigger.click();
    await expect(page.getByRole("menuitem", { name: /Responses/i })).toHaveAttribute(
      "aria-current",
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

  test("tabs recover when a flex container grows after collapsing", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 380, height: 844 });
    await page.goto("/visual-fixtures/sticky-tabs", { waitUntil: "domcontentloaded" });

    const bar = page.locator('[data-slot="tabs-list"]');
    const moreTrigger = bar.locator('[data-slot="tabs-more-trigger"]');
    await expect(moreTrigger).toBeVisible();
    await expect(bar.getByRole("tab", { name: "Question Editor" })).toBeVisible();

    await page.setViewportSize({ width: 1536, height: 864 });
    await expect(bar.getByRole("tab")).toHaveCount(7);
    await expect(moreTrigger).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("tabs-after-widening.png") });

    await page.setViewportSize({ width: 380, height: 844 });
    await expect(moreTrigger).toBeVisible();
    await expect(bar.getByRole("tab", { name: "Question Editor" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("tabs-after-narrowing.png") });
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

  test("dual adjacent tabs: both full-width on mobile, only primary stays sticky on scroll, secondary sticks on desktop", async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 380, height: 844 });
    await page.goto("/visual-fixtures/sticky-tabs?mode=dual", { waitUntil: "domcontentloaded" });

    const primaryBar = page.locator("[data-primary-mobile-tabs]");
    const secondaryBar = page.locator('[data-application-page] [data-slot="tabs-list"]');
    await expect(primaryBar).toBeVisible();
    await expect(secondaryBar).toBeVisible();

    const mobileInitial = await page.evaluate(() => {
      const nav = document.querySelector("[data-mobile-navbar]")!;
      const primary = document.querySelector("[data-primary-mobile-tabs]")!;
      const secondary = document.querySelector('[data-application-page] [data-slot="tabs-list"]')!;
      const navRect = nav.getBoundingClientRect();
      const primaryRect = primary.getBoundingClientRect();
      const secondaryRect = secondary.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        navBottom: Math.round(navRect.bottom),
        primaryLeft: Math.round(primaryRect.left),
        primaryRight: Math.round(primaryRect.right),
        primaryTop: Math.round(primaryRect.top),
        primaryBottom: Math.round(primaryRect.bottom),
        secondaryLeft: Math.round(secondaryRect.left),
        secondaryRight: Math.round(secondaryRect.right),
        secondaryTop: Math.round(secondaryRect.top),
        secondaryPosition: window.getComputedStyle(secondary).position,
      };
    });

    expect(mobileInitial.scrollWidth).toBeLessThanOrEqual(mobileInitial.clientWidth);
    expect(mobileInitial.primaryLeft).toBe(0);
    expect(mobileInitial.primaryRight).toBe(380);
    expect(mobileInitial.secondaryLeft).toBe(0);
    expect(mobileInitial.secondaryRight).toBe(380);
    expect(Math.abs(mobileInitial.primaryTop - mobileInitial.navBottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(mobileInitial.secondaryTop - mobileInitial.primaryBottom)).toBeLessThanOrEqual(1);
    expect(mobileInitial.secondaryPosition).toBe("relative");
    await page.screenshot({ path: testInfo.outputPath("mobile-dual-default.png") });

    await page.evaluate(() => window.scrollTo(0, 420));
    await page.waitForTimeout(150);
    const mobileScrolled = await page.evaluate(() => {
      const nav = document.querySelector("[data-mobile-navbar]")!;
      const primary = document.querySelector("[data-primary-mobile-tabs]")!;
      const secondary = document.querySelector('[data-application-page] [data-slot="tabs-list"]')!;
      return {
        navBottom: Math.round(nav.getBoundingClientRect().bottom),
        primaryTop: Math.round(primary.getBoundingClientRect().top),
        secondaryTop: Math.round(secondary.getBoundingClientRect().top),
      };
    });

    expect(Math.abs(mobileScrolled.primaryTop - mobileScrolled.navBottom)).toBeLessThanOrEqual(1);
    expect(mobileScrolled.secondaryTop).toBeLessThan(mobileScrolled.navBottom);
    await page.screenshot({ path: testInfo.outputPath("mobile-dual-scrolled.png") });

    // On desktop, primary mobile nav is hidden so the page tab bar becomes the single sticky bar.
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    await expect(primaryBar).toBeHidden();
    await expect(secondaryBar).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 420));
    await page.waitForTimeout(150);
    const desktopScrolled = await page.evaluate(() => {
      const secondary = document.querySelector('[data-application-page] [data-slot="tabs-list"]')!;
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        secondaryTop: Math.round(secondary.getBoundingClientRect().top),
        secondaryPosition: window.getComputedStyle(secondary).position,
      };
    });

    expect(desktopScrolled.scrollWidth).toBeLessThanOrEqual(desktopScrolled.clientWidth);
    expect(desktopScrolled.secondaryPosition).toBe("sticky");
    expect(desktopScrolled.secondaryTop).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("desktop-dual-scrolled.png") });
  });

  test("mid-page tabs: full-width below content on mobile without double-sticking", async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 380, height: 844 });
    await page.goto("/visual-fixtures/sticky-tabs?mode=midpage", { waitUntil: "domcontentloaded" });

    const primaryBar = page.locator("[data-primary-mobile-tabs]");
    const summary = page.locator('[data-testid="midpage-summary"]');
    const midpageBar = page.locator('[data-application-page] [data-slot="tabs-list"]');
    await expect(primaryBar).toBeVisible();
    await expect(summary).toBeVisible();
    await expect(midpageBar).toBeVisible();

    const initial = await page.evaluate(() => {
      const summaryEl = document.querySelector('[data-testid="midpage-summary"]')!;
      const mid = document.querySelector('[data-application-page] [data-slot="tabs-list"]')!;
      const midRect = mid.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        summaryBottom: Math.round(summaryEl.getBoundingClientRect().bottom),
        midLeft: Math.round(midRect.left),
        midRight: Math.round(midRect.right),
        midTop: Math.round(midRect.top),
        midPosition: window.getComputedStyle(mid).position,
      };
    });

    expect(initial.scrollWidth).toBeLessThanOrEqual(initial.clientWidth);
    expect(initial.midLeft).toBe(0);
    expect(initial.midRight).toBe(380);
    expect(initial.midTop).toBeGreaterThanOrEqual(initial.summaryBottom);
    expect(initial.midPosition).toBe("relative");
    await page.screenshot({ path: testInfo.outputPath("mobile-midpage-default.png") });

    await page.evaluate(() => window.scrollTo(0, 420));
    await page.waitForTimeout(150);
    const scrolled = await page.evaluate(() => {
      const nav = document.querySelector("[data-mobile-navbar]")!;
      const primary = document.querySelector("[data-primary-mobile-tabs]")!;
      const mid = document.querySelector('[data-application-page] [data-slot="tabs-list"]')!;
      return {
        navBottom: Math.round(nav.getBoundingClientRect().bottom),
        primaryTop: Math.round(primary.getBoundingClientRect().top),
        midTop: Math.round(mid.getBoundingClientRect().top),
      };
    });

    expect(Math.abs(scrolled.primaryTop - scrolled.navBottom)).toBeLessThanOrEqual(1);
    expect(scrolled.midTop).toBeLessThan(scrolled.navBottom);
    await page.screenshot({ path: testInfo.outputPath("mobile-midpage-scrolled.png") });
  });
});
