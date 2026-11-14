import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { db } from "@/db";
import { studentConceptMasteryHistory } from "@/db/schema";
import { and, eq, gte, asc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const courseId = req.nextUrl.searchParams.get("courseId");
  const conceptName = req.nextUrl.searchParams.get("conceptName");

  if (!courseId || !conceptName) {
    return NextResponse.json({ error: "courseId and conceptName required" }, { status: 400 });
  }

  const access = await resolveCourseAccess({ courseId, userId: session.user.id });
  if (!access.hasFullContentAccess) return NextResponse.json({ error: "Akses mata kuliah tidak tersedia." }, { status: 403 });

  // Calculate 28 days ago date boundary
  const twentyEightDaysAgo = new Date();
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
  const twentyEightDaysAgoStr = twentyEightDaysAgo.toISOString().split("T")[0];

  const points = await db
    .select({
      date: studentConceptMasteryHistory.snapshotDate,
      masteryScore: studentConceptMasteryHistory.masteryScore,
    })
    .from(studentConceptMasteryHistory)
    .where(
      and(
        eq(studentConceptMasteryHistory.studentId, session.user.id),
        eq(studentConceptMasteryHistory.courseId, courseId),
        eq(studentConceptMasteryHistory.conceptName, conceptName),
        gte(studentConceptMasteryHistory.snapshotDate, twentyEightDaysAgoStr)
      )
    )
    .orderBy(asc(studentConceptMasteryHistory.snapshotDate));

  return NextResponse.json({ points });
}
