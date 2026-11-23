import { test, expect, type Page } from "@playwright/test";

test.setTimeout(45_000);
async function searchModels(page: Page, query: string) {
  const input = page.getByPlaceholder("Cari fitur atau model...");
  if (!await input.isVisible()) await page.getByRole("button", { name: "Cari fitur atau model...", exact: true }).click();
  await input.fill(query);
}
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
    if (state === "conflict-banner") await searchModels(page, "Zyra");
    if (state === "all-default") await searchModels(page, "Playground");
    await capture(page, state, errors, info.outputPath(`${state}.png`));
  });
}
test("models edit save reset and conflict", async ({ page }, info) => {
  const errors = await prepare(page);
  await page.goto("/visual-fixtures/admin-ops-models?state=custom-only");
  await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible();
  const row = page.getByTestId("model-feature-row-zyra");
  await row.getByRole("button", { name: /Utama:/ }).first().click();
  await expect(page.locator("[data-slot=popover-content]")).toBeVisible();
  await capture(page, "open", errors, info.outputPath("model-open.png"));
  await page.getByRole("button", { name: "Gemini 2.5 Flash Lite", exact: true }).click();
  await capture(page, "dirty", errors, info.outputPath("model-dirty.png"));
  await row.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(row.getByRole("button", { name: "Tersimpan", exact: true })).toBeDisabled();
  await capture(page, "saved", errors, info.outputPath("model-saved.png"));
  await row.getByRole("button", { name: "Zyra: Tindakan", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reset", exact: true }).click();
  await expect(row).toHaveCount(0);
  await capture(page, "reset", errors, info.outputPath("model-reset.png"));
  await page.goto("/visual-fixtures/admin-ops-models?state=conflict");
  await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible();
  const conflict = page.getByTestId("model-feature-row-zyra");
  await conflict.getByRole("button", { name: /Utama:/ }).first().click();
  await page.getByRole("button", { name: "Gemini 2.5 Flash Lite", exact: true }).click();
  await conflict.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Konfigurasi model" })).toBeVisible();
  await searchModels(page, "Zyra");
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

test("models latency refresh preserves the catalog and updates observations", async ({ page }, info) => {
  const errors = await prepare(page);
  await page.clock.install();
  await page.goto("/visual-fixtures/admin-ops-models?state=latency-refresh&task=zyra");
  await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible();
  const refresh = page.getByRole("button", { name: "Perbarui latensi", exact: true });
  await refresh.click();
  await expect(refresh).toBeDisabled();
  await capture(page, "latency queued", errors, info.outputPath("latency-queued.png"));
  await page.clock.fastForward(10_000);
  await expect(refresh).toBeEnabled();
  await page.getByTestId("model-feature-row-zyra").getByRole("button", { name: /Utama:/ }).first().click();
  await page.locator('button[aria-label="OpenAI GPT"][data-size="icon"]').click();
  await expect(page.getByRole("button", { name: "gpt-future-fixture-long-title", exact: true })).toContainText("1,8 s");
  await capture(page, "latency updated", errors, info.outputPath("latency-updated.png"));
});

test("models discovered provider selection", async ({ page }, info) => {
  const errors = await prepare(page);
  await page.clock.install();
  await page.goto("/visual-fixtures/admin-ops-models?state=custom-only");
  await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible();
  const row = page.getByTestId("model-feature-row-zyra");
  await row.getByRole("button", { name: /Utama:/ }).first().click();
  await page.locator('button[aria-label="OpenAI GPT"][data-size="icon"]').click();
  const newest = page.getByRole("button", { name: "gpt-future-fixture-long-title", exact: true });
  await expect(newest).toContainText("1,1 s");
  await expect(page.locator('[data-slot="popover-content"] button[aria-description]').first()).toHaveAttribute("aria-label", "gpt-future-fixture-long-title");
  await expect(newest).toHaveAttribute("aria-description", /Median latensi/);
  await capture(page, "discovered open", errors, info.outputPath("discovered-open.png"));
  await page.getByRole("button", { name: "Urutan dan latensi model", exact: true }).click();
  await expect(page.getByText(/Latensi adalah median 3 respons/)).toBeVisible();
  await capture(page, "measurement help", errors, info.outputPath("measurement-help.png"));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "gpt-future-fixture-long-title", exact: true }).click();
  await row.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(row.getByRole("button", { name: "Tersimpan", exact: true })).toBeDisabled();
  await expect(row.getByRole("button", { name: /Utama:/ }).first()).toContainText("gpt-future-fixture-long-title");
  await capture(page, "discovered saved", errors, info.outputPath("discovered-saved.png"));
  await page.clock.fastForward(12 * 60 * 60_000 + 1000);
  await row.getByRole("button", { name: /Utama:/ }).first().click();
  await page.locator('button[aria-label="OpenAI GPT"][data-size="icon"]').click();
  await expect(page.getByRole("button", { name: "gpt-future-fixture-long-title", exact: true })).toContainText("Lama 1,1 s");
  await capture(page, "stale measurement", errors, info.outputPath("measurement-stale.png"));
});

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
  await searchModels(page, "Playground");
  const row = page.getByTestId("model-feature-row-playground");
  await row.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(row.locator('button[aria-busy="true"]')).toBeDisabled();
  await expect(row.getByRole("button", { name: /Utama:/ }).first()).toBeDisabled();
  await capture(page, "saving", errors, info.outputPath("models-saving.png"));
});

test("models provider search and compact mobile filters", async ({ page }, info) => {
  const errors = await prepare(page);
  await page.goto("/visual-fixtures/admin-ops-models?state=custom-only");
  await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible();
  const toolbar = page.getByTestId("model-filters");
  expect(await toolbar.evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(40);
  if (info.project.name === "mobile-380") {
    await toolbar.getByRole("button", { name: "Cari fitur atau model...", exact: true }).click();
    const search = page.getByPlaceholder("Cari fitur atau model...");
    await expect(search).toBeFocused();
    await search.fill("Zyra");
    await capture(page, "search", errors, info.outputPath("models-search.png"));
    await search.press("Escape");
    await expect(toolbar.getByRole("button", { name: "Cari fitur atau model...", exact: true })).toBeFocused();
    await expect(search).toHaveValue("");
  }
  const row = page.getByTestId("model-feature-row-zyra");
  await row.getByRole("button", { name: /Utama:/ }).click();
  await page.locator('button[aria-label="OpenAI GPT"][data-size="icon"]').click();
  const query = page.getByRole("textbox", { name: "Cari model" });
  await query.fill("tidak-ada-model");
  await expect(page.getByRole("status")).toBeVisible();
  await capture(page, "empty provider search", errors, info.outputPath("models-provider-empty.png"));
  await query.fill("GPT 6.2 Sol");
  await capture(page, "provider options", errors, info.outputPath("models-provider-options.png"));
  await page.getByRole("button", { name: "GPT 6.2 Sol", exact: true }).click();
  await expect(row.getByRole("button", { name: "Zyra Utama: GPT 6.2 Sol", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(row.getByRole("button", { name: "Tersimpan", exact: true })).toBeDisabled();
  await capture(page, "provider saved", errors, info.outputPath("models-provider-saved.png"));
});

test("models help and secondary actions in dark mode", async ({ page }, info) => {
  const errors = await prepare(page);
  await page.goto("/visual-fixtures/admin-ops-models?state=custom-only");
  await expect(page.locator('[data-fixture-ready="true"]')).toBeVisible();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const row = page.getByTestId("model-feature-row-zyra");
  await row.getByRole("button", { name: "Zyra: Ketentuan kapabilitas registri", exact: true }).click();
  await expect(page.getByText("Pilih 3 model berbeda", { exact: false })).toBeVisible();
  await capture(page, "dark help", errors, info.outputPath("models-dark-help.png"));
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: "Zyra: Tindakan", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Reset", exact: true })).toBeVisible();
  await capture(page, "dark actions", errors, info.outputPath("models-dark-actions.png"));
});

test("models focused tabs retain URL state and refresh", async ({ page }, info) => {
  const errors = await prepare(page);
  await page.goto("/visual-fixtures/admin-ops-models?state=custom-only&task=zyra");
  await expect(page.getByRole("tab", { name: "Zyra", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("model-feature-row-zyra")).toBeVisible();
  await expect(page.getByTestId("model-filters")).toHaveCount(0);
  await page.getByRole("button", { name: "Muat ulang", exact: true }).click();
  await capture(page, "Zyra tab", errors, info.outputPath("models-tab-zyra.png"));
  await page.getByRole("tab", { name: "Ops AI", exact: true }).click();
  await expect(page).toHaveURL(/task=admin-ops-ai/);
  await expect(page.getByTestId("model-feature-row-admin-ops-ai")).toBeVisible();
  await capture(page, "Ops AI tab", errors, info.outputPath("models-tab-ops.png"));
  const embedding = page.getByRole("tab", { name: "Embedding", exact: true });
  if (await embedding.isVisible()) await embedding.click();
  else {
    await page.getByRole("button", { name: "Lebih", exact: true }).click();
    await page.getByRole("menuitem", { name: "Embedding", exact: true }).click();
  }
  await expect(page).toHaveURL(/task=embedding/);
  await capture(page, "Embedding tab", errors, info.outputPath("models-tab-embedding.png"));
});
