import { createHash } from "node:crypto";
import { OfflineHttpError } from "@/lib/offline/server-auth";
import { MATERIAL_PDF_LEASE_MS, type MaterialPdfTarget } from "@/packages/native-parity/student/courses/pdf";
import { findCanonicalDetail, findLegacyMaterialDetail } from "./canonical-material-detail";
import { canAccessCourseContent, hasChapterScopeWithin } from "./course-access";
import { listStudentEnrollments } from "./course-catalog";
import { resolveNativeStudentReadingAccess } from "./native-reading-access";
import { nativeMaterialPdfSource } from "./native-material-pdf-source";
export { readNativeMaterialPdf } from "@/lib/native/material-pdf-bytes";

export async function authorizeNativeMaterialPdf(userId: string, { courseId, materialId }: MaterialPdfTarget, origin: string, download = false) {
  const access = await resolveNativeStudentReadingAccess(userId, courseId);
  if (access.canonicalCourseId && await findCanonicalDetail(access.canonicalCourseId, materialId)) {
    throw new OfflineHttpError(404, "PDF_NOT_FOUND");
  }
  const record = await findLegacyMaterialDetail(access.legacyCourseId ?? access.courseId ?? courseId, materialId);
  if (!record || record.source === "legacy-article") throw new OfflineHttpError(404, "PDF_NOT_FOUND");
  const allowed = record.source === "manual-pdf"
    ? hasChapterScopeWithin(record.chapterIds, access.scopedChapterIds)
    : canAccessCourseContent(access, "diktat", record.chapterIds);
  if (!allowed || (download && (record.source !== "manual-pdf" || !access.capabilities.canDownloadDiktat))) {
    throw new OfflineHttpError(403, "PDF_ACCESS_DENIED");
  }
  const aliases = [courseId, access.courseId, access.canonicalCourseId, access.legacyCourseId].filter((id): id is string => Boolean(id));
  const source = nativeMaterialPdfSource(record.fileUrl, aliases, record.source, origin);
  if (!source) throw new OfflineHttpError(422, "PDF_SOURCE_UNSUPPORTED");
  const now = Date.now();
  const enrollment = access.tier === "enrolled" ? (await listStudentEnrollments(userId)).find(row =>
    aliases.some(alias => [row.id, row.canonicalId, row.legacyId].includes(alias))) : undefined;
  if (access.tier === "enrolled" && !enrollment) throw new OfflineHttpError(403, "PDF_ACCESS_DENIED");
  const until = Math.min(now + MATERIAL_PDF_LEASE_MS, enrollment?.expiresAt?.getTime() ?? Infinity,
    access.isFreeNow ? access.pricing.endsAt?.getTime() ?? Infinity : Infinity);
  if (until <= now) throw new OfflineHttpError(403, "PDF_ACCESS_DENIED");
  const revision = createHash("sha256").update(JSON.stringify([materialId, record.source, record.fileUrl, record.revision])).digest("hex");
  return { source, until, revision };
}
