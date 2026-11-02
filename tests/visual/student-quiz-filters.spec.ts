import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

test("quiz access filters show the current URL selection", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  if (process.env.VISUAL_CHECK_DISABLE_PUSH === "1") {
    await page.addInitScript(() => { delete (Navigator.prototype as { serviceWorker?: unknown }).serviceWorker; });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/courses/visual-math/quiz");
  await expect(page.getByText("Memuat mata kuliah…")).toHaveCount(0, { timeout: 30_000 });
  const filters = page.getByRole("navigation", { name: "Filter akses kuis" });
  async function capture(name: string) {
    const path = info.outputPath(`screenshots/${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    await info.attach(name, { path, contentType: "image/png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await expect(filters.getByRole("link", { name: "Semua" })).toHaveAttribute("aria-current", "page");
  await capture("all");
  await filters.getByRole("link", { name: "Gratis" }).click();
  await expect(page).toHaveURL(/access=free/);
  await expect(filters.getByRole("link", { name: "Gratis" })).toHaveAttribute("aria-current", "page");
  await capture("free");
  await filters.getByRole("link", { name: "Premium" }).click();
  await expect(page).toHaveURL(/access=premium/);
  await expect(filters.getByRole("link", { name: "Premium" })).toHaveAttribute("aria-current", "page");
  await capture("premium");
  expect(errors).toEqual([]);
});
