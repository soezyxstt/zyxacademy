import { chromium, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { publicCases } from "../../../../../packages/native-parity/operations/public-fixtures";
import { testimonialStories } from "../../../../../lib/testimonials";
import id from "../../../../../messages/id/marketing.json";
import en from "../../../../../messages/en/marketing.json";
import idNotifications from "../../../../../messages/id/notifications.json";
import enNotifications from "../../../../../messages/en/notifications.json";

const out = fileURLToPath(new URL("./references", import.meta.url));
const base = "http://localhost:3212";
const fixedTime = new Date("2026-09-20T05:00:00.000Z");
const demoCourse = "fictional-berpikir";
const demoArticle = `${demoCourse}-article-1`;
type Fixture = (typeof publicCases)[number];
type CaseOptions = {
  path?: string;
  state?: "empty" | "error";
  status?: number;
};

const overrides: Record<string, CaseOptions> = {
  "demo-view-article": { path: `/demo/article?course=${demoCourse}&articleId=${demoArticle}` },
  "demo-view-quiz": { path: `/demo/quiz?course=${demoCourse}` },
  "demo-view-missing": { status: 404 },
  "demo-empty": { path: "/fixture-demo-empty", state: "empty" },
  "demo-retry": { path: "/demo?course=fictional-kimia" },
  "download-empty": { state: "empty" },
  "download-retry": { state: "error" },
  "unsubscribe-retry": { path: "/unsubscribe?status=success&category=course_updates" },
};

const clientInteractions = new Set([
  "english-faq", "form-validation", "form-local-submit", "plans-default",
  "plans-course-limits", "plans-retry", "demo-view-quiz",
]);

async function show(locator: ReturnType<Page["locator"]>) {
  await expect(locator).toBeVisible({ timeout: 20_000 });
  await locator.scrollIntoViewIfNeeded();
}

async function assertAndInteract(page: Page, fixture: Fixture, name: string) {
  const m = fixture.locale === "id" ? id : en;
  const notifications = fixture.locale === "id" ? idNotifications : enNotifications;
  const heading = (text: string) => page.getByRole("heading", { name: text, exact: false }).first();
  const button = (text: string) => page.getByRole("button", { name: text, exact: true }).first();
  const link = (text: string) => page.getByRole("link", { name: text, exact: true }).first();
  const text = (value: string) => page.getByText(value, { exact: false }).first();
  switch (name) {
    case "hero-id": return show(heading(m.home.heroTitle));
    case "english-faq": {
      const disclosure = button(m.faq.free.question);
      await disclosure.click();
      return show(text(m.faq.free.answer));
    }
    case "demo-link": {
      const cta = link(m.home.tryDemo);
      await expect(cta).toHaveAttribute("href", "/id/demo");
      return show(cta);
    }
    case "founders-id": return show(heading(m.about.founderSectionTitle));
    case "long-copy-en": return show(heading(m.about.storyTitle));
    case "portfolio": {
      const portfolio = link(m.about.founderPortfolio);
      await expect(portfolio).toHaveAttribute("href", "https://adihnursyam.com");
      return show(portfolio);
    }
    case "demo-course-article": return show(page.getByRole("link", { name: /Mengenal konsep dasar/i }).first());
    case "demo-empty": return show(heading(m.demo.emptyTitle));
    case "demo-retry": return show(text("Kimia Dasar I"));
    case "demo-view-article": return show(heading("Mengenal konsep dasar"));
    case "demo-view-missing": return show(heading("404"));
    case "demo-view-quiz": {
      await show(text("Pertanyaan konsep 1?"));
      const options = page.getByRole("button", { name: "Pilihan pertama" });
      const count = await options.count();
      if (count > 0) await options.first().click();
      return;
    }
    case "download-platforms": {
      await expect(page.getByRole("button", { name: /^iPhone/ })).toBeDisabled();
      const android = page.getByRole("link", { name: /Android \(APK\)/ }).first();
      await expect(android).toHaveAttribute("href", "https://example.test/release/zyx.apk");
      return show(android);
    }
    case "download-empty": return show(text(m.download.empty.replace("{channel}", "Stable")));
    case "download-retry": return show(text(m.download.error));
    case "form-empty": {
      await expect(page.getByLabel("Full name")).toHaveValue("");
      return show(heading("Register Profile"));
    }
    case "form-validation": {
      await button("Submit Registration").click();
      return show(text("Full name is required."));
    }
    case "form-local-submit": {
      await page.getByLabel("Full name").fill("Public Fixture");
      await page.getByLabel("Email address").fill("fixture@example.test");
      await page.getByLabel("Age").fill("19");
      await page.getByLabel(/^Password/).first().fill("local-fixture");
      await page.getByRole("combobox").click();
      await page.getByRole("option", { name: "TPB Kalkulus I" }).click();
      await page.locator('input[type="file"]').setInputFiles({
        name: "fixture.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
      });
      await page.getByRole("checkbox", { name: /agree to the terms/i }).check();
      await button("Submit Registration").click();
      await expect(page.getByLabel("Full name")).toHaveValue("", { timeout: 10_000 });
      return show(text("Profile registration successful."));
    }
    case "plans-default": {
      await show(heading(m.plans.title));
      await expect(page.locator('[data-plan-price="minimal"]')).toBeVisible();
      return;
    }
    case "plans-course-limits": {
      await button(m.plans.courseList.replace("{count}", "3")).click();
      const decrease = button(m.plans.decreaseCourses);
      await decrease.click();
      await decrease.click();
      await expect(decrease).toBeDisabled();
      return show(text(m.plans.coveredCourses.replace("{count}", "1").replace("{max}", "5")));
    }
    case "plans-retry": {
      const quote = page.locator('[data-plan-price="minimal"]');
      await expect(quote).toBeVisible();
      const previous = await quote.textContent();
      await button(m.plans.increasePeople).click();
      await expect(quote).not.toHaveText(previous ?? "");
      return show(quote);
    }
    case "privacy-id": return show(heading(m.meta.privacy.title));
    case "terms-id": return show(heading(m.meta.terms.title));
    case "privacy-en-anchor": {
      await page.locator('a[href="#kontak"]').click();
      await expect(page).toHaveURL(/#kontak$/);
      return show(page.locator("#kontak-heading"));
    }
    case "terms-en-anchor": {
      await page.locator('a[href="#integritas-akademik"]').click();
      await expect(page).toHaveURL(/#integritas-akademik$/);
      return show(page.locator("#integritas-akademik-heading"));
    }
    case "privacy-terms-link":
    case "terms-privacy-link": {
      const target = name === "privacy-terms-link" ? "/terms" : "/privacy";
      const crossLink = page.locator(`article a[href="${target}"]`).first();
      await show(crossLink);
      return;
    }
    case "testimonial-list": {
      await expect(text(testimonialStories[0].name)).toBeVisible();
      return show(heading(m.testimonial.storiesTitle));
    }
    case "testimonial-dark-en": return show(text(testimonialStories[1].quote));
    case "testimonial-plans": {
      const plans = link(m.home.viewPlans);
      await expect(plans).toHaveAttribute("href", "/id/plans");
      return show(plans);
    }
    case "unsubscribe-confirm": {
      await show(heading(notifications.email.unsubscribe.confirmTitle.replace("{category}", notifications.email.categories.courseUpdates.label)));
      await expect(button(notifications.email.unsubscribe.unsubscribe)).toBeEnabled();
      return;
    }
    case "unsubscribe-invalid": return show(heading(notifications.email.unsubscribe.invalidTitle));
    case "unsubscribe-retry": return show(heading(notifications.email.unsubscribe.successTitle));
    default: throw new Error(`No reference check for ${name}`);
  }
}

async function main() {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE,
    args: ["--force-color-profile=srgb"],
  });
  const group = process.env.PUBLIC_REFERENCE_GROUP;
  const included = publicCases.filter(item => !item.pattern.startsWith("/blog") &&
    (group === "static" ? !item.pattern.startsWith("/demo") : group === "demo" ? item.pattern.startsWith("/demo") : true));
  const requested = process.env.PUBLIC_REFERENCE_CASES?.split(",") ?? [];
  const widths = process.env.PUBLIC_REFERENCE_WIDTHS?.split(",").map(Number) ?? [380, 1536];
  const cases = included.filter(item => requested.length === 0 || requested.includes(item.id.replace("operations-public-", "")));
  const rows: Array<Record<string, unknown>> = [];
  const failures: string[] = [];
  const manifest = requested.length ? "manifest-partial.json" : group ? `manifest-${group}.json` : "manifest.json";
  const writeManifest = () => writeFile(`${out}/${manifest}`, JSON.stringify({
    fixedTime,
    cases: [...rows].sort((a, b) => String(a.file).localeCompare(String(b.file))),
    failures: [...failures].sort(),
  }, null, 2) + "\n");

  async function capture(width: number, fixture: Fixture) {
    const height = width === 380 ? 844 : 864;
    const dpr = 1;
    const name = fixture.id.replace("operations-public-", "");
    const options = overrides[name] ?? {};
    const context = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: dpr,
      locale: fixture.locale === "id" ? "id-ID" : "en-US", timezoneId: "UTC",
      reducedMotion: "reduce", colorScheme: fixture.theme,
      extraHTTPHeaders: {
        "x-fixture-locale": fixture.locale,
        "x-fixture-theme": fixture.theme,
        "x-fixture-state": options.state ?? "populated",
      },
    });
    const errors: string[] = [];
    const runtimeIssues: string[] = [];
    const path = options.path ?? fixture.href;
    const page = await context.newPage();
    try {
      await page.clock.setFixedTime(fixedTime);
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin === base) {
          const asset = /^\/(founders|testimoni|platforms)\/([a-z0-9-]+\.(?:jpeg|png|svg))$/.exec(url.pathname);
          if (asset) {
            const filename = fileURLToPath(new URL(`../../../../../public${url.pathname}`, import.meta.url));
            return route.fulfill({ path: filename });
          }
          return route.continue();
        }
        if (url.protocol === "data:") return route.continue();
        errors.push(`Blocked external request ${url.toString()}`);
        return route.abort();
      });
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (name === "form-local-submit" && text.includes("Cannot update a component") &&
          text.includes("FormsPlaygroundPage FileUploadField")) {
          runtimeIssues.push("Web FileUploadField updates FormsPlaygroundPage during render.");
        } else {
          errors.push(text);
        }
      });
      page.on("response", response => {
        if (response.status() >= 400 && !(options.status === response.status() && response.request().isNavigationRequest())) {
          errors.push(`HTTP ${response.status()} ${response.url()}`);
        }
      });
      const response = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
      expect(response?.status()).toBe(options.status ?? 200);
      expect(new URL(page.url()).pathname).toBe(new URL(path, base).pathname);
      if (clientInteractions.has(name)) {
        await expect(page.locator("html")).toHaveAttribute("data-public-reference-ready", "true", { timeout: 75_000 });
      }
      await page.evaluate(() => document.fonts.ready);
      await assertAndInteract(page, fixture, name);
      if (options.status !== 404) expect(await page.locator("html").getAttribute("lang")).toBe(fixture.locale);
      await page.evaluate(async () => {
        const visible = [...document.images].filter((image) => {
          const rect = image.getBoundingClientRect();
          return rect.width > 0 && rect.top < innerHeight && rect.bottom > 0;
        });
        await Promise.all(visible.map((image) => {
          image.loading = "eager";
          return image.decode();
        }));
      });
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      if (errors.length) throw new Error(errors.join("\n"));
      const file = `${name}-${width}-dpr1.png`;
      await page.screenshot({ path: `${out}/${file}`, animations: "disabled", scale: "device" });
      const layout = scrollWidth > width ? "overflow" : "fits";
      rows.push({
        file, path, locale: fixture.locale, theme: fixture.theme, width, height, dpr,
        status: response?.status(), scrollWidth, layout, runtimeIssues: [...new Set(runtimeIssues)],
      });
      console.log(`CAPTURE ${width} ${name}${layout === "overflow" ? ` (source is ${scrollWidth}px wide)` : ""}`);
    } catch (error) {
      const message = `FAIL ${width} ${name}: ${error instanceof Error ? error.message : String(error)}`;
      failures.push(message);
      console.error(message);
    } finally {
      await context.close();
    }
  }

  try {
    for (const width of widths) {
      for (const pattern of new Set(cases.map((item) => item.pattern))) {
        await Promise.all(cases.filter((item) => item.pattern === pattern).map((item) => capture(width, item)));
        await writeManifest();
      }
    }
  } finally {
    await browser.close();
    await writeManifest();
  }
  console.log(`${rows.length} captures, ${failures.length} failures`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
