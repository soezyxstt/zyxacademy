import { build, type Plugin } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { DEFAULT_PRICING_DISCOUNTS } from "../../../../../lib/pricing-discounts";
import { fixtureFontStyles } from "../../../fixtures/fonts";
import marketing from "../../../../../messages/id/marketing.json";

const path = fileURLToPath(new URL(".", import.meta.url));
const base = "http://localhost:3212";
const fixedTime = "2026-09-20T05:00:00.000Z";
const overrides: Record<string, string> = {
  "next/link": "import React from 'react'; export default function Link({ href, children, ...props }) { return React.createElement('a', { ...props, href }, children); }",
  "@/lib/env": "export const env = { NEXT_PUBLIC_WHATSAPP_NUMBER: '6280000000000' };",
  "@/lib/i18n/client": "export { useTranslations } from 'next-intl'; export function useAppLocale() { return { locale: 'id' }; }",
};
const boundaries: Plugin = {
  name: "public-plans-browser-boundaries",
  setup(builder) {
    builder.onResolve({ filter: /^(next\/link|@\/lib\/env|@\/lib\/i18n\/client)$/ }, ({ path }) => ({ path, namespace: "plans-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "plans-fixture" }, ({ path }) => ({ contents: overrides[path], resolveDir: process.cwd() }));
  },
};

async function main() {
  const [bundle, canonicalCss] = await Promise.all([
    build({ entryPoints: [resolve(path, "plans-browser.tsx")], bundle: true, format: "iife", write: false, minify: true,
      plugins: [boundaries], define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" } }),
    readFile("app/globals.css", "utf8"),
  ]);
  const highlight = [
    '@source "../app/(marketing)/plans";',
    '@source "../components/pricing";',
    '@source "../components/ui";',
    '@source "../components/marketing-page-hero.tsx";',
    '@source "../components/layout/section-container.tsx";',
  ].join("\n");
  const input = canonicalCss.replace('@import "tailwindcss";', '@import "tailwindcss" source(none);') + "\n" + highlight;
  const { css } = await postcss([tailwind()]).process(input, { from: resolve("app/globals.css") });
  const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE, args: ["--force-color-profile=srgb"] });
  const cases = [];
  try {
    for (const { width, height } of [{ width: 380, height: 844 }, { width: 1536, height: 864 }]) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: "id-ID", timezoneId: "UTC", reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        await page.clock.setFixedTime(new Date(fixedTime));
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        await context.route("**/*", route => {
          const url = route.request().url();
          if (url === `${base}/plans`) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id"><head></head><body><div id="root"></div></body></html>' });
          if (url === `${base}/api/pricing`) return route.fulfill({ json: DEFAULT_PRICING_DISCOUNTS });
          errors.push(`Unexpected request ${url}`);
          return route.abort();
        });
        await page.goto(`${base}/plans`);
        await page.addStyleTag({ content: css + fixtureFontStyles() });
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        const price = page.locator('[data-plan-price="minimal"]');
        await expect(price).toContainText(/Rp\s+[\d.]+/);
        await price.scrollIntoViewIfNeeded();
        await page.evaluate(() => document.fonts.ready);
        const initial = await price.innerText();
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const file = `plans-price-loaded-${width}-dpr1.png`;
        await page.screenshot({ path: resolve(path, "references", file), animations: "disabled", scale: "device" });
        await page.getByRole("button", { name: marketing.plans.increasePeople }).click();
        await expect(price).not.toHaveText(initial);
        if (errors.length) throw new Error(errors.join("\n"));
        cases.push({ file, path: "/plans", locale: "id", theme: "light", width, height, dpr: 1, scrollWidth, price: initial,
          component: "PlansClient", checked: "Loaded price and recalculation after increasing the group size" });
        console.log(`CAPTURE /plans ${width}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await writeFile(resolve(path, "references/manifest-plans-prices.json"), JSON.stringify({ fixedTime, cases }, null, 2) + "\n");
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
