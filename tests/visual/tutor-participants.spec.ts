import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

test("participant search, filter and groups remain usable", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  if (process.env.VISUAL_CHECK_DISABLE_PUSH === "1") {
    await page.addInitScript(() => { delete (Navigator.prototype as { serviceWorker?: unknown }).serviceWorker; });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tutor/visual-math/participants");
  const filter = page.getByRole("combobox", { name: "Filter tipe pendaftaran" });
  await expect(filter).toContainText("Semua tipe", { timeout: 30_000 });
  await expect(page.getByText("Visual murid")).toBeVisible();
  async function capture(name: string) {
    const path = info.outputPath(`screenshots/${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    await info.attach(name, { path, contentType: "image/png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await capture("participants");
  await filter.click();
  await capture("filter-open");
  await page.getByRole("option", { name: "Langsung", exact: true }).click();
  const search = page.getByRole("textbox", { name: /Cari nama/ });
  await search.fill("tidak cocok");
  await expect(page.getByText("Visual murid")).not.toBeVisible();
  await capture("no-results");
  await search.clear();
  await page.getByRole("tab", { name: "Kelompok belajar" }).click();
  await capture("groups-empty");
  expect(errors).toEqual([]);
});
