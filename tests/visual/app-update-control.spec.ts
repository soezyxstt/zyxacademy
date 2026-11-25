import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { fixtureFontStyles } from "./fixtures/fonts";

// Exercise the real component and update bridge with an older binary's ACL responses.
let script: string;
let styles: string;
test.beforeAll(async () => {
  const stubs: Record<string, string> = {
    "@/components/ui/toast": "export const toast=Object.assign(()=>{},{error:()=>{}});",
    "@/lib/native/notifications": "export const sendDesktopNativeNotification=async()=>{};",
  };
  const result = await build({
    stdin: {
      contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import {AppUpdateControl} from "@/components/native/app-update-control"; createRoot(document.getElementById("root")).render(<AppUpdateControl variant="sidebar"/>);',
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    plugins: [{ name: "native-update-fixture", setup(builder) {
      builder.onResolve({ filter: /^@\// }, args => stubs[args.path]
        ? { path: args.path, namespace: "stub" }
        : builder.resolve(resolve(args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
      builder.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: stubs[args.path], loader: "js" }));
    } }],
  });
  script = result.outputFiles[0].text;
  const css = readFileSync(resolve("app/globals.css"), "utf8")
    .replace('@import "tailwindcss";', '@import "tailwindcss" source(none);')
    + `\n@source "${resolve("components").replaceAll("\\", "/")}";`;
  styles = (await postcss([tailwind()]).process(css, { from: resolve("app/globals.css") })).css + fixtureFontStyles();
});

for (const theme of ["light", "dark"]) {
  test(`installed version and manual update recovery, ${theme}`, async ({ page }, info) => {
    const issues: string[] = [];
    page.on("pageerror", error => issues.push(error.message));
    page.on("console", message => { if (message.type() === "error") issues.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400) issues.push(`${response.status()} ${response.url()}`); });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const timeout = window.setTimeout.bind(window);
      window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => timeout(handler, delay === 5000 ? 0 : delay, ...args)) as typeof window.setTimeout;
      Object.assign(window, { __TAURI__: { core: { invoke: async (command: string) => {
        if (command === "plugin:app|version") return "0.1.0-alpha.18";
        throw `Command ${command} not allowed by ACL`;
      } } } });
    });
    const origin = "https://staging.zyxacademy.com";
    await page.route(`${origin}/**`, route => {
      if (new URL(route.request().url()).pathname === "/api/app/latest") return route.fulfill({ json: { release: {
        channel: "nightly", tag: "app-v0.1.0-alpha.19-nightly.20261124.635ab54", version: "0.1.0-alpha.19", buildId: "635ab54",
        releaseUrl: "https://github.com/soezyxstt/zyxacademy/releases",
        downloads: { windows: "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.1.0-alpha.19-nightly.20261124.635ab54/zyx.exe" },
      } } });
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="id" class="${theme === "dark" ? "dark" : ""}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><body class="bg-background text-foreground font-sans"><div id="root" style="display:flex;justify-content:flex-end;padding:24px"></div><script>${script}</script></body></html>` });
    });
    await page.goto(origin);
    const trigger = page.getByRole("button", { name: "Pembaruan aplikasi tersedia", exact: true });
    await trigger.focus();
    await trigger.press("Enter");
    await expect(page.getByText("Nightly · 0.1.0-alpha.18", { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath("available.png"), animations: "disabled" });
    await page.getByRole("button", { name: "Perbarui", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("memerlukan pembaruan manual");
    await expect(page.getByRole("link", { name: "Unduh installer" })).toHaveAttribute("href", "/download");
    await expect(page.getByRole("button", { name: "Perbarui", exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("manual.png"), animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const panel = await page.locator("[data-slot=popover-content]").boundingBox();
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-slot=popover-content]")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(issues).toEqual([]);
  });
}
