import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const shellRoot = resolve("apps/desktop/dist");

test.use({ storageState: { cookies: [], origins: [] } });

for (const colorScheme of ["light", "dark"] as const) {
  test(`desktop startup and recovery, ${colorScheme}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.emulateMedia({ colorScheme });
    await page.route("http://desktop-shell.test/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/offline-origin.js" || pathname === "/offline-shell.js") {
        await route.fulfill({ contentType: "text/javascript", body: "" });
        return;
      }
      if (pathname === "/offline-shell.css") {
        await route.fulfill({ contentType: "text/css", body: "" });
        return;
      }
      if (pathname === "/favicon.ico") {
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      const path = pathname === "/" ? "/index.html" : pathname;
      expect(path === "/index.html" || path.startsWith("/vendor/katex/")).toBe(true);
      await route.fulfill({
        status: 200,
        body: await readFile(resolve(shellRoot, `.${path}`)),
        contentType: path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css" : "font/woff2",
      });
    });
    await page.addInitScript(() => {
      // This script runs in Chromium, not Bun or an installed Tauri shell.
      type FixtureWindow = {
        __TAURI__: { core: { invoke: (command: string) => Promise<unknown> } };
        __desktopOnline: boolean;
        __desktopProbe: { resolve: () => void; reject: () => void } | null;
        fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
      };
      const fixture = window as unknown as FixtureWindow;
      fixture.__desktopOnline = true;
      fixture.__desktopProbe = null;
      Object.defineProperty(navigator, "onLine", { get: () => fixture.__desktopOnline });
      fixture.__TAURI__ = { core: { invoke: async (command) => {
        if (command === "get_desktop_server_origin") return "https://staging.zyxacademy.com";
        return { items: [], totalBytes: 0 };
      } } };
      fixture.fetch = (_input, init) => new Promise((resolveProbe, rejectProbe) => {
        fixture.__desktopProbe = {
          resolve: () => resolveProbe({ type: "opaque", ok: false } as Response),
          reject: () => rejectProbe(new TypeError("Fixture origin unavailable")),
        };
        init?.signal?.addEventListener("abort", fixture.__desktopProbe.reject, { once: true });
      });
    });

    await page.goto("http://desktop-shell.test/");
    await expect(page.locator("#offline-indicator")).toBeHidden();
    await expect(page.locator("#library-section")).toBeHidden();
    await expect(page.locator("#retry-button")).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`desktop-connecting-${colorScheme}.png`), fullPage: true, animations: "disabled" });

    await page.evaluate(() => (window as unknown as { __desktopProbe: { reject: () => void } }).__desktopProbe.reject());
    await expect(page.locator("#title")).toHaveText("Zyx belum dapat dibuka");
    await expect(page.locator("#offline-indicator")).toBeHidden();
    await expect(page.locator("#retry-button")).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`desktop-unavailable-${colorScheme}.png`), fullPage: true, animations: "disabled" });

    await page.evaluate(() => {
      (window as unknown as { __desktopOnline: boolean }).__desktopOnline = false;
      window.dispatchEvent(new Event("offline"));
    });
    await expect(page.locator("#offline-indicator")).toHaveText("Offline");
    await expect(page.locator("#library-section")).toBeVisible();
    await page.screenshot({ path: info.outputPath(`desktop-offline-${colorScheme}.png`), fullPage: true, animations: "disabled" });

    await page.evaluate(() => {
      (window as unknown as { __desktopOnline: boolean }).__desktopOnline = true;
      window.dispatchEvent(new Event("online"));
    });
    await expect(page.locator("#offline-indicator")).toBeHidden();
    await page.evaluate(() => (window as unknown as { __desktopProbe: { resolve: () => void } }).__desktopProbe.resolve());
    await expect(page.locator("#offline-indicator")).toBeHidden();
    await expect(page.getByRole("button", { name: "Buka aplikasi", exact: true })).toBeEnabled();
    await expect(page.locator("#title")).toHaveText("Bacaan tersimpan");
    await expect(page).toHaveURL("http://desktop-shell.test/");
    await page.screenshot({ path: info.outputPath(`desktop-restored-${colorScheme}.png`), fullPage: true, animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    expect(errors).toEqual([]);
  });
}
