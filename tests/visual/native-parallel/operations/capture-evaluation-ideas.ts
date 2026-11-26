import { chromium, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import messages from "@/messages/id/adminEval.json";

async function main() {
  const root = process.env.PARITY_OPERATIONS_WEB_URL ?? "http://localhost:3211";
  const output = "artifacts/native-parity/operations-web/evaluation-ideas";
  const t = messages.questionBank;
  const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE, args: ["--force-color-profile=srgb"] });
  const viewports = [{ width: 380, height: 844 }, { width: 1536, height: 864 }];
  const captures: Record<string, unknown>[] = [];
  const errors: string[] = [];
  await mkdir(output, { recursive: true });

  async function capture(page: Page, id: string, theme: string) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      const screenshot = `evaluation-ideas-${id}-${theme}-${viewport.width}.png`;
      await page.screenshot({ path: `${output}/${screenshot}`, fullPage: true, animations: "disabled" });
      captures.push({ id, theme, ...viewport, screenshot });
    }
    await page.setViewportSize(viewports[0]);
  }

  try {
    const page = await browser.newPage({ viewport: viewports[0], deviceScaleFactor: 1, locale: "id-ID", timezoneId: "Asia/Jakarta", reducedMotion: "reduce" });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });

    for (const theme of ["light", "dark"]) {
      const href = `${root}/evaluation/ideas?theme=${theme}`;
      const response = await page.goto(href, { waitUntil: "commit", timeout: 90000 });
      expect(response?.status()).toBe(200);
      expect(page.url()).toBe(href);
      await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible({ timeout: 90000 });
      await page.getByRole("button", { name: t.manageIdeas }).click();
      const firstIdea = page.getByRole("checkbox", { name: /MD03\.1/ });
      const secondIdea = page.getByRole("checkbox", { name: /MD03\.2/ });
      await expect(firstIdea).toBeVisible();
      await expect(secondIdea).toBeVisible();
      await capture(page, "available", theme);

      await firstIdea.check();
      await secondIdea.check();
      const weights = page.getByRole("spinbutton", { name: t.weightLabel });
      await expect(weights.nth(0)).toHaveValue("0.5");
      await expect(weights.nth(1)).toHaveValue("0.5");
      await expect(page.getByText(/100%.*Siap disimpan/)).toBeVisible();
      await capture(page, "balanced", theme);

      await weights.nth(0).fill("0.4");
      await expect(page.getByText(/90%.*Total bobot harus 100%/)).toBeVisible();
      await capture(page, "invalid", theme);

      await weights.nth(1).fill("0.6");
      await expect(page.getByText(/100%.*Siap disimpan/)).toBeVisible();
      await secondIdea.uncheck();
      await expect(weights).toHaveCount(1);
      await expect(weights.nth(0)).toHaveValue("1");
    }
  } finally {
    await browser.close();
  }

  expect(errors).toEqual([]);
  await writeFile(`${output}/cases.json`, JSON.stringify({
    source: "Bank Soal IdeaAssignmentFields with synthetic chapter and published Idea records",
    locale: "id-ID", timeZone: "Asia/Jakarta", dpr: 1, captures, errors,
  }, null, 2) + "\n");
  console.log(`${captures.length} Idea assignment reference captures passed`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
