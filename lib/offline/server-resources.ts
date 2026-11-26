import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { artikel, bab, chapters, courseVideos, courseVideoPlaylists, diktatMateri } from "@/db/schema";
import { resolveCourseAccess, canAccessCourseContent, type CourseAccessResult } from "@/lib/student/course-access";
import { listStudentEnrollments, resolveStudentCourse, type StudentEnrollmentRecord } from "@/lib/student/course-catalog";
import { getCanonicalPublishedArticle } from "@/lib/articles/structured-repository";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { hasLegacyPrivateFormativeEnvelope } from "@/lib/materials/legacy-article-public";
import { storage } from "@/lib/storage";
import { BADGE_THRESHOLDS } from "@/lib/gamification/catalog";
import { profileBadgeFamilies } from "@/lib/gamification/profile-badges";
import { loadCatalog } from "@/lib/i18n/catalogs";
import { OfflineHttpError, assertOfflineActorCurrent, offlineIdentity, type OfflineActor } from "./server-auth";
import { currentOfflineCursor, readOfflineChanges, readOfflinePolicy } from "./server-events";
import { OFFLINE_REPRESENTATION_VERSION, offlineResourceKey, type OfflineAchievementCatalog, type OfflineAsset, type OfflineCourseAccess, type OfflineCourseOutline, type OfflineEnrollment, type OfflineManifestResponse, type OfflinePolicy, type OfflineResourceDescriptor, type OfflineResourceEnvelope, type OfflineResourceKind, type OfflineTextMaterial, type OfflineVideoCatalog } from "./sync-contract";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
export function offlineRevision(value: unknown): string { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function bytes(value: unknown): number { return Buffer.byteLength(JSON.stringify(value), "utf8"); }

export function offlineLeaseExpiresAt(actor: Pick<OfflineActor, "sessionExpiresAt">, policy: Pick<OfflinePolicy, "accessLeaseMs">, now: number, ...ends: Array<number | null | undefined>): number {
  return Math.max(now, Math.min(now + policy.accessLeaseMs, actor.sessionExpiresAt, ...ends.filter((end): end is number => typeof end === "number" && Number.isFinite(end))));
}

export async function offlineEnrollments(actor: OfflineActor): Promise<{ records: StudentEnrollmentRecord[]; summaries: OfflineEnrollment[] }> {
  const records = await listStudentEnrollments(actor.accountId);
  return { records, summaries: records.map(row => ({ id: row.id, title: row.title, expiresAt: row.expiresAt?.getTime() ?? null })) };
}

export async function offlineCourseAccess(actor: OfflineActor, courseId: string, policy: OfflinePolicy, enrollments?: StudentEnrollmentRecord[], resolved?: CourseAccessResult): Promise<{ publicAccess: OfflineCourseAccess; access: CourseAccessResult }> {
  const access = resolved ?? await resolveCourseAccess({ courseId, userId: actor.accountId });
  const rows = enrollments ?? (await offlineEnrollments(actor)).records;
  const record = rows.find(row => [row.id, row.canonicalId, row.legacyId].includes(courseId) || row.canonicalId === access.canonicalCourseId);
  const now = Date.now();
  const leaseExpiresAt = access.hasCourseAccess ? offlineLeaseExpiresAt(actor, policy, now, access.tier === "enrolled" ? record?.expiresAt?.getTime() : null, access.isFreeNow ? access.pricing.endsAt?.getTime() : null) : now;
  const chapterIds = access.hasFullContentAccess ? access.scopedChapterIds : access.scopedChapterIds.filter(id => access.freeChapterIds.includes(id));
  return { access, publicAccess: { courseId, allowed: access.hasCourseAccess, fullContent: access.hasFullContentAccess, chapterIds, leaseExpiresAt } };
}

type MaterialRow = { id: string; title: string; version: number; generationHash: string; updatedAt: Date; babId: string | null; contentMarkdown?: string; contentDigest?: string; structureStatus?: string };
function materialDescriptor(kind: "article" | "diktat", row: MaterialRow, courseId: string, actor: OfflineActor, courseTitle: string, chapterTitle: string | null, chapterNumber: number | null, chapterIds: string[]): OfflineResourceDescriptor {
  return { key: offlineResourceKey(kind, row.id, courseId), kind, id: row.id, courseId, chapterIds, title: row.title, revision: offlineRevision({ representation: OFFLINE_REPRESENTATION_VERSION, locale: actor.locale, kind, id: row.id, version: row.version, hash: row.generationHash, contentDigest: row.contentDigest, updatedAt: row.updatedAt, structureStatus: row.structureStatus, title: row.title, courseTitle, chapterTitle, chapterNumber, chapterIds }), updatedAt: row.updatedAt.getTime(), estimatedBytes: row.contentMarkdown ? Buffer.byteLength(row.contentMarkdown, "utf8") : 0 };
}

async function courseManifestData(actor: OfflineActor, courseId: string, policy: OfflinePolicy) {
  const { access, publicAccess } = await offlineCourseAccess(actor, courseId, policy);
  if (!publicAccess.allowed) throw new OfflineHttpError(403, "OFFLINE_COURSE_ACCESS_DENIED");
  const course = await resolveStudentCourse(courseId);
  if (!course) throw new OfflineHttpError(404, "OFFLINE_COURSE_NOT_FOUND");
  const chapterRows = course.canonicalId
    ? await db.select({ id: bab.id, title: bab.title, orderIndex: bab.orderIndex, legacyId: bab.legacyChapterId }).from(bab).where(and(eq(bab.mataKuliahId, course.canonicalId), eq(bab.status, "active"))).orderBy(asc(bab.orderIndex))
    : await db.select({ id: chapters.id, title: chapters.title, orderIndex: chapters.orderIndex }).from(chapters).where(eq(chapters.courseId, course.legacyId ?? course.id)).orderBy(asc(chapters.orderIndex));
  const chapterMap = new Map(chapterRows.map(row => [row.id, row]));
  const scopesFor = (chapterId: string | null) => { const chapter = chapterId ? chapterMap.get(chapterId) : null; return [chapterId, chapter && "legacyId" in chapter ? chapter.legacyId : null].filter((id): id is string => typeof id === "string"); };
  const [articles, diktats] = course.canonicalId ? await Promise.all([
    db.select({ id: artikel.id, title: artikel.title, version: artikel.version, generationHash: artikel.generationHash, contentDigest: sql<string>`encode(sha256(convert_to(${artikel.contentMarkdown}, 'UTF8')), 'hex')`, updatedAt: artikel.updatedAt, babId: artikel.babId, structureStatus: artikel.structureStatus }).from(artikel).where(and(eq(artikel.mataKuliahId, course.canonicalId), eq(artikel.status, "published"))).orderBy(asc(artikel.title)),
    db.select({ id: diktatMateri.id, title: diktatMateri.title, version: diktatMateri.version, generationHash: diktatMateri.generationHash, contentDigest: sql<string>`encode(sha256(convert_to(${diktatMateri.contentMarkdown}, 'UTF8')), 'hex')`, updatedAt: diktatMateri.updatedAt, babId: diktatMateri.babId }).from(diktatMateri).where(and(eq(diktatMateri.mataKuliahId, course.canonicalId), eq(diktatMateri.status, "published"))).orderBy(asc(diktatMateri.title)),
  ]) : [[], []];
  const materialRows = [...articles.map(row => ({ kind: "article" as const, row })), ...diktats.map(row => ({ kind: "diktat" as const, row }))];
  const resources = materialRows.filter(({ kind, row }) => (!row.babId || chapterMap.has(row.babId)) && canAccessCourseContent(access, kind, scopesFor(row.babId))).map(({ kind, row }) => materialDescriptor(kind, row, courseId, actor, course.title, row.babId ? chapterMap.get(row.babId)?.title ?? null : null, row.babId ? chapterMap.get(row.babId)?.orderIndex ?? null : null, scopesFor(row.babId)));
  const versions = new Map(materialRows.map(({ kind, row }) => [offlineResourceKey(kind, row.id, courseId), row.version]));
  return { access, publicAccess, course, chapterRows, resources, versions };
}

function accessSignature(access: OfflineCourseAccess): string {
  return offlineRevision({ allowed: access.allowed, fullContent: access.fullContent, chapterIds: [...access.chapterIds].sort() });
}

/** Cursor is captured before reads. Committed changes during a read trigger a retry,
 * so a multi-query DTO cannot acknowledge a cursor newer than its content. */
async function assertOfflineReadCurrent(actor: OfflineActor, cursor: string, access?: CourseAccessResult): Promise<void> {
  await assertOfflineActorCurrent(actor);
  const scopes = access ? [access.courseId, access.requestedCourseId, access.canonicalCourseId, access.legacyCourseId].filter((id): id is string => Boolean(id)) : [];
  let after = cursor;
  for (let page = 0; page < 5; page++) {
    const changes = await readOfflineChanges(actor.accountId, scopes, after);
    if (changes.reset || changes.changes.length > 0) throw new OfflineHttpError(409, "OFFLINE_MATERIAL_CHANGED");
    if (!changes.hasMore) return;
    after = changes.cursor;
  }
  throw new OfflineHttpError(409, "OFFLINE_MATERIAL_CHANGED");
}

export async function buildOfflineManifest(actor: OfflineActor, courseId: string): Promise<OfflineManifestResponse> {
  const cursor = await currentOfflineCursor();
  const policy = await readOfflinePolicy();
  const { publicAccess, resources, access } = await courseManifestData(actor, courseId, policy);
  const current = await offlineCourseAccess(actor, courseId, policy);
  if (accessSignature(publicAccess) !== accessSignature(current.publicAccess)) throw new OfflineHttpError(409, "OFFLINE_ACCESS_CHANGED");
  await assertOfflineReadCurrent(actor, cursor, access);
  return { ...offlineIdentity(actor), cursor, serverTime: Date.now(), leaseExpiresAt: Math.min(publicAccess.leaseExpiresAt, current.publicAccess.leaseExpiresAt), resource: current.publicAccess, resources };
}

/** Unchanged reading content needs only the authorized manifest, never section
 * bodies, progress, source figures or the full diktat text. */
export async function offlineUnchangedMaterial(actor: OfflineActor, kind: OfflineResourceKind, id: string, courseId: string | undefined, etag: string | null): Promise<Pick<OfflineResourceEnvelope, "resource" | "cursor" | "validatedAt" | "leaseExpiresAt"> | null> {
  if (!etag || !courseId || (kind !== "article" && kind !== "diktat")) return null;
  const manifest = await buildOfflineManifest(actor, courseId);
  const resource = manifest.resources.find(value => value.id === id && value.kind === kind);
  if (!resource) throw new OfflineHttpError(404, "OFFLINE_MATERIAL_UNAVAILABLE");
  return etag === `"${resource.revision}"` ? { resource, cursor: manifest.cursor, validatedAt: manifest.serverTime, leaseExpiresAt: manifest.leaseExpiresAt } : null;
}

function readLegacyArticle(row: MaterialRow & { contentMarkdown: string }, courseId: string, courseTitle: string): PublicArticleReadModel {
  if (hasLegacyPrivateFormativeEnvelope(row.contentMarkdown)) throw new OfflineHttpError(409, "OFFLINE_MATERIAL_NOT_READY");
  return { id: row.id, courseId, title: row.title, slug: row.id, chapterId: row.babId, courseTitle, chapterTitle: null, chapterNumber: null, version: row.version, totalEstimatedReadingMinutes: 0, sections: [{ id: `${row.id}:offline`, slug: "reading", title: row.title, sectionNumber: "", sectionKind: "topic", learningObjective: "", estimatedReadingMinutes: 0, orderIndex: 0, parentSectionId: null, blocks: [{ id: `${row.id}:text`, blockKey: `${row.id}:text`, blockType: "explanation", title: null, orderIndex: 0, content: row.contentMarkdown }] }] };
}

async function achievementCatalog(actor: OfflineActor): Promise<OfflineAchievementCatalog> {
  const catalog = await loadCatalog(actor.locale, "student");
  const profile = catalog.profileCustomization as { families?: Record<string, string> } | undefined;
  return { achievements: profileBadgeFamilies.map(family => ({ id: family, title: profile?.families?.[family] ?? family.replaceAll("_", " "), description: "", thresholds: [...BADGE_THRESHOLDS[family]], icon: `/gamification/achievement--${family.replaceAll("_", "-")}--bronze.svg` })) };
}

async function videoCatalog(access: CourseAccessResult): Promise<{ catalog: OfflineVideoCatalog; revision: string }> {
  const courseIds = [...new Set([access.legacyCourseId, access.canonicalCourseId, access.courseId].filter((id): id is string => Boolean(id)))];
  const [videos, playlists] = await Promise.all([
    db.select().from(courseVideos).where(inArray(courseVideos.courseId, courseIds)).orderBy(asc(courseVideos.orderIndex)),
    db.select({ id: courseVideoPlaylists.id, title: courseVideoPlaylists.title }).from(courseVideoPlaylists).where(inArray(courseVideoPlaylists.courseId, courseIds)).orderBy(asc(courseVideoPlaylists.orderIndex)),
  ]);
  const visible = videos.filter(video => access.tier === "staff" || !video.chapterId || access.scopedChapterIds.includes(video.chapterId));
  return { catalog: { playlists, videos: visible.map(video => ({ id: video.id, title: video.title, videoUrl: access.hasFullContentAccess ? video.videoUrl.startsWith("youtube/") ? video.videoUrl : storage.getUrl(video.videoUrl) : "", thumbnailUrl: video.thumbnailUrl ? storage.getUrl(video.thumbnailUrl) : null, playlistId: video.playlistId, durationSeconds: video.duration })) }, revision: offlineRevision(visible.map(video => [video.id, video.updatedAt])) };
}

/** Only image references get downloaded; video URLs and interactive evaluation stay online. */
export function offlineAssetSources(data: unknown): string[] {
  const urls = new Set<string>();
  const visit = (value: unknown, key = "") => {
    if (typeof value === "string") {
      if (["imageUrl", "thumbnailUrl", "icon"].includes(key) && /^(?:https?:\/\/|\/)/.test(value)) urls.add(value);
      for (const match of value.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)) urls.add(match[1]);
    } else if (Array.isArray(value)) value.forEach(item => visit(item));
    else if (value && typeof value === "object") for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
  };
  visit(data);
  if (urls.size > 80) throw new OfflineHttpError(413, "OFFLINE_TOO_MANY_ASSETS");
  return [...urls].filter(url => !url.startsWith("//") && !url.includes("\u0000"));
}

function assertRequiredFiguresReady(data: unknown): void {
  if (Array.isArray(data)) { data.forEach(assertRequiredFiguresReady); return; }
  if (!data || typeof data !== "object") return;
  if ("kind" in data && data.kind === "source_figure" && (!("asset" in data) || !data.asset)) throw new OfflineHttpError(503, "OFFLINE_ASSET_UNAVAILABLE");
  Object.values(data).forEach(assertRequiredFiguresReady);
}

export function offlineAssetUrl(descriptor: OfflineResourceDescriptor, locale: string, source: string): string {
  const query = new URLSearchParams({ kind: descriptor.kind, id: descriptor.id, locale, revision: descriptor.revision, asset: source });
  if (descriptor.courseId) query.set("courseId", descriptor.courseId);
  return `/api/offline/asset?${query}`;
}

function wrapAssets<T>(data: T, descriptor: OfflineResourceDescriptor, locale: string): { data: T; assets: OfflineAsset[] } {
  const replacements = new Map(offlineAssetSources(data).map(source => [source, offlineAssetUrl(descriptor, locale, source)]));
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") { for (const [from, to] of replacements) value = (value as string).split(from).join(to); return value; }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
    return value;
  };
  return { data: visit(data) as T, assets: [...replacements.values()].map(url => ({ url, required: descriptor.kind === "article" || descriptor.kind === "diktat" })) };
}

export async function buildOfflineResource(actor: OfflineActor, kind: OfflineResourceKind, id: string, courseId?: string): Promise<OfflineResourceEnvelope> {
  const cursor = await currentOfflineCursor();
  const policy = await readOfflinePolicy();
  const validatedAt = Date.now();
  let leaseExpiresAt = offlineLeaseExpiresAt(actor, policy, validatedAt);
  let data: OfflineResourceEnvelope["data"];
  let descriptor: OfflineResourceDescriptor;
  let verifiedAccess: CourseAccessResult | undefined;
  if (kind === "enrollments" || kind === "achievement_catalog") {
    data = kind === "enrollments" ? (await offlineEnrollments(actor)).summaries : await achievementCatalog(actor);
    descriptor = { key: offlineResourceKey(kind, id), kind, id, courseId: null, chapterIds: [], title: kind, revision: offlineRevision({ representation: OFFLINE_REPRESENTATION_VERSION, locale: actor.locale, kind, data }), updatedAt: 0, estimatedBytes: bytes(data) };
  } else {
    if (!courseId) throw new OfflineHttpError(400, "OFFLINE_COURSE_REQUIRED");
    const manifest = await courseManifestData(actor, courseId, policy);
    verifiedAccess = manifest.access;
    leaseExpiresAt = manifest.publicAccess.leaseExpiresAt;
    if (kind === "course_outline" || kind === "video_catalog") {
      const video = kind === "video_catalog" ? await videoCatalog(manifest.access) : undefined;
      data = video ? video.catalog : { id: courseId, title: manifest.course.title, chapters: manifest.chapterRows.map(({ id: chapterId, title, orderIndex }) => ({ id: chapterId, title, orderIndex })), materials: manifest.resources } satisfies OfflineCourseOutline;
      descriptor = { key: offlineResourceKey(kind, id, courseId), kind, id, courseId, chapterIds: [], title: manifest.course.title, revision: offlineRevision({ representation: OFFLINE_REPRESENTATION_VERSION, locale: actor.locale, kind, data, videoRevision: video?.revision, fullContent: manifest.publicAccess.fullContent }), updatedAt: 0, estimatedBytes: bytes(data) };
    } else {
      const selected = manifest.resources.find(resource => resource.id === id && resource.kind === kind);
      if (!selected) throw new OfflineHttpError(404, "OFFLINE_MATERIAL_UNAVAILABLE");
      descriptor = selected;
      if (kind === "article") {
        const article = await getCanonicalPublishedArticle(courseId, id, actor.accountId, undefined, { includeProgress: false });
        if (article) { const { progress: _progress, ...content } = article; data = content; }
        else {
          const [row] = await db.select().from(artikel).where(and(eq(artikel.id, id), eq(artikel.mataKuliahId, manifest.course.canonicalId!), eq(artikel.status, "published"))).limit(1);
          if (!row || row.structureStatus === "structured") throw new OfflineHttpError(409, "OFFLINE_MATERIAL_CHANGED");
          data = readLegacyArticle(row, courseId, manifest.course.title);
        }
      } else {
        const [row] = await db.select().from(diktatMateri).where(and(eq(diktatMateri.id, id), eq(diktatMateri.mataKuliahId, manifest.course.canonicalId!), eq(diktatMateri.status, "published"))).limit(1);
        if (!row) throw new OfflineHttpError(404, "OFFLINE_MATERIAL_UNAVAILABLE");
        data = { id, courseId, title: row.title, body: row.contentMarkdown, docCategory: "diktat", kind: "article", contentVersion: row.version } satisfies OfflineTextMaterial;
      }
      // A publication racing the multi-query read must never create a mixed-version package.
      const current = await courseManifestData(actor, courseId, policy);
      const verified = current.resources.find(resource => resource.id === id && resource.kind === kind);
      const contentVersion = kind === "article" && "version" in data ? data.version : "contentVersion" in data ? data.contentVersion : null;
      if (!verified || verified.revision !== descriptor.revision || contentVersion !== manifest.versions.get(descriptor.key) || contentVersion !== current.versions.get(descriptor.key)) throw new OfflineHttpError(409, "OFFLINE_MATERIAL_CHANGED");
      leaseExpiresAt = Math.min(leaseExpiresAt, current.publicAccess.leaseExpiresAt);
      descriptor = { ...descriptor, estimatedBytes: bytes(data) };
    }
    const currentGrant = await offlineCourseAccess(actor, courseId, policy);
    if (accessSignature(manifest.publicAccess) !== accessSignature(currentGrant.publicAccess)) throw new OfflineHttpError(409, "OFFLINE_ACCESS_CHANGED");
    leaseExpiresAt = Math.min(leaseExpiresAt, currentGrant.publicAccess.leaseExpiresAt);
  }
  await assertOfflineReadCurrent(actor, cursor, verifiedAccess);
  if (descriptor.estimatedBytes > policy.maxBytes || descriptor.estimatedBytes > 8 * 1024 * 1024) throw new OfflineHttpError(413, "OFFLINE_MATERIAL_TOO_LARGE");
  assertRequiredFiguresReady(data);
  const wrapped = wrapAssets(data, descriptor, actor.locale);
  return { ...offlineIdentity(actor), resource: descriptor, cursor, validatedAt, leaseExpiresAt, data: wrapped.data, assets: wrapped.assets };
}
