import { chromium, type Page } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { preparePendingPagination } from "./PendingPagination";
import { sharedUiCases } from "../../../../packages/native-parity/shared-ui/cases";

const origin = process.env.SHARED_UI_REFERENCE_URL ?? "http://127.0.0.1:3217";
const scale = Number(process.env.PARITY_DPR ?? 1);
if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid PARITY_DPR");
const deviceViewport = process.env.SHARED_UI_VIEWPORT;
const deviceSize = deviceViewport?.match(/^(\d+)x(\d+)$/);
const baseWidth = Number(process.env.SHARED_UI_BASE_WIDTH);
if (deviceViewport && (!deviceSize || ![380, 768, 1024].includes(baseWidth) || !process.env.SHARED_UI_REFERENCES)) {
  throw new Error("Use SHARED_UI_VIEWPORT=WIDTHxHEIGHT, SHARED_UI_BASE_WIDTH=380|768|1024, and a separate SHARED_UI_REFERENCES directory for a device.");
}
const output = resolve(
  process.env.SHARED_UI_REFERENCES ??
    "tests/visual/native-parallel/shared-ui/references",
  `dpr${scale}`,
);
const selected = process.argv.slice(2);
if (selected.some(id => !sharedUiCases.some(fixture => fixture.id === id))) throw new Error("Unknown case ID");
if (selected.length && !process.env.SHARED_UI_REFERENCES) throw new Error("Use a separate SHARED_UI_REFERENCES directory for partial captures.");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
await mkdir(output, { recursive: true });

async function waitForState(page: Page, id: string) {
  await page.locator('html[data-hydrated="true"]').waitFor();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("[data-page-transition]")).every(
      (el) => Number(getComputedStyle(el).opacity) >= 0.999,
    ),
  );
  if (id.includes("-pagination-") && !id.endsWith("-pending")) {
    await page.getByRole("tab", { name: "Soal", exact: true }).click();
    const nav = page.getByRole("navigation", { name: "Halaman bank soal" });
    if (!id.endsWith("-first"))
      await nav.getByRole("button", { name: "Berikutnya" }).click();
    await nav.evaluate((el) => el.scrollIntoView({ block: "center" }));
  }
  if (id.includes("-table-")) {
    await page
      .getByText(
        id.endsWith("single")
          ? "Maya Ayuningtyas Kusumawardani"
          : id.endsWith("many")
            ? "Nara Pratama"
            : /belum ada/i,
      )
      .filter({ visible: true })
      .first()
      .waitFor();
  }
  if (id.includes("-grid-")) {
    const grid = page.locator('div.grid[class*="/documents:grid-cols-2"]').first();
    await grid.waitFor();
    const valid = await grid.evaluate(el => {
      const width = el.getBoundingClientRect().width;
      const expected = 1 + [464, 704, 944, 1184].filter(min => width >= min).length;
      return getComputedStyle(el).gridTemplateColumns.split(" ").length === expected;
    });
    if (!valid) throw new Error("Document grid does not match its source container breakpoints");
  }
  if (
    id === "shared-ui-calendar-available" ||
    id === "shared-ui-calendar-selected"
  ) {
    await page
      .getByText("Tutorial momentum", { exact: true })
      .first()
      .waitFor();
  }
  if (/^shared-(dialog|sheet|popover)-/.test(id) && !id.includes("-closed-")) {
    await page.getByRole("dialog").first().waitFor();
  }
  if (id === "shared-ui-composer-attachment")
    await page.locator('img[src^="data:image/"]').first().waitFor();
  if (id === "shared-dialog-validation-light")
    await page.getByRole("alert").filter({ hasText: "wajib" }).waitFor();
}

const results = [];
try {
  for (const fixture of sharedUiCases) {
    if (selected.length && !selected.includes(fixture.id)) continue;
    if (deviceSize && fixture.width !== baseWidth) continue;
    const { id, theme } = fixture;
    const width = deviceSize ? Number(deviceSize[1]) : fixture.width;
    const height = deviceSize ? Number(deviceSize[2]) : fixture.height;
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: scale,
      colorScheme: theme,
      locale: "id-ID",
      timezoneId: "Asia/Jakarta",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    await page.clock.setFixedTime(new Date("2026-03-02T05:00:00Z"));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const row = {
      id,
      theme,
      width,
      height,
      component: fixture.component,
      deviceScaleFactor: scale,
      readyId:
        "open" in fixture && fixture.open
          ? id + "-panel"
          : "shared-ui-case-" + id,
      keyboardTarget: "",
      errors,
      captured: false,
    };
    results.push(row);
    let release: (() => void) | undefined;
    try {
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (
          ["http:", "https:"].includes(url.protocol) &&
          (url.origin !== origin || route.request().method() !== "GET")
        ) {
          return route.abort();
        }
        return route.continue();
      });
      const response = await page.goto(`${origin}/${id}`, {
        waitUntil: "networkidle",
        timeout: 120000,
      });
      if (response?.status() !== 200)
        throw new Error(`HTTP ${response?.status()}`);
      await page.locator(`[data-reference="${id}"]`).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await waitForState(page, id);
      if (id === "shared-ui-pagination-pending") {
        release = await preparePendingPagination(page);
        await page.getByRole("button", { name: "Berikutnya", exact: true }).scrollIntoViewIfNeeded();
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      if (overflow > 1) errors.push(`Horizontal overflow: ${overflow}px`);
      await page.screenshot({
        path: resolve(output, `${id}.png`),
        animations: "disabled",
        caret: "hide",
      });
      row.captured = true;
      await page.keyboard.press("Tab");
      row.keyboardTarget = await page.evaluate(() => {
        const el = document.activeElement;
        return el
          ? [
              el.tagName,
              el.getAttribute("role"),
              el.getAttribute("aria-label") ||
                el.textContent?.trim()?.slice(0, 80),
            ]
              .filter(Boolean)
              .join(" ")
          : "";
      });
    } catch (error) {
      errors.push(String(error).slice(0, 1200));
    } finally {
      await context.close();
      release?.();
    }
    console.log(id, row.captured ? "PNG" : "MISSING", ...errors);
  }
} finally {
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  await browser.close();
}
if (results.some((r) => !r.captured || r.errors.length)) process.exitCode = 1;
