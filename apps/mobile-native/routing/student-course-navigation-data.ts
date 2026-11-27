import { studentNavigationEndpoint, type StudentCourseSummary } from "../../../components/navigation/student/student-nav-model";
import type { StudentRequest } from "../features/student/contracts";

function courseSummary(value: unknown): value is StudentCourseSummary {
  return Boolean(value && typeof value === "object" && "id" in value && typeof value.id === "string" &&
    value.id && value.id !== "." && value.id !== ".." && !/[/\\\u0000-\u001f\u007f\ud800-\udfff]/u.test(value.id) &&
    "title" in value && typeof value.title === "string" && value.title.trim());
}

export async function readStudentCourseTitle(request: StudentRequest, courseId: string, signal: AbortSignal) {
  const query = new URLSearchParams({ courseId });
  const response = await request(`${studentNavigationEndpoint}?${query}`, { signal });
  try {
    if (!response.ok) throw new Error("Course metadata unavailable");
    const value: unknown = await response.json();
    if (value !== null && !courseSummary(value)) throw new Error("Invalid course metadata");
    return { course: value, showLive: response.headers.get("X-Zyx-Course-Live") === "1" };
  } finally {
    response.dispose?.();
  }
}

export async function readStudentCourseChoices(request: StudentRequest, signal: AbortSignal) {
  const response = await request(studentNavigationEndpoint, { signal });
  try {
    if (!response.ok) throw new Error("Enrollment metadata unavailable");
    const value: unknown = await response.json();
    if (!Array.isArray(value) || !value.every(courseSummary)) throw new Error("Invalid enrollment metadata");
    return value;
  } finally {
    response.dispose?.();
  }
}
