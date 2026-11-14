import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mataKuliah } from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildInteractiveDocumentAdmissionKey, buildInteractiveDocumentAssetKey } from "@/lib/storage/keys";
import { verifyInteractiveDocumentAdmissionReceipt } from "@/lib/materials/interactive-document-verified";
import { resolveSourceFigureForCourse } from "@/lib/authoring/source-figures";
import type { ProductBundleValidation } from "@/lib/bundle/product-validator";
import type { DiktatSourceFigureAssets } from "@/lib/materials/diktat-static-visual";

type Bundle = Pick<Extract<ProductBundleValidation, { success: true }>["data"], "manifest" | "products">;
type Figure = Awaited<ReturnType<typeof resolveSourceFigureForCourse>>;
type Ports = {
  course(id: string): Promise<{ legacyCourseId: string }>;
  figure(input: { courseId: string; materialId: string; assetId: string }): Promise<Figure>;
  download(key: string): Promise<Uint8Array>;
};
const bytesHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function loadDiktatWorkerAssets(bundle: Bundle, ports: Ports = {
  async course(id) {
    const [course] = await db.select({ legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).where(eq(mataKuliah.id, id)).limit(1);
    if (!course?.legacyCourseId) throw new Error("PRODUCT_V4_COURSE_ALIAS_REQUIRED");
    return { legacyCourseId: course.legacyCourseId };
  },
  figure: resolveSourceFigureForCourse,
  async download(key) { if (!storage.download) throw new Error("STORAGE_DOWNLOAD_UNSUPPORTED"); return storage.download(key); },
}): Promise<DiktatSourceFigureAssets> {
  const visuals = bundle.products.flatMap(product => product.productType === "article" ? product.visuals ?? [] : []);
  const figures = visuals.filter(visual => visual.kind === "source_figure").sort((a, b) => a.assetId.localeCompare(b.assetId) || a.materialId.localeCompare(b.materialId));
  const assets: Record<string, DiktatSourceFigureAssets[string]> = {};
  if (figures.length) {
    const course = await ports.course(bundle.manifest.courseId);
    for (const spec of figures) {
      const figure = await ports.figure({ courseId: course.legacyCourseId, materialId: spec.materialId, assetId: spec.assetId });
      if (!figure.publicationAllowed || figure.permission === "unknown" || figure.sourceChecksum !== spec.sourceChecksum || figure.assetId !== spec.assetId || figure.materialId !== spec.materialId || figure.courseId !== course.legacyCourseId) throw new Error("PRODUCT_V4_FIGURE_NOT_AUTHORIZED_OR_CURRENT");
      let print: Uint8Array | undefined;
      for (const variant of [...figure.variants].sort((a, b) => a.name.localeCompare(b.name))) {
        const bytes = await ports.download(variant.key);
        if (bytesHash(bytes) !== variant.checksum) throw new Error("PRODUCT_V4_FIGURE_BYTES_CHANGED");
        if (variant.name === "print") print = bytes;
      }
      if (!print) throw new Error("PRODUCT_V4_FIGURE_PRINT_VARIANT_REQUIRED");
      assets[figure.assetId] = { bytes: print, mimeType: "image/png", sourceChecksum: figure.sourceChecksum, attribution: figure.attribution };
    }
  }
  for (const spec of visuals.filter(visual => visual.kind === "interactive_document")) {
    verifyInteractiveDocumentAdmissionReceipt(spec, await ports.download(buildInteractiveDocumentAdmissionKey(spec.printSha256)));
    const bytes = await ports.download(buildInteractiveDocumentAssetKey(spec.printSha256, "print"));
    if (bytes.byteLength !== spec.printBytes || bytesHash(bytes) !== spec.printSha256) throw new Error("INTERACTIVE_DOCUMENT_INTEGRITY");
    assets[`interactive_document:${spec.printSha256}`] = { bytes, mimeType: "image/png", sourceChecksum: spec.printSha256 };
  }
  return assets;
}
