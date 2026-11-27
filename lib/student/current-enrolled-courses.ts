import "server-only";
import { resolveCourseEntitlementsBatch } from "./course-access";
import { listStudentEnrollments } from "./course-catalog";

/** Revalidate current entitlements before projecting course-scoped learner records. */
export async function listCurrentEnrolledCourses(userId: string) {
  const enrollments = await listStudentEnrollments(userId);
  const ids = [...new Set(enrollments.map(course => course.id))];
  if (ids.length === 0) return [];
  const entitlements = await resolveCourseEntitlementsBatch(userId, ids);
  return enrollments.flatMap(course => {
    const access = entitlements.get(course.id);
    return access?.hasFullContentAccess && !access.reason ? [{
      ...course, canonicalId: access.canonicalCourseId, legacyId: access.legacyCourseId,
    }] : [];
  });
}
