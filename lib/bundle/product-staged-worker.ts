import { eq } from "drizzle-orm";
import { db } from "@/db";
import { imporBundle } from "@/db/schema";
import { storage } from "@/lib/storage";
import { parseProductBundle, type ProductBundleValidation } from "./product-validator";
import { readSecureZip } from "./zip-reader";

// Staging fully admits assets before writing; the stored checksum binds every archive member.
export function parseAdmittedProductBundle(bytes: Uint8Array, row: { bundleId: string; checksum: string }): Extract<ProductBundleValidation, { success: true }>["data"] {
  let result: ProductBundleValidation;
  try {
    result = parseProductBundle(readSecureZip(bytes, {}, { allowInteractiveDocuments: true }));
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "PRODUCT_ZIP_INVALID";
    throw new Error(`PRODUCT_BUNDLE_VALIDATION_FAILED:${code}`);
  }
  if (!result.success) throw new Error(`PRODUCT_BUNDLE_VALIDATION_FAILED:${result.issues.map(item => item.code).join(",")}`);
  if (result.data.manifest.bundleId !== row.bundleId || result.data.checksum !== row.checksum) throw new Error("PRODUCT_BUNDLE_CHECKSUM_MISMATCH");
  return result.data;
}

export async function readProductBundleForDiktat(importId: string) {
  const [row] = await db.select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1);
  if (!row || row.bundleType !== "product") throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (row.validationReport.valid !== true) throw new Error("PRODUCT_BUNDLE_ADMISSION_REQUIRED");
  if (!storage.download) throw new Error("PRODUCT_BUNDLE_STORAGE_DOWNLOAD_UNAVAILABLE");
  return parseAdmittedProductBundle(await storage.download(row.sourceUriOrKey), row);
}
