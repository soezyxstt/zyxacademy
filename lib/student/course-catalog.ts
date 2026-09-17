import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { courses, enrollments, mataKuliah, pendaftaranMurid } from "@/db/schema";

export type StudentCourseRecord = {
  id: string;
  canonicalId: string | null;
  legacyId: string | null;
  title: string;
  category: string;
  description: string;
};

export type StudentEnrollmentRecord = StudentCourseRecord & {
  enrolledAt: Date | null;
  expiresAt: Date | null;
};

function projectCanonicalCourse(
  canonical: typeof mataKuliah.$inferSelect,
  legacy?: typeof courses.$inferSelect,
): StudentCourseRecord {
  return {
    id: canonical.legacyCourseId ?? canonical.id,
    canonicalId: canonical.id,
    legacyId: canonical.legacyCourseId ?? null,
    title: canonical.title,
    category: legacy?.category ?? "Akademik",
    description: legacy?.description ?? "",
  };
}

function projectLegacyCourse(legacy: typeof courses.$inferSelect): StudentCourseRecord {
  return {
    id: legacy.id,
    canonicalId: null,
    legacyId: legacy.id,
    title: legacy.title,
    category: legacy.category,
    description: legacy.description ?? "",
  };
}

async function findCanonicalCourseCandidates(courseId: string) {
  return db
    .select()
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(2);
}

async function findLegacyCourseCandidates(courseId: string) {
  return db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(2);
}

export async function resolveStudentCourse(courseId: string): Promise<StudentCourseRecord | null> {
  const cleanCourseId = typeof courseId === "string" ? courseId.trim() : "";
  if (!cleanCourseId) return null;

  const [canonicalRows, legacyRows] = await Promise.all([
    findCanonicalCourseCandidates(cleanCourseId),
    findLegacyCourseCandidates(cleanCourseId),
  ]);
  if (canonicalRows.length > 1 || legacyRows.length > 1) return null;

  const canonical = canonicalRows[0] ?? null;
  const directLegacy = legacyRows[0] ?? null;

  if (canonical) {
    if (canonical.status !== "active") return null;
    // A direct legacy match is valid only when the canonical row explicitly
    // maps to it. This rejects canonical IDs that collide with an unrelated
    // legacy course instead of silently choosing one representation.
    if (directLegacy && canonical.legacyCourseId !== directLegacy.id) return null;

    let legacy = directLegacy;
    if (!legacy && canonical.legacyCourseId) {
      const linkedLegacyRows = await findLegacyCourseCandidates(canonical.legacyCourseId);
      if (linkedLegacyRows.length > 1) return null;
      legacy = linkedLegacyRows[0] ?? null;
    }
    return projectCanonicalCourse(canonical, legacy ?? undefined);
  }

  return directLegacy ? projectLegacyCourse(directLegacy) : null;
}

export async function listStudentCourses(): Promise<StudentCourseRecord[]> {
  const [allCanonicalRows, legacyRows] = await Promise.all([
    db.select().from(mataKuliah).orderBy(asc(mataKuliah.title)),
    db.select().from(courses).orderBy(asc(courses.title)),
  ]);
  const canonicalRows = allCanonicalRows.filter((course) => course.status === "active");
  const legacyById = new Map(legacyRows.map((course) => [course.id, course]));
  const canonicalIds = new Set(allCanonicalRows.map((course) => course.id));
  const canonicalLegacyCounts = new Map<string, number>();
  for (const course of allCanonicalRows) {
    if (course.legacyCourseId) {
      canonicalLegacyCounts.set(
        course.legacyCourseId,
        (canonicalLegacyCounts.get(course.legacyCourseId) ?? 0) + 1,
      );
    }
  }
  const ambiguousLegacyIds = new Set(
    [...canonicalLegacyCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([legacyId]) => legacyId),
  );
  const collidingAliasIds = new Set(
    allCanonicalRows.flatMap((course) =>
      course.legacyCourseId
        && course.legacyCourseId !== course.id
        && canonicalIds.has(course.legacyCourseId)
        ? [course.id, course.legacyCourseId]
        : [],
    ),
  );
  const safeCanonicalRows = canonicalRows.filter((course) =>
    !collidingAliasIds.has(course.id)
      && (!course.legacyCourseId
        || (!ambiguousLegacyIds.has(course.legacyCourseId) && !collidingAliasIds.has(course.legacyCourseId))),
  );
  const projected = safeCanonicalRows.map((course) =>
    projectCanonicalCourse(course, course.legacyCourseId ? legacyById.get(course.legacyCourseId) : undefined),
  );
  // Suppress every mapped legacy identity, including mappings that are
  // archived, ambiguous, or otherwise excluded from the active projection.
  // Otherwise an inactive canonical row can reappear as a public legacy card.
  const representedLegacyIds = new Set(allCanonicalRows.flatMap((course) => course.legacyCourseId ? [course.legacyCourseId] : []));

  for (const legacy of legacyRows) {
    if (representedLegacyIds.has(legacy.id) || collidingAliasIds.has(legacy.id)) continue;
    projected.push(projectLegacyCourse(legacy));
  }

  return projected.sort((left, right) => left.title.localeCompare(right.title, "id"));
}

export async function isStudentEnrolled(userId: string, courseId: string): Promise<boolean> {
  if (!userId || !courseId) return false;
  const course = await resolveStudentCourse(courseId);
  const now = new Date();

  if (!course) {
    const canonicalIdentityRows = await findCanonicalCourseCandidates(courseId.trim());
    if (canonicalIdentityRows.length > 0) return false;
  }

  if (course?.canonicalId) {
    const [canonicalEnrollment] = await db
      .select({ id: pendaftaranMurid.id })
      .from(pendaftaranMurid)
      .where(
        and(
          eq(pendaftaranMurid.penggunaId, userId),
          eq(pendaftaranMurid.mataKuliahId, course.canonicalId),
          inArray(pendaftaranMurid.status, ["active", "completed"]),
          or(isNull(pendaftaranMurid.endAt), gt(pendaftaranMurid.endAt, now)),
        ),
      )
      .limit(1);
    if (canonicalEnrollment) return true;
  }

  const legacyCourseId = course?.legacyId ?? courseId;
  const [legacyEnrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, legacyCourseId),
        gt(enrollments.expiresAt, now),
      ),
    )
    .limit(1);
  return Boolean(legacyEnrollment);
}

export async function listStudentEnrollments(userId: string): Promise<StudentEnrollmentRecord[]> {
  const now = new Date();
  const [canonicalRows, legacyRows] = await Promise.all([
    db
      .select({
        course: mataKuliah,
        enrolledAt: pendaftaranMurid.startAt,
        expiresAt: pendaftaranMurid.endAt,
      })
      .from(pendaftaranMurid)
      .innerJoin(mataKuliah, eq(pendaftaranMurid.mataKuliahId, mataKuliah.id))
      .where(
        and(
          eq(pendaftaranMurid.penggunaId, userId),
          eq(mataKuliah.status, "active"),
          inArray(pendaftaranMurid.status, ["active", "completed"]),
          or(isNull(pendaftaranMurid.endAt), gt(pendaftaranMurid.endAt, now)),
        ),
      ),
    db
      .select({ course: courses, enrolledAt: enrollments.enrolledAt, expiresAt: enrollments.expiresAt })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(and(eq(enrollments.userId, userId), gt(enrollments.expiresAt, now))),
  ]);

  const legacyById = new Map(legacyRows.map((row) => [row.course.id, row]));
  const result = new Map<string, StudentEnrollmentRecord>();
  for (const row of canonicalRows) {
    const legacy = row.course.legacyCourseId ? legacyById.get(row.course.legacyCourseId) : undefined;
    const projected = projectCanonicalCourse(row.course, legacy?.course);
    result.set(projected.id, {
      ...projected,
      enrolledAt: row.enrolledAt,
      expiresAt: row.expiresAt,
    });
  }
  for (const row of legacyRows) {
    if (result.has(row.course.id)) continue;
    result.set(row.course.id, {
      ...projectLegacyCourse(row.course),
      enrolledAt: row.enrolledAt,
      expiresAt: row.expiresAt,
    });
  }

  return [...result.values()].sort((left, right) => left.title.localeCompare(right.title, "id"));
}
