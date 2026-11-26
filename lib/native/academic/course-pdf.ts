import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { artikel, buktiPdfBundle, courseMaterials, diktatMateri, diktats, imporBundle, mataKuliah } from "@/db/schema";
import { resolveCourseIdentity, type ResolvedCourseIdentity } from "@/lib/admin/course-identity";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { OfflineHttpError } from "@/lib/offline/server-auth";
import { buildProductVerificationKey, isProtectedProductDiktatPdfKey, isSafeKey, slugifySegment } from "@/lib/storage/keys";
import { nativeMaterialPdfSource, type MaterialPdfSource } from "@/lib/native/material-pdf-source";
import type { MaterialPdfTarget } from "@/packages/native-parity/student/courses/pdf";
import type { AdminPdfGrant } from "./course-pdf-response";

async function canonicalDiktatSource(row: {
  id: string; fileKey: string | null; courseCode: string; generationHash: string;
}, identity: ResolvedCourseIdentity): Promise<MaterialPdfSource | null> {
  const key = row.fileKey;
  if (!key || !isSafeKey(key) || /[\u0000-\u001f\u007f]/u.test(key) || !key.endsWith(".pdf")) return null;
  // The Admin renderer writes a per-document file under the canonical course.
  const manual = `courses/${slugifySegment(row.courseCode)}/materials/${slugifySegment(row.id)}-`;
  if (key.startsWith(manual) && /^\d+\.pdf$/.test(key.slice(manual.length))) return { storageKey: key };
  // Published products refer to renderer evidence in one of the two canonical namespaces.
  const [root, directory, planOrFolder, leaf] = key.split("/");
  const importId = isProtectedProductDiktatPdfKey(key) ? directory : undefined;
  if (!importId) {
    try {
      if (root !== "overhaul" || directory !== "product-verification" || buildProductVerificationKey(planOrFolder, leaf) !== key) return null;
    } catch { return null; }
  }
  const [evidence] = await db.select({ id: buktiPdfBundle.id }).from(buktiPdfBundle)
    .innerJoin(imporBundle, eq(imporBundle.id, buktiPdfBundle.imporBundleId))
    .where(and(importId ? eq(buktiPdfBundle.imporBundleId, importId) : undefined, eq(buktiPdfBundle.storageKey, key),
      eq(buktiPdfBundle.diktatHash, row.generationHash), eq(buktiPdfBundle.status, "ready"),
      or(isNull(imporBundle.courseId), inArray(imporBundle.courseId, identity.allIds)))).limit(1);
  return evidence ? { storageKey: key } : null;
}

/** Resolve only a PDF owned by the requested course's verified canonical/legacy identity. */
export async function findAdminCoursePdf(identity: ResolvedCourseIdentity, materialId: string): Promise<AdminPdfGrant | null> {
  const [uploads, compiled, products, articles] = await Promise.all([
    db.select({ id: courseMaterials.id, course: courseMaterials.courseId, fileUrl: courseMaterials.fileUrl,
      revision: courseMaterials.updatedAt, checksum: courseMaterials.checksum }).from(courseMaterials)
      .where(and(eq(courseMaterials.id, materialId), inArray(courseMaterials.courseId, identity.allIds))).limit(2),
    db.select({ id: diktats.id, course: diktats.courseId, fileUrl: diktats.fileUrl, status: diktats.status,
      revision: diktats.updatedAt, isStale: diktats.isStale, generation: diktats.generationHash }).from(diktats)
      .where(and(eq(diktats.id, materialId), inArray(diktats.courseId, identity.allIds))).limit(2),
    identity.canonicalId ? db.select({ id: diktatMateri.id, fileKey: diktatMateri.fileKey, revision: diktatMateri.updatedAt,
      version: diktatMateri.version, status: diktatMateri.status, generationHash: diktatMateri.generationHash, courseCode: mataKuliah.code })
      .from(diktatMateri).innerJoin(mataKuliah, eq(mataKuliah.id, diktatMateri.mataKuliahId))
      .where(and(eq(diktatMateri.id, materialId), eq(diktatMateri.mataKuliahId, identity.canonicalId))).limit(2) : [],
    identity.canonicalId ? db.select({ id: artikel.id }).from(artikel)
      .where(and(eq(artikel.id, materialId), eq(artikel.mataKuliahId, identity.canonicalId),
        inArray(artikel.status, ["draft", "published", "in_review"]))).limit(1) : [],
  ]);
  if (uploads.length + compiled.length + products.length !== 1 || articles.length) return null;
  const [upload] = uploads;
  const [compiledDiktat] = compiled;
  const [product] = products;
  const origin = new URL(resolveAuthBaseUrl()).origin;
  const source = upload ? nativeMaterialPdfSource(upload.fileUrl, identity.allIds, "manual-pdf", origin)
    : compiledDiktat?.status === "ready" ? nativeMaterialPdfSource(compiledDiktat.fileUrl, identity.allIds, "legacy-diktat", origin)
      : product && ["draft", "in_review", "published"].includes(product.status) ? await canonicalDiktatSource(product, identity) : null;
  if (!source) return null;
  const revision = createHash("sha256").update(JSON.stringify([identity.primaryId, identity.status, materialId,
    upload ?? compiledDiktat ?? product, source])).digest("hex");
  return { source, revision };
}

export async function authorizeAdminCoursePdf({ courseId, materialId }: MaterialPdfTarget) {
  const identity = await resolveCourseIdentity(courseId);
  const grant = identity && await findAdminCoursePdf(identity, materialId);
  if (!grant) throw new OfflineHttpError(404, "PDF_NOT_FOUND");
  return grant;
}
