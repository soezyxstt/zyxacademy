import { expect, test } from "@playwright/test";

// Requires an authenticated local student and seeded dashboard data.
for (const event of [
  { id: "visual-badge", kind: "badge", family: "warrior_reader", tier: 1, lp: 25 },
  { id: "visual-rank", kind: "rank", rank: "kades" },
]) {
  test(`dashboard ${event.kind} celebration`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    page.on("response", r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.removeItem("zyx-celebrations-shown-v1"));
    await page.route("**/api/student/gamification/celebrations", route => route.fulfill({ json: route.request().method() === "GET" ? { celebrations: [event] } : { success: true } }));
    const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('a[href="/achievements"]').first()).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: event.kind === "badge" ? "Warrior Reader" : "Kades" })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`screenshots/dashboard-${event.kind}.png`), fullPage: true, animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
