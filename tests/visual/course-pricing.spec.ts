import { expect, test } from "@playwright/test";
import { DEFAULT_PRICING_DISCOUNTS } from "../../lib/pricing-discounts";

test.setTimeout(120_000);

test("course pricing fixture", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route("**/api/pricing", (route) => route.fulfill({ json: DEFAULT_PRICING_DISCOUNTS }));
  let saveResult = { success: false, error: "Gagal menyimpan jadwal. Coba lagi." };
  const saveRequests: string[] = [];
  await page.route("**/visual-fixtures/course-pricing", async (route) => {
    if (!route.request().headers()["next-action"]) return route.fallback();
    saveRequests.push(route.request().postData() ?? "");
    await route.fulfill({ contentType: "text/x-component", body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(saveResult)}\n` });
  });
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  const response = await page.goto("/visual-fixtures/course-pricing", { waitUntil: "networkidle", timeout: 120_000 });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/visual-fixtures/course-pricing");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByText("Limited Time Free akan dimulai").first()).toBeVisible();
  await expect(page.getByText("Limited Time Free telah berakhir").first()).toBeVisible();
  async function capture(name: string) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const path = testInfo.outputPath(`screenshots/${name}.png`);
    await page.screenshot({ path, fullPage: name === "catalog-admin-overview", animations: "disabled" });
    await testInfo.attach(name, { path, contentType: "image/png" });
  }
  await capture("catalog-admin-overview");
  for (const [index, name] of [[0, "admin-list"], [1, "admin-settings"], [2, "student-dashboard"], [3, "student-catalog"], [4, "student-overview-unlocked"], [5, "student-overview-locked"]] as const) {
    const path = testInfo.outputPath(`screenshots/${name}.png`);
    await page.locator('[data-testid="pricing-fixture"] > section').nth(index).screenshot({ path, animations: "disabled" });
    await testInfo.attach(name, { path, contentType: "image/png" });
  }
  await page.getByRole("button", { name: "Tambah mata kuliah" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await capture("admin-create-premium");
  await dialog.getByLabel("Kategori akses").focus();
  await expect(dialog.getByLabel("Kategori akses")).toBeFocused();
  await page.keyboard.press("Enter");
  await capture("admin-category-options");
  if (!(await page.getByRole("listbox").isVisible())) await dialog.getByLabel("Kategori akses").click();
  await page.getByRole("option", { name: "Free", exact: true }).click();
  await capture("admin-create-free");
  await dialog.getByLabel("Kategori akses").click();
  await page.getByRole("option", { name: "Limited Time Free" }).click();
  await capture("admin-create-limited");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit metadata" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture("admin-edit");
  await page.keyboard.press("Escape");
  const settings = page.locator('[data-testid="pricing-fixture"] > section').nth(1);
  await settings.getByLabel("Mulai (WIB)").fill("2030-01-03T08:00");
  await settings.getByLabel("Berakhir (WIB)").fill("2030-01-02T08:00");
  await settings.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Pastikan waktu mulai dan akhir WIB valid, dan waktu akhir setelah waktu mulai.")).toBeVisible();
  expect(saveRequests).toHaveLength(0);
  await capture("schedule-invalid");
  await settings.getByLabel("Berakhir (WIB)").fill("2030-01-04T08:00");
  await settings.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText(saveResult.error)).toBeVisible();
  expect(saveRequests).toHaveLength(1);
  expect(saveRequests[0]).toContain("limited_time_free");
  await capture("schedule-save-error");
  saveResult = { success: true, error: "" };
  await settings.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Informasi mata kuliah berhasil diperbarui.")).toBeVisible();
  expect(saveRequests).toHaveLength(2);
  await capture("schedule-saved");
  expect(errors).toEqual([]);
});
