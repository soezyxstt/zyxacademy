import { expect, test } from "@playwright/test";

// Requires an isolated student session with at least one earned badge and one locked family.
test("profile avatar and follow states", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/profile/edit");
  await expect(page).toHaveURL(/\/profile\/edit/);
  await page.screenshot({ path: info.outputPath("screenshots/profile-edit-photo.png"), fullPage: true, animations: "disabled" });
  const mode = page.getByRole("combobox", { name: /Avatar mode|Mode avatar/ });
  await mode.click();
  await page.screenshot({ path: info.outputPath("screenshots/profile-mode-open.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("option", { name: /^(Badge|Lencana)$/ }).click();
  await page.screenshot({ path: info.outputPath("screenshots/profile-edit-badge.png"), fullPage: true, animations: "disabled" });
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/profile$/);
  await page.screenshot({ path: info.outputPath("screenshots/profile-owned-locked.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: /^(Followers|Pengikut)$/ }).click();
  await expect(page.getByRole("button", { name: /^(Followers|Pengikut)$/ })).toBeEnabled();
  await page.screenshot({ path: info.outputPath("screenshots/profile-follow-open.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
