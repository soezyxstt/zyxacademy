import { expect, test } from "@playwright/test";
import { stubVisualTelemetry } from "@/tests/visual/telemetry-stubs";
import { waitForVisualReadiness } from "@/tests/visual/visual-readiness";

for (const user of [
  { name: "Student", role: "student", roles: [], tutor: false, admin: false },
  { name: "Tutor", role: "teacher", roles: [], tutor: true, admin: false },
  { name: "Admin", role: "admin", roles: [], tutor: true, admin: true },
  { name: "Multi-role", role: "student", roles: ["admin"], tutor: true, admin: true },
]) {
  test(`public account menu for ${user.name}`, async ({ page }, testInfo) => {
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await stubVisualTelemetry(page);
    await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: {
      user: { id: "account-fixture", name: user.name, email: "account@example.invalid", emailVerified: true, role: user.role, roles: user.roles },
      session: { id: "account-session", userId: "account-fixture", expiresAt: "2099-01-01T00:00:00.000Z" },
    } }));
    await page.goto("/plans");
    await waitForVisualReadiness(page);
    expect(new URL(page.url()).pathname).toBe("/plans");

    const mobile = testInfo.project.name === "mobile-380";
    if (mobile) await page.getByRole("button", { name: /open menu|buka menu/i }).click();
    const container = mobile ? page.getByRole("dialog") : page.locator("header");
    const trigger = container.getByRole("button", { name: new RegExp(user.name, "i") });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.screenshot({ path: testInfo.outputPath(`${user.name}-closed.png`) });
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(menu.locator('a[href="/profile"]')).toBeVisible();
    await expect(menu.locator('a[href="/dashboard"]')).toBeVisible();
    await expect(menu.locator('a[href="/tutor"]')).toHaveCount(user.tutor ? 1 : 0);
    await expect(menu.locator('a[href="/admin"]')).toHaveCount(user.admin ? 1 : 0);
    await expect(menu.getByRole("menuitem", { name: /sign out|keluar/i })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${user.name}-open.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(failures).toEqual([]);
  });
}
