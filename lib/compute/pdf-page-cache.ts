import { createHash } from "node:crypto";
import { z } from "zod";
import type { StorageProvider } from "@/lib/storage";
import { buildPdfPageCacheKey } from "@/lib/storage/keys";
import type { SourceFilePage } from "@/lib/compute-client/pdf";

// Bump when parser, rasterizer, or extraction settings change.
export const PDF_PAGE_RENDERER_VERSION = "pdf-parse-2.4.5-v3";
export const PDF_PAGE_RENDER_WIDTH = 1280;

const cachedPageSchema = z.object({
  totalPages: z.number().int().positive(),
  pageNumber: z.number().int().positive(),
  text: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  imageChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});

function checksum(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function cachedPdfPages(
  input: { checksum: string; pages: number[]; rendererVersion: string; width: number; textOnly?: boolean },
  storage: Pick<StorageProvider, "exists" | "download" | "upload">,
  render: (pages: number[]) => Promise<{ totalPages: number; pages: SourceFilePage[] }>,
): Promise<{ totalPages: number; pages: SourceFilePage[] }> {
  if (!storage.download) throw new Error("STORAGE_DOWNLOAD_UNSUPPORTED");
  const cached = new Map<number, SourceFilePage>();
  let totalPages: number | undefined;
  for (const pageNumber of input.pages) {
    const key = buildPdfPageCacheKey({ ...input, pageNumber });
    if (!await storage.exists(`${key}.json`) || (!input.textOnly && !await storage.exists(`${key}.png`))) continue;
    let metadata;
    const bytes = await storage.download(`${key}.json`);
    try {
      metadata = cachedPageSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      continue;
    }
    if (metadata.pageNumber !== pageNumber || metadata.width !== input.width ||
        pageNumber > metadata.totalPages || (totalPages !== undefined && metadata.totalPages !== totalPages)) continue;
    const png = input.textOnly ? new Uint8Array() : await storage.download(`${key}.png`);
    if (!input.textOnly && checksum(png) !== metadata.imageChecksum) continue;
    totalPages = metadata.totalPages;
    cached.set(pageNumber, { pageNumber, text: metadata.text, width: metadata.width, height: metadata.height, png });
  }
  const missing = input.pages.filter((page) => !cached.has(page));
  if (missing.length) {
    const rendered = await render(missing);
    totalPages = rendered.totalPages;
    for (const pageNumber of missing) {
      const page = rendered.pages.find((page) => page.pageNumber === pageNumber);
      if (!page || (!input.textOnly && !page.png.byteLength)) throw new Error("PDF_PAGE_RENDER_INCOMPLETE");
      const metadata = cachedPageSchema.parse({ ...page, totalPages, imageChecksum: input.textOnly ? null : checksum(page.png) });
      if (page.width !== input.width || pageNumber > totalPages) throw new Error("PDF_PAGE_RENDER_INVALID");
      const key = buildPdfPageCacheKey({ ...input, pageNumber });
      if (!input.textOnly) await storage.upload(page.png, `page-${pageNumber}.png`, "image/png", { key: `${key}.png` });
      // Metadata commits the entry only after the PNG is stored.
      await storage.upload(new TextEncoder().encode(JSON.stringify(metadata)), `page-${pageNumber}.json`,
        "application/json", { key: `${key}.json` });
      cached.set(pageNumber, page);
    }
  }
  if (totalPages === undefined) throw new Error("PDF_PAGE_RENDER_INCOMPLETE");
  return { totalPages, pages: input.pages.map((pageNumber) => cached.get(pageNumber)!) };
}
