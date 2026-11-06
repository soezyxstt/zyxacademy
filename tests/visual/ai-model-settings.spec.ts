import { test, expect, type Page } from "@playwright/test";

test.setTimeout(45_000);
async function prepare(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  return errors;
}
async function capture(page: Page, name: string, errors: string[], path: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal { display:none !important; }" });
  await page.screenshot({ path, fullPage: name !== "open", animations: "disabled" });
  expect(new URL(page.url()).pathname).toContain("/visual-fixtures/");
  const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, wide: [...document.querySelectorAll("*")].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth && !e.closest("table")).slice(0,10).map(e => ({ tag:e.tagName, classes:e.className, width:e.getBoundingClientRect().width, overflow:getComputedStyle(e).overflowX, parent: e.parentElement?.className, parentOverflow: e.parentElement ? getComputedStyle(e.parentElement).overflowX : "", parentW: e.parentElement?.getBoundingClientRect().width })) }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
  expect(errors, name).toEqual([]);
}
for (const state of ["custom-only", "all-default", "empty-search", "conflict-banner"]) {
  test(`models ${state}`, async ({ page }, info) => {
    const errors = await prepare(page);
    await page.goto(`/visual-fixtures/admin-ops-models?state=${state}`);
    await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible();
    if (state === "conflict-banner") await page.getByPlaceholder("Cari fitur atau model...").fill("Zyra");
    if (state === "all-default") await page.getByPlaceholder("Cari fitur atau model...").fill("Playground");
    await capture(page, state, errors, info.outputPath(`${state}.png`));
  });
}
test("models edit save reset and conflict", async ({ page }, info) => {
  const errors = await prepare(page);
  await page.goto("/visual-fixtures/admin-ops-models?state=custom-only");
  await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible();
  const row = page.getByTestId("model-feature-row-zyra");
  await row.getByRole("combobox").first().click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await capture(page, "open", errors, info.outputPath("model-open.png"));
  if (!(await page.getByRole("option").count())) await row.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Gemini 2.5 Flash Lite", exact: true }).click();
  await capture(page, "dirty", errors, info.outputPath("model-dirty.png"));
  await row.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(row.getByRole("button", { name: "Tersimpan", exact: true })).toBeDisabled();
  await capture(page, "saved", errors, info.outputPath("model-saved.png"));
  await row.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(row).toHaveCount(0);
  await capture(page, "reset", errors, info.outputPath("model-reset.png"));
  await page.goto("/visual-fixtures/admin-ops-models?state=conflict");
  await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible();
  const conflict = page.getByTestId("model-feature-row-zyra");
  await conflict.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Gemini 2.5 Flash Lite", exact: true }).click();
  await conflict.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Konfigurasi model" })).toBeVisible();
  await page.getByPlaceholder("Cari fitur atau model...").fill("Zyra");
  await capture(page, "conflict", errors, info.outputPath("model-conflict.png"));
});

for (const state of ["populated", "empty", "loading", "error"]) {
  test(`analytics ${state}`, async ({ page }, info) => {
    const errors = await prepare(page);
    const logs = Array.from({ length: state === "empty" ? 0 : 18 }, (_, i) => ({ timestamp: "2026-11-05T08:30:00.000Z", operation: "generateContent", model: "gemini-3.5-flash-lite", viaGateway: true, latencyMs: 1200 + i, success: i % 5 !== 0 }));
    await page.route("**/api/admin/ai-analytics", async route => {
      if (state === "loading" || state === "error") return;
      await route.fulfill({ json: { totalRequests: logs.length, successfulRequests: logs.length ? 14 : 0, failedRequests: logs.length ? 4 : 0, gatewayRequests: logs.length, directRequests: 0, averageLatencyMs: 1200, gatewaySuccessRate: 78, directSuccessRate: 0, recentLogs: logs } });
    });
    await page.route("**/api/admin/ai-analytics/usage?**", route => route.fulfill({ json: { success: true, data: { users: Array.from({ length: state === "empty" ? 0 : 18 }, (_, i) => ({ userId: `user-${i}`, name: `Mahasiswa ${i + 1}`, email: `student${i}@example.test`, requests: i + 1, inputTokens: 200, outputTokens: 100, totalTokens: 300 })), daily: state === "empty" ? [] : [{ date: "2026-11-04", requests: 10, inputTokens: 300, outputTokens: 150 }, { date: "2026-11-05", requests: 18, inputTokens: 500, outputTokens: 250 }] } } }));
    await page.goto("/visual-fixtures/admin-ai-analytics");
    if (state === "error") {
      // Simulate a transport failure, keeping the HTTP-response gate strict.
      await page.unroute("**/api/admin/ai-analytics");
      await page.route("**/api/admin/ai-analytics", route => route.fulfill({ status: 200, body: "invalid json" }));
      await page.reload();
      await expect(page.getByRole("button", { name: /Coba lagi/i })).toBeVisible({ timeout: 30000 });
    } else if (state === "loading") {
      await expect(page.getByRole("status")).toBeVisible();
    } else {
      if (state === "empty") await expect(page.getByText("Belum ada permintaan model yang tercatat")).toBeVisible();
      else await expect(page.locator("#ai-analytics-refresh")).toBeVisible();
      await expect(page.getByText("Memuat data penggunaan Zyra...")).toHaveCount(0);
    }
    await capture(page, state, errors, info.outputPath(`analytics-${state}.png`));
    if (state === "populated") {
      const buttons = page.getByRole("button", { name: /Berikutnya|Next/i });
      for (const button of await buttons.all()) await button.click();
      await capture(page, "pagination", errors, info.outputPath("analytics-page-two.png"));
      await page.getByRole("combobox").click();
      await page.getByRole("option", { name: "7 Hari Terakhir", exact: true }).click();
      await expect(page.getByText("Memuat data penggunaan Zyra...")).toHaveCount(0);
      await page.locator(".overflow-x-auto").evaluateAll(elements => elements.forEach(element => { element.scrollLeft = element.scrollWidth; }));
      await capture(page, "filtered and scrolled tables", errors, info.outputPath("analytics-filtered.png"));
    }
  });
}

test("models at sidebar breakpoint", async ({ page }, info) => {
  test.skip(info.project.name === "mobile-380");
  const errors = await prepare(page);
  await page.setViewportSize({ width: 1024, height: 864 });
  await page.goto("/visual-fixtures/admin-ops-models?state=custom-only");
  await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible();
  await capture(page, "sidebar breakpoint", errors, info.outputPath("models-1024.png"));
});

test("models saving state", async ({ page }, info) => {
  const errors = await prepare(page);
  await page.goto("/visual-fixtures/admin-ops-models?state=saving");
  await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible();
  await page.getByPlaceholder("Cari fitur atau model...").fill("Playground");
  const row = page.getByTestId("model-feature-row-playground");
  await row.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(row.locator('button[aria-busy="true"]')).toBeDisabled();
  await expect(row.getByRole("combobox").first()).toBeDisabled();
  await capture(page, "saving", errors, info.outputPath("models-saving.png"));
});
