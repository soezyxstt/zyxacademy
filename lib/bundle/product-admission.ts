import { parseProductBundle, productInteractiveDocuments, type ProductBundleValidation, type ProductValidationIssue } from "./product-validator";
import { readSecureZip } from "./zip-reader";

function issue(code: string, message: string, path?: string): ProductValidationIssue {
  return { code, message, path };
}

/** Admission validates decoded asset bytes; structural parsing alone is not admission. */
export async function validateProductBundleAdmission(bytes: Uint8Array): Promise<ProductBundleValidation> {
  let result: ProductBundleValidation;
  try {
    result = parseProductBundle(readSecureZip(bytes, {}, { allowInteractiveDocuments: true }));
  } catch (error) {
    return { success: false, issues: [issue(error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "PRODUCT_ZIP_INVALID", error instanceof Error ? error.message : String(error))] };
  }
  if (!result.success) return result;
  const specs = productInteractiveDocuments(result.data.products);
  if (specs.length && result.data.manifest.schemaVersion !== "product-bundle.v4") return { success: false, issues: [issue("PRODUCT_VISUAL_REQUIRES_V4", "Interactive documents require V4")] };
  if (!specs.length && !result.data.manifest.visualAssets?.length && ![...result.data.files.keys()].some(path => path.startsWith("visuals/"))) return result;
  try {
    const { validateInteractiveDocumentArchive } = await import("@/lib/materials/interactive-document-assets");
    await validateInteractiveDocumentArchive(specs, result.data.manifest.visualAssets ?? [], result.data.files);
    return result;
  } catch (error) {
    const code = error instanceof Error && /^INTERACTIVE_DOCUMENT_[A-Z_]+$/.test(error.message) ? error.message : "INTERACTIVE_DOCUMENT_ASSET_INVALID";
    return { success: false, issues: [issue(code, "Interactive document asset admission failed", "visualAssets")] };
  }
}
