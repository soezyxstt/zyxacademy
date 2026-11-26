import { db } from "@/db";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { getAuthSession } from "@/lib/auth-session";
import { getPeranCodes } from "@/lib/auth/authorization";
import { listTutorAccessibleCourses, resolveTutorCourseAccess } from "@/lib/auth/tutor-access";
import { createTourApi } from "@/lib/onboarding/tour-api";
import { createTourCourseSelector } from "@/lib/onboarding/tour-course";
import { createTourRepository } from "@/lib/onboarding/tour-repository";
import { isStudentEnrolled, listStudentEnrollments, resolveStudentCourse } from "@/lib/student/course-catalog";

const repository = createTourRepository(db);
const selectCourse = createTourCourseSelector({
  listStudentEnrollments,
  resolveStudentCourse,
  isStudentEnrolled,
  listTutorAccessibleCourses,
  resolveTutorCourseAccess,
  resolveCourseIdentity,
});
const api = createTourApi({ getSession: getAuthSession, getRoles: getPeranCodes, selectCourse, ...repository });

export const GET = api.GET;
export const PUT = api.PUT;
