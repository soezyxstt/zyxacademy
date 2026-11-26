import { createHash } from "node:crypto";
import { OfflineHttpError } from "@/lib/offline/server-auth";
import { storage } from "@/lib/storage";
import { MATERIAL_PDF_LEASE_MS, MATERIAL_PDF_MAX_BYTES, type MaterialPdfTarget } from "@/packages/native-parity/student/courses/pdf";
import { findCanonicalDetail, findLegacyMaterialDetail } from "./canonical-material-detail";
import { canAccessCourseContent, hasChapterScopeWithin } from "./course-access";
import { listStudentEnrollments } from "./course-catalog";
import { resolveNativeStudentReadingAccess } from "./native-reading-access";
import { nativeMaterialPdfSource, type MaterialPdfSource } from "./native-material-pdf-source";

export async function authorizeNativeMaterialPdf(userId: string, { courseId, materialId }: MaterialPdfTarget, origin: string) {
  const access = await resolveNativeStudentReadingAccess(userId, courseId);
  if (access.canonicalCourseId && await findCanonicalDetail(access.canonicalCourseId, materialId)) {
    throw new OfflineHttpError(404, "PDF_NOT_FOUND");
  }
  const record = await findLegacyMaterialDetail(access.legacyCourseId ?? access.courseId ?? courseId, materialId);
  if (!record || record.source === "legacy-article") throw new OfflineHttpError(404, "PDF_NOT_FOUND");
  const allowed = record.source === "manual-pdf"
    ? hasChapterScopeWithin(record.chapterIds, access.scopedChapterIds)
    : canAccessCourseContent(access, "diktat", record.chapterIds);
  if (!allowed) throw new OfflineHttpError(403, "PDF_ACCESS_DENIED");
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

async function downloadBounded(url: string, signal: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", redirect: "error", headers: { Accept: "application/pdf" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]) });
  if (!response.ok || !response.body) throw new OfflineHttpError(503, "PDF_UNAVAILABLE");
  const declared = Number(response.headers.get("Content-Length"));
  if (declared > MATERIAL_PDF_MAX_BYTES) {
    await response.body.cancel();
    throw new OfflineHttpError(413, "PDF_TOO_LARGE");
  }
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MATERIAL_PDF_MAX_BYTES) throw new OfflineHttpError(413, "PDF_TOO_LARGE");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export async function readNativeMaterialPdf(source: MaterialPdfSource, signal: AbortSignal) {
  const bytes = "hostedUrl" in source ? await downloadBounded(source.hostedUrl, signal)
    : storage.getSignedUrl ? await downloadBounded(await storage.getSignedUrl(source.storageKey, "get", undefined, 60), signal)
    : await storage.download?.(source.storageKey);
  if (!bytes) throw new OfflineHttpError(503, "PDF_UNAVAILABLE");
  if (bytes.byteLength > MATERIAL_PDF_MAX_BYTES) throw new OfflineHttpError(413, "PDF_TOO_LARGE");
  if (!/%PDF-\d\.\d/.test(new TextDecoder().decode(bytes.subarray(0, 1024)))) throw new OfflineHttpError(422, "PDF_INVALID");
  return bytes;
}
