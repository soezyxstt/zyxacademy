import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { tutorCourses } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCohortAnalytics } from "@/lib/cohort-analytics";

export async function GET(req: NextRequest) {

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string | null }).role;
  if (role !== "teacher" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });

  if (role === "teacher") {
    const [assigned] = await db
      .select({ id: tutorCourses.id })
      .from(tutorCourses)
      .where(
        and(eq(tutorCourses.tutorId, session.user.id), eq(tutorCourses.courseId, courseId))
      )
      .limit(1);

    if (!assigned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const analytics = await getCohortAnalytics(courseId);
  return NextResponse.json(analytics);
}
