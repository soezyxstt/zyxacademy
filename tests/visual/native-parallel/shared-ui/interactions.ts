import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright-core";

const origin = process.env.SHARED_UI_REFERENCE_URL ?? "http://127.0.0.1:3217";
const browser: Browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
});
let failures = 0;

async function scenario(
  name: string,
  id: string,
  run: (page: Page) => Promise<void>,
  touch = false,
) {
  if (
    process.env.INTERACTIONS_FILTER &&
    !name.includes(process.env.INTERACTIONS_FILTER)
  )
    return;
  const context = await browser.newContext({
    viewport: { width: 380, height: 760 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    reducedMotion: "reduce",
    ...(touch ? { hasTouch: true, isMobile: true } : {}),
  });
  const page = await context.newPage();
  try {
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        ["http:", "https:"].includes(url.protocol) &&
        (url.origin !== origin || route.request().method() !== "GET")
      )
        return route.abort();
      return route.continue();
    });
    const response = await page.goto(`${origin}/${id}`, {
      waitUntil: "networkidle",
      timeout: 120_000,
    });
    assert.equal(response?.status(), 200, `HTTP ${response?.status()}`);
    await page.locator(`[data-reference="${id}"]`).waitFor();
    await run(page);
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(
      `FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await context.close();
  }
}

async function noOverflow(page: Page) {
  const delta = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  assert.ok(delta <= 1, `horizontal overflow ${delta}px`);
}

try {
  await scenario(
    "dialog keyboard validation, Escape and focus",
    "shared-dialog-closed-light",
    async (page) => {
      const trigger = page.getByRole("button", { name: "Perubahan jadwal" });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ state: "visible" });
      await dialog.getByRole("button", { name: "Ajukan permohonan" }).focus();
      await page.keyboard.press("Enter");
      assert.match(await dialog.getByRole("alert").innerText(), /wajib diisi/i);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await trigger.waitFor({ state: "visible" });
      await page.waitForFunction(
        () =>
          document.activeElement?.textContent?.trim() === "Perubahan jadwal",
      );
    },
  );

  await scenario(
    "sheet trigger and focus restoration",
    "shared-sheet-closed-light",
    async (page) => {
      const trigger = page.getByRole("button", { name: "Daftar isi" });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const sheet = page.getByRole("dialog");
      await sheet.waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "hidden" });
      await page.waitForFunction(
        () => document.activeElement?.textContent?.trim() === "Daftar isi",
      );
    },
  );

  await scenario(
    "screen-reader page title",
    "shared-ui-header-long-title-light",
    async (page) => {
      const heading = page.getByRole("heading", { level: 1 });
      assert.match(await heading.innerText(), /Dokumen Fisika dasar/);
      assert.equal(await heading.getAttribute("data-sr-only-header"), "");
      assert.equal(
        await heading.evaluate((el) => el.classList.contains("sr-only")),
        true,
      );
    },
  );

  await scenario(
    "search keyboard, populated value and clear",
    "shared-ui-search-collapsed",
    async (page) => {
      const trigger = page.getByRole("button", { name: "Cari pertanyaan" });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const input = page.getByRole("textbox", { name: "Cari pertanyaan" });
      await input.waitFor({ state: "visible" });
      await input.fill("Gelombang");
      assert.equal(await input.inputValue(), "Gelombang");
      await page.getByRole("button", { name: "Bersihkan pencarian" }).click();
      assert.equal(await input.inputValue(), "");
      await input.press("Escape");
      await page.waitForFunction(
        () =>
          document.activeElement?.getAttribute("aria-label") ===
            "Cari pertanyaan" && document.activeElement?.tagName === "BUTTON",
      );
    },
  );

  await scenario(
    "list error retry",
    "shared-ui-list-error-light",
    async (page) => {
      await page.getByRole("button", { name: "Coba lagi" }).click();
      await page
        .getByText("Nara Pratama")
        .first()
        .waitFor({ state: "visible" });
      assert.equal(
        await page.getByText("Daftar pengguna gagal dimuat").count(),
        0,
      );
    },
  );

  await scenario(
    "empty list reset",
    "shared-ui-list-empty-dark",
    async (page) => {
      await page.getByRole("button", { name: "Reset filter" }).click();
      await page
        .getByText("Nara Pratama")
        .first()
        .waitFor({ state: "visible" });
      assert.equal(
        await page.getByText("Tidak ada pengguna yang cocok").count(),
        0,
      );
    },
  );

  await scenario(
    "calendar changes date",
    "shared-ui-calendar-empty",
    async (page) => {
      const tabs = page.getByRole("tablist").getByRole("tab");
      assert.equal(await tabs.count(), 7);
      assert.equal(await tabs.nth(0).getAttribute("aria-selected"), "true");
      await tabs.nth(2).click();
      assert.equal(await tabs.nth(2).getAttribute("aria-selected"), "true");
    },
  );

  await scenario(
    "tabs change selection",
    "navigation-tabs-overflow-light",
    async (page) => {
      const tablist = page.getByRole("tablist");
      const target = tablist.getByRole("tab", { name: "Ringkasan" });
      await target.click();
      assert.equal(await target.getAttribute("aria-selected"), "true");
    },
  );

  await scenario(
    "long table name wraps at 380px",
    "shared-ui-table-single",
    async (page) => {
      const name = page
        .locator("p")
        .filter({ hasText: "Maya Ayuningtyas Kusumawardani" });
      await name.waitFor({ state: "visible" });
      const fits = await name.evaluate(
        (el) => el.scrollWidth <= el.clientWidth + 1,
      );
      assert.equal(fits, true, "long participant name is clipped");
      await noOverflow(page);
    },
  );

  await scenario(
    "large text and overflow",
    "shared-ui-table-single",
    async (page) => {
      await page.addStyleTag({
        content: "html { font-size: 125% !important; }",
      });
      await page
        .locator("p")
        .filter({ hasText: "Maya Ayuningtyas Kusumawardani" })
        .waitFor({ state: "visible" });
      await noOverflow(page);
      const name = page
        .locator("p")
        .filter({ hasText: "Maya Ayuningtyas Kusumawardani" });
      assert.equal(
        await name.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        true,
        "large text is clipped",
      );
    },
  );

  await scenario(
    "touch search",
    "shared-ui-search-collapsed",
    async (page) => {
      await page.getByRole("button", { name: "Cari pertanyaan" }).tap();
      const input = page.getByRole("textbox", { name: "Cari pertanyaan" });
      await input.fill("Energi");
      assert.equal(await input.inputValue(), "Energi");
      await page.getByRole("button", { name: "Bersihkan pencarian" }).tap();
      assert.equal(await input.inputValue(), "");
    },
    true,
  );
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
