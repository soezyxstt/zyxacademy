import { db } from "@/db";
import { courses, mataKuliah, quizTemplates, imporBundle } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";

export interface ResolvedCourseIdentity {
  slug: string;
  primaryId: string;
  canonicalId: string | null;
  legacyId: string | null;
  title: string;
  category: string;
  description: string | null;
  status: string;
  allIds: string[];
}

export interface LockedCourseInfo {
  id: string;
  slug: string;
  title: string;
  compatibleCourseIds?: string[];
}

export async function resolveCourseIdentity(
  identifier: string
): Promise<ResolvedCourseIdentity | null> {
  const cleanId = identifier.trim().toLowerCase();
  if (!cleanId) return null;

  const [canonicalRows, legacyRows] = await Promise.all([
    db
      .select()
      .from(mataKuliah)
      .where(or(eq(mataKuliah.id, cleanId), eq(mataKuliah.legacyCourseId, cleanId)))
      .limit(2),
    db
      .select()
      .from(courses)
      .where(eq(courses.id, cleanId))
      .limit(2),
  ]);

  // A public identifier is an authorization boundary. Never select an
  // arbitrary first row when corrupted aliases or a canonical/legacy ID
  // collision make that boundary ambiguous.
  if (canonicalRows.length > 1 || legacyRows.length > 1) return null;

  const canonicalCourse = canonicalRows[0] ?? null;
  const directLegacyCourse = legacyRows[0] ?? null;
  if (!canonicalCourse && !directLegacyCourse) {
    return null;
  }

  // When both tables match the same identifier, they must describe the same
  // compatibility mapping. A canonical ID colliding with an unrelated legacy
  // course must fail closed rather than silently preferring the canonical row.
  if (
    canonicalCourse &&
    directLegacyCourse &&
    canonicalCourse.legacyCourseId !== directLegacyCourse.id
  ) {
    return null;
  }

  let linkedLegacy = directLegacyCourse;
  if (!linkedLegacy && canonicalCourse?.legacyCourseId) {
    const linkedLegacyRows = await db
      .select()
      .from(courses)
      .where(eq(courses.id, canonicalCourse.legacyCourseId))
      .limit(2);
    if (linkedLegacyRows.length > 1) return null;
    linkedLegacy = linkedLegacyRows[0] ?? null;
  }

  let linkedCanonical = canonicalCourse;
  if (!linkedCanonical && directLegacyCourse) {
    const linkedCanonicalRows = await db
      .select()
      .from(mataKuliah)
      .where(eq(mataKuliah.legacyCourseId, directLegacyCourse.id))
      .limit(2);
    if (linkedCanonicalRows.length > 1) return null;
    linkedCanonical = linkedCanonicalRows[0] ?? null;
  }

  const primaryId = linkedCanonical?.id ?? linkedLegacy!.id;
  const canonicalId = linkedCanonical?.id ?? null;
  const legacyId = linkedCanonical?.legacyCourseId ?? linkedLegacy?.id ?? null;
  const title = linkedCanonical?.title ?? linkedLegacy!.title;
  const category = linkedLegacy?.category ?? "Umum";
  const description = linkedLegacy?.description ?? null;
  const status = linkedCanonical?.status ?? "active";

  const allIdsSet = new Set<string>();
  allIdsSet.add(cleanId);
  if (canonicalId) allIdsSet.add(canonicalId);
  if (legacyId) allIdsSet.add(legacyId);
  if (linkedLegacy?.id) allIdsSet.add(linkedLegacy.id);
  if (primaryId) allIdsSet.add(primaryId);

  return {
    slug: identifier,
    primaryId,
    canonicalId,
    legacyId,
    title,
    category,
    description,
    status,
    allIds: Array.from(allIdsSet),
  };
}

export function matchesCourseIdentity(
  targetCourseId: string | null | undefined,
  identity: Pick<ResolvedCourseIdentity, "allIds" | "primaryId" | "canonicalId" | "legacyId">
): boolean {
  if (!targetCourseId) return false;
  const clean = targetCourseId.trim().toLowerCase();
  return (
    identity.allIds.some((id) => id.toLowerCase() === clean) ||
    Boolean(identity.canonicalId && identity.canonicalId.toLowerCase() === clean) ||
    Boolean(identity.legacyId && identity.legacyId.toLowerCase() === clean) ||
    identity.primaryId.toLowerCase() === clean
  );
}

export function isQuizOwnedByCourse(
  quiz: { courseId: string | null | undefined },
  identity: Pick<ResolvedCourseIdentity, "allIds" | "primaryId" | "canonicalId" | "legacyId">
): boolean {
  return matchesCourseIdentity(quiz.courseId, identity);
}

export function getCanonicalCourseSlug(
  identity: Pick<ResolvedCourseIdentity, "slug" | "primaryId" | "canonicalId">
): string {
  return identity.canonicalId || identity.primaryId || identity.slug;
}

export async function resolveQuizCourseIdentity(
  quizId: string
): Promise<ResolvedCourseIdentity | null> {
  const cleanId = quizId.trim();
  if (!cleanId) return null;

  const [template] = await db
    .select({ courseId: quizTemplates.courseId })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, cleanId))
    .limit(1);

  if (!template?.courseId) return null;
  return resolveCourseIdentity(template.courseId);
}

export async function resolveBundleCourseIdentity(
  bundleId: string,
  bundleType?: "idea" | "product"
): Promise<ResolvedCourseIdentity | null> {
  const cleanId = bundleId.trim();
  if (!cleanId) return null;

  const bundleIdentity = or(eq(imporBundle.id, cleanId), eq(imporBundle.bundleId, cleanId));

  const rows = await db
    .select({ courseId: imporBundle.courseId, bundleType: imporBundle.bundleType })
    .from(imporBundle)
    .where(bundleType ? and(bundleIdentity, eq(imporBundle.bundleType, bundleType)) : bundleIdentity)
    .limit(2);

  if (rows.length > 1) return null;

  const row = rows[0];
  if (!row?.courseId) return null;

  return resolveCourseIdentity(row.courseId);
}
