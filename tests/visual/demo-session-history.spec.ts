import { expect, test } from "@playwright/test";

// Run against the credential-free demo harness described in public-demo-seeding.md.
test("demo progress stays reset after browser history restores a previous page", async ({ page }, info) => {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(`page: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`http ${response.status()}: ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const key = "zyx-demo:1:fictional-berpikir:fixture-v1";
  const response = await page.goto("/id/demo/article?course=fictional-berpikir", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await page.getByRole("button", { name: "Kembali ke daftar materi", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/documents/);
  await expect.poll(() => page.evaluate(storageKey => sessionStorage.getItem(storageKey), key)).toContain('"article"');
  await page.goBack();
  await expect(page).toHaveURL(/\/demo\/article/);
  await page.goForward();
  await expect(page).toHaveURL(/\/demo\/documents/);
  await expect.poll(() => page.evaluate(storageKey => sessionStorage.getItem(storageKey), key)).toContain('"article"');
  await expect(page.getByRole("link", { name: /Mengenal konsep dasar/ }).locator('[aria-label="Selesai dipelajari"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/history-completed.png"), fullPage: true, animations: "disabled" });

  if (info.project.name === "mobile-380") await page.getByRole("button", { name: "Buka navigasi", exact: true }).click();
  await page.getByRole("button", { name: /Pelajar Demo/ }).click();
  await page.getByRole("menuitem", { name: "Keluar", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\?course=/);
  await expect.poll(() => page.evaluate(storageKey => sessionStorage.getItem(storageKey), key)).toBeNull();
  await page.goBack();
  await expect(page).toHaveURL(/\/demo\/documents/);
  await expect.poll(() => page.evaluate(storageKey => sessionStorage.getItem(storageKey), key)).toBeNull();
  await expect(page.getByRole("link", { name: /Mengenal konsep dasar/ }).locator('[aria-label="Selesai dipelajari"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: info.outputPath("screenshots/history-reset.png"), fullPage: true, animations: "disabled" });
  expect(failures).toEqual([]);
});
