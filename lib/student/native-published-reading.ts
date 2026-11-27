import { createHash } from "node:crypto";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { getCanonicalPublishedArticle, getCanonicalPublishedTextProduct } from "@/lib/articles/structured-repository";
import { OfflineHttpError } from "@/lib/offline/server-auth";
import { offlineAssetFetchTarget, offlineAssetSources } from "@/lib/offline/server-assets";
import { findCanonicalDetail, findLegacyMaterialDetail } from "./canonical-material-detail";
import { readLegacyMaterialBody } from "./legacy-material-body";
import { resolveNativeStudentReadingAccess } from "./native-reading-access";
import { canAccessCourseContent } from "./course-access";

type Target = { courseId: string; materialId: string };

function publicContent({ progress: _progress, ...content }: PublicArticleReadModel) {
  return content;
}

async function authorizedReading(studentId: string, { courseId, materialId }: Target) {
  const access = await resolveNativeStudentReadingAccess(studentId, courseId);
  const record = access.canonicalCourseId && await findCanonicalDetail(access.canonicalCourseId, materialId);
  if (record && "ambiguous" in record) throw new OfflineHttpError(404, "READING_UNAVAILABLE");
  if (record) {
    if (!canAccessCourseContent(access, record.policyKind, [record.chapterId])) throw new OfflineHttpError(403, "READING_ACCESS_DENIED");
    return { ...record, format: "canonical" as const, chapterIds: [record.chapterId], canRunCoding: access.hasFullContentAccess };
  }
  const legacyCourse = access.legacyCourseId ?? access.courseId ?? courseId;
  const legacy = await findLegacyMaterialDetail(legacyCourse, materialId);
  if (legacy?.source !== "legacy-article") throw new OfflineHttpError(404, "READING_UNAVAILABLE");
  if (!canAccessCourseContent(access, "article", legacy.chapterIds)) throw new OfflineHttpError(403, "READING_ACCESS_DENIED");
  return { ...legacy, id: materialId, chapterId: legacy.chapterIds[0] ?? null, policyKind: "article" as const, legacyCourse, canRunCoding: false };
}

export async function loadNativePublishedReading(studentId: string, target: Target, environment: string) {
  const record = await authorizedReading(studentId, target);
  const kind = record.policyKind;
  const canonical = record.format === "canonical";
  const article = canonical && kind === "article"
    ? await getCanonicalPublishedArticle(target.courseId, record.id, studentId, undefined, { includeProgress: false }) : null;
  const text = !article && canonical ? await getCanonicalPublishedTextProduct(target.courseId, record.id) : null;
  const legacy = record.format !== "canonical"
    ? await readLegacyMaterialBody(record.legacyCourse, record.id, record.format, record.chapterIds)
    : null;
  if (article && (article.id !== record.id || article.version !== record.version)) throw new OfflineHttpError(409, "READING_CHANGED");
  if (!article && !legacy?.trim() && (!text || text.id !== record.id || text.productType !== kind || !text.contentMarkdown.trim())) {
    throw new OfflineHttpError(404, "READING_UNAVAILABLE");
  }
  const current = await authorizedReading(studentId, target);
  if (record.id !== current.id || record.version !== current.version || record.updatedAt.getTime() !== current.updatedAt.getTime() ||
    record.format !== current.format || JSON.stringify(record.chapterIds) !== JSON.stringify(current.chapterIds) || kind !== current.policyKind) throw new OfflineHttpError(409, "READING_CHANGED");
  const { id, title, chapterId, version } = record;
  const identity = { id, title, courseId: target.courseId };
  const markdown = legacy ?? text?.contentMarkdown ?? "";
  const data = article ? publicContent(article) : kind === "diktat"
    ? { ...identity, kind: "article", docCategory: "diktat", body: markdown, contentVersion: version }
    : { ...identity, chapterId, version, sections: [{ id: id + ":reading", slug: "reading", title: "",
      blocks: [{ id: id + ":content", blockType: "explanation", content: markdown }] }] };
  const assets = offlineAssetSources(data).filter(source => {
    try { offlineAssetFetchTarget(source, environment); return true; }
    catch { return false; }
  });
  const revision = createHash("sha256").update(JSON.stringify([kind, version, data, assets])).digest("hex");
  return { kind, courseId: target.courseId, id, title, revision, data, assets, structured: article !== null, codingMode: article ? current.canRunCoding ? "native" as const : "browser" as const : null };
}
