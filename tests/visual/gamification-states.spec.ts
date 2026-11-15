import { expect, test } from "@playwright/test";

// Requires a local student storage state and seeded gamification data.
for (const [tab, path] of [["overview", "/achievements"], ["badges", "/achievements?tab=badges"], ["missions", "/achievements?tab=missions"], ["rewards", "/achievements?tab=rewards"], ["leaderboard", "/leaderboard"]] as const) {
  test(`gamification ${tab}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(new RegExp(path.replace("?", "\\?")));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`screenshots/${tab}.png`), fullPage: true, animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
    if (tab === "badges") {
      await page.getByRole("button", { name: "Warrior Reader" }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.screenshot({ path: info.outputPath("screenshots/badge-detail.png"), fullPage: true, animations: "disabled" });
    }
  });
}

test("dashboard summary", async ({ page }, info) => {
  await page.goto("/dashboard");
  await expect(page.locator('a[href="/achievements"]').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/dashboard-summary.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
