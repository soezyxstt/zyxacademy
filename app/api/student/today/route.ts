import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getStudentEnrollments } from "@/app/(student)/dashboard/actions";
import { getOrUpdateStreak, getWeeklyActivity } from "@/lib/streak-service";
import { getOrBuildTodayRecommendation } from "@/lib/recommendation-service";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const studentId = session.user.id;

  const [streak, enrollments, weeklyActivity] = await Promise.all([
    getOrUpdateStreak(studentId),
    getStudentEnrollments(),
    getWeeklyActivity(studentId),
  ]);

  const enrolledCourseIds = enrollments.map((e) => e.id);
  const recommendation = await getOrBuildTodayRecommendation(studentId, enrolledCourseIds);

  return NextResponse.json({
    streak: { current: streak.current, longest: streak.longest },
    items: recommendation.items,
    weeklyActivity,
  });
}

