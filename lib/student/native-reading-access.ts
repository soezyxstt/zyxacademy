import { OfflineHttpError } from "@/lib/offline/server-auth";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { isPkaEnrolled } from "@/lib/pka-enrollment";
import { resolveCourseAccess } from "./course-access";

export async function resolveNativeStudentReadingAccess(studentId: string, courseId: string) {
  const access = await resolveCourseAccess({ courseId, userId: studentId, roleHint: "murid" });
  if (!access.isAuthenticated || !access.hasCourseAccess) throw new OfflineHttpError(403, "READING_ACCESS_DENIED");
  if ([courseId, access.courseId, access.canonicalCourseId, access.legacyCourseId].includes(PKA_COURSE_ID) &&
    !(await isPkaEnrolled(studentId))) throw new OfflineHttpError(403, "READING_ACCESS_DENIED");
  return access;
}
