import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

// Match the configured Android emulator and the iPhone 17 Pro simulator in CI.
// The comparison script rejects dimension mismatches without resizing either image.
const targets = [
  { platform: "android", width: 380, height: 820, scale: 1 },
  { platform: "ios", width: 402, height: 874, scale: 3 },
] as const;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
try {
  for (const target of targets) {
    const context = await browser.newContext({
      viewport: { width: target.width, height: target.height },
      deviceScaleFactor: target.scale, isMobile: true, hasTouch: true,
      locale: "en-GB", colorScheme: "dark", reducedMotion: "reduce", serviceWorkers: "block",
    });
    const page = await context.newPage();
    await page.route("**/api/auth/get-session**", route => route.fulfill({ json: null }));
    await page.clock.setFixedTime(new Date("2030-01-02T00:00:00Z"));
    const response = await page.goto("http://127.0.0.1:3127/visual-fixtures/course-catalog", { waitUntil: "domcontentloaded", timeout: 180_000 });
    expect(response?.status()).toBe(200);
    // The tab markup is server-rendered; wait for the client bundle before
    // clicking, then verify the selected state rather than accepting an SSR click.
    await page.waitForLoadState("networkidle", { timeout: 60_000 });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.evaluate(() => document.fonts.ready);
    const main = page.getByRole("main");
    await expect(main).toHaveAttribute("data-catalog-fixture-ready", "true", { timeout: 60_000 });
    const dir = join("artifacts/student-evidence/reference", target.platform);
    await mkdir(dir, { recursive: true });
    await expect(main.getByRole("tab", { name: "All (5)" })).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
    await expect(main.getByRole("link", { name: /Matematika I/ })).toBeVisible();
    await page.screenshot({ path: join(dir, "catalog-all.png"), animations: "disabled" });
    await main.getByRole("tab", { name: "TPB", exact: true }).click();
    await expect(main.getByRole("tab", { name: "TPB", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/jurusan=tpb/);
    await expect(main.getByRole("link", { name: /Matematika I/ })).toBeVisible();
    await expect(main.getByRole("link", { name: /Tutorial PKA/ })).toHaveCount(0);
    await page.screenshot({ path: join(dir, "catalog-tpb.png"), animations: "disabled" });
    await main.getByRole("tab", { name: "PKA", exact: true }).click();
    await expect(main.getByRole("tab", { name: "PKA", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/jurusan=pka/);
    await expect(main.getByRole("link", { name: /Tutorial PKA/ })).toBeVisible();
    await expect(main.getByRole("link", { name: /Matematika I/ })).toHaveCount(0);
    await page.screenshot({ path: join(dir, "catalog-pka.png"), animations: "disabled" });
    await context.close();
  }
} finally {
  await browser.close();
}
