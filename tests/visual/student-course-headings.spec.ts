import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

for (const [path, title] of [
  ["material", "Materi belajar: Matematika Dasar"],
  ["quiz", "Latihan kuis: Matematika Dasar"],
  ["mastery", "Penguasaan materi: Matematika Dasar"],
  ["progress", "Progres belajar: Matematika Dasar"],
] as const) {
  test(`course ${path} identifies the current section`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    if (process.env.VISUAL_CHECK_DISABLE_PUSH === "1") {
      await page.addInitScript(() => { delete (Navigator.prototype as { serviceWorker?: unknown }).serviceWorker; });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    const response = await page.goto(`/courses/visual-math/${path}`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(new RegExp(`/courses/visual-math/${path}$`));
    await expect(page.getByText("Memuat mata kuliah…")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    const screenshot = info.outputPath(`screenshots/${path}.png`);
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
    await info.attach(path, { path: screenshot, contentType: "image/png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
