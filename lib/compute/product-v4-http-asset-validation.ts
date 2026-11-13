import { productEntitySchema, productInteractiveDocuments, type ProductEntity } from "@/lib/bundle/product-validator";
import { verifyInteractiveDocumentAsset } from "@/lib/materials/interactive-document-server";
import { productV4DocumentPairKey } from "./product-v4-document-wire";

/** The HTTP renderer receives untrusted bytes and must fully decode PNGs. */
export async function validateProductV4HttpAssets(
  products: readonly ProductEntity[],
  pairs: Readonly<Record<string, { document: Uint8Array; print: Uint8Array }>>,
  figures: Readonly<Record<string, { bytes: Uint8Array }>>,
): Promise<void> {
  const specs = productInteractiveDocuments(products.map(product => productEntitySchema.parse(product)));
  for (const [key, pair] of Object.entries(pairs)) {
    const matches = specs.filter(spec => productV4DocumentPairKey(spec) === key);
    if (!matches.length) throw new Error("VERIFICATION_DOCUMENT_ASSET_UNAVAILABLE");
    for (const spec of matches) {
      await verifyInteractiveDocumentAsset(spec, "document", pair.document);
      await verifyInteractiveDocumentAsset(spec, "print", pair.print);
    }
  }
  for (const [key, figure] of Object.entries(figures)) {
    if (!key.startsWith("interactive_document:")) continue;
    const matches = specs.filter(spec => `interactive_document:${spec.printSha256}` === key);
    if (!matches.length) throw new Error("VERIFICATION_DOCUMENT_ASSET_UNAVAILABLE");
    for (const spec of matches) await verifyInteractiveDocumentAsset(spec, "print", figure.bytes);
  }
}
