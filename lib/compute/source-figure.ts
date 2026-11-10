import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { getPdfWorkerSrc } from "./pdf-worker";

export const SOURCE_FIGURE_RENDERER = "pdfjs-5.4.296-pdf-parse-2.4.5-figure-v2";
export const LEGACY_SOURCE_FIGURE_RENDERER = "pdfjs-5.4.296-pdf-parse-worker-2.4.5-napi-canvas-0.1.80-figure-v1";
export const normalizedCropSchema = z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)])
  .refine(([x0, y0, x1, y1]) => x1 > x0 && y1 > y0, "SOURCE_FIGURE_CROP_INVALID");
export type NormalizedCrop = z.infer<typeof normalizedCropSchema>;
export const figureChecksum = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

export function figurePixelCrop(crop: NormalizedCrop, width: number, height: number) {
  const [x0, y0, x1, y1] = normalizedCropSchema.parse(crop);
  const left = Math.floor(x0 * width), top = Math.floor(y0 * height);
  const right = Math.min(width, Math.ceil(x1 * width)), bottom = Math.min(height, Math.ceil(y1 * height));
  if (right <= left || bottom <= top) throw new Error("SOURCE_FIGURE_CROP_EMPTY");
  return { left, top, width: right - left, height: bottom - top };
}

export async function renderSourceFigure(bytes: Uint8Array, pageNumber: number, crop: NormalizedCrop) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || bytes.byteLength === 0 || bytes.byteLength > 50 * 1024 * 1024) throw new Error("SOURCE_FIGURE_INPUT_INVALID");
  normalizedCropSchema.parse(crop);
  if (process.env.ZYX_COMPUTE_RUNTIME === "neon") {
    const { runBrowserPdf } = await import("./browser-pdf");
    const result = z.object({ pageNumber: z.literal(pageNumber), crop: normalizedCropSchema,
      pdfPointBbox: z.array(z.number()).length(4), cropBox: z.array(z.number()).length(4), rotation: z.number(), transform: z.array(z.number()).length(6),
      variants: z.array(z.object({ name: z.enum(["preview", "print"]), image: z.string().min(1), width: z.number().int().positive(), height: z.number().int().positive(),
        pixels: z.object({ left: z.number().int().nonnegative(), top: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() }) })).length(2),
    }).parse(await runBrowserPdf(bytes, { mode: "figure", page: pageNumber, crop }));
    return { ...result, rounding: "floor-start-ceil-end" as const, renderer: SOURCE_FIGURE_RENDERER,
      variants: result.variants.map(({ image, ...variant }) => { const png = Buffer.from(image, "base64"); return { ...variant, png, checksum: figureChecksum(png) }; }) };
  } else {
  const require = createRequire(import.meta.url);
  const standardFonts = pathToFileURL(resolve(dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts") + sep);
  if (require("pdfjs-dist/package.json").version !== "5.4.296" || require("@napi-rs/canvas/package.json").version !== "0.1.80") throw new Error("SOURCE_FIGURE_RENDERER_UNPINNED");
  const { createCanvas, Path2D, DOMMatrix, ImageData } = require("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
  // Bun's built-in Path2D cannot be consumed by the installed native canvas.
  Object.assign(globalThis, { Path2D, DOMMatrix, ImageData });
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  GlobalWorkerOptions.workerSrc = await getPdfWorkerSrc();
  // PDF.js' Node font factory reads filesystem paths, not file URL strings.
  const task = getDocument({ data: bytes.slice(), standardFontDataUrl: fileURLToPath(standardFonts).replaceAll("\\", "/"), isEvalSupported: false, useSystemFonts: false, stopAtErrors: true });
  try {
    const doc = await task.promise;
    if (pageNumber > doc.numPages) throw new Error("SOURCE_FIGURE_PAGE_INVALID");
    const page = await doc.getPage(pageNumber);
    if (![0, 90, 180, 270].includes(page.rotate)) throw new Error("SOURCE_FIGURE_ROTATION_INVALID");
    const base = page.getViewport({ scale: 1 });
    const corners = [[crop[0] * base.width, crop[1] * base.height], [crop[2] * base.width, crop[3] * base.height]];
    const pdfCorners = corners.map(([x, y]) => base.convertToPdfPoint(x, y));
    const pdfPointBbox = [Math.min(...pdfCorners.map(p => p[0])), Math.min(...pdfCorners.map(p => p[1])), Math.max(...pdfCorners.map(p => p[0])), Math.max(...pdfCorners.map(p => p[1]))];
    const variants: Array<{ name: "preview" | "print"; png: Uint8Array; width: number; height: number; checksum: string; pixels: ReturnType<typeof figurePixelCrop> }> = [];
    for (const [name, desiredWidth] of [["preview", 1280], ["print", 2560]] as const) {
      const viewport = page.getViewport({ scale: desiredWidth / base.width });
      const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height);
      if (width * height > 16_000_000) throw new Error("SOURCE_FIGURE_PIXEL_LIMIT");
      const canvas = createCanvas(width, height);
      Object.assign(globalThis, { Path2D, DOMMatrix, ImageData });
      // PDF.js accepts the installed native canvas at runtime; its DOM declaration omits that adapter.
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
      const pixels = figurePixelCrop(crop, width, height);
      const output = createCanvas(pixels.width, pixels.height);
      output.getContext("2d").drawImage(canvas, pixels.left, pixels.top, pixels.width, pixels.height, 0, 0, pixels.width, pixels.height);
      const png = output.toBuffer("image/png");
      variants.push({ name, png, width: pixels.width, height: pixels.height, checksum: figureChecksum(png), pixels });
    }
    return { pageNumber, crop, pdfPointBbox, cropBox: page.view, rotation: page.rotate, transform: base.transform, rounding: "floor-start-ceil-end" as const, renderer: SOURCE_FIGURE_RENDERER, variants };
  } finally { await task.destroy(); }
  }
}
