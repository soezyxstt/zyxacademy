import { expect, test } from "@playwright/test";

test.setTimeout(120_000);
test("short link load failure can be retried", async ({ page }, info) => {
  const errors: string[] = [];
  let requests = 0;
  let recovered = false;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && !message.text().includes("503")) errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400 && !response.url().endsWith("/api/admin/short-links")) errors.push(`${response.status()} ${response.url()}`); });
  await page.route("**/api/admin/short-links", route => {
    requests += 1;
    return route.fulfill(recovered ? { json: [] } : { status: 503, json: {} });
  });
  await page.goto("/visual-fixtures/admin-short-links", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Tautan pendek tidak dapat dimuat.")).toBeVisible({ timeout: 60_000 });
  async function capture(name: string) {
    const path = info.outputPath(`screenshots/${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    await info.attach(name, { path, contentType: "image/png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await capture("error");
  recovered = true;
  await page.getByRole("button", { name: "Coba lagi" }).click();
  await expect(page.getByText("Belum ada tautan pendek.")).toBeVisible();
  await capture("recovered-empty");
  expect(requests).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test("creating a link after a load failure refreshes the list", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && !message.text().includes("503")) errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400 && !response.url().endsWith("/api/admin/short-links")) errors.push(`${response.status()} ${response.url()}`); });
  let reads = 0;
  let created = false;
  const link = { id: "visual-link", slug: "contoh", url: "https://example.com", title: "Tautan contoh", clicks: 0, createdAt: "2026-01-01T00:00:00Z" };
  await page.route("**/api/admin/short-links", route => {
    if (route.request().method() === "POST") {
      created = true;
      return route.fulfill({ json: link });
    }
    reads += 1;
    return route.fulfill(created ? { json: [link] } : { status: 503, json: {} });
  });
  await page.goto("/visual-fixtures/admin-short-links", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Tautan pendek tidak dapat dimuat.")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("URL tujuan").fill("https://example.com");
  await page.getByRole("button", { name: "Buat tautan", exact: true }).click();
  await expect(page.getByText("Tautan contoh")).toBeVisible();
  expect(reads).toBeGreaterThanOrEqual(2);
  const path = info.outputPath("screenshots/created-after-error.png");
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach("created-after-error", { path, contentType: "image/png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
