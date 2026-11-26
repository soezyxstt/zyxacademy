import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import id from "../../../../messages/id/marketing.json";
import en from "../../../../messages/en/marketing.json";

const base = "http://localhost:3219";
const output = fileURLToPath(new URL("./references", import.meta.url));
const brand = new URL("../../../../public/brand/", import.meta.url);
const logos = new Set(["zyx-logo-horizontal-color.svg", "zyx-logo-horizontal-reversed.svg"]);
const articleTitle = "Belajar dengan latihan terarah";
const slug = "belajar-dengan-latihan-terarah";
const footprints = [
  { width: 380, height: 844, dpr: 1 },
  { width: 402, height: 874, dpr: 3 },
];
const cases = [
  { name: "list", locale: "id", theme: "light", path: "/id/blog" },
  { name: "detail", locale: "id", theme: "light", path: `/id/blog/${slug}` },
  { name: "empty", locale: "en", theme: "dark", path: "/en/blog?category=kegiatan_zyx" },
] as const;

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE,
    args: ["--force-color-profile=srgb"],
  });
  const references = [];
  await mkdir(output, { recursive: true });
  try {
    for (const { width, height, dpr } of footprints) {
      for (const entry of cases) {
        const copy = entry.locale === "id" ? id : en;
        const context = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: dpr,
          locale: entry.locale === "id" ? "id-ID" : "en-US",
          colorScheme: entry.theme,
          timezoneId: "UTC",
          reducedMotion: "no-preference",
          extraHTTPHeaders: { "x-fixture-locale": entry.locale },
          serviceWorkers: "block",
        });
        const failures: string[] = [];
        try {
          await context.route("**/*", async (route) => {
            const url = new URL(route.request().url());
            if (url.origin === base) {
              const filename = url.pathname.slice("/brand/".length);
              if (url.pathname.startsWith("/brand/") && logos.has(filename)) {
                return route.fulfill({
                  contentType: "image/svg+xml",
                  body: await readFile(new URL(filename, brand)),
                });
              }
              return route.continue();
            }
            failures.push(`Unexpected network request ${url.origin}`);
            return route.abort();
          });
          const page = await context.newPage();
          page.on("pageerror", (error) => failures.push(error.message));
          page.on("console", (message) => {
            if (message.type() === "error") failures.push(message.text());
          });
          page.on("response", (response) => {
            if (response.status() >= 400) failures.push(`HTTP ${response.status()} ${response.url()}`);
          });
          const response = await page.goto(`${base}${entry.path}`, { waitUntil: "networkidle", timeout: 300_000 });
          expect(response?.status()).toBe(200);
          expect(page.url()).toBe(`${base}${entry.path}`);

          const nav = page.getByRole("navigation", { name: copy.nav.primary });
          const logo = nav.getByRole("img", { name: "Zyx Academy" });
          await expect(logo).toBeVisible();
          await expect(logo).toHaveJSProperty("naturalWidth", 579);
          await expect(page.getByRole("button", { name: copy.nav.signIn })).toBeVisible();
          await expect(page.getByRole("button", { name: copy.nav.openMenu })).toHaveAttribute("aria-expanded", "false");
          const main = page.getByRole("main");
          const footer = page.getByRole("contentinfo");
          await expect(main).toBeVisible();
          await expect(footer.getByRole("navigation", { name: copy.footer.legalLinks })).toBeVisible();

          if (entry.name === "list") {
            await expect(main.getByRole("link", { name: new RegExp(articleTitle) }).first()).toBeVisible();
          } else if (entry.name === "detail") {
            await expect(main.getByRole("heading", { name: articleTitle })).toBeVisible();
          } else {
            await expect(main.getByText("No articles yet", { exact: true })).toBeVisible();
          }
          await page.evaluate(() => document.fonts.ready);
          await expect(main.locator("[data-page-transition]")).toHaveCSS("opacity", "1");
          const viewport = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            header: document.querySelector("header")?.getBoundingClientRect().height,
            mainTop: Number.parseFloat(getComputedStyle(document.querySelector("main")!).paddingTop),
            dark: document.documentElement.classList.contains("dark"),
          }));
          expect(viewport.width).toBeLessThanOrEqual(width);
          expect(viewport.header).toBe(56);
          expect(viewport.mainTop).toBe(viewport.header);
          expect(viewport.dark).toBe(entry.theme === "dark");

          const filename = `blog-shell-${entry.name}-${entry.locale}-${entry.theme}-${width}-dpr${dpr}.png`;
          await page.screenshot({ path: `${output}/${filename}`, animations: "disabled", scale: "device" });
          references.push({ ...entry, width, height, dpr, file: filename, viewport });
          if (entry.name === "empty") {
            await footer.scrollIntoViewIfNeeded();
            await expect(footer).toBeInViewport();
            const file = `blog-shell-footer-${entry.locale}-${entry.theme}-${width}-dpr${dpr}.png`;
            await page.screenshot({ path: `${output}/${file}`, animations: "disabled", scale: "device" });
            references.push({ ...entry, name: "footer", width, height, dpr, file, viewport });
          }
          expect(failures).toEqual([]);
          console.log(filename);
        } finally {
          await context.close();
        }
      }
    }
    await writeFile(`${output}/manifest-blog-shell.json`, `${JSON.stringify({
      sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      viewportUnits: "CSS pixels",
      shell: "app/(marketing)/layout.tsx with the production Navbar, SiteMain and Footer",
      data: "Public blog fixture articles and unauthenticated guest session. All requests restricted to localhost.",
      references,
    }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
