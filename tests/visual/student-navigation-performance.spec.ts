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
