import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(async () => document.fonts.ready);
  const path = testInfo.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled", caret: "hide" });
  await testInfo.attach(name, { path, contentType: "image/png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test("admin documentation search and article", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/admin/docs", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/docs$/);
  const search = page.getByRole("textbox", { name: "Cari dokumentasi" });
  await expect(search).toBeVisible();
  await capture(page, testInfo, "index");
  await search.fill("ma1101");
  await expect(page.getByRole("link", { name: /Menamai dan mengunggah dokumen/ }).first()).toBeVisible();
  await capture(page, testInfo, "search-results");
  await search.fill("tidak-ada-kata-ini");
  await expect(page.getByText("Dokumentasi tidak ditemukan")).toBeVisible();
  await capture(page, testInfo, "search-empty");
  await page.getByRole("button", { name: /bersihkan|hapus|clear/i }).click();
  await page.getByRole("link", { name: /Menamai dan mengunggah dokumen/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/docs\/dokumen-materi$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Menamai dan mengunggah dokumen" })).toBeVisible();
  await capture(page, testInfo, "article");
  expect(errors).toEqual([]);
});

test("documentation navigation opens a section across pages", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/admin/docs", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/docs$/);
  const mobile = testInfo.project.name === "mobile-380";
  if (mobile) {
    await page.getByRole("button", { name: /buka navigasi|open navigation/i }).click();
    await page.getByRole("button", { name: /tutup sidebar|close sidebar/i }).click();
    await page.getByRole("button", { name: "Navigasi dokumentasi" }).click();
  }
  let navigation = page.getByRole("navigation", { name: "Navigasi dokumentasi" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: "Bagian dalam Menamai dan mengunggah dokumen" }).click();
  await expect(navigation.getByRole("link", { name: "Unggah massal dan duplikat" })).toBeVisible();
  await capture(page, testInfo, "docs-navigation-open");
  await navigation.getByRole("link", { name: "Unggah massal dan duplikat" }).click();
  await expect(page).toHaveURL(/\/admin\/docs\/dokumen-materi#bagian-4$/, { timeout: 15_000 });
  await expect(page.locator("#bagian-4")).toBeInViewport();
  if (mobile) {
    await expect(page.getByRole("dialog", { name: "Navigasi dokumentasi" })).toHaveCount(0);
    await page.getByRole("button", { name: "Navigasi dokumentasi" }).click();
  }
  navigation = page.getByRole("navigation", { name: "Navigasi dokumentasi" });
  await expect(navigation.getByRole("link", { name: "Unggah massal dan duplikat" })).toHaveAttribute("aria-current", "location");
  await capture(page, testInfo, "docs-navigation-article");
  await navigation.getByRole("link", { name: "Siapkan dokumen" }).click();
  await expect(page).toHaveURL(/#bagian-1$/);
  await expect(page.locator("#bagian-1")).toBeInViewport();
  await page.reload();
  await expect(page.locator("#bagian-1")).toBeInViewport();
  expect(errors).toEqual([]);
});

test("documentation navigation switches at the wide-screen breakpoint", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop-fhd-125", "Breakpoint coverage uses the desktop browser context.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1279, height: 864 });
  await page.goto("/admin/docs", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Navigasi dokumentasi" })).toBeVisible();
  await page.getByRole("button", { name: "Navigasi dokumentasi" }).click();
  await expect(page.getByRole("dialog", { name: "Navigasi dokumentasi" })).toBeVisible();
  await capture(page, testInfo, "docs-navigation-1279");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Navigasi dokumentasi" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Navigasi dokumentasi" })).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 864 });
  await expect(page.getByRole("navigation", { name: "Navigasi dokumentasi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Navigasi dokumentasi" })).toBeHidden();
  await capture(page, testInfo, "docs-navigation-1280");
});
