import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { fixtureFontStyles } from "./fixtures/fonts";

let script: string;
let styles: string;
const origin = "http://account-transition.test";
test.beforeAll(async () => {
  const css = resolve("app/globals.css");
  styles = (await postcss([tailwind()]).process(readFileSync(css), { from: css })).css + fixtureFontStyles();
  const bundle = await build({
    entryPoints: ["tests/visual/fixtures/account-transition.tsx"], bundle: true, write: false, format: "iife", minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
  });
  script = bundle.outputFiles[0].text;
});

test("remote account change freezes forms and portals until cancellation", async ({ page }, info) => {
  const issues: string[] = [];
  page.on("pageerror", error => issues.push(error.message));
  page.on("console", message => { if (message.type() === "error") issues.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) issues.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(`${origin}/**`, route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body class="bg-background"><div id="root"></div><script>${script}</script></body></html>` }));
  await page.goto(origin);
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: "Simpan profil", exact: true }).click();
  await expect(page.getByText("Tersimpan: 1", { exact: true })).toBeVisible();
  await page.locator("#profile-name").focus();

  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", {
    key: "zyx-account-transition-v1",
    newValue: JSON.stringify({ source: "other-tab", phase: "begin", at: Date.now() }),
  })));
  await expect(page.getByRole("status")).toHaveText("Berganti akun...");
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    (document.getElementById("profile-form") as HTMLFormElement).requestSubmit();
    (document.getElementById("portal-save") as HTMLButtonElement).click();
  });
  expect(await page.evaluate(() => (window as unknown as { fixtureWrites: number }).fixtureWrites)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { fixturePortalWrites: number }).fixturePortalWrites)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("remote-account-paused.png"), fullPage: true, animations: "disabled" });

  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", {
    key: "zyx-account-transition-v1",
    newValue: JSON.stringify({ source: "other-tab", phase: "cancel", at: Date.now() }),
  })));
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Simpan profil", exact: true }).click();
  await page.getByRole("button", { name: "Simpan dari dialog", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { fixtureWrites: number }).fixtureWrites)).toBe(2);
  expect(await page.evaluate(() => (window as unknown as { fixturePortalWrites: number }).fixturePortalWrites)).toBe(1);

  // The originating tab keeps its own account-menu loading state.
  await page.evaluate(() => (window as unknown as { fixtureLocalTransition: (pending: boolean) => void }).fixtureLocalTransition(true));
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { fixtureLocalTransition: (pending: boolean) => void }).fixtureLocalTransition(false));
  await page.screenshot({ path: info.outputPath("remote-account-restored.png"), fullPage: true, animations: "disabled" });
  expect(issues).toEqual([]);
});
