import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { readSecureZip } from "@/lib/bundle/zip-reader";
import {
  computeProductBundleChecksum,
  deterministicProductSerialization,
  parseProductBundle,
  productBundleManifestSchema,
  productDependencySchema,
  productEntitySchema,
  productIdeaLinkSchema,
  productSourceRefSchema,
  validateProductBundle,
  type ProductBundleFiles,
  type ProductBundleManifest,
  type ProductBundleValidation,
  type ProductDependency,
  type ProductEntity,
} from "./product-validator";

export type ProductBundleV2 = {
  manifest: ProductBundleManifest;
  products: readonly ProductEntity[];
  dependencies: readonly ProductDependency[];
  files: ProductBundleFiles;
  checksum: string;
  publicationBlocked: boolean;
};

export {
  computeProductBundleChecksum,
  deterministicProductSerialization,
  parseProductBundle,
  productBundleManifestSchema,
  productDependencySchema,
  productEntitySchema,
  productIdeaLinkSchema,
  productSourceRefSchema,
  validateProductBundle,
};

export function parseProductBundleZip(bytes: Uint8Array): ProductBundleValidation {
  return parseProductBundle(readSecureZip(bytes));
}

export function serializeProductBundle(bundle: ProductBundleV2): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of [...bundle.files.entries()].sort(([left], [right]) => left.localeCompare(right))) entries[path] = content;
  return zipSync(entries, { level: 6 });
}

export function productEntityHash(product: ProductEntity): string {
  return createHash("sha256").update(deterministicProductSerialization(product), "utf8").digest("hex");
}
