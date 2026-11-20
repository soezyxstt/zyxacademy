import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Compile tests/visual/demo-gamification-harness/compile.cjs first. The isolated
// fixture renders actual demo compositions; its simple search surface exercises
// the same local adapter but does not mount the full application command menu.
const root = process.cwd();
const fixture = path.join(root, "artifacts/visual-quality/demo-gamification-fixture");
let bundle: Buffer;
let styles: string;
test.beforeAll(() => {
  bundle = readFileSync(path.join(fixture, "bundle.js"));
  styles = readFileSync(path.join(fixture, "styles.css"), "utf8") + readFileSync(path.join(fixture, "bundle.css"), "utf8");
});
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  (page as Page & { fixtureErrors: string[] }).fixtureErrors = errors;
  await page.route("http://demo-fixture.local/**", route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() !== "GET") return route.fulfill({ status: 500, body: "Unexpected mutation" });
    if (pathname === "/fixture.js") return route.fulfill({ contentType: "application/javascript", body: bundle });
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
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => { image.onload = () => resolve(); image.onerror = () => resolve(); }))); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator("img").evaluateAll(images => images.filter(image => !(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth === 0).map(image => image.getAttribute("src")))).toEqual([]);
  await page.screenshot({ path: info.outputPath(`screenshots/${state}.png`), fullPage: true, animations: "disabled" });
}
const url = (view: string, query = "") => `http://demo-fixture.local/id/demo/${view}?course=math${query}`;

test("leaderboard tabs, filters, legacy links and local social profiles", async ({ page }, info) => {
  await page.goto(url("leaderboard"));
  await expect(page.getByRole("tab", { name: "Rank" })).toHaveAttribute("data-state", "active");
  await expect(page.getByText("40.000 XP").first()).toBeVisible();
  await expect(page.locator('[data-profile-mascot]')).toHaveCount(0);
  await capture(page, info, "rank");
  await page.getByRole("button", { name: /Citra Maharani/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Follow", exact: true })).toBeVisible();
  await expect(dialog.locator('[data-profile-mascot="zyra-avatar-studio-cat"]')).toBeVisible();
  await capture(page, info, "profile-dialog");
  await dialog.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Unfollow", exact: true })).toBeVisible();
  await capture(page, info, "profile-following");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await capture(page, info, "rank-filter");
  await page.getByRole("combobox", { name: "Cakupan" }).click();
  await page.getByRole("option", { name: "Diikuti" }).click();
  await expect(page).toHaveURL(/scope=following/);
  await page.keyboard.press("Escape");
  await capture(page, info, "rank-following");
  await page.goto(url("leaderboard", "&academic=1"));
  await expect(page.getByRole("tab", { name: "Akademik" })).toHaveAttribute("data-state", "active");
  await capture(page, info, "academic");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await capture(page, info, "academic-filter");
  await page.getByRole("combobox", { name: "Kelas" }).click();
  await page.getByRole("option", { name: "Berpikir komputasional" }).click();
  await expect(page).toHaveURL(/course=math.*academicCourse=logic/);
  await expect(page.getByRole("heading", { name: "Kalkulus I" })).toHaveCount(0);
  await capture(page, info, "academic-filtered");
  await page.getByRole("tab", { name: "Rank" }).click();
  await expect(page.getByRole("tab", { name: "Rank" })).toHaveAttribute("data-state", "active");
  await expect(page).not.toHaveURL(/academic=1/);
});

test("achievement tabs, tier dialog and local rewards", async ({ page }, info) => {
  await page.goto(url("achievements"));
  await expect(page.getByText("42.650", { exact: false }).first()).toBeVisible();
  await capture(page, info, "achievement-overview");
  await page.getByRole("tab", { name: "Lencana" }).click();
  await expect(page).toHaveURL(/course=math.*tab=badges/);
  await capture(page, info, "badges");
  await page.getByRole("button", { name: "Warrior Reader", exact: true }).click();
  await capture(page, info, "badge-tiers");
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Misi" }).click();
  await capture(page, info, "missions");
  await page.getByRole("tab", { name: "Hadiah" }).click();
  await capture(page, info, "rewards");
  await expect(page.getByRole("link", { name: "Lihat misi" })).toHaveAttribute("href", "/id/demo/achievements?course=math&tab=missions");
  const item = page.locator("li").filter({ has: page.getByRole("button", { name: "Lihat Anggrek" }) });
  await item.getByRole("button", { name: "Lihat Anggrek" }).click();
  await capture(page, info, "reward-preview");
  await page.keyboard.press("Escape");
  await item.getByRole("button", { name: "Beli" }).click();
  await expect(item.getByRole("button", { name: "Pakai" })).toBeVisible();
  await expect(page.getByText("Saldo: 490 LP")).toBeVisible();
  await item.getByRole("button", { name: "Pakai" }).click();
  await expect(item.getByRole("button", { name: "Dipakai" })).toBeDisabled();
  await capture(page, info, "reward-equipped");
  await page.reload();
  await expect(item.getByRole("button", { name: "Dipakai" })).toBeDisabled();
});

test("profile, follows, group roster and local people search", async ({ page }, info) => {
  await page.goto(url("profile"));
  await expect(page.getByText("42.650 XP")).toBeVisible();
  await expect(page.locator('[data-profile-mascot="zyra-avatar-studio-cat"]')).toBeVisible();
  await capture(page, info, "profile");
  await page.getByRole("button", { name: "Diikuti", exact: true }).click();
  await expect(page.getByRole("button", { name: /Ayu Lestari/ })).toBeVisible();
  await capture(page, info, "profile-follow-list");
  await page.getByRole("button", { name: /Ayu Lestari/ }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Unfollow" })).toBeVisible();
  await capture(page, info, "profile-follow-dialog");
  await page.getByRole("dialog").getByRole("button", { name: "Unfollow" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Ayu Lestari/ })).toHaveCount(0);
  await capture(page, info, "profile-unfollowed");
  await page.goto(url("groups"));
  await expect(page.getByRole("button", { name: /Pelajar Demo/ })).toBeVisible();
  await capture(page, info, "group-roster");
  await page.goto(url("search"));
  await page.getByLabel("Cari orang").fill("Citra");
  await expect(page.getByRole("button", { name: /Citra Maharani/ })).toBeVisible();
  await capture(page, info, "search-results");
  await page.getByRole("button", { name: /Citra Maharani/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, info, "search-profile");
});


test("equipping a mascot updates the owner profile and own dialog", async ({ page }, info) => {
  await page.goto(url("achievements", "&tab=rewards"));
  await page.getByRole("button", { name: "Maskot Zyra", exact: true }).click();
  const item = page.locator("li").filter({ has: page.getByRole("button", { name: "Lihat Harimau" }) });
  await item.getByRole("button", { name: "Beli" }).click();
  await item.getByRole("button", { name: "Pakai" }).click();
  await expect(item.getByRole("button", { name: "Dipakai" })).toBeDisabled();
  await page.goto(url("profile"));
  await expect(page.locator('[data-profile-mascot="zyra-avatar-studio-tiger"]')).toBeVisible();
  await capture(page, info, "profile-selected-mascot");
  await page.goto(url("leaderboard"));
  await page.getByRole("button", { name: /Pelajar Demo/ }).click();
  await expect(page.getByRole("dialog").locator('[data-profile-mascot="zyra-avatar-studio-tiger"]')).toBeVisible();
  await capture(page, info, "own-dialog-selected-mascot");
});
