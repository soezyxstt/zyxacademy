import { expect, test, type Page, type TestInfo } from "@playwright/test";

test.setTimeout(120_000);

const routes = [
  "/demo",
  "/demo/article",
  "/demo/diktat",
  "/demo/flashcards",
  "/demo/quiz",
  "/demo/zyra",
  "/demo/schedule",
  "/demo/leaderboard",
  "/demo/groups",
] as const;

async function stabilize(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      nextjs-portal { display: none !important; }
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(async () => document.fonts.ready);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await stabilize(page);
  const path = testInfo.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled", caret: "hide" });
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

for (const route of routes) {
  test(`demo route ${route} at both configured viewports`, async ({ page }, testInfo) => {
    const failures = observeFailures(page);
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await capture(page, testInfo, `${testInfo.project.name}-${route.slice(1).replaceAll("/", "-")}-initial`);

    expect(response?.status()).toBeLessThan(400);
    expect(new URL(page.url()).pathname).toBe(route);
    const overflow = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(overflow.scroll, `Horizontal overflow: ${overflow.scroll}px in ${overflow.client}px`).toBeLessThanOrEqual(overflow.client);

    const empty = page.getByRole("heading", { name: "Demo belum tersedia" });
    if (await empty.isVisible()) {
      expect(failures).toEqual([]);
      return;
    }

    await expect(page.getByRole("navigation", { name: "Navigasi demo" })).toBeVisible();
    await expect(page.getByText("Mode demo", { exact: true })).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain("correctIndices");

    if (route === "/demo/flashcards") {
      const card = page.getByRole("button", { name: /Klik untuk membalik/ });
      await expect(card).toBeVisible();
      await card.click();
      await expect(page.getByText("Jawaban", { exact: true })).toBeVisible();
      await capture(page, testInfo, `${testInfo.project.name}-demo-flashcards-revealed`);
    }

    if (route === "/demo/quiz") {
      const options = page.locator('input[type="radio"], input[type="checkbox"]');
      await expect(options.first()).toBeVisible();
      await options.first().check();
      await page.getByRole("button", { name: "Kirim jawaban" }).click();
      await expect(page.getByText(/Skor demo:/)).toBeVisible();
      await capture(page, testInfo, `${testInfo.project.name}-demo-quiz-submitted`);
    }

    expect(failures).toEqual([]);
  });
}
