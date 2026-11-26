// Actual mobile Next pages backed by academic/local/seed.sql.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { fixtureCookie } from "../../../../packages/native-parity/academic/local/cookie.mjs";

const origin = "http://127.0.0.1:3314";
const output = "artifacts/native-parity/academic/first-journeys";
const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE });
const results = [];
await mkdir(output, { recursive: true });

async function journey(role, start, steps) {
  const context = await browser.newContext({
    viewport: { width: 380, height: 844 }, deviceScaleFactor: 1, colorScheme: "light",
    locale: "id-ID", timezoneId: "Asia/Jakarta", serviceWorkers: "block", reducedMotion: "reduce",
  });
  const [name, value] = fixtureCookie(role).split("=");
  await context.addCookies([{ name, value, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const row = { role, start, steps: [], outcome: "started" };
  results.push(row);
  async function record(label) {
    await page.evaluate(() => document.fonts.ready);
    const file = role + "-" + (row.steps.length + 1) + ".png";
    await page.screenshot({ path: output + "/" + file, animations: "disabled", style: "nextjs-portal { display:none !important }" });
    row.steps.push({ label, location: new URL(page.url()).pathname, file });
  }
  try {
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + start, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(() => [...document.querySelectorAll("main button, nav button")]
      .some(button => Object.keys(button).some(key => key.startsWith("__reactProps"))), undefined, { timeout: 40000 });
    await steps(page, record, row);
    row.outcome = "observed";
  } catch (error) {
    row.outcome = "interrupted";
    row.error = error.message.split("\n").slice(0, 4).join("\n");
    row.controls = await page.locator("a,button,[role=tab]").evaluateAll(nodes => nodes
      .filter(node => node.getClientRects().length)
      .map(node => [node.getAttribute("aria-label"), node.textContent.trim().slice(0, 50), node.getAttribute("href")]));
    process.exitCode = 1;
  } finally {
    await context.close();
    await writeFile(output + "/manifest.json", JSON.stringify(results, null, 2) + "\n");
    console.log(role, row.outcome, row.steps.map(step => step.label).join(", "), row.error ?? "");
  }
}

try {
  await journey("tutor", "/tutor", async (page, record) => {
    const assigned = page.locator('main a[href="/tutor/academic-course-1"]').filter({ visible: true }).first();
    await assigned.click();
    await page.waitForURL(/\/tutor\/academic-course-1$/);
    const participants = page.locator('a[href$="/academic-course-1/participants"]').filter({ visible: true }).first();
    // Horizontal course tabs may require Playwright's normal scroll-into-view.
    const more = page.getByRole("button", { name: /lebih|lainnya|more/i }).first();
    await participants.or(more).first().waitFor({ timeout: 50000 });
    if (!await participants.isVisible()) await more.click();
    await participants.click();
    await page.getByText("Nadia Lestari", { exact: true }).filter({ visible: true }).waitFor();
    await page.getByText("nadia@academic.test", { exact: true }).filter({ visible: true }).waitFor();
    await record("Assigned course and participant details inline");
    await page.goBack();
    await page.waitForURL(/\/tutor\/academic-course-1$/);
    await record("Back to assigned course");
  });
  await journey("admin", "/admin/courses", async (page, record, row) => {
    const category = page.getByRole("combobox", { name: "Program studi / kategori" });
    await category.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('[role="combobox"]')]
      .some(button => Object.keys(button).some(key => key.startsWith("__reactProps"))));
    await category.click();
    await page.getByRole("option", { name: "Biologi", exact: true }).click();
    const biology = page.getByRole("link", { name: "Biologi Dasar", exact: true }).filter({ visible: true });
    await biology.first().waitFor();
    assert.equal(await page.getByRole("link", { name: "Fisika Dasar", exact: true }).filter({ visible: true }).count(), 0);
    await record("Category filter applied");
    await biology.first().click();
    await page.waitForURL(/\/admin\/courses\/[^/]+$/);
    await page.getByText("Belum ada bab", { exact: false }).filter({ visible: true }).first().waitFor();
    await record("Course detail reached through filtered list");
    await page.goBack();
    await page.waitForURL(/\/admin\/courses$/);
    await biology.first().waitFor();
    row.afterBack = {
      category: (await category.textContent())?.trim(),
      otherCourseVisible: await page.getByRole("link", { name: "Fisika Dasar", exact: true }).filter({ visible: true }).count() > 0,
    };
    await record("Web filter state after Back");
  });
} finally {
  await browser.close();
}
