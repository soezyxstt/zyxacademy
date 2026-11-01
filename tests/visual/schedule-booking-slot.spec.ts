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
  // The component uses the real translation catalog. Its account locale is fixed
  // so that importing the application provider cannot pull server actions into this fixture.
  const bundle = await build({
    entryPoints: ["tests/visual/fixtures/schedule-booking-slot.tsx"],
    bundle: true, write: false, format: "iife", minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{
      name: "fixture-locale",
      setup(build) {
        build.onResolve({ filter: /^@\/components\/providers\/locale-provider$/ }, () => ({
          path: "fixture-locale", namespace: "fixture",
        }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: 'export const useAppLocale = () => ({ locale: "id" })',
        }));
      },
    }],
  });
  script = bundle.outputFiles[0].text;
});

for (const mode of ["Minggu", "Hari", "Bulan"]) {
  test(`student can rebook released slots and cannot select started slots in ${mode}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) errors.push(response.url()); });
    await page.clock.install({ time: new Date("2026-06-01T02:00:00Z") });
    await page.clock.pauseAt(new Date("2026-06-01T02:59:59Z"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setContent('<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="root"></main></body></html>');
    await page.addStyleTag({ content: styles });
    await page.addScriptTag({ content: script });

    const view = page.getByRole("combobox").first();
    await expect(view).toContainText("Minggu");
    if (mode !== "Minggu") {
      await view.click();
      await page.getByRole("option", { name: mode, exact: true }).click();
    }

    const starting = page.getByRole("button", { name: /Tutor: Nara/ });
    const released = page.getByRole("button", { name: /Tutor: Sinta/ });
    await expect(starting).toBeVisible();
    await released.click();
    await expect(page.locator("main")).toHaveAttribute("data-selected", "released");
    const history = page.getByRole("button", { name: /Kalkulus.*Dibatalkan/ });
    await history.click();
    await expect(page.locator("main")).toHaveAttribute("data-detail", "past-booking");
    await starting.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("before-start.png") });

    await page.clock.fastForward(1000);
    await expect(page.getByText("Tutor: Nara", { exact: true })).toBeVisible();
    await expect(starting).toHaveCount(0);
    await expect(released).toBeVisible();
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.locator("html").evaluate((html) => html.clientWidth));
    await page.screenshot({ path: testInfo.outputPath("at-start.png") });
    expect(errors).toEqual([]);
  });
}
