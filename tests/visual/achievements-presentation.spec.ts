import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

// Compile the isolated fixture first with the command recorded in the handoff.
// It uses fictional data and mocked actions, so it does not exercise authenticated routing or persistence.
const fixture = resolve(process.env.ZYX_FIXTURE_OUT || "artifacts/visual-quality/achievements-fixture", "index.html");

async function openFixture(page: Page, query: string) {
  expect(existsSync(fixture), "Compile the achievements fixture before running this spec").toBe(true);
  const url = `${pathToFileURL(fixture).href}?${query}`;
  await page.goto(url);
  expect(page.url()).toBe(url);
  await expect(page.getByRole("heading", { level: 1, name: "Pencapaian", includeHidden: true })).toBeAttached();
}

async function capture(page: Page, info: TestInfo, state: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => { image.onload = () => resolve(); image.onerror = () => resolve(); })));
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator('img').evaluateAll(images => images.filter(image => !(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth === 0).map(image => image.getAttribute('src')))).toEqual([]);
  await page.screenshot({ path: info.outputPath(`${state}.png`), fullPage: true, animations: "disabled" });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  (page as Page & { fixtureErrors?: string[] }).fixtureErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { fixtureErrors?: string[] }).fixtureErrors).toEqual([]);
});

test("overview and maximum rank", async ({ page }, info) => {
  await openFixture(page, "view=overview");
  await expect(page.getByRole("tab", { name: "Peringkat" })).toHaveCount(0);
  await expect(page.getByText("42.650", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("1.240 LP")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Papan lencana" })).toBeVisible();
  await capture(page, info, "overview");
  await openFixture(page, "view=overview&empty=1");
  await expect(page.getByText("Belum ada lencana yang diperoleh")).toBeVisible();
  await capture(page, info, "overview-no-badges");
  await openFixture(page, "view=overview&max=1");
  await expect(page.getByText("Peringkat tertinggi")).toBeVisible();
  await capture(page, info, "overview-maximum");
});

test("badge family progress and completed tiers", async ({ page }, info) => {
  await openFixture(page, "view=badges");
  await capture(page, info, "badges");
  await page.getByRole("button", { name: "Warrior Reader", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Warrior Reader I", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Warrior Reader V", { exact: true })).toBeAttached();
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "46");
  await capture(page, info, "badge-family");
  await page.keyboard.press("Escape");
  await openFixture(page, "view=badges&max=1");
  await page.getByRole("button", { name: "Warrior Reader", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("Selesai")).toBeVisible();
  await capture(page, info, "badge-family-complete");
});

test("mission categories and empty state", async ({ page }, info) => {
  await openFixture(page, "view=missions");
  await expect(page.getByRole("progressbar")).toHaveCount(4);
  await expect(page.getByText("Selesai ·", { exact: true })).toBeVisible();
  await capture(page, info, "missions");
  await openFixture(page, "view=missions&empty=1");
  await expect(page.getByText("Belum ada misi aktif")).toBeVisible();
  await capture(page, info, "missions-empty");
});

test("reward groups and detailed previews", async ({ page }, info) => {
  await openFixture(page, "view=rewards");
  await expect(page.getByRole("link", { name: "Lihat misi" })).toHaveAttribute("href", "/achievements?tab=missions");
  await capture(page, info, "rewards-frames");
  const previews = [
    ["Bingkai avatar", "Lihat Orbit Zyx", "frame"],
    ["Gelar", "Lihat Gelar pelajar", "title"],
    ["Tema profil", "Lihat Tema akademi", "profile-theme"],
    ["Tema Zyra", "Lihat Orbit", "zyra-theme"],
    ["Maskot Zyra", "Lihat Komodo cendekia", "mascot"],
  ] as const;
  for (const [group, item, state] of previews) {
    const trigger = page.getByRole("button", { name: group, exact: true });
    if (await trigger.getAttribute("data-state") !== "open") await trigger.click();
    await capture(page, info, `rewards-${state}-open`);
    await page.getByRole("button", { name: item, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    if (state === "frame") await expect(dialog.locator('[data-depth="true"]')).toBeVisible();
    if (state === "zyra-theme") {
      await expect(dialog.getByText("Sebelum")).toBeVisible();
      await expect(dialog.getByText("Sesudah")).toBeVisible();
      await expect(dialog.locator('[data-zyra-skin="orbit"]')).toBeVisible();
    }
    if (state === "mascot") {
      const canvas = dialog.locator('canvas[data-mascot-model="komodo"]');
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      await canvas.focus();
      const before = await canvas.screenshot();
      await canvas.focus();
      await page.keyboard.press("ArrowRight");
      await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
    }
    await capture(page, info, `preview-${state}`);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: item, exact: true })).toBeFocused();
  }
});

test("reward purchase feedback and empty state", async ({ page }, info) => {
  await openFixture(page, "view=rewards");
  const item = page.locator("li").filter({ has: page.getByRole("button", { name: "Lihat Garuda Fajar" }) });
  await item.getByRole("button", { name: "Pakai" }).click();
  await expect(item.getByRole("button", { name: "Tunggu" })).toBeDisabled();
  await capture(page, info, "reward-pending");
  await page.evaluate(() => (window as any).__finishAchievementReward({ ok: false }));
  await expect(page.getByRole("alert")).toBeVisible();
  await capture(page, info, "reward-error");
  await item.getByRole("button", { name: "Pakai" }).click();
  await page.evaluate(() => (window as any).__finishAchievementReward({ ok: true }));
  await expect(page.getByRole("status")).toHaveText("Hadiah diperbarui");
  await capture(page, info, "reward-success");
  await openFixture(page, "view=rewards&empty=1");
  await expect(page.getByText("Belum ada hadiah")).toBeVisible();
  await expect(page.getByRole("link", { name: "Lihat misi" })).toBeVisible();
  await capture(page, info, "rewards-empty");
});

test("dark rewards and badge dialog", async ({ page }, info) => {
  await openFixture(page, "view=rewards");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await capture(page, info, "rewards-dark");
  await openFixture(page, "view=badges");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.getByRole("button", { name: "Warrior Reader", exact: true }).click();
  await capture(page, info, "badge-family-dark");
});


test("frame motion enabled", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openFixture(page, "view=rewards");
  await page.getByRole("button", { name: "Lihat Orbit Zyx", exact: true }).click();
  const scene = page.getByRole("dialog").getByTestId("frame-choreography");
  await expect(scene).toBeVisible();
  await expect.poll(() => scene.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === "running").length)).toBeGreaterThan(0);
  await capture(page, info, "preview-frame-motion");
});
