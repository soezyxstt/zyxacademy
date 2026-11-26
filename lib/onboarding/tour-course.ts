import { PKA_COURSE_ID } from "@/lib/pka-config";
import type { TourRole } from "./tour-state";

type StudentCourse = { id: string; canonicalId: string | null; legacyId: string | null };
type TutorCourse = { courseId: string; legacyCourseId: string | null };
type CourseDependencies = {
  listStudentEnrollments: (userId: string) => Promise<StudentCourse[]>;
  resolveStudentCourse: (courseId: string) => Promise<StudentCourse | null>;
  isStudentEnrolled: (userId: string, courseId: string) => Promise<boolean>;
  listTutorAccessibleCourses: (userId: string, options: { allowAdmin: false }) => Promise<TutorCourse[]>;
  resolveTutorCourseAccess: (input: { penggunaId: string; courseId: string; allowAdmin: false }) => Promise<{ courseId: string | null; legacyCourseId: string | null; hasAccess: boolean }>;
  resolveCourseIdentity: (courseId: string) => Promise<{ canonicalId: string | null; legacyId: string | null; status: string } | null>;
};

function eligibleId(id: string | null): id is string {
  return Boolean(id && id !== PKA_COURSE_ID && id.length <= 128 && id.trim() && !/[\u0000-\u001f\u007f]/.test(id));
}

function preferHint<T>(courses: T[], matchesHint: (course: T) => boolean): T[] {
  return [...courses.filter(matchesHint), ...courses.filter(course => !matchesHint(course))];
}

/** Pick navigation context from the account's current, independently verified access. */
export function createTourCourseSelector(dependencies: CourseDependencies) {
  return async (userId: string, role: TourRole, hint: string | null): Promise<string | null> => {
    if (role === "student") {
      const enrolled = await dependencies.listStudentEnrollments(userId);
      const candidates = preferHint(enrolled, course => Boolean(hint && [course.id, course.canonicalId, course.legacyId].includes(hint)));
      const checked = new Set<string>();
      for (const candidate of candidates) {
        if (!eligibleId(candidate.id) || checked.has(candidate.id)) continue;
        checked.add(candidate.id);
        const course = await dependencies.resolveStudentCourse(candidate.id);
        // Legacy enrollment rows can survive an archived or ambiguous catalog mapping.
        if (!course || !eligibleId(course.id) || course.canonicalId === PKA_COURSE_ID || course.legacyId === PKA_COURSE_ID) continue;
        if (await dependencies.isStudentEnrolled(userId, course.id)) return course.id;
      }
      return null;
    }

    const assigned = await dependencies.listTutorAccessibleCourses(userId, { allowAdmin: false });
    const candidates = preferHint(assigned, course => Boolean(hint && [course.courseId, course.legacyCourseId].includes(hint)));
    for (const candidate of candidates) {
      if (!eligibleId(candidate.courseId) || candidate.legacyCourseId === PKA_COURSE_ID) continue;
      const course = await dependencies.resolveTutorCourseAccess({ penggunaId: userId, courseId: candidate.courseId, allowAdmin: false });
      if (!course.hasAccess || !eligibleId(course.courseId) || course.legacyCourseId === PKA_COURSE_ID) continue;
      // The tutor document route also rejects ambiguous compatibility identities.
      const identity = await dependencies.resolveCourseIdentity(course.courseId);
      if (identity?.status === "active" && identity.canonicalId === course.courseId && identity.legacyId !== PKA_COURSE_ID) return course.courseId;
    }
    return null;
  };
}
