import { expect, test, type Page, type TestInfo } from "@playwright/test";

test.setTimeout(120_000);

const FIXTURE_BASE = "/visual-fixtures/student-navigation";

async function stabilize(page: Page) {
  await page.evaluate(async () => {
    if (document.fonts) {
      await document.fonts.ready;
    }
  });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await stabilize(page);
  const path = testInfo.outputPath(`screenshots/${name}-${testInfo.project.name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

function observeFailures(page: Page) {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().includes("favicon")) {
      failures.push(`http: ${response.status()} ${response.url()}`);
    }
  });
  return failures;
}

test.describe("Student Navigation Performance & Visual Quality", () => {
  test("populated course overview renders cleanly", async ({ page }, testInfo) => {
    const failures = observeFailures(page);

    const response = await page.goto(`${FIXTURE_BASE}?state=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('[data-testid="state-overview"]')).toBeVisible();
    if (testInfo.project.name !== "mobile-380") await expect(page.getByText("Matematika I (MA1101)")).toBeVisible();
    await expect(page.getByText("Bab 1: Sistem Bilangan Real dan Pertaksamaan")).toBeVisible();
    await expect(page.getByText("4 kartu flashcard perlu diulang hari ini")).toBeVisible();

    await capture(page, testInfo, "student-overview-populated");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    expect(failures).toEqual([]);
  });

  test("course overview loading boundary skeleton renders cleanly", async ({ page }, testInfo) => {
    const failures = observeFailures(page);

    const response = await page.goto(`${FIXTURE_BASE}?state=overview-loading`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('[data-testid="state-overview-loading"]')).toBeVisible();

    await capture(page, testInfo, "student-overview-loading");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    expect(failures).toEqual([]);
  });

  test("progress loading boundary skeleton renders cleanly", async ({ page }, testInfo) => {
    const failures = observeFailures(page);

    const response = await page.goto(`${FIXTURE_BASE}?state=progress-loading`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('[data-testid="state-progress-loading"]')).toBeVisible();

    await capture(page, testInfo, "student-progress-loading");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    expect(failures).toEqual([]);
  });

  test("populated course materials list renders cleanly", async ({ page }, testInfo) => {
    const failures = observeFailures(page);

    const response = await page.goto(`${FIXTURE_BASE}?state=material`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('[data-testid="state-material"]')).toBeVisible();
    if (testInfo.project.name !== "mobile-380") await expect(page.getByText("Materi Belajar: Matematika I (MA1101)")).toBeVisible();
    await expect(page.getByText("Latihan Soal Ujian Tengah Semester")).toBeVisible();

    await capture(page, testInfo, "student-material-populated");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    expect(failures).toEqual([]);
  });

  test("course material tabs keep their width after returning from the reader", async ({ page }, testInfo) => {
    const failures = observeFailures(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const response = await page.goto(`${FIXTURE_BASE}?state=material`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const list = page.getByRole("tablist");
    const selectedTab = list.locator('[aria-selected="true"]');
    const bar = page.locator('[data-slot="tabs-list"]');
    const more = bar.locator('[data-slot="tabs-more-trigger"]');
    const expectOverflow = () => expect(more).toHaveCount(testInfo.project.name === "mobile-380" ? 1 : 0);
    const expectFullWidth = () => expect.poll(() => bar.evaluate((element) => {
      const pageWidth = element.closest("[data-application-page]")!.getBoundingClientRect().width;
      return Math.abs(element.getBoundingClientRect().width - pageWidth);
    })).toBeLessThanOrEqual(1);

    await stabilize(page);
    await expect(selectedTab).toBeVisible();
    await expectFullWidth();
    await expectOverflow();
    const visibleTabs = await list.getByRole("tab").allTextContents();
    await page.getByRole("button", { name: /Lain-lain|Others/i }).click();
    await capture(page, testInfo, "material-tabs-before-reader");

    await page.getByRole("link", { name: /Sifat-sifat Aljabar Bilangan Real/ }).click();
    await expect(page.getByTestId("state-reader-loading")).toBeVisible();
    await page.goBack();

    await expect(page.getByTestId("state-material")).toBeVisible();
    await expect(selectedTab).toBeVisible();
    await expectFullWidth();
    await expectOverflow();
    await expect(list.getByRole("tab")).toHaveText(visibleTabs);
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    )).toBeLessThanOrEqual(0);
    await capture(page, testInfo, "material-tabs-after-reader");
    expect(failures).toEqual([]);
  });

  test("course material loading boundary skeleton renders cleanly", async ({ page }, testInfo) => {
    const failures = observeFailures(page);

    const response = await page.goto(`${FIXTURE_BASE}?state=material-loading`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('[data-testid="state-material-loading"]')).toBeVisible();

    await capture(page, testInfo, "student-material-loading");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    expect(failures).toEqual([]);
  });

  test("material reader loading boundary skeleton renders cleanly", async ({ page }, testInfo) => {
    const failures = observeFailures(page);

    const response = await page.goto(`${FIXTURE_BASE}?state=reader-loading`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('[data-testid="state-reader-loading"]')).toBeVisible();

    await capture(page, testInfo, "student-reader-loading");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    expect(failures).toEqual([]);
  });

  test("course materials empty state renders cleanly", async ({ page }, testInfo) => {
    const failures = observeFailures(page);

    const response = await page.goto(`${FIXTURE_BASE}?state=material-empty`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('[data-testid="state-material-empty"]')).toBeVisible();

    await capture(page, testInfo, "student-material-empty");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    expect(failures).toEqual([]);
  });

  test("locked materials state renders cleanly with tier restrictions", async ({ page }, testInfo) => {
    const failures = observeFailures(page);

    const response = await page.goto(`${FIXTURE_BASE}?state=locked`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('[data-testid="state-locked"]')).toBeVisible();

    await capture(page, testInfo, "student-material-locked");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    expect(failures).toEqual([]);
  });

  test("course overview renders with reduced motion enabled", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const failures = observeFailures(page);

    const response = await page.goto(`${FIXTURE_BASE}?state=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('[data-testid="state-overview"]')).toBeVisible();
    await capture(page, testInfo, "student-nav-reduced-motion");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    expect(failures).toEqual([]);
  });

  test("course overview renders with default motion enabled", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const failures = observeFailures(page);

    const response = await page.goto(`${FIXTURE_BASE}?state=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('[data-testid="state-overview"]')).toBeVisible();
    await capture(page, testInfo, "student-nav-default-motion");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    expect(failures).toEqual([]);
  });
});
