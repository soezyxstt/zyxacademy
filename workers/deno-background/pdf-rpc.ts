import type { Context } from "hono";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { storage } from "@/lib/storage";
import { isSafeKey } from "@/lib/storage/keys";
import { ingestMcpSourcePack } from "@/lib/authoring/mcp-workflows";

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_PAGES_PER_REQUEST = 4;
const PDF_PAGE_WIDTH = 1280;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function verifyAuth(c: Context): boolean {
  const secret = process.env.COMPUTE_SERVICE_SECRET;
  if (!secret) return true;
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${secret}`;
}

export async function handlePdfPagesRpc(c: Context) {
  if (!verifyAuth(c)) {
    return c.json({ error: "UNAUTHORIZED" }, 401);
  }

  let body: { storageKey?: string; pages?: number[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "INVALID_JSON_BODY" }, 400);
  }

  const { storageKey, pages } = body;
  if (!storageKey || typeof storageKey !== "string" || !isSafeKey(storageKey) || !storageKey.toLowerCase().endsWith(".pdf")) {
    return c.json({ error: "INVALID_STORAGE_KEY" }, 400);
  }

  if (
    !Array.isArray(pages) ||
    pages.length === 0 ||
    pages.length > MAX_PAGES_PER_REQUEST ||
    pages.some((p) => typeof p !== "number" || !Number.isInteger(p) || p < 1) ||
    new Set(pages).size !== pages.length
  ) {
    return c.json({ error: "INVALID_PAGES" }, 400);
  }

  try {
    if (typeof storage.download !== "function") {
      return c.json({ error: "STORAGE_DOWNLOAD_UNSUPPORTED" }, 500);
    }

    const bytes = await storage.download(storageKey);
    if (!bytes || bytes.byteLength === 0) {
      return c.json({ error: "PDF_EMPTY" }, 404);
    }
    if (bytes.byteLength > MAX_PDF_BYTES) {
      return c.json({ error: "PDF_EXCEEDS_SIZE_LIMIT" }, 413);
    }

    const { PDFParse } = await import("pdf-parse");
    const workerPath = path.resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
    PDFParse.setWorker(pathToFileURL(workerPath).href);
    const parser = new PDFParse({ data: bytes });

    try {
      const info = await parser.getInfo();
      const totalPages = info.total;
      if (pages.some((p) => p > totalPages)) {
        return c.json({ error: "PAGE_OUT_OF_BOUNDS", totalPages }, 400);
      }

      const textResult = await parser.getText({ partial: pages });
      const screenshotResult = await parser.getScreenshot({
        partial: pages,
        desiredWidth: PDF_PAGE_WIDTH,
        imageBuffer: true,
      });

      const textByPage = new Map(textResult.pages.map((p) => [p.num, p.text]));
      const imageByPage = new Map(screenshotResult.pages.map((p) => [p.pageNumber, p]));

      const serializedPages = pages.map((pageNumber) => {
        const image = imageByPage.get(pageNumber);
        if (!image || image.data.byteLength === 0) {
          throw new Error(`RENDER_PAGE_FAILED_${pageNumber}`);
        }
        return {
          pageNumber,
          text: textByPage.get(pageNumber) ?? "",
          imageBase64: Buffer.from(image.data).toString("base64"),
          width: image.width,
          height: image.height,
        };
      });

      return c.json({
        totalPages,
        pages: serializedPages,
      });
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch (err: any) {
    console.error("[handlePdfPagesRpc] Error:", err);
    return c.json({ error: err.message || "PDF_PARSE_FAILED" }, 500);
  }
}

export async function handleSourcePackResolveRpc(c: Context) {
  if (!verifyAuth(c)) {
    return c.json({ error: "UNAUTHORIZED" }, 401);
  }

  let body: {
    filename?: string;
    contentBase64?: string;
    directOriginals?: Array<{ documentId: string; contentBase64: string }>;
    storedOriginals?: Array<{ documentId: string; storageKey: string; checksum: string }>;
    boundScope?: { courseId: string; chapterId: string };
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "INVALID_JSON_BODY" }, 400);
  }

  const { filename, contentBase64, directOriginals, storedOriginals, boundScope } = body;
  if (!filename || typeof filename !== "string" || !contentBase64 || typeof contentBase64 !== "string") {
    return c.json({ error: "INVALID_SOURCE_PACK_INPUT" }, 400);
  }

  try {
    const originalsMap = new Map<string, Uint8Array>();

    // Decode direct originals if any
    if (Array.isArray(directOriginals)) {
      for (const entry of directOriginals) {
        if (!entry.documentId || !entry.contentBase64) continue;
        originalsMap.set(entry.documentId, new Uint8Array(Buffer.from(entry.contentBase64, "base64")));
      }
    }

    // Download stored originals directly from R2 on Deno
    if (Array.isArray(storedOriginals) && storedOriginals.length > 0) {
      if (typeof storage.download !== "function") {
        return c.json({ error: "STORAGE_DOWNLOAD_UNSUPPORTED" }, 500);
      }

      for (const entry of storedOriginals) {
        if (!entry.documentId || !entry.storageKey) continue;
        if (!isSafeKey(entry.storageKey)) {
          return c.json({ error: `INVALID_STORAGE_KEY:${entry.storageKey}` }, 400);
        }

        const bytes = await storage.download(entry.storageKey);
        if (entry.checksum) {
          const actualChecksum = sha256(bytes);
          if (actualChecksum !== entry.checksum) {
            return c.json({ error: `CHECKSUM_MISMATCH:${entry.documentId}` }, 400);
          }
        }
        originalsMap.set(entry.documentId, bytes);
      }
    }

    const ingestResult = ingestMcpSourcePack(
      filename,
      contentBase64,
      originalsMap.size > 0 ? originalsMap : undefined,
      boundScope
    );

    return c.json({ success: true, result: ingestResult });
  } catch (err: any) {
    console.error("[handleSourcePackResolveRpc] Error:", err);
    return c.json({ error: err.message || "SOURCE_PACK_INGESTION_FAILED" }, 500);
  }
}
