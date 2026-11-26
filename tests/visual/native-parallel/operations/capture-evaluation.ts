import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import messages from "@/messages/id/adminOps.json";
import evalMessages from "@/messages/id/adminEval.json";

async function main() {
  const t = messages.astInspectorUI;
  const jobs = evalMessages.jobs;
  const destination = "artifacts/native-parity/operations-web/evaluation";
  const root = process.env.PARITY_OPERATIONS_WEB_URL ?? "http://localhost:3211";
  const timeZone = process.env.PARITY_OPERATIONS_TIME_ZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE, args: ["--force-color-profile=srgb"] });
  const captures: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const cases = [
    { id: "ast-preview", url: "screen=ast", check: async (page: import("@playwright/test").Page) => {
      await expect(page.getByRole("tab", { name: t.livePreview })).toHaveAttribute("aria-selected", "true");
    } },
    { id: "ast-diagnostics", url: "screen=ast&tab=diagnostics", check: async (page: import("@playwright/test").Page) => {
      await page.getByRole("button", { name: t.leakage }).click();
      await expect(page.getByText(/memuat persamaan matematika/).first()).toBeVisible();
    } },
    { id: "ast-json", url: "screen=ast&tab=json", check: async (page: import("@playwright/test").Page) => {
      await page.getByRole("button", { name: t.visual }).click();
      await expect(page.getByRole("button", { name: t.copyJson })).toBeVisible();
    } },
    { id: "jobs-empty", url: "screen=jobs&mode=empty", check: async (page: import("@playwright/test").Page) => {
      await expect(page.getByText(jobs.empty)).toBeVisible();
    } },
    { id: "jobs-completed", url: "screen=jobs", check: async (page: import("@playwright/test").Page) => {
      await expect(page.getByText(jobs.completed, { exact: true })).toBeVisible();
    } },
    { id: "jobs-form", url: "screen=jobs", check: async (page: import("@playwright/test").Page) => {
      await page.getByRole("button", { name: jobs.createJob }).click();
      await expect(page.getByRole("button", { name: jobs.run })).toBeVisible();
    } },
  ];
  await mkdir(destination, { recursive: true });
  try {
    const viewports = [{ width: 380, height: 844 }, { width: 1536, height: 864 }];
    const page = await browser.newPage({ viewport: viewports[0], deviceScaleFactor: 1, locale: "id-ID", timezoneId: timeZone, reducedMotion: "reduce" });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    for (const theme of ["light", "dark"]) for (const scenario of cases) {
      await page.setViewportSize(viewports[0]);
      const path = `/evaluation?${scenario.url}&theme=${theme}`;
      const response = await page.goto(root + path, { waitUntil: "commit", timeout: 60000 });
      expect(response?.status()).toBe(200);
      expect(page.url()).toBe(root + path);
      if (scenario.id.startsWith("ast-")) {
        await expect(page.getByRole("button", { name: t.export })).toBeEnabled({ timeout: 90000 });
      } else {
        await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible({ timeout: 90000 });
      }
      await scenario.check(page);
      await page.evaluate(() => document.fonts.ready);
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        const screenshot = `${scenario.id}-${theme}-${viewport.width}.png`;
        await page.screenshot({ path: `${destination}/${screenshot}`, fullPage: true, animations: "disabled" });
        captures.push({ id: scenario.id, theme, ...viewport, screenshot });
      }
    }
    await page.close();
  } finally {
    await browser.close();
  }
  await writeFile(`${destination}/cases.json`, JSON.stringify({ locale: "id-ID", timeZone, dpr: 1, captures, errors }, null, 2));
  if (errors.length) throw new Error(errors.join("\n"));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
