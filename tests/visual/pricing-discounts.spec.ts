import { expect, test } from "@playwright/test";
import { DEFAULT_PRICING_DISCOUNTS } from "../../lib/pricing-discounts";
test.setTimeout(90_000);

test("independent schedules, validation, save, and shared price states", async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  let stored = DEFAULT_PRICING_DISCOUNTS;
  await page.route("**/api/pricing", (route) => route.fulfill({ json: stored }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/visual-fixtures/pricing-discounts", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/visual-fixtures/pricing-discounts");
  await expect(page.locator('[data-plan-price="essential"]')).toContainText("Rp 8.325.000", { timeout: 30_000 });
  const capture = async (name: string) => {
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.evaluate(async () => { await document.fonts.ready; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: name !== "voucher-open", animations: "disabled" });
  };
  await capture("expired");
  await page.locator("#platform-percent").fill("20");
  await page.locator("#platform-startsOn").fill("2026-11-01");
  await page.getByRole("button", { name: "Simpan diskon", exact: true }).click();
  await expect(page.locator("form [role=alert]")).toContainText("urutan tanggal");
  await capture("invalid-dates");
  await page.locator("#platform-endsOn").fill("2027-12-31");
  await page.locator("#tutorial-percent").fill("50");
  await page.locator("#tutorial-startsOn").fill("2026-11-01");
  await page.locator("#tutorial-endsOn").fill("2027-12-31");
  stored = {
    platform: { percent: 20, startsOn: "2026-11-01", endsOn: "2027-12-31" },
    tutorial: { percent: 50, startsOn: "2026-11-01", endsOn: "2027-12-31" },
  };
  await page.getByRole("button", { name: "Simpan diskon", exact: true }).click();
  await expect(page.getByRole("button", { name: "Menyimpan..." })).toBeDisabled();
  await capture("saving");
  await expect(page.getByRole("status")).toContainText("Diskon tersimpan");
  await expect(page.locator('[data-plan-price="minimal"]')).toContainText("20% off");
  await expect(page.locator('[data-plan-price="essential"]')).toContainText("43% off");
  await capture("saved-active");
  await page.getByRole("combobox").press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await capture("voucher-open");
  await page.getByRole("option", { name: /HEMAT10/ }).click();
  await expect(page.locator("[data-price-final]")).toBeVisible();
  await capture("voucher-applied");
  await page.getByLabel("Jumlah pertemuan", { exact: true }).first().fill("7");
  await expect(page.getByText("Jumlah pertemuan harus kelipatan 5.", { exact: true })).toBeVisible();
  await capture("invalid-quantity");
  await page.locator("#platform-percent").fill("0");
  await page.locator("#tutorial-percent").fill("100");
  stored = { platform: { ...stored.platform, percent: 0 }, tutorial: { ...stored.tutorial, percent: 100 } };
  await page.getByRole("button", { name: "Simpan diskon", exact: true }).click();
  await expect(page.getByRole("button", { name: "Simpan diskon", exact: true })).toBeEnabled();
  await expect(page.locator('[data-plan-price="minimal"] s')).toHaveCount(0);
  await capture("zero-and-full-discount");
  await page.goto("/visual-fixtures/pricing-discounts?failSave=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-plan-price="essential"]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Simpan diskon", exact: true }).click();
  await expect(page.locator("form [role=alert]")).toContainText("Gagal menyimpan", { timeout: 15_000 });
  await capture("save-failure");
  expect(errors).toEqual([]);
});

test("loading and unavailable pricing suppress monetary quotes", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/pricing", async (route) => { await pending; await route.fulfill({ json: {} }); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/visual-fixtures/pricing-discounts", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const capture = async (name: string) => {
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.evaluate(async () => { await document.fonts.ready; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  };
  await expect(page.getByRole("status").filter({ hasText: "Memuat harga..." })).toHaveCount(5);
  await capture("loading");
  release();
  await expect(page.getByText("Harga belum tersedia. Coba lagi.", { exact: true })).toHaveCount(3);
  await expect(page.getByText("Gagal memuat harga. Coba muat ulang.", { exact: true })).toHaveCount(2);
  await expect(page.locator("[data-plan-price], [data-price-after]")).toHaveCount(0);
  await capture("pricing-unavailable");
  expect(errors).toEqual([]);
});

test("discount controls fit tablet and sidebar widths", async ({ page }, info) => {
  test.skip(info.project.name !== "laptop-fhd-125", "One pass for intermediate widths");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.route("**/api/pricing", (route) => route.fulfill({ json: DEFAULT_PRICING_DISCOUNTS }));
  await page.goto("/visual-fixtures/pricing-discounts", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-plan-price="essential"]')).toBeVisible();
  for (const width of [640, 768, 1024]) {
    await page.setViewportSize({ width, height: 864 });
    await page.locator("main").evaluate((element, width) => { element.style.width = `${width >= 768 ? width - 256 : width}px`; }, width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.locator("form").screenshot({ path: info.outputPath(`form-${width}.png`) });
  }
  expect(errors).toEqual([]);
});
