import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, realpath, stat, writeFile, rename, rm } from "node:fs/promises";
import { watchFile, unwatchFile } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type { PublicVisualSpec } from "@/lib/articles/structured-read-model";
import { prepareProductDraftPreview, draftPreviewFailure, type DraftPreviewIssue, type ProductDraftPreview } from "@/lib/authoring/product-draft-preview";
import { PRODUCT_DRAFT_LIMITS } from "@/lib/authoring/product-draft-builder";
import { compileProductDiktatHtml, PRODUCT_DIKTAT_FOOTER_TEMPLATE } from "@/lib/bundle/product-diktat-pdf";
import { inspectDiktatPrintReadiness } from "@/lib/materials/diktat-print-readiness";
import { setupPdfWorker } from "@/lib/compute/pdf-worker";
import { buildDraftPreviewBrowser } from "./preview-browser-build";
import { createDraftPreviewExample } from "./preview-example";

const viewports = [{ width: 380, height: 844 }, { width: 1536, height: 864 }];
const themes = ["light", "dark"] as const;
const html = '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Product draft preview</title><link rel="icon" href="data:,"><link rel="stylesheet" href="./preview.css"></head><body><div id="root"></div><script src="./preview.js"></script></body></html>';
const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: 'self'; font-src data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export async function assertDraftPreviewPaths(inputFile: string, output: string) {
  const outputReal = await realpath(output);
  const resolvedInput = path.resolve(inputFile);
  const inputReal = await realpath(resolvedInput).catch(async () => path.join(await realpath(path.dirname(resolvedInput)).catch(() => path.dirname(resolvedInput)), path.basename(resolvedInput)));
  const inputStat = await stat(resolvedInput).catch(() => null);
  for (const name of ["preview-report.json", "preview-report.json.tmp", "outline.json"]) {
    const destination = path.join(outputReal, name);
    const metadata = await lstat(destination).catch(() => null);
    const target = await realpath(destination).catch(() => destination);
    const targetStat = await stat(destination).catch(() => null);
    if (resolvedInput === destination || inputReal === target || inputStat && targetStat && inputStat.dev === targetStat.dev && inputStat.ino === targetStat.ino) throw new Error("PREVIEW_INPUT_OUTPUT_COLLISION");
    if (metadata?.isSymbolicLink()) throw new Error("PREVIEW_OUTPUT_SYMLINK");
  }
}

async function atomicJson(destination: string, content: unknown) {
  const temporary = `${destination}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await rename(temporary, destination);
  } finally { await rm(temporary, { force: true }); }
}

export function draftPreviewSetupIssue(error: unknown): DraftPreviewIssue | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const known: Record<string, string> = {
    PREVIEW_BROWSER_UNAVAILABLE: "Install Chromium with bunx playwright install chromium, or pass --executable-path to a working local Chromium binary. The draft does not need a content edit.",
    PREVIEW_BUILD_UNAVAILABLE: "Install the locked project dependencies and rerun the local preview. The draft does not need a content edit.",
    PREVIEW_PDF_RUNTIME_UNAVAILABLE: "Install the locked PDF parser and its optional native canvas dependency, then rerun the local preview.",
  };
  const code = String(error.code);
  return known[code] ? { code, path: "runtime", message: known[code], severity: "error" } : null;
}

export function parseDraftPreviewArgs(args: string[]) {
  const options: { input?: string; out: string; watch: boolean; check: boolean; example?: "short" | "long"; executablePath?: string; help: boolean } = { out: "artifacts/authoring-preview", watch: false, check: false, help: false };
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === "--watch") options.watch = true;
    else if (name === "--check") options.check = true;
    else if (name === "--help") options.help = true;
    else if (["--input", "--out", "--example", "--executable-path"].includes(name)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`PREVIEW_ARGUMENT_VALUE_REQUIRED:${name}`);
      if (name === "--input") options.input = value;
      if (name === "--out") options.out = value;
      if (name === "--executable-path") options.executablePath = value;
      if (name === "--example") { if (value !== "short" && value !== "long") throw new Error("PREVIEW_EXAMPLE_INVALID"); options.example = value; }
    } else throw new Error(`PREVIEW_ARGUMENT_UNKNOWN:${name}`);
  }
  if (!options.help && Boolean(options.input) === Boolean(options.example)) throw new Error("PREVIEW_SELECT_INPUT_OR_EXAMPLE");
  return options;
}

/** Fixed in-memory routes: request paths can never read arbitrary local files. */
export function createDraftPreviewServer(resources: Map<string, { body: string; type: string }>, prefix: string) {
  if (!/^\/[a-f0-9]{32}\/$/.test(prefix)) throw new Error("PREVIEW_SERVER_PREFIX_INVALID");
  return createServer((request, response) => {
    const route = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const resource = route.startsWith(prefix) ? resources.get(route.slice(prefix.length)) : undefined;
    if (request.method !== "GET" || !resource) { response.writeHead(404, { "Cache-Control": "no-store" }); response.end(); return; }
    response.writeHead(200, { "Content-Type": resource.type, "Cache-Control": "no-store", "Content-Security-Policy": csp, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    response.end(resource.body);
  });
}

function inspectPreviewDocument() {
  const errors: string[] = [];
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth) errors.push("PREVIEW_HORIZONTAL_OVERFLOW");
  if (document.querySelector(".katex-error")) errors.push("PREVIEW_MATH_RENDER_INVALID");
  if ([...document.images].some(image => !image.complete || !image.naturalWidth)) errors.push("PREVIEW_IMAGE_INCOMPLETE");
  if (document.fonts.status !== "loaded") errors.push("PREVIEW_FONTS_NOT_READY");
  return { errors, headings: [...document.querySelectorAll("main h1, main h2, main h3, main h4")].map(element => ({ level: Number(element.tagName.slice(1)), text: element.textContent?.trim() ?? "" })), height: document.documentElement.scrollHeight };
}

export async function prepareDraftPreviewVisuals(page: Page, visuals: readonly PublicVisualSpec[]) {
  const expected = new Map(visuals.map(visual => [visual.id, visual]));
  const observed: Array<{ id: string; kind: string; ready: true }> = [];
  // fullPage captures do not trigger IntersectionObserver below the viewport.
  for (const figure of await page.locator("main figure").elementHandles()) {
    await figure.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const id = await figure.getAttribute("id");
    const visual = id ? expected.get(id) : undefined;
    if (!id || !visual) continue;
    const details = { id, kind: visual.kind, canvasType: visual.kind === "learning_canvas" ? visual.canvas.type : "", controls: visual.kind === "interactive_scene" ? visual.parameters.length : 0 };
    await page.waitForFunction(({ id, kind, canvasType, controls }) => {
      const root = document.getElementById(id);
      if (!root || [...root.querySelectorAll("p")].some(element => /^Memuat (?:visual|grafik)/.test(element.textContent?.trim() ?? ""))) return false;
      if (kind === "interactive_scene") return Boolean(root.querySelector("[data-interactive-scene] > svg[role=group]") && root.querySelectorAll("[role=slider], [data-scene-control]").length === controls);
      if (kind === "epsilon_delta_graph") {
        const container = root.querySelector('[data-testid="epsilon-delta-board"]');
        if (!container) return Boolean(root.querySelector("svg[role=img]"));
        const graph = (window as Window & { JXG?: { boards: Record<string, {
          containerObj: Element;
          objectsList: Array<{ visProp: { curvetype?: string }; rendNode?: SVGGraphicsElement }>;
        }> } }).JXG;
        const board = Object.values(graph?.boards ?? {}).find(board => board.containerObj === container);
        const curves = board?.objectsList.filter(object => object.visProp.curvetype === "functiongraph") ?? [];
        // Axes and bands can exist even when JessieCode fails to compute the curve.
        return curves.length > 0 && curves.every(curve => curve.rendNode && getComputedStyle(curve.rendNode).visibility !== "hidden" && curve.rendNode.getBBox().width > 0);
      }
      if (kind === "learning_canvas") {
        const renderer = root.querySelector(":scope > div:not([hidden]) > section");
        if (!renderer) return false;
        if (["function_plot", "data_plot", "vector_diagram", "free_body"].includes(canvasType)) return Boolean(renderer.querySelector("svg[role=img]"));
        if (canvasType === "flowchart") return Boolean(renderer.querySelector(".react-flow__node"));
        if (canvasType === "concept_map") return Boolean(renderer.querySelector("[data-diagram-node]"));
        return true;
      }
      return true;
    }, details);
    observed.push({ id, kind: visual.kind, ready: true });
  }
  const missing = visuals.filter(visual => ["interactive_scene", "learning_canvas", "epsilon_delta_graph"].includes(visual.kind) && !observed.some(item => item.id === visual.id));
  if (missing.length) throw new Error("PREVIEW_REFERENCED_VISUAL_NOT_RENDERED");
  await page.waitForFunction(() => ![...document.querySelectorAll("main p")].some(element => /^Memuat (?:visual|grafik)/.test(element.textContent?.trim() ?? "")));
  await page.evaluate(async () => { window.scrollTo(0, 0); await document.fonts.ready; });
  return observed;
}

interface PreviewCapture { productId: string; path: string; kind: "screenshot" | "pdf" | "pdf_page"; viewport?: { width: number; height: number }; theme?: "light" | "dark"; page?: number }
interface PreviewReport {
  schemaVersion: "product-draft-preview-report.v1";
  inputHash: string | null;
  checks: ProductDraftPreview["checks"] & { browser: "not_run" | "passed" | "failed"; print: "not_run" | "passed" | "failed" };
  status: "invalid" | "structure_ready" | "preview_ready" | "needs_changes" | "setup_required";
  issues: DraftPreviewIssue[];
  outline: string;
  captures: PreviewCapture[];
  browserVersion: string | null;
  metrics: { elapsedMs: number; buildMs: number; browserLaunches: number; pdfRenders: number };
}

export async function runDraftPreview(args = process.argv.slice(2)) {
  const options = parseDraftPreviewArgs(args);
  if (options.help) { console.log("bun run authoring:preview --input draft.json [--out artifacts/authoring-preview] [--watch] [--check] [--executable-path /path/to/chromium]\nbun run authoring:preview --example short|long\nLocal content preview only. Source admission, saved progress, grading, and release review run through MCP."); return; }
  const output = path.resolve(options.out);
  await mkdir(output, { recursive: true, mode: 0o700 });
  if (options.example) {
    options.input = path.join(output, "draft.json");
    await atomicJson(options.input, createDraftPreviewExample(options.example === "long"));
  }
  const inputFile = path.resolve(options.input!);
  await assertDraftPreviewPaths(inputFile, output);
  const prefix = `/${randomBytes(16).toString("hex")}/`;
  const resources = new Map<string, { body: string; type: string }>();
  const server = createDraftPreviewServer(resources, prefix);
  let origin = "";
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let buildMs = 0;
  let builds = 0;
  let launches = 0;
  let stopped = false;
  let lastHash: string | null = null;
  let pending = false;
  let running = false;
  let finish: (() => void) | undefined;
  const completed = new Promise<void>(resolve => { finish = resolve; });

  const initialize = async () => {
    if (browser?.isConnected() && context) return;
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    browser = undefined;
    context = undefined;
    if (!resources.has("preview.js")) {
      const started = performance.now();
      const built = await buildDraftPreviewBrowser().catch(() => { throw Object.assign(new Error("PREVIEW_BUILD_UNAVAILABLE"), { code: "PREVIEW_BUILD_UNAVAILABLE" }); });
      buildMs = Math.round(performance.now() - started);
      builds++;
      resources.set("", { body: html, type: "text/html; charset=utf-8" });
      resources.set("preview.css", { body: built.styles, type: "text/css; charset=utf-8" });
      resources.set("preview.js", { body: built.script, type: "text/javascript; charset=utf-8" });
    }
    if (!server.listening) await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("PREVIEW_SERVER_ADDRESS_INVALID");
    origin = `http://127.0.0.1:${address.port}${prefix}`;
    browser = await chromium.launch({ headless: true, ...(options.executablePath ? { executablePath: options.executablePath } : {}) }).catch(() => { throw Object.assign(new Error("PREVIEW_BROWSER_UNAVAILABLE"), { code: "PREVIEW_BROWSER_UNAVAILABLE" }); });
    launches++;
    context = await browser.newContext({ serviceWorkers: "block", reducedMotion: "reduce", acceptDownloads: false });
  };

  const capture = async (preview: ProductDraftPreview, report: PreviewReport, directory: string) => {
    await initialize();
    const page = await context!.newPage().catch(() => { throw Object.assign(new Error("PREVIEW_BROWSER_UNAVAILABLE"), { code: "PREVIEW_BROWSER_UNAVAILABLE" }); });
    let articleFailed = false;
    let printFailed = false;
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(20_000);
    let location = "preview";
    const problem = (code: string, message: string) => report.issues.push({ code, path: location, message: message.slice(0, 400), severity: "error" });
    page.on("pageerror", error => problem("PREVIEW_BROWSER_ERROR", error.message));
    page.on("console", message => { if (message.type() === "error") problem("PREVIEW_CONSOLE_ERROR", message.text()); });
    page.on("response", response => { if (response.status() >= 400) problem("PREVIEW_HTTP_ERROR", `Local resource returned HTTP ${response.status()}`); });
    await page.route("**/*", route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      problem("PREVIEW_NETWORK_BLOCKED", `An external ${route.request().resourceType()} request was blocked`);
      return route.abort("blockedbyclient");
    });
    await page.addInitScript(() => {
      const applyTheme = () => { document.documentElement.classList.toggle("dark", new URLSearchParams(window.location.search).get("theme") === "dark"); };
      if (document.documentElement) applyTheme();
      else document.addEventListener("DOMContentLoaded", applyTheme, { once: true });
    });
    try {
      for (const [index, product] of preview.products.entries()) {
        location = `products.${index}`;
        const priorErrors = report.issues.filter(issue => issue.severity === "error").length;
        const stem = `product-${index + 1}`;
        if (product.productType === "article") {
          report.checks.browser = "failed";
          resources.set("article.json", { body: JSON.stringify(product.article), type: "application/json" });
          for (const viewport of viewports) for (const theme of themes) {
            location = `products.${index}.${viewport.width}.${theme}`;
            await page.setViewportSize(viewport);
            await page.emulateMedia({ media: "screen", colorScheme: theme });
            await page.goto(`${origin}?theme=${theme}`, { waitUntil: "networkidle" });
            await page.waitForFunction(() => document.documentElement.dataset.previewReady === "true" || Boolean(document.documentElement.dataset.previewError));
            const failed = await page.evaluate(() => document.documentElement.dataset.previewError);
            if (failed) throw new Error(failed);
            const visuals = await prepareDraftPreviewVisuals(page, product.article.sections.flatMap(section => section.blocks.flatMap(block => block.visuals ?? [])));
            const observation = { ...await page.evaluate(inspectPreviewDocument), visuals };
            observation.errors.forEach(code => problem(code, code));
            if (observation.height > 30_000) { problem("PREVIEW_DOCUMENT_TOO_TALL", "Split this draft into shorter articles before capturing the full document"); continue; }
            const filename = `${stem}-${viewport.width}-${theme}.png`;
            await page.screenshot({ path: path.join(directory, filename), fullPage: true, animations: "disabled" });
            report.captures.push({ productId: product.id, path: path.relative(output, path.join(directory, filename)), kind: "screenshot", viewport, theme });
            await writeFile(path.join(directory, `${stem}-${viewport.width}-${theme}.json`), JSON.stringify(observation, null, 2), { mode: 0o600 });
          }
          articleFailed ||= report.issues.filter(issue => issue.severity === "error").length > priorErrors;
          report.checks.browser = articleFailed ? "failed" : "passed";
        } else {
          report.checks.print = "failed";
          location = `products.${index}.print`;
          await page.setViewportSize({ width: 794, height: 1123 });
          await page.emulateMedia({ media: "print", colorScheme: "light" });
          const printHtml = compileProductDiktatHtml(product.source);
          await page.setContent(printHtml, { waitUntil: "networkidle" });
          (await page.evaluate(inspectDiktatPrintReadiness)).forEach(code => problem(code, code));
          const pdf = await page.pdf({ format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: PRODUCT_DIKTAT_FOOTER_TEMPLATE, preferCSSPageSize: true });
          report.metrics.pdfRenders++;
          await writeFile(path.join(directory, `${stem}.pdf`), pdf, { mode: 0o600 });
          report.captures.push({ productId: product.id, path: path.relative(output, path.join(directory, `${stem}.pdf`)), kind: "pdf" });
          // Direct local parser: never dispatch to a configured hosted compute provider.
          const { PDFParse } = await import("pdf-parse").catch(() => { throw Object.assign(new Error("PREVIEW_PDF_RUNTIME_UNAVAILABLE"), { code: "PREVIEW_PDF_RUNTIME_UNAVAILABLE" }); });
          await setupPdfWorker(PDFParse);
          const parser = new PDFParse({ data: new Uint8Array(pdf) });
          try {
            const { total } = await parser.getInfo();
            if (total > 4) problem("PREVIEW_DIKTAT_PAGE_BUDGET", `Diktat uses ${total} pages; the release budget is 4`);
            if (total > 20) throw new Error("PREVIEW_PDF_PAGE_LIMIT");
            const pages = await parser.getScreenshot({ desiredWidth: 1280, imageBuffer: true, imageDataUrl: false });
            for (const rendered of pages.pages) {
              const filename = `${stem}-page-${rendered.pageNumber}.png`;
              await writeFile(path.join(directory, filename), rendered.data, { mode: 0o600 });
              report.captures.push({ productId: product.id, path: path.relative(output, path.join(directory, filename)), kind: "pdf_page", page: rendered.pageNumber });
            }
          } finally { await parser.destroy(); }
          printFailed ||= report.issues.filter(issue => issue.severity === "error").length > priorErrors;
          report.checks.print = printFailed ? "failed" : "passed";
        }
      }
    } finally { await page.close(); }
  };

  const render = async () => {
    if (stopped) return;
    if (running) { pending = true; return; }
    running = true;
    const priorBuilds = builds;
    let unchanged = false;
    let projected = false;
    const started = performance.now();
    const report: PreviewReport = { schemaVersion: "product-draft-preview-report.v1", inputHash: null,
      checks: { structure: "failed", references: "not_checked", publication: "not_evaluated", visualReview: "not_performed", browser: "not_run", print: "not_run" },
      status: "invalid", issues: [], captures: [], outline: "outline.json", browserVersion: null,
      metrics: { elapsedMs: 0, buildMs: 0, browserLaunches: launches, pdfRenders: 0 } };
    try {
      await assertDraftPreviewPaths(inputFile, output);
      const metadata = await stat(inputFile);
      if (!metadata.isFile() || metadata.size > PRODUCT_DRAFT_LIMITS.requestBytes) throw new Error("PREVIEW_INPUT_TOO_LARGE_OR_NOT_FILE");
      const preview = prepareProductDraftPreview(JSON.parse(await readFile(inputFile, "utf8")));
      if (options.watch && preview.inputHash === lastHash) { unchanged = true; return; }
      report.inputHash = preview.inputHash;
      report.checks = { ...report.checks, ...preview.checks };
      report.issues.push(...preview.issues);
      await atomicJson(path.join(output, "outline.json"), preview.outline);
      projected = true;
      if (preview.checks.structure === "passed") {
        if (!options.check) {
          const directory = path.join(output, `${preview.inputHash.slice(0, 12)}-${randomBytes(4).toString("hex")}`);
          await mkdir(directory, { mode: 0o700 });
          await capture(preview, report, directory);
        }
        report.status = report.issues.some(issue => issue.severity === "error") ? "needs_changes" : options.check ? "structure_ready" : "preview_ready";
      }
      lastHash = preview.inputHash;
    } catch (error) {
      lastHash = null;
      const setup = draftPreviewSetupIssue(error);
      report.issues.push(...(setup ? [setup] : draftPreviewFailure(error, "preview")));
      report.status = setup ? "setup_required" : "needs_changes";
      // Replace an earlier outline so a malformed edit cannot leave old output looking current.
      if (!projected) { await assertDraftPreviewPaths(inputFile, output); await atomicJson(path.join(output, "outline.json"), []); }
    } finally {
      try {
        if (!unchanged) {
          report.metrics = { ...report.metrics, elapsedMs: Math.round(performance.now() - started), buildMs: priorBuilds === builds ? 0 : buildMs, browserLaunches: launches };
          report.browserVersion = browser?.version() ?? null;
          const destination = path.join(output, "preview-report.json");
          await assertDraftPreviewPaths(inputFile, output);
          await atomicJson(destination, report);
          console.log(JSON.stringify({ status: report.status, report: destination, captures: report.captures.length, issues: report.issues.length, ...report.metrics }));
          process.exitCode = report.status === "preview_ready" || report.status === "structure_ready" ? 0 : 1;
        }
      } finally {
        running = false;
        if (pending && !stopped) { pending = false; void render().catch(failWatch); }
        if (stopped) finish?.();
      }
    }
  };
  const stop = () => { stopped = true; unwatchFile(inputFile); if (!running) finish?.(); };
  const failWatch = (error: unknown) => { process.exitCode = 1; console.error(JSON.stringify({ status: "failed", issues: draftPreviewFailure(error, "watch") })); stop(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    if (options.watch) watchFile(inputFile, { interval: 350 }, () => { void render().catch(failWatch); });
    await render();
    if (options.watch && !stopped) {
      console.log(JSON.stringify({ status: "watching", input: inputFile, report: path.join(output, "preview-report.json") }));
      await completed;
    }
  } finally {
    stop();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await context?.close();
    await browser?.close();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

if (import.meta.main) runDraftPreview().catch(error => {
  console.error(JSON.stringify({ status: "failed", issues: draftPreviewFailure(error, "command"), nextAction: "Check --help, fix the input or local browser setup, then rerun. No remote service was changed." }));
  process.exitCode = 1;
});
