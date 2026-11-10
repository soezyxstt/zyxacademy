import type { Context } from "hono";
import { RetryAfterError } from "inngest";
import { createHash } from "node:crypto";
import { storage } from "@/lib/storage";
import { isSafeKey } from "@/lib/storage/keys";
import { ingestMcpSourcePack } from "@/lib/authoring/mcp-workflows";
import { readPdfFromStorage } from "@/lib/compute/pdf-reader";
import { isSourceReadTimeout, pdfReadOptionsSchema, timePdfStage } from "@/lib/compute/pdf-read-options";

const MAX_PAGES_PER_REQUEST = 4;

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

  const requestId = crypto.randomUUID();
  let body: { storageKey?: string; pages?: number[]; representation?: unknown; imageWidth?: unknown; requestId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "INVALID_JSON_BODY" }, 400);
  }

  const traceId = typeof body.requestId === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(body.requestId) ? body.requestId : requestId;
  const options = pdfReadOptionsSchema.safeParse(body);
  if (!options.success) return c.json({ error: "INVALID_PDF_OPTIONS", requestId: traceId }, 400);
  const { representation } = options.data;
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

    const result = await readPdfFromStorage({ storageKey, pages, ...options.data, requestId: traceId });
    const textOnly = representation === "text";
    return await timePdfStage(traceId, "send.serialize", async () => c.json({
      requestId: traceId,
      totalPages: result.totalPages,
      checksum: result.checksum,
      size: result.size,
      pages: result.pages.map(({ png, ...page }) => ({ ...page,
        ...(textOnly ? {} : { imageBase64: Buffer.from(png).toString("base64") }) })),
    }));
  } catch (err: any) {
    if (err instanceof RetryAfterError || (err instanceof Error && err.message === "VERIFICATION_BROWSER_RATE_LIMITED")) return c.json({ error: "SOURCE_READ_RATE_LIMITED", requestId: traceId }, 429, { "Retry-After": typeof err.retryAfter === "string" && /^\d+$/.test(err.retryAfter) ? err.retryAfter : "30" });
    if (isSourceReadTimeout(err)) return c.json({ error: "SOURCE_READ_TIMEOUT", requestId: traceId }, 504);
    if (err instanceof Error && (err.message === "PAGE_OUT_OF_BOUNDS" || err.message === "AUTHORING_MCP_SOURCE_PAGE_INVALID")) {
      return c.json({ error: "PAGE_OUT_OF_BOUNDS" }, 400);
    }
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
      boundScope,
      { issueToken: false },
    );

    return c.json({ success: true, result: ingestResult });
  } catch (err: any) {
    console.error("[handleSourcePackResolveRpc] Error:", err);
    return c.json({ error: err.message || "SOURCE_PACK_INGESTION_FAILED" }, 500);
  }
}
