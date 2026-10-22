import { chromium, type Browser, type Page } from "playwright-core";
import { parseStoredPdfPages } from "./pdf-pages";
import { deriveProductV4VerificationPlan, assertProductV4VerificationCurrent, type ProductV4ObservedCheck, type ProductV4VerificationPlan, type ProductV4VerificationRequirement } from "@/lib/bundle/product-v4-verification";
import { productBundleManifestSchema, productEntitySchema, productDependencySchema, deterministicProductSerialization, type ProductEntity } from "@/lib/bundle/product-validator";
import { verificationPreviewSchema } from "@/lib/materials/verification-preview";
import type { ArticlePart } from "@/lib/materials/article-parts";
import { compileProductDiktatHtml, PRODUCT_DIKTAT_FOOTER_TEMPLATE } from "@/lib/bundle/product-diktat-pdf";
import { inspectDiktatPrintReadiness } from "@/lib/materials/diktat-print-readiness";
import type { DiktatSourceFigureAssets } from "@/lib/materials/diktat-static-visual";
import { z } from "zod";
import { assertProductV4RuntimeFingerprint, expectedChromiumRuntime, resolveProductV4LoadedRuntime, type ProductV4RuntimeFingerprint } from "./product-v4-runtime-binding";

declare const __ZYX_VERIFICATION_BUILD_RUNTIME__: { fingerprint: ProductV4RuntimeFingerprint; chromium: { browserVersion: string; revision: string } } | undefined;

const deployed = typeof (globalThis as { Deno?: unknown }).Deno !== "undefined";
const embeddedRuntime = typeof __ZYX_VERIFICATION_BUILD_RUNTIME__ === "undefined" ? undefined : __ZYX_VERIFICATION_BUILD_RUNTIME__;
const loadedRuntime = resolveProductV4LoadedRuntime(embeddedRuntime?.fingerprint);
const loadedBrowserRuntime = embeddedRuntime?.chromium ?? (deployed ? undefined : expectedChromiumRuntime());
let browser: Promise<Browser> | undefined;
const bundleSchema = z.object({ manifest: productBundleManifestSchema, products: z.array(productEntitySchema).max(500), dependencies: z.array(productDependencySchema).max(5000) });
export function validateVerificationBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("VERIFICATION_BASE_ORIGIN_INVALID");
  return url.origin;
}
export function validateDeployedVerificationBaseUrl(value: string): string {
  const url = new URL(value);
  if (!["https://staging.zyxacademy.com", "https://www.zyxacademy.com"].includes(url.origin) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("VERIFICATION_BASE_ORIGIN_INVALID");
  return url.origin;
}
async function launchVerificationBrowser() {
  if (!deployed) return chromium.launch({ headless: true });
  const account = process.env.CF_ACCOUNT_ID, token = process.env.CF_API_TOKEN;
  if (!account || !/^[a-f0-9]{32}$/i.test(account) || !token) throw new Error("VERIFICATION_BROWSER_CONFIGURATION_REQUIRED");
  return chromium.connectOverCDP(`wss://api.cloudflare.com/client/v4/accounts/${account}/browser-run/devtools/browser?keep_alive=600000`, { headers: { Authorization: `Bearer ${token}` }, timeout: 30_000 });
}
export async function closeProductV4BrowserRunner() { if (browser) { await (await browser).close(); browser = undefined; } }

export async function fontsReady(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const used = new Map<string, string>();
    for (const element of document.querySelectorAll("main, main p, main button, main input, main h1, main h2, main h3, main h4, main h5, main h6, main dt, main dd, main th, main td, main li, main label, main summary, main strong, main em, main .katex span")) {
      const style = getComputedStyle(element);
      const family = style.fontFamily.split(",")[0];
      used.set(`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${family}`, element.textContent?.slice(0, 200) || "x");
    }
    // Unused local fallback faces can be absent on Linux; required rendered fonts must load.
    await Promise.all([...used].map(async ([font, text]) => {
      await document.fonts.load(font, text);
      if (!document.fonts.check(font, text)) throw new Error("VERIFICATION_REQUIRED_FONT_UNAVAILABLE");
    }));
  });
}
export async function captureProductV4WebState(page: Page, checkId: string) {
  const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
  const viewport = page.viewportSize();
  if (!viewport || height <= 0 || Math.ceil(height / viewport.height) > 300) throw new Error("VERIFICATION_CAPTURE_HEIGHT_INVALID");
  const artifacts: ProductV4ObservedCheck["artifacts"] = [];
  const session = await page.context().newCDPSession(page);
  try {
    // Capture exact viewport slices, including long chapters with 200 percent text.
    for (let y = 0; y < height; y += viewport.height) {
      await page.evaluate(top => window.scrollTo(0, top), y);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const capture = await Promise.race([session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("VERIFICATION_CAPTURE_TIMEOUT")), 60_000); })]);
        artifacts.push({ id: `web-${checkId}-${y}`, mediaType: "image/png", bytes: Buffer.from(capture.data, "base64") });
      } finally { clearTimeout(timer); }
    }
  } finally { await session.detach(); }
  return artifacts;
}
export async function exerciseProductV4WebState(page: Page, state: string): Promise<boolean> {
  const interactiveStates = ["changed", "reset", "keyboard"];
  if (interactiveStates.includes(state)) {
    const parameters = page.getByRole("button", { name: "Parameter", exact: true });
    if (await parameters.count() && await parameters.getAttribute("aria-expanded") !== "true") await parameters.click();
    if (!await page.getByRole("slider").count()) {
      const activate = page.getByRole("button", { name: "Interaksi grafik", exact: true });
      if (await activate.count()) await activate.click();
    }
  }
  const epsilon = page.getByRole("slider", { name: "Toleransi epsilon", exact: true });
  const slider = await epsilon.count() ? epsilon : page.getByRole("slider").first();
  if (["changed", "epsilon-minimum", "epsilon-maximum", "resolution-limited", "reset", "keyboard"].includes(state)) {
    if (!await slider.count()) {
      if (!["changed", "reset", "keyboard"].includes(state)) return false;
      const plot = page.locator("main svg[tabindex='0']").first();
      if (!await plot.count()) return false;
      const before = await plot.innerHTML();
      await plot.focus();
      await plot.press("ArrowRight");
      if (await plot.innerHTML() === before) return false;
      if (state === "reset") { await plot.press("0"); if (await plot.innerHTML() !== before) throw new Error("VERIFICATION_RESET_FAILED"); }
      return true;
    }
    const original = await slider.inputValue().catch(async () => await slider.getAttribute("aria-valuenow") ?? "");
    if (["epsilon-minimum", "epsilon-maximum", "resolution-limited"].includes(state)) {
      await slider.focus();
      await slider.press(state === "epsilon-maximum" ? "End" : "Home");
    } else {
      await slider.focus();
      await slider.press("ArrowRight");
    }
    const changed = await slider.inputValue().catch(async () => await slider.getAttribute("aria-valuenow") ?? "");
    if (["changed", "keyboard", "reset"].includes(state) && changed === original) return false;
    if (state === "reset") {
      const reset = page.getByRole("button", { name: /^Reset$|^Reset parameter$|^Reset visual$/ }).first();
      if (!await reset.count()) return false;
      await reset.click();
      const restored = await slider.inputValue().catch(async () => await slider.getAttribute("aria-valuenow") ?? "");
      if (restored !== original) throw new Error("VERIFICATION_RESET_FAILED");
    }
    if (state === "resolution-limited" && !await page.getByText(/Delta belum dapat dijamin/).count()) return false;
  }
  if (state === "fallback") {
    const visibleFallback = page.locator("main [data-visual-fallback]:visible");
    if (await visibleFallback.count()) return true;
    const fallback = page.getByRole("button", { name: /Tampilkan tabel nilai|Tampilkan alternatif/ }).first();
    if (!await fallback.count()) return false;
    await fallback.click();
    if (!await page.locator("main [data-visual-fallback]:visible").count() && !await page.getByRole("table").count()) return false;
  }
  if (state === "keyboard-and-text-zoom") {
    await page.evaluate(async () => {
      const sample = document.querySelector("main p") ?? document.querySelector("main");
      const originalSize = sample ? parseFloat(getComputedStyle(sample).fontSize) : 0;
      // Pixel typography tokens need explicit text scaling; diagram coordinates retain their own zoom controls.
      const sizes = [...document.querySelectorAll<HTMLElement>("main, main *")].filter(element => !element.closest(".katex, svg, .jxgbox")).map(element => {
        const style = getComputedStyle(element);
        return { element, fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight) };
      });
      for (const { element, fontSize, lineHeight } of sizes) {
        element.style.fontSize = `${fontSize * 2}px`;
        if (Number.isFinite(lineHeight)) element.style.lineHeight = `${lineHeight * 2}px`;
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (sample && parseFloat(getComputedStyle(sample).fontSize) < originalSize * 1.99) throw new Error(`VERIFICATION_TEXT_ZOOM_NOT_APPLIED:${originalSize}:${getComputedStyle(sample).fontSize}:${sample.getAttribute("style")}`);
    });
    const control = page.locator("main button,main input,main [tabindex='0']").first();
    if (await control.count()) { await control.focus(); await page.keyboard.press("Tab"); }
  }
  return true;
}

export function inspectProductV4DisplayMath(state: string): string[] {
  for (const formula of document.querySelectorAll<HTMLElement>("main .katex-display, main .katex-display .katex-html")) {
    for (let element: HTMLElement | null = formula; element && element.tagName !== "MAIN"; element = element.parentElement) {
      if (element.clientWidth === 0 || element.scrollWidth <= element.clientWidth + 1) continue;
      const style = getComputedStyle(element);
      if (style.overflowX === "visible") continue;
      if (state === "reading-order-and-math") return ["DISPLAY_MATH_OVERFLOW"];
      if (!["auto", "scroll"].includes(style.overflowX) || element.tabIndex < 0 || !element.getAttribute("aria-label")?.trim() || style.scrollbarWidth === "none") return [`DISPLAY_MATH_SCROLL_INACCESSIBLE:${element.closest?.("[data-part-id]")?.id ?? element.tagName}:${style.overflowX}`];
    }
  }
  return [];
}

export async function exerciseProductV4MathScroll(page: Page): Promise<void> {
  for (const formula of await page.locator("main .katex-display").all()) {
    const overflowing = await formula.evaluate(element => {
      for (let current: HTMLElement | null = element as HTMLElement; current && current.tagName !== "MAIN"; current = current.parentElement) {
        if (current.clientWidth > 0 && current.scrollWidth > current.clientWidth + 1 && ["auto", "scroll"].includes(getComputedStyle(current).overflowX)) {
          current.focus();
          current.scrollLeft = 0;
          return true;
        }
      }
      return false;
    });
    if (!overflowing) continue;
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.activeElement instanceof HTMLElement && document.activeElement.scrollLeft > 0);
    await formula.evaluate(element => {
      for (let current: HTMLElement | null = element as HTMLElement; current && current.tagName !== "MAIN"; current = current.parentElement) current.scrollLeft = 0;
    });
  }
}

export async function executeBrowserProductV4Check(input: {
  plan: ProductV4VerificationPlan;
  bundle: { manifest: unknown; products: readonly ProductEntity[]; dependencies: readonly unknown[] };
  requirement: ProductV4VerificationRequirement;
  baseUrl: string;
  staticFigureAssets?: DiktatSourceFigureAssets;
}): Promise<ProductV4ObservedCheck> {
  const bundle = bundleSchema.parse(input.bundle);
  assertProductV4RuntimeFingerprint(input.plan.binding, await loadedRuntime);
  const derived = deriveProductV4VerificationPlan({ bundle, binding: input.plan.binding });
  assertProductV4VerificationCurrent(input.plan, derived);
  const requirement = derived.requirements.find((check) => check.id === input.requirement.id);
  if (!requirement || deterministicProductSerialization(requirement) !== deterministicProductSerialization(input.requirement)) throw new Error("VERIFICATION_REQUIREMENT_INVALID");
  const baseUrl = deployed ? validateDeployedVerificationBaseUrl(input.baseUrl) : validateVerificationBaseUrl(input.baseUrl);
  const result: ProductV4ObservedCheck = { checkId: requirement.id, status: "NOT_TESTED", expected: `${requirement.layer}:${requirement.state}`, observed: "The requested state has no supported browser executor.", artifacts: [] };
  if (!["web", "print"].includes(requirement.layer)) return result;
  browser ??= launchVerificationBrowser().then(instance => {
    instance.on("disconnected", () => { browser = undefined; });
    return instance;
  }).catch(error => { browser = undefined; throw error; });
  const launched = await browser;
  const expectedBrowserVersion = input.plan.binding.browserVersion ?? (deployed ? undefined : loadedBrowserRuntime?.browserVersion);
  if (!expectedBrowserVersion || launched.version() !== expectedBrowserVersion) throw new Error("PRODUCT_V4_BROWSER_VERSION_MISMATCH");
  const context = await launched.newContext({ viewport: requirement.viewport ?? { width: 703, height: 1032 }, reducedMotion: "reduce" });
  const errors: string[] = [];
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`HTTP_${response.status()}`); });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl || url.protocol === "data:") await route.continue();
    else { errors.push("UNEXPECTED_EXTERNAL_REQUEST"); await route.abort(); }
  });
  try {
    if (requirement.layer === "web") {
      const visualArticle = bundle.products.find((product) => product.productType === "article" && (product.id === requirement.target || (product.visuals ?? []).some((visual) => `${product.id}/${visual.id}` === requirement.target)));
      if (!visualArticle || visualArticle.productType !== "article") throw new Error("VERIFICATION_ARTICLE_MISSING");
      const selected = (visualArticle.visuals ?? []).find((visual) => `${visualArticle.id}/${visual.id}` === requirement.target);
      const previewVisuals = (visualArticle.visuals ?? []).map((visual) => {
        if (visual.kind !== "source_figure") return visual;
        const asset = input.staticFigureAssets?.[visual.assetId];
        if (!asset || asset.sourceChecksum !== visual.sourceChecksum || asset.mimeType !== "image/png" || asset.bytes.length < 24) throw new Error("VERIFICATION_SOURCE_ASSET_UNAVAILABLE");
        const bytes = Buffer.from(asset.bytes);
        if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("VERIFICATION_SOURCE_ASSET_INVALID");
        const { materialId: _material, sourceChecksum: _checksum, ...publicVisual } = visual;
        return { ...publicVisual, asset: { assetId: visual.assetId, imageUrl: `data:image/png;base64,${bytes.toString("base64")}`, attribution: asset.attribution ?? "", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } };
      });
      const payload = verificationPreviewSchema.parse({ type: "zyx-verification-preview.v1", title: visualArticle.title,
        sections: [...visualArticle.sections].sort((a, b) => a.orderIndex - b.orderIndex).map((section) => ({ id: section.id, title: section.title, blocks: [...section.blocks].sort((a, b) => a.orderIndex - b.orderIndex).map((block) => ({ id: block.id, parts: block.parts })) })),
        visuals: previewVisuals, ...(selected ? { visualId: selected.id } : {}) });
      const response = await page.goto(`${baseUrl}/authoring-verification`, { waitUntil: "networkidle" });
      if (response?.status() !== 200 || new URL(page.url()).pathname !== "/authoring-verification") throw new Error("VERIFICATION_PREVIEW_REDIRECT");
      await page.waitForSelector("html[data-verification-ready='true']", { state: "attached" });
      const webRuntime = await page.locator("html").getAttribute("data-verification-runtime");
      if (!webRuntime) throw new Error("VERIFICATION_WEB_BUILD_UNATTESTED");
      assertProductV4RuntimeFingerprint(input.plan.binding, JSON.parse(webRuntime));
      await page.evaluate((preview) => window.postMessage(preview, window.location.origin), payload);
      await page.waitForSelector("[data-verification-loaded]");
      for (const figure of await page.locator("main figure").all()) { await figure.scrollIntoViewIfNeeded(); }
      await page.locator("main").scrollIntoViewIfNeeded();
      await page.waitForFunction(() => ![...document.querySelectorAll("main p")].some((element) => element.textContent?.startsWith("Memuat grafik")));
      await fontsReady(page);
      if (!await exerciseProductV4WebState(page, requirement.state)) return result;
      await fontsReady(page);
      if (!selected) {
        const anchors = (parts: readonly ArticlePart[]): string[] => parts.flatMap((part) => [part.id, ...(part.kind === "worked_example" ? part.steps.flatMap((step) => anchors(step.parts)) : [])]);
        const expectedAnchors = payload.sections.flatMap((section) => section.blocks.flatMap((block) => anchors(block.parts)));
        const observedAnchors = await page.locator("main [data-part-id]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-part-id")));
        if (JSON.stringify(expectedAnchors) !== JSON.stringify(observedAnchors)) throw new Error("VERIFICATION_ARTICLE_READING_ORDER_INVALID");
      }
      const mathFailures = await page.evaluate(inspectProductV4DisplayMath, requirement.state);
      if (mathFailures.length) throw new Error(mathFailures.join(","));
      if (requirement.state === "keyboard-and-text-zoom") await exerciseProductV4MathScroll(page);
      const failures = await page.evaluate(() => {
        const issues: string[] = [];
        if (document.querySelector(".katex-error")) issues.push("MATH_RENDER_ERROR");
        if (document.documentElement.scrollWidth > document.documentElement.clientWidth) issues.push("PAGE_OVERFLOW");
        const width = document.documentElement.clientWidth;
        if ([...document.querySelectorAll("main [data-article-parts], main [data-part-id], main .markdown-article, main p, main dl, main dd")].some(element => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && (box.left < -1 || box.right > width + 1);
        })) issues.push("CONTENT_CLIPPED_BY_VIEWPORT");
        if ([...document.images].some((image) => !image.complete || image.naturalWidth === 0)) issues.push("IMAGE_NOT_READY");
        return issues;
      });
      if (failures.length || errors.length) throw new Error([...failures, ...errors].join(","));
      result.artifacts = await captureProductV4WebState(page, requirement.id);
    } else {
      const diktat = bundle.products.find((product) => product.productType === "diktat" && product.id === requirement.target);
      const article = diktat?.productType === "diktat" ? bundle.products.find((product) => product.productType === "article" && product.id === diktat.sourceArticleId) : undefined;
      if (!diktat || diktat.productType !== "diktat" || !article || article.productType !== "article") throw new Error("VERIFICATION_PRINT_SOURCE_MISSING");
      await page.emulateMedia({ media: "print" });
      await page.setContent(compileProductDiktatHtml({ article, diktat, staticFigureAssets: input.staticFigureAssets }), { waitUntil: "networkidle" });
      const failures = await page.evaluate(inspectDiktatPrintReadiness);
      if (failures.length || errors.length) throw new Error([...failures, ...errors].join(","));
      const pdf = await page.pdf({ format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: PRODUCT_DIKTAT_FOOTER_TEMPLATE, preferCSSPageSize: true });
        const info = await parseStoredPdfPages(new Uint8Array(pdf), [], { representation: "text" });
        const pageCount = info.totalPages;
        if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 4) throw new Error("VERIFICATION_PRINT_PAGE_COUNT_INVALID");
        result.pageCount = pageCount;
        if (requirement.artifactType === "application/pdf") result.artifacts = [{ id: "diktat.pdf", mediaType: "application/pdf", bytes: pdf }];
        else {
          const pages = await parseStoredPdfPages(new Uint8Array(pdf), Array.from({ length: pageCount }, (_, index) => index + 1), { representation: "image", imageWidth: 1280 });
          if (pages.pages.length !== pageCount) throw new Error("VERIFICATION_PRINT_CAPTURE_MISSING");
          result.artifacts = pages.pages.map(page => ({ id: `page-${page.pageNumber}.png`, mediaType: "image/png" as const, pageNumber: page.pageNumber, bytes: page.png }));
        }
    }
    return { ...result, status: "PASS", observed: "The exact bundle state rendered without runtime, math, image, HTTP or overflow errors. Artifacts record machine output; visual review remains separate." };
  } catch (error) {
    return { ...result, status: "FAIL", observed: (error instanceof Error ? error.message : "VERIFICATION_EXECUTION_FAILED").slice(0, 490) };
  } finally { await context.close(); }
}
