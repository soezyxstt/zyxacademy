import { expect, test, type Page } from "@playwright/test";
import { stubVisualTelemetry } from "@/tests/visual/telemetry-stubs";

async function choose(page: Page, label: string, value: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}

test.use({ storageState: { cookies: [], origins: [] } });

test("student demo preferences update the interface and survive reload", async ({ page }, info) => {
  await stubVisualTelemetry(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const response = await page.goto("/en/demo/settings?course=fictional-berpikir");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/en\/demo\/settings(?:\?|$)/);
  await expect(page.getByRole("tab", { name: "General", selected: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Vibration", exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath("general-preferences.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  const spacing = page.getByRole("combobox", { name: "Spacing", exact: true });
  await expect(spacing).toHaveText("Normal");
  const readingPreview = page.locator("figure").filter({ hasText: "Reading preview" });
  const sample = readingPreview.locator("p").first();
  const getFontSize = (element: Element) => parseFloat(getComputedStyle(element).fontSize);
  const getGap = (element: Element) => parseFloat(getComputedStyle(element).rowGap);
  const sampleFontSize = await sample.evaluate(getFontSize);
  const sampleGap = await readingPreview.locator("div").evaluate(getGap);
  const initialSpacing = await spacing.evaluate((element) => getComputedStyle(element).getPropertyValue("--row-padding"));
  const initialFont = await spacing.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

  await spacing.focus();
  await expect(spacing).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "Tightest", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("appearance-menu.png"), fullPage: true, animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(spacing).toBeFocused();

  await choose(page, "Spacing", "Tightest");
  await choose(page, "Font size", "Large");
  expect(await sample.evaluate(getFontSize)).toBeGreaterThan(sampleFontSize);
  expect(await readingPreview.locator("div").evaluate(getGap)).toBeLessThan(sampleGap);
  await choose(page, "Color mode", "Dark");
  const ornaments = page.getByRole("switch", { name: "Background ornaments" });
  await expect(ornaments).toBeChecked();
  await ornaments.click();
  await expect(ornaments).not.toBeChecked();
  await page.getByRole("switch", { name: "Animations" }).click();

  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-preference-density", "tightest");
  await expect(html).toHaveAttribute("data-preference-font-size", "large");
  await expect(html).toHaveAttribute("data-preference-background", "solid");
  await expect(html).toHaveAttribute("data-preference-animations", "false");
  await expect(html).toHaveClass(/\bdark\b/);
  expect(await spacing.evaluate((element) => getComputedStyle(element).getPropertyValue("--row-padding"))).not.toEqual(initialSpacing);
  expect(await spacing.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBe(initialFont);
  expect(await html.evaluate((element) => getComputedStyle(element).getPropertyValue("--user-font-scale").trim())).toBe("1.25");
  const ornamentLayer = page.locator("[data-personalized-surface] [data-page-ornaments]").first();
  await expect(ornamentLayer).toBeAttached();
  await expect(ornamentLayer).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  await page.screenshot({ path: info.outputPath("appearance-applied.png"), fullPage: true, animations: "disabled" });

  await page.reload();
  await expect(spacing).toHaveText("Tightest");
  await expect(page.getByRole("combobox", { name: "Font size" })).toHaveText("Large");
  await expect(page.getByRole("switch", { name: "Animations" })).not.toBeChecked();

  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/tab=profile/);
  await expect(page.getByRole("link", { name: "Edit profile", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("demo-profile-settings.png"), fullPage: true, animations: "disabled" });

  await page.getByRole("tab", { name: "Notifications", exact: true }).click();
  await expect(page).toHaveURL(/tab=notifications/);
  await choose(page, "On-screen alert position", "Top left");
  const previewToast = page.locator('[data-sonner-toast][data-x-position="left"][data-y-position="top"]');
  await expect(previewToast.getByText("Notifications will appear here")).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage notifications" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("demo-notification-settings.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("link", { name: "Manage notifications" }).click();
  const emailReminder = page.getByRole("switch", { name: "Tutorial reminder emails", exact: true });
  await expect(emailReminder).toBeChecked();
  const frequency = page.getByRole("combobox", { name: "Email frequency", exact: true });
  await expect(frequency).toHaveValue("once");
  await expect(page.getByRole("spinbutton", { name: "Hours", exact: true })).toHaveValue("1");
  await expect(page.getByRole("spinbutton", { name: "Minutes", exact: true })).toHaveValue("0");
  await page.screenshot({ path: info.outputPath("tutorial-reminder-once.png"), fullPage: true, animations: "disabled" });
  await frequency.selectOption("repeat");
  await page.getByRole("spinbutton", { name: "Hours", exact: true }).fill("2");
  const interval = page.getByRole("spinbutton", { name: "Repeat every (minutes)", exact: true });
  await interval.fill("5");
  const saveReminder = page.getByRole("button", { name: "Save reminder schedule", exact: true });
  await expect(saveReminder).toBeDisabled();
  await interval.fill("30");
  await expect(page.getByText("Emails per session: 4.")).toBeVisible();
  await expect(saveReminder).toBeEnabled();
  await page.screenshot({ path: info.outputPath("tutorial-reminder-repeat.png"), fullPage: true, animations: "disabled" });
  await saveReminder.click();
  await expect(saveReminder).toBeDisabled();
  await emailReminder.click();
  await expect(frequency).toBeHidden();
  await page.screenshot({ path: info.outputPath("tutorial-reminder-disabled.png"), fullPage: true, animations: "disabled" });
  await emailReminder.click();
  await expect(frequency).toHaveValue("repeat");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  const toaster = page.locator('[data-sonner-toaster][data-x-position="left"][data-y-position="top"]');
  await expect(toaster.locator("[data-sonner-toast]")).toBeVisible();
  await page.screenshot({ path: info.outputPath("on-screen-alert.png"), fullPage: true, animations: "disabled" });
  expect(errors).toEqual([]);
});
