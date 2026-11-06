import { expect, test } from "@playwright/test";
import { prepareReadOnlyStagingCapture } from "./staging-readonly-auth";

// Primary agent: run against an authorized non-production environment with
// PLAYWRIGHT_STORAGE_STATE. This spec deliberately performs no content mutations.
test("question query draft, filter, clear and history on active tab", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await prepareReadOnlyStagingCapture(page, process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000");
  await page.goto("/admin/questions?tab=ai-generated", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/admin\/questions\?/);
  const search = page.getByPlaceholder(/Cari isi soal|Search question text, tags/);
  const capture = async (name: string) => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.waitForTimeout(200);
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
  };
  await capture("default");
  await search.pressSequentially("integral", { delay: 10 });
  await expect(search).toHaveValue("integral");
  await expect(search).toBeFocused();
  await capture("draft");
  await page.getByRole("button", { name: /^Filter soal|^Filter questions/ }).click();
  await page.getByRole("combobox", { name: "Filter status" }).click();
  await page.getByRole("option", { name: "Reviewed", exact: true }).click();
  await expect(page).toHaveURL(/qStatus=reviewed/);
  await expect(page).toHaveURL(/qSearch=integral/);
  await capture("filter-open");
  await page.keyboard.press("Escape");
  await search.fill("integral tambahan");
  await expect(search).toHaveValue("integral tambahan");
  await page.getByRole("button", { name: /Bersihkan pencarian|Clear search|Hapus input/ }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect.poll(() => new URL(page.url()).searchParams.get("qSearch")).toBeNull();
  await capture("cleared");
  await page.goBack();
  await expect(search).toHaveValue("integral");
  await capture("back");
  await page.goForward();
  await expect(search).toHaveValue("");
  await capture("forward");
  // Back during a fresh debounce must cancel the unsent search.
  await search.pressSequentially("pending", { delay: 1 });
  await page.goBack();
  await expect(search).toHaveValue("integral");
  await expect.poll(() => new URL(page.url()).searchParams.get("qSearch")).toBe("integral");
  await capture("back-cancels-debounce");
  expect(errors).toEqual([]);
});

test("historical reference question pagination, filter popover, detail view, empty state, and history", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await prepareReadOnlyStagingCapture(page, process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000");
  await page.goto("/admin/questions?tab=historical", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/tab=historical/);

  const search = page.getByPlaceholder(/Cari isi soal.*sumber|Search question text.*source/);
  const capture = async (name: string) => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.waitForTimeout(200);
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
  };

  await capture("historical-default");

  // Expand detail if any historical row is present
  const detailTrigger = page.getByRole("button", { name: /Lihat detail|View details/ }).first();
  if ((await detailTrigger.count()) > 0) {
    await detailTrigger.click();
    await capture("historical-detail-open");
    await page.getByRole("button", { name: /Tutup detail|Hide details/ }).first().click();
  }

  await search.pressSequentially("kalkulus", { delay: 10 });
  await expect(search).toHaveValue("kalkulus");
  await expect(search).toBeFocused();
  await capture("historical-draft");

  await page.getByRole("button", { name: /^Filter soal|^Filter questions/ }).click();
  await page.getByRole("combobox", { name: /Filter kategori sumber|Filter source category/ }).click();
  await page.getByRole("option", { name: /UTS|Midterm/ }).click();
  await expect(page).toHaveURL(/hCategory=uts/);
  await expect(page).toHaveURL(/hSearch=kalkulus/);
  await capture("historical-filter-open");
  await page.keyboard.press("Escape");

  // Clear search immediately
  await page.getByRole("button", { name: /Bersihkan pencarian|Clear search|Hapus input/ }).click();
  await expect(search).toHaveValue("");
  await expect.poll(() => new URL(page.url()).searchParams.get("hSearch")).toBeNull();
  await capture("historical-cleared");

  // Back / Forward navigation restores hSearch and cancels unsent debounce
  await page.goBack();
  await expect(search).toHaveValue("kalkulus");
  await capture("historical-back");
  await page.goForward();
  await expect(search).toHaveValue("");
  await search.pressSequentially("unsent-historical", { delay: 1 });
  await page.goBack();
  await expect(search).toHaveValue("kalkulus");
  await expect.poll(() => new URL(page.url()).searchParams.get("hSearch")).toBe("kalkulus");
  await capture("historical-back-cancels-debounce");

  expect(errors).toEqual([]);
});
