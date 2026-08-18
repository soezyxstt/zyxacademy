import { buildCourseThumbnailKey } from "@/lib/storage/keys";
import { storage } from "@/lib/storage";

/**
 * Server-side thumbnail generation for course documents and PDFs.
 * Renders page 1 / document cover into a compact WebP/PNG image stored in Cloudflare R2
 * under `thumbnails/courses/{courseSlug}/{materialId}.webp`.
 */
export async function generateAndSavePdfThumbnail(params: {
  courseSlug: string;
  materialId: string;
  pdfBuffer?: Buffer | Uint8Array | null;
  fileKey?: string | null;
}): Promise<string | null> {
  const { courseSlug, materialId } = params;
  if (!courseSlug || !materialId) return null;

  const thumbnailKey = buildCourseThumbnailKey({
    courseSlug,
    materialId,
    extension: "webp",
  });

  try {
    // Dynamic import puppeteer to keep server bundle lightweight and prevent bundling on client
    const puppeteer = (await import("puppeteer")).default;
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 600, height: 800, deviceScaleFactor: 1 });

      let dataUrl: string | null = null;
      if (params.pdfBuffer) {
        const base64Pdf = Buffer.from(params.pdfBuffer).toString("base64");
        dataUrl = `data:application/pdf;base64,${base64Pdf}#page=1&toolbar=0&navpanes=0&scrollbar=0`;
      } else if (params.fileKey) {
        const publicUrl = storage.getUrl(params.fileKey);
        dataUrl = `${publicUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0`;
      }

      if (!dataUrl) {
        await browser.close();
        return null;
      }

      await page.goto(dataUrl, { waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => null);

      // Snapshot first page area
      const screenshot = await page.screenshot({
        type: "webp",
        quality: 85,
        clip: { x: 0, y: 0, width: 600, height: 800 },
      });

      const buffer = Buffer.isBuffer(screenshot) ? screenshot : Buffer.from(screenshot);
      await storage.upload(buffer, thumbnailKey, "image/webp");
      return thumbnailKey;
    } finally {
      await browser.close().catch(() => null);
    }
  } catch (err) {
    console.error(`[ThumbnailGenerator] Failed to generate thumbnail for ${courseSlug}/${materialId}:`, err);
    return null;
  }
}
