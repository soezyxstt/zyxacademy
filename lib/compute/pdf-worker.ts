import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

let cachedWorkerSrc: string | null = null;

/**
 * Resolves the PDF.js worker source URL or data URL robustly across runtimes (Node, Bun, Deno)
 * and across different execution working directories (e.g. root vs workers/deno-background).
 */
export async function getPdfWorkerSrc(): Promise<string | null> {
  if (cachedWorkerSrc) return cachedWorkerSrc;

  // 1. Try resolving through module require resolution (works in Node, Bun, and Deno)
  try {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const resolved = req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    if (resolved && fs.existsSync(resolved)) {
      cachedWorkerSrc = pathToFileURL(resolved).href;
      return cachedWorkerSrc;
    }
  } catch {}

  // 2. Try process.cwd() fallback
  try {
    const cwdCandidate = path.resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
    if (fs.existsSync(cwdCandidate)) {
      cachedWorkerSrc = pathToFileURL(cwdCandidate).href;
      return cachedWorkerSrc;
    }
  } catch {}

  // 3. Try bundled base64 data URL from pdf-parse/worker (works in serverless / container without flat node_modules)
  try {
    const { getData } = await import("pdf-parse/worker");
    const dataUrl = typeof getData === "function" ? getData() : null;
    if (dataUrl && typeof dataUrl === "string") {
      cachedWorkerSrc = dataUrl;
      return cachedWorkerSrc;
    }
  } catch {}

  return null;
}

/**
 * Configures the worker on the provided PDFParse class if a valid worker source is found.
 */
export async function setupPdfWorker(PDFParseClass: { setWorker(src: string): void }): Promise<void> {
  const workerSrc = await getPdfWorkerSrc();
  if (workerSrc) {
    PDFParseClass.setWorker(workerSrc);
  }
}
