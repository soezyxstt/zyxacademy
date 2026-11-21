import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import postcss from "postcss";
import { build } from "esbuild";

let script: string;
let styles: string;
test.beforeAll(async () => {
  const stylesheet = resolve("app/globals.css");
  styles = (await postcss([tailwind()]).process(readFileSync(stylesheet), { from: stylesheet })).css;
  const bundle = await build({
    entryPoints: ["tests/visual/fixtures/google-calendar-control.tsx"], bundle: true, write: false, format: "iife", minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "fixture-services", setup(builder) {
      builder.onResolve({ filter: /^@\/components\/providers\/locale-provider$/ }, () => ({ path: "locale", namespace: "fixture" }));
      builder.onResolve({ filter: /^@\/app\/actions\/google-calendar$/ }, () => ({ path: "actions", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "locale" ? 'export const useAppLocale = () => ({ locale: "id" })' : `
        export async function getGoogleCalendarStatus() { if (window.statusFailure) throw new Error("fixture unavailable"); return window.syncStatus; }
        export async function requestGoogleCalendarSync() { window.syncStatus.pending = true; return { ok: true }; }
        export async function connectGoogleCalendar() { return { url: null }; }
      ` }));
    } }],
  });
  script = bundle.outputFiles[0].text;
});

for (const state of ["disconnected", "ready", "pending", "failed", "reconnect", "unconfigured", "central-reconnect", "status-failed"]) {
  test(`calendar control ${state}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setContent('<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>');
    await page.evaluate(state => {
      (window as any).syncStatus = { connected: state !== "disconnected", configured: state !== "unconfigured", pending: state === "pending", error: ["failed", "reconnect"].includes(state) ? state : null, lastSyncedAt: state === "ready" ? "2026-11-21T03:00:00Z" : null };
      (window as any).statusFailure = state === "status-failed";
      if (state === "central-reconnect") (window as any).syncStatus.error = "reconnect";
      location.hash = ["unconfigured", "central-reconnect"].includes(state) ? "central" : "";
    }, state);
    await page.addStyleTag({ content: styles });
    await page.addScriptTag({ content: script });
    const trigger = page.getByRole("button", { name: /^(Google Calendar|Google Calendar Zyx)$/ });
    const overlaps = await page.locator("main > div > div:first-child button").evaluateAll(buttons => {
      const boxes = buttons.map(button => ({ name: button.getAttribute("aria-label") || button.textContent, rect: button.getBoundingClientRect() })).filter(item => item.rect.width && item.rect.height);
      return boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b => Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > 1 && Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > 1).map(b => `${a.name} / ${b.name}`));
    });
    expect(overlaps).toEqual([]);
    await trigger.focus();
    await page.screenshot({ path: testInfo.outputPath("closed.png") });
    await trigger.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    const action = page.getByRole("button", { name: /Hubungkan|Sinkronkan sekarang|Muat ulang status/ });
    if (["pending", "unconfigured"].includes(state)) await expect(action).toBeDisabled();
    else await expect(action).toBeEnabled();
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.locator("html").evaluate(e => e.clientWidth));
    await page.screenshot({ path: testInfo.outputPath("open.png") });
    if (state === "central-reconnect") await expect(page.getByRole("status")).toContainText("token Google pusat");
    if (state === "status-failed") {
      await expect(action).toHaveText("Muat ulang status");
      await page.evaluate(() => { (window as any).statusFailure = false; });
      await action.click();
      await expect(page.getByRole("button", { name: "Sinkronkan sekarang", exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("status-recovered.png") });
    }
    if (state === "ready") {
      await action.click();
      await expect(action).toBeDisabled();
      await expect(page.getByRole("status")).toContainText("dalam antrean");
      await page.screenshot({ path: testInfo.outputPath("queued.png") });
    }
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test("denied consent stays visible after successful status refresh", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.route("http://fixture.test/**", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>' }));
  await page.goto("http://fixture.test/?calendarSync=error");
  await page.evaluate(() => { (window as any).syncStatus = { connected: false, configured: true, pending: false, error: null, lastSyncedAt: null }; });
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
  await page.getByRole("button", { name: "Google Calendar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Sinkronisasi gagal");
  await page.clock.fastForward(11000);
  await expect(page.getByRole("status")).toContainText("Sinkronisasi gagal");
  await page.screenshot({ path: testInfo.outputPath("denied-after-refresh.png") });
});
