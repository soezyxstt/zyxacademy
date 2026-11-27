import { getAuthSession } from "@/lib/auth-session";
import { getCourse } from "@/lib/course-utils";
import { listStudentEnrollments } from "@/lib/student/course-catalog";
import { env } from "@/lib/env";

/** Small sidebar reads avoid serialized Server Action requests. */
export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const expectedUserId = request.headers.get("x-student-id");
  if (expectedUserId && expectedUserId !== session.user.id) {
    return Response.json({ error: "Account changed" }, { status: 409 });
  }
  const courseId = new URL(request.url).searchParams.get("courseId");
  const headers = { "Cache-Control": "private, no-store", "X-Zyx-Course-Live": env.FEATURE_LIVE === "1" ? "1" : "0" };
  if (courseId) {
    // Match getCourseAction's metadata boundary. No learning bodies are returned.
    const course = await getCourse(courseId);
    return Response.json(course ? { id: course.id, title: course.title } : null, { headers });
  }
  const courses = await listStudentEnrollments(session.user.id);
  return Response.json(courses.map(({ id, title }) => ({ id, title })), { headers });
}
