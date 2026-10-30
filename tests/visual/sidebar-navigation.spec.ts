import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => document.fonts.ready);
  const path = info.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

test("sidebar navigation retains readable labels and accessible collapsed controls", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const response = await page.goto("/visual-fixtures/sidebar-navigation", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("link", { name: "Beranda" })).toHaveAttribute("aria-current", "page");
  await capture(page, info, "expanded");
  await page.getByRole("button", { name: "Materi" }).click();
  await expect(page.getByRole("button", { name: "Materi" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "Artikel" })).toBeVisible();
  await capture(page, info, "expanded-open");
  await page.getByRole("button", { name: "Tutup" }).click();
  await expect(page.getByRole("link", { name: "Beranda" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Materi" })).toBeVisible();
  await capture(page, info, "collapsed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
