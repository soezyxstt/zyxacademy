import { test, expect, type Page, type TestInfo } from "@playwright/test";

async function openConsent(page: Page, theme: "light" | "dark", profile = "") {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
  await page.addInitScript(theme => {
    localStorage.setItem("theme", theme);
    // Local consent fixtures neither provision push nor submit authorization.
    delete (Navigator.prototype as { serviceWorker?: unknown }).serviceWorker;
  }, theme);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  const path = `/visual-fixtures/mcp-consent${profile ? `?profile=${profile}` : ""}`;
  const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 180000 });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(path);
  await expect(page.locator("body")).toHaveAttribute("data-mcp-fixture-ready", "true");
  await expect(page.locator("html")).toHaveClass(new RegExp(theme));
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  return failures;
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

for (const theme of ["light", "dark"] as const) {
  test(`URL connection exposes all permissions with four selected, ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(240000);
    const failures = await openConsent(page, theme);
    await expect(page.getByText("4 dari 46 izin", { exact: true })).toBeVisible();
    await expect(page.locator('input[name="selected_scope"]')).toHaveCount(4);
    await expect(page.getByRole("button", { name: /^Authoring/ })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("checkbox", { name: "Publikasikan konten belajar", exact: true })).not.toBeChecked();
    const first = page.getByRole("checkbox", { name: "Pilih semua izin dalam Authoring", exact: true });
    await first.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
    await expect(first).toBeFocused();
    expect(await first.evaluate(element => element.matches(":focus-visible"))).toBe(true);
    expect(await first.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe("none");
    await capture(page, testInfo, "consent-initial-focus");

    const closedGroups = page.locator('main button[aria-expanded="false"]');
    while (await closedGroups.count()) await closedGroups.first().click();
    await expect(page.getByRole("checkbox")).toHaveCount(52); // 46 scopes and six groups.
    const forms = page.getByRole("checkbox", { name: "Kelola formulir", exact: true });
    await expect(forms).not.toBeChecked();
    await forms.click();
    await expect(page.getByText("5 dari 46 izin", { exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Pilih semua izin dalam Konten dan formulir", exact: true })).toHaveAttribute("aria-checked", "mixed");
    await expect(page.locator('input[name="selected_scope"][value="forms:write"]')).toHaveCount(1);
    await expect(page.locator('input[name="selected_scope"][value="users:roles:admin"]')).toHaveCount(0);
    await capture(page, testInfo, "consent-all-options-selected-subset");

    // Group toggles clear the selected subset without hiding available scopes.
    for (const group of await page.getByRole("checkbox", { name: /^Pilih semua izin dalam/ }).all()) {
      if (await group.getAttribute("aria-checked") === "mixed") await group.click();
      if (await group.isChecked()) await group.click();
    }
    const openGroups = page.locator('main button[aria-expanded="true"]');
    while (await openGroups.count()) await openGroups.first().click();
    await expect(page.getByText("0 dari 46 izin", { exact: true })).toBeVisible();
    await expect(page.locator('input[name="selected_scope"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Izinkan Zyx Admin" })).toBeDisabled();
    await capture(page, testInfo, "consent-no-scopes");
    expect(failures).toEqual([]);
  });

  test(`explicit scope request stays limited, ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const failures = await openConsent(page, theme, "narrow");
    await expect(page.getByText("6 dari 6 izin", { exact: true })).toBeVisible();
    await expect(page.locator('input[name="scope"]')).toHaveValue("forms:read forms:write forms:responses:read forms:responses:export courses:read courses:write");
    await expect(page.locator('input[name="selected_scope"]')).toHaveCount(6);
    await expect(page.getByRole("button", { name: /^Authoring/ })).toHaveCount(0);
    const forms = page.getByRole("checkbox", { name: "Kelola formulir", exact: true });
    await forms.click(); await expect(forms).not.toBeChecked();
    await expect(page.getByText("5 dari 6 izin", { exact: true })).toBeVisible();
    await capture(page, testInfo, "consent-narrow-request");
    expect(failures).toEqual([]);
  });
}
