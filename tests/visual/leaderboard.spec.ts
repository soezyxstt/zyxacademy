import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Precompiled isolated components with fictional data, no authenticated routes or database.
const root = process.cwd();
const fixture = path.join(root, "artifacts/visual-quality/leaderboard-fixture");
let bundle: Uint8Array;
let styles: string;
test.beforeAll(() => {
  bundle = readFileSync(path.join(fixture, "bundle.js"));
  styles = readFileSync(path.join(fixture, "styles.css"), "utf8") + readFileSync(path.join(fixture, "bundle.css"), "utf8");
});

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  (page as Page & { fixtureErrors: string[] }).fixtureErrors = errors;
  await page.route("http://leaderboard.local/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/fixture.js") return route.fulfill({ contentType: "application/javascript", body: Buffer.from(bundle) });
    if (pathname === "/styles.css") return route.fulfill({ contentType: "text/css", body: styles });
    if (pathname.startsWith("/gamification/")) {
      const asset = path.resolve(root, "public", `.${pathname}`);
      if (!asset.startsWith(path.join(root, "public/gamification") + path.sep) || !existsSync(asset)) return route.fulfill({ status: 404 });
      return route.fulfill({ path: asset });
    }
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>' });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { fixtureErrors: string[] }).fixtureErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

async function capture(page: Page, info: TestInfo, state: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`screenshots/${state}.png`), fullPage: true, animations: "disabled" });
}

test("rank and academic filters follow URL state", async ({ page }, info) => {
  await page.goto("http://leaderboard.local/leaderboard");
  await expect(page.getByRole("tab", { name: "Rank" })).toHaveAttribute("data-state", "active");
  const filter = await page.getByRole("button", { name: "Filter", exact: true }).boundingBox();
  const tabs = await page.getByRole("tablist").boundingBox();
  const row = await page.getByRole("tablist").locator("..").boundingBox();
  expect(Math.abs(filter!.x + filter!.width - (row!.x + row!.width))).toBeLessThan(2);
  expect(Math.abs(filter!.y + filter!.height / 2 - (tabs!.y + tabs!.height / 2))).toBeLessThan(2);
  await capture(page, info, "rank-populated");
  await page.getByRole("button", { name: /Alya Putri/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, info, "rank-profile-open");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Periode" })).toBeVisible();
  await capture(page, info, "rank-filter-open");
  await page.getByRole("combobox", { name: "Periode" }).click();
  await page.getByRole("option", { name: "Minggu" }).click();
  await expect(page).toHaveURL(/period=week/);
  await page.getByRole("combobox", { name: "Cakupan" }).click();
  await page.getByRole("option", { name: "Diikuti" }).click();
  await expect(page).toHaveURL(/scope=following/);
  await capture(page, info, "rank-filter-selected");
  await page.getByRole("tab", { name: "Akademik" }).click();
  await expect(page).toHaveURL(/tab=academic/);
  await expect(page.getByRole("heading", { name: "Kalkulus I" })).toBeVisible();
  await capture(page, info, "academic-all");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Kelas" })).toBeVisible();
  await capture(page, info, "academic-filter-open");
  await page.getByRole("combobox", { name: "Kelas" }).click();
  await page.getByRole("option", { name: "Berpikir komputasional dan pemecahan masalah" }).click();
  await expect(page).toHaveURL(/course=logic/);
  await expect(page.getByText("Belum ada hasil kuis.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kalkulus I" })).toHaveCount(0);
  await capture(page, info, "academic-filter-selected-empty");
  await page.getByRole("tab", { name: "Rank" }).click();
  await expect(page).toHaveURL(/period=week/);
  await expect(page).toHaveURL(/scope=following/);
  await expect(page.getByRole("button", { name: "Filter, aktif" })).toBeVisible();
});

test("empty rank and no enrollment", async ({ page }, info) => {
  await page.goto("http://leaderboard.local/leaderboard?empty=1");
  await expect(page.getByText("Belum ada peringkat")).toBeVisible();
  await capture(page, info, "rank-empty");
  await page.goto("http://leaderboard.local/leaderboard?tab=academic&noCourses=1");
  await expect(page.getByText("Anda belum terdaftar di kelas mana pun.")).toBeVisible();
  await capture(page, info, "academic-no-enrollment");
});

test("dark rank filters", async ({ page }, info) => {
  await page.goto("http://leaderboard.local/leaderboard");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await capture(page, info, "rank-filter-dark");
});
