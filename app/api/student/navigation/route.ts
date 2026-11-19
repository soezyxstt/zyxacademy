import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-session";
import { getCourse } from "@/lib/course-utils";
import { listStudentEnrollments } from "@/lib/student/course-catalog";

/** Small sidebar reads avoid serialized Server Action requests. */
export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expectedUserId = request.headers.get("x-student-id");
  if (expectedUserId && expectedUserId !== session.user.id) {
    return NextResponse.json({ error: "Account changed" }, { status: 409 });
  }
  const courseId = new URL(request.url).searchParams.get("courseId");
  const headers = { "Cache-Control": "private, no-store" };
  if (courseId) {
    // Match getCourseAction's metadata boundary. No learning bodies are returned.
    const course = await getCourse(courseId);
    return NextResponse.json(course ? { id: course.id, title: course.title } : null, { headers });
  }
  const courses = await listStudentEnrollments(session.user.id);
  return NextResponse.json(courses.map(({ id, title }) => ({ id, title })), { headers });
}
