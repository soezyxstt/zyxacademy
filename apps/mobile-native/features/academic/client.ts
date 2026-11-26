import type { AdminCourseSectionResult } from "../../../../packages/native-parity/academic/courses/sections";
import type { AdminCourse, AdminCourseOverview } from "../../../../packages/native-parity/academic/courses/model";
import { TutorDataError, type TutorDataSource } from "../../../../packages/native-parity/academic/tutor/model";

/** The host supplies its authenticated, origin-bound transport for this account. */
export interface AcademicTransport {
  accountId: string;
  origin: string;
  locale: string;
  get(path: string, signal: AbortSignal): Promise<Response>;
}

export function createAcademicClient(transport: AcademicTransport) {
  async function read<T>(path: string, signal: AbortSignal): Promise<T> {
    const response = await transport.get(path, signal);
    if (!response.ok) throw new TutorDataError(response.status);
    return response.json() as Promise<T>;
  }
  const tutor: TutorDataSource = {
    dashboard: signal => read("/api/native/academic/tutor/dashboard", signal),
    analytics: (id, signal) => read(`/api/native/academic/tutor/courses/${encodeURIComponent(id)}/analytics`, signal),
    participants: (id, signal) => read(`/api/native/academic/tutor/courses/${encodeURIComponent(id)}/participants`, signal),
    grading: (id, signal) => read(`/api/native/academic/tutor/courses/${encodeURIComponent(id)}/grading`, signal),
  };
  return {
    tutor,
    courses: (signal: AbortSignal) => read<AdminCourse[]>("/api/native/academic/admin/courses", signal),
    course: (slug: string, signal: AbortSignal) => read<AdminCourseOverview>(`/api/native/academic/admin/courses/${encodeURIComponent(slug)}`, signal),
    courseSection: (slug: string, section: string, itemId: string | undefined, signal: AbortSignal) => {
      const parts = [slug, section, ...(itemId ? [itemId] : [])].map(encodeURIComponent);
      return read<AdminCourseSectionResult>(`/api/native/academic/admin/courses/${parts.join("/")}`, signal);
    },
  };
}
