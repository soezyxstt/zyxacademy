import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { listStudentEnrollments } from "@/lib/student/course-catalog";
import { getOrUpdateStreak, getWeeklyActivity } from "@/lib/streak-service";
import { getOrBuildTodayRecommendation } from "@/lib/recommendation-service";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const studentId = session.user.id;
  const expectedUserId = request.headers.get("x-student-id");
  if (expectedUserId && expectedUserId !== studentId) {
    return NextResponse.json({ error: "Account changed" }, { status: 409 });
  }

  const [streak, enrollments, weeklyActivity] = await Promise.all([
    getOrUpdateStreak(studentId),
    listStudentEnrollments(studentId),
    getWeeklyActivity(studentId),
  ]);

  const enrolledCourseIds = enrollments.map((e) => e.id);
  const recommendation = await getOrBuildTodayRecommendation(studentId, enrolledCourseIds);

  return NextResponse.json({
    streak: { current: streak.current, longest: streak.longest },
    enrollments: enrollments.map(({ id, title }) => ({ id, title })),
    items: recommendation.items,
    weeklyActivity,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

