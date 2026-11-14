import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { acquireConfiguredVerificationBrowser, runVerificationBrowserOperation } from "./product-v4-browser-session";
import { verificationBrowserIdentity } from "./product-v4-browser-config";

interface Assets { parser: string; worker: string; pdfjs: string; fonts: Record<string, string> }
let assets: Assets | undefined;
// Only the Neon archive contains this file; Next must not trace it into the web build.
const loadAssets = () => assets ??= JSON.parse(readFileSync(resolve(/* turbopackIgnore: true */ dirname(fileURLToPath(import.meta.url)), "pdf-assets.json"), "utf8")) as Assets;
const pageSchema = z.object({ pageNumber: z.number().int().positive(), text: z.string(), image: z.string(), width: z.number().int().positive(), height: z.number().int().positive() });
const pagesSchema = z.object({ totalPages: z.number().int().positive(), pages: z.array(pageSchema) });
const inspectionSchema = z.object({ pageCount: z.number().int().positive(), text: z.string() });
type Request = { mode: "pages"; pages: number[]; representation: "text" | "image" | "both"; width: number } | { mode: "inspect" } | { mode: "figure"; page: number; crop: [number, number, number, number] };

/** Native canvas exceeds Neon's archive limit; PDF.js runs in a bounded remote browser instead. */
export async function runBrowserPdf(bytes: Uint8Array, input: Request): Promise<unknown> {
  if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw new Error("PDF_EXCEEDS_SIZE_LIMIT");
  const source = loadAssets();
  const session = await acquireConfiguredVerificationBrowser();
  return runVerificationBrowserOperation(async signal => {
    if (session.browser.version() !== verificationBrowserIdentity().browserVersion) throw new Error("PRODUCT_V4_BROWSER_VERSION_MISMATCH");
    const context = await session.browser.newContext();
    await context.route("https://zyx-pdf.invalid/**", async route => {
      const key = new URL(route.request().url()).pathname.slice(1);
      const data = source.fonts[key];
      if (!data) return route.abort();
      await route.fulfill({ status: 200, contentType: key.endsWith(".js") ? "application/javascript" : key.endsWith(".wasm") ? "application/wasm" : "application/octet-stream", body: Buffer.from(data, "base64"), headers: { "Access-Control-Allow-Origin": "*" } });
    });
    const page = await context.newPage();
    await page.evaluate(length => { (globalThis as unknown as { pdfBytes: Uint8Array }).pdfBytes = new Uint8Array(length); }, bytes.length);
    // Bound each CDP message independently of the maximum supported PDF size.
    for (let offset = 0; offset < bytes.length; offset += 384 * 1024) {
      signal.throwIfAborted();
      await page.evaluate(({ offset, chunk }) => {
        const data = atob(chunk), target = (globalThis as unknown as { pdfBytes: Uint8Array }).pdfBytes;
        for (let i = 0; i < data.length; i++) target[offset + i] = data.charCodeAt(i);
      }, { offset, chunk: Buffer.from(bytes.subarray(offset, offset + 384 * 1024)).toString("base64") });
    }
    signal.throwIfAborted();
    return page.evaluate(async ({ input, parserSource, workerSource, pdfjsSource }) => {
      const bytes = (globalThis as unknown as { pdfBytes: Uint8Array }).pdfBytes;
      const moduleUrl = (source: string) => URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const worker = moduleUrl(workerSource);
      const options = { data: bytes, standardFontDataUrl: "https://zyx-pdf.invalid/standard_fonts/", cMapUrl: "https://zyx-pdf.invalid/cmaps/", wasmUrl: "https://zyx-pdf.invalid/wasm/", cMapPacked: true, useWorkerFetch: false, useSystemFonts: false, isEvalSupported: false };
      if (input.mode === "figure") {
        const pdfjs = await import(moduleUrl(pdfjsSource));
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        const task = pdfjs.getDocument(options);
        try {
          const doc = await task.promise;
          if (input.page > doc.numPages) throw new Error("SOURCE_FIGURE_PAGE_INVALID");
          const page = await doc.getPage(input.page);
          if (![0, 90, 180, 270].includes(page.rotate)) throw new Error("SOURCE_FIGURE_ROTATION_INVALID");
          const base = page.getViewport({ scale: 1 });
          const [x0, y0, x1, y1] = input.crop;
          const corners = [[x0 * base.width, y0 * base.height], [x1 * base.width, y1 * base.height]].map(([x, y]) => base.convertToPdfPoint(x, y));
          const variants = [];
          for (const [name, width] of [["preview", 1280], ["print", 2560]] as const) {
            const viewport = page.getViewport({ scale: width / base.width });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            if (canvas.width * canvas.height > 16_000_000) throw new Error("SOURCE_FIGURE_PIXEL_LIMIT");
            await page.render({ canvas, viewport }).promise;
            const left = Math.floor(x0 * canvas.width), top = Math.floor(y0 * canvas.height);
            const right = Math.min(canvas.width, Math.ceil(x1 * canvas.width)), bottom = Math.min(canvas.height, Math.ceil(y1 * canvas.height));
            const output = document.createElement("canvas"); output.width = right - left; output.height = bottom - top;
            if (output.width <= 0 || output.height <= 0) throw new Error("SOURCE_FIGURE_CROP_EMPTY");
            output.getContext("2d")!.drawImage(canvas, left, top, output.width, output.height, 0, 0, output.width, output.height);
            variants.push({ name, width: output.width, height: output.height, image: output.toDataURL("image/png").split(",")[1], pixels: { left, top, width: output.width, height: output.height } });
          }
          return { pageNumber: input.page, crop: input.crop, pdfPointBbox: [Math.min(...corners.map((p: number[]) => p[0])), Math.min(...corners.map((p: number[]) => p[1])), Math.max(...corners.map((p: number[]) => p[0])), Math.max(...corners.map((p: number[]) => p[1]))], cropBox: page.view, rotation: page.rotate, transform: base.transform, variants };
        } finally { await task.destroy(); }
      }
      const { PDFParse } = await import(moduleUrl(parserSource));
      PDFParse.setWorker(worker);
      const parser = new PDFParse(options);
      try {
        const info = await parser.getInfo();
        if (input.mode === "inspect") return { pageCount: info.total, text: (await parser.getText()).text };
        if (input.pages.some(page => page > info.total)) throw new Error("AUTHORING_MCP_SOURCE_PAGE_INVALID");
        const texts = input.representation === "image" ? { pages: [] } : await parser.getText({ partial: input.pages });
        const images = input.representation === "text" ? { pages: [] } : await parser.getScreenshot({ partial: input.pages, desiredWidth: input.width, imageBuffer: false, imageDataUrl: true });
        return { totalPages: info.total, pages: input.pages.map(pageNumber => {
          const image = images.pages.find((page: { pageNumber: number }) => page.pageNumber === pageNumber);
          return { pageNumber, text: texts.pages.find((page: { num: number }) => page.num === pageNumber)?.text ?? "", image: image?.dataUrl?.split(",")[1] ?? "", width: image ? Math.round(image.width) : 1, height: image ? Math.round(image.height) : 1 };
        }) };
      } finally { await parser.destroy(); }
    }, { input, parserSource: source.parser, workerSource: source.worker, pdfjsSource: source.pdfjs });
  }, () => session.close(), 120_000);
}

export async function parseBrowserPdfPages(bytes: Uint8Array, pages: number[], representation: "text" | "image" | "both", width: number) {
  const result = pagesSchema.parse(await runBrowserPdf(bytes, { mode: "pages", pages, representation, width }));
  return { totalPages: result.totalPages, pages: result.pages.map(({ image, ...page }) => {
    const png = new Uint8Array(Buffer.from(image, "base64"));
    if (representation === "text") return { ...page, png };
    if (png.length < 24) throw new Error("SOURCE_PAGE_PNG_INVALID");
    const header = new DataView(png.buffer, png.byteOffset, png.byteLength);
    if (header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a || header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452 || !header.getUint32(16) || !header.getUint32(20)) throw new Error("SOURCE_PAGE_PNG_INVALID");
    return { ...page, png, width: header.getUint32(16), height: header.getUint32(20) };
  }) };
}

export async function inspectBrowserPdf(bytes: Uint8Array) {
  return inspectionSchema.parse(await runBrowserPdf(bytes, { mode: "inspect" }));
}
