import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { setupPdfWorker } from "./pdf-worker";
import { db } from "@/db";
import { buktiPdfBundle, imporBundle, user } from "@/db/schema";
import { storage, type StorageProvider } from "@/lib/storage";
import { joinKey, slugifySegment } from "@/lib/storage/keys";
import type { ProductEntity } from "@/lib/bundle/product-validator";
import { parseStagedProductBundle } from "@/lib/bundle/product-staging";
import type { SafeFailureCode } from "@/lib/materials/pdf-artifact-contract";
import { uploadProductDiktatPdf } from "./product-diktat-storage";
import {
  PRODUCT_DIKTAT_PRINT_PROFILE,
  PRODUCT_DIKTAT_RENDERER_VERSION,
  compileProductDiktatHtml,
  renderProductDiktatPdf,
} from "@/lib/bundle/product-diktat-pdf";

export interface InspectedPdf {
  pageCount: number;
  text: string;
}

type ArticleProduct = Extract<ProductEntity, { productType: "article" }>;
type DiktatProduct = Extract<ProductEntity, { productType: "diktat" }>;

export async function inspectProductDiktatPdf(bytes: Uint8Array): Promise<InspectedPdf> {
  const { PDFParse } = await import("pdf-parse");
  await setupPdfWorker(PDFParse);
  // PDF.js transfers its input buffer to a worker. Keep the upload bytes owned here.
  const parser = new PDFParse({ data: bytes.slice() });
  try {
    const info = await parser.getInfo();
    const textResult = await parser.getText();
    const text = textResult.text;
    if (!text.trim() || text.includes("[object Object]") || text.includes("\\undefined") || text.includes("\uFFFD")) {
      throw new Error("PRODUCT_DIKTAT_PDF_CONTENT_INVALID");
    }
    return { pageCount: info.total, text };
  } catch (error) {
    throw new Error("PRODUCT_DIKTAT_PDF_CONTENT_INSPECTION_FAILED", { cause: error });
  } finally {
    await parser.destroy();
  }
}

function evidenceId(importId: string, productId: string, hash: string): string {
  return `pdf-evidence-${createHash("sha256").update(`${importId}:${productId}:${hash}:${PRODUCT_DIKTAT_PRINT_PROFILE}`).digest("hex").slice(0, 32)}`;
}

export function productDiktatFailureCode(error: unknown): SafeFailureCode {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("FORMULA")) return "FORMULA_RENDER_ERROR";
  if (message.includes("TIMEOUT") || (error instanceof Error && error.name === "TimeoutError")) return "RENDER_TIMEOUT";
  if (message.includes("RENDERER_CONFIG_MISSING")) return "RENDERER_CONFIG_MISSING";
  if (message.includes("RENDERER_REJECTED")) return "RENDERER_REJECTED";
  if (message.includes("RENDERER_INVALID_PDF")) return "INVALID_PDF_OUTPUT";
  if (message.includes("PDF_INSPECTION_FAILED")) {
    const cause = error instanceof Error ? error.cause : undefined;
    return cause instanceof Error && cause.message === "PRODUCT_DIKTAT_PDF_CONTENT_INSPECTION_FAILED"
      ? "INVALID_PDF_OUTPUT"
      : "RENDER_UNAVAILABLE";
  }
  if (message.includes("RENDERER")) return "RENDER_UNAVAILABLE";
  if (message.includes("PAGE")) return "PAGE_BUDGET_EXCEEDED";
  if (message.includes("STORAGE")) return "STORAGE_UNAVAILABLE";
  return "INVALID_SOURCE_MARKDOWN";
}


/** Renders and stores PDF evidence, marking only transient failures as retryable. */
export async function generateProductDiktatPdfEvidence(input: {
  importId: string;
  requestedBy: string;
  renderer?: (html: string) => Promise<Uint8Array>;
  storageProvider?: StorageProvider;
  throwOnFailure?: boolean;
}): Promise<{ evidenceId: string; status: "ready" | "failed"; pageCount?: number; failureCode?: SafeFailureCode }> {
  const [actor] = await db.select({ role: user.role }).from(user).where(eq(user.id, input.requestedBy)).limit(1);
  if (!actor || actor.role !== "admin") throw new Error("PRODUCT_DIKTAT_RENDER_FORBIDDEN");
  const [importRow] = await db.select({ id: imporBundle.id, status: imporBundle.status }).from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1);
  if (!importRow) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (importRow.status === "published" || importRow.status === "withdrawn") throw new Error("PRODUCT_DIKTAT_RENDER_DRAFT_REQUIRED");

  const bundle = await parseStagedProductBundle(input.importId);
  const article = bundle.products.find((product): product is ArticleProduct => product.productType === "article");
  const diktat = bundle.products.find((product): product is DiktatProduct => product.productType === "diktat");
  if (!article || !diktat) throw new Error("PRODUCT_DIKTAT_SOURCE_MISSING");

  const id = evidenceId(input.importId, diktat.id, diktat.generationHash);
  const now = new Date();
  const base = {
    id,
    imporBundleId: input.importId,
    productId: diktat.id,
    articleVersion: article.version,
    articleHash: article.generationHash,
    diktatHash: diktat.generationHash,
    rendererVersion: PRODUCT_DIKTAT_RENDERER_VERSION,
    printProfile: PRODUCT_DIKTAT_PRINT_PROFILE,
  };
  await db.insert(buktiPdfBundle).values({ ...base, status: "pending", createdAt: now, updatedAt: now }).onConflictDoUpdate({
    target: [buktiPdfBundle.imporBundleId, buktiPdfBundle.productId, buktiPdfBundle.diktatHash, buktiPdfBundle.printProfile],
    set: { rendererVersion: PRODUCT_DIKTAT_RENDERER_VERSION, status: "pending", storageKey: null, pageCount: null, failureCode: null, updatedAt: now },
  });

  try {
    const staticFigureAssets = article.schemaVersion === "article.v4"
      ? await (await import("./product-v4-runtime-binding")).loadProductV4StaticFigureAssets(bundle)
      : undefined;
    const html = compileProductDiktatHtml({ article, diktat, staticFigureAssets });
    const bytes = await (input.renderer ?? renderProductDiktatPdf)(html);
    const inspection = await inspectProductDiktatPdf(bytes).catch((error) => {
      console.error("Product Diktat PDF inspection failed:", error instanceof Error ? error.message : String(error));
      throw new Error("PRODUCT_DIKTAT_PDF_INSPECTION_FAILED", { cause: error });
    });
    if (inspection.pageCount < 1 || inspection.pageCount > 4) throw new Error("PRODUCT_DIKTAT_PAGE_BUDGET_EXCEEDED");
    const objectKey = joinKey("overhaul", input.importId, "diktat-pdf", `${slugifySegment(diktat.id)}-${diktat.generationHash.slice(0, 16)}.pdf`);
    await uploadProductDiktatPdf({
      provider: input.storageProvider ?? storage,
      bytes,
      filename: `${slugifySegment(diktat.title)}.pdf`,
      key: objectKey,
      metadata: { importId: input.importId, productId: diktat.id, rendererVersion: PRODUCT_DIKTAT_RENDERER_VERSION },
    });
    await db.update(buktiPdfBundle).set({ status: "ready", storageKey: objectKey, pageCount: inspection.pageCount, failureCode: null, updatedAt: new Date() }).where(eq(buktiPdfBundle.id, id));
    return { evidenceId: id, status: "ready", pageCount: inspection.pageCount };
  } catch (error) {
    const failureCode = productDiktatFailureCode(error);
    await db.update(buktiPdfBundle).set({ status: "failed", storageKey: null, pageCount: null, failureCode, updatedAt: new Date() }).where(eq(buktiPdfBundle.id, id));
    if (input.throwOnFailure && ["RENDER_UNAVAILABLE", "RENDER_TIMEOUT", "STORAGE_UNAVAILABLE"].includes(failureCode)) {
      throw new Error(`PRODUCT_DIKTAT_RENDER_RETRYABLE:${failureCode}`, { cause: error });
    }
    return { evidenceId: id, status: "failed", failureCode };
  }
}
