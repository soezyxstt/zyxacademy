import { validateProductBundleAdmission } from "../../lib/bundle/product-admission";
import type { InteractiveDocumentSpec } from "../../lib/materials/interactive-document";

export async function admitLocalV4Bundle(bytes: Uint8Array) {
  const parsed = await validateProductBundleAdmission(bytes);
  if (!parsed.success) throw new Error(`LOCAL_BUNDLE_INVALID:${parsed.issues.map(issue => issue.code).join(",")}`);
  return { bytes, bundle: parsed.data };
}

export function localV4DocumentReader(files: ReadonlyMap<string, Uint8Array>) {
  return async (spec: InteractiveDocumentSpec, kind: "document" | "print") => {
    const hash = kind === "document" ? spec.documentSha256 : spec.printSha256;
    const bytes = files.get(`visuals/${hash}.${kind === "document" ? "html" : "png"}`);
    if (!bytes) throw new Error("LOCAL_BUNDLE_ASSET_MISSING");
    return bytes;
  };
}
