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

export async function resolveStudentCourse(courseId: string): Promise<StudentCourseRecord | null> {
  const [canonical] = await db
    .select()
    .from(mataKuliah)
    .where(
      and(
        or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)),
      ),
    )
    .limit(1);

  if (canonical) {
    if (canonical.status !== "active") return null;
    const [legacy] = canonical.legacyCourseId
      ? await db.select().from(courses).where(eq(courses.id, canonical.legacyCourseId)).limit(1)
      : [];
    return projectCanonicalCourse(canonical, legacy);
  }

  const [legacy] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  return legacy ? projectLegacyCourse(legacy) : null;
}

export async function listStudentCourses(): Promise<StudentCourseRecord[]> {
  const [allCanonicalRows, legacyRows] = await Promise.all([
    db.select().from(mataKuliah).orderBy(asc(mataKuliah.title)),
    db.select().from(courses).orderBy(asc(courses.title)),
  ]);
  const canonicalRows = allCanonicalRows.filter((course) => course.status === "active");
  const legacyById = new Map(legacyRows.map((course) => [course.id, course]));
  const projected = canonicalRows.map((course) =>
    projectCanonicalCourse(course, course.legacyCourseId ? legacyById.get(course.legacyCourseId) : undefined),
  );
  const representedLegacyIds = new Set(allCanonicalRows.flatMap((course) => course.legacyCourseId ? [course.legacyCourseId] : []));

  for (const legacy of legacyRows) {
    if (!representedLegacyIds.has(legacy.id)) projected.push(projectLegacyCourse(legacy));
  }

  return projected.sort((left, right) => left.title.localeCompare(right.title, "id"));
}

export async function isStudentEnrolled(userId: string, courseId: string): Promise<boolean> {
  if (!userId || !courseId) return false;
  const course = await resolveStudentCourse(courseId);
  const now = new Date();

  if (!course) {
    const [canonicalIdentity] = await db
      .select({ id: mataKuliah.id })
      .from(mataKuliah)
      .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
      .limit(1);
    if (canonicalIdentity) return false;
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
