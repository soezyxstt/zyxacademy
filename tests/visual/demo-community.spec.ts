import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

for (const view of ["dashboard", "schedule", "leaderboard", "groups"]) {
  test(`demo community ${view}`, async ({ page }, testInfo) => {
    const failures: string[] = [];
    page.on("pageerror", error => failures.push(error.message));
    page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    const path = `/visual-fixtures/demo-community?view=${view}`;
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(path);
    for (const route of ["schedule", "leaderboard", "groups"]) {
      await expect(page.getByRole("navigation", { name: "Navigasi demo" }).locator(`a[href="/demo/${route}"]`)).toBeVisible();
    }
    if (view === "schedule") await expect(page.getByRole("button", { name: "Detail sesi" })).toHaveCount(3);
    if (view === "leaderboard") await expect(page.getByRole("cell", { name: "96", exact: true })).toBeVisible();
    if (view === "groups") await expect(page.getByText("6 dari 6 orang")).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.evaluate(async () => document.fonts.ready);
    const screenshot = testInfo.outputPath(`screenshots/${view}.png`);
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
    await testInfo.attach(view, { path: screenshot, contentType: "image/png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(failures).toEqual([]);
  });
}
