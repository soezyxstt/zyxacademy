import { chromium, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import marketing from "../../../../../messages/id/marketing.json";
import notifications from "../../../../../messages/id/notifications.json";

const origin = "http://localhost:3212";
const folder = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const cases = [
  ["about", marketing.about.title],
  ["plans", marketing.plans.title],
  ["privacy", marketing.meta.privacy.title],
  ["terms", marketing.meta.terms.title],
  ["testimonial", marketing.testimonial.title],
  ["unsubscribe", notifications.email.unsubscribe.invalidTitle],
] as const;

async function main() {
  const cachedHtml = process.env.PUBLIC_REFERENCE_SSR_HTML;
  const selected = process.env.PUBLIC_REFERENCE_CASES?.split(",") ?? [];
  const output = folder("./references/");
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE, args: ["--force-color-profile=srgb"] });
  try {
    const outcomes = await Promise.allSettled(cases.filter(([name]) => selected.length === 0 || selected.includes(name)).map(async ([name, title]) => {
      const url = `${origin}/${name}`;
      const html = cachedHtml ? await readFile(`${cachedHtml}/public-pages-${name}.html`, "utf8") : await fetch(url, {
        headers: { "x-fixture-locale": "id", "x-fixture-theme": "light" },
        signal: AbortSignal.timeout(180_000),
      }).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${name}`);
        return response.text();
      });
      const context = await browser.newContext({
        viewport: { width: 380, height: 844 }, deviceScaleFactor: 1, javaScriptEnabled: false,
        reducedMotion: "reduce", locale: "id-ID", timezoneId: "UTC",
      });
      try {
        await context.route("**/*", async route => {
          const request = new URL(route.request().url());
          if (request.origin !== origin) throw new Error(`Unexpected external URL ${request.origin}`);
          if (request.href === url) return route.fulfill({ body: html, contentType: "text/html" });
          const asset = request.pathname;
          if (asset.startsWith("/_next/static/") || asset.startsWith("/founders/") || asset.startsWith("/testimoni/")) {
            const file = asset.startsWith("/_next/")
              ? folder(`./.next/dev${asset.replace(/^\/_next\//, "/")}`)
              : folder(`../../../../../public${asset}`);
            if (existsSync(file)) return route.fulfill({ path: file });
            if (!asset.endsWith(".js")) throw new Error(`Missing local asset ${asset}`);
          }
          return route.abort();
        });
        const page = await context.newPage();
        const response = await page.goto(url, { waitUntil: "load" });
        expect(response?.status()).toBe(200);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.getByRole("heading", { name: title })).toBeVisible();
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const file = `ssr-${name}-380-dpr1.png`;
        await page.screenshot({ path: output + file, animations: "disabled", scale: "device" });
        console.log(`CAPTURE ${name} ${scrollWidth}`);
        return { file, path: `/${name}`, locale: "id", theme: "light", width: 380, height: 844, dpr: 1,
          status: 200, scrollWidth, layout: scrollWidth <= 380 ? "fits" : "overflow", ssrOnly: true };
      } finally {
        await context.close();
      }
    }));
    const manifest = {
      cases: outcomes.flatMap(result => result.status === "fulfilled" ? [result.value] : []),
      failures: outcomes.flatMap(result => result.status === "rejected" ? [String(result.reason)] : []),
    };
    await writeFile(output + "manifest-ssr.json", JSON.stringify(manifest, null, 2) + "\n");
    if (manifest.failures.length) {
      console.error(manifest.failures);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
