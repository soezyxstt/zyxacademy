import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts, courses, mataKuliah, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, and, ne, inArray } from "drizzle-orm";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { readAdminCourseLeaderboard } from "@/lib/admin/leaderboard-course-read-model";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseIdParam = searchParams.get("courseId");
  const typeParam = searchParams.get("type");
  const searchParam = searchParams.get("search")?.toLowerCase().trim();
  const isOverviewMode = !courseIdParam || courseIdParam === "all";

  // 1. Fetch all courses for combobox selector (canonical first, fallback to legacy)
  const [canonicalCourses, legacyList] = await Promise.all([
    db
      .select({
        id: mataKuliah.id,
        title: mataKuliah.title,
      })
      .from(mataKuliah)
      .where(eq(mataKuliah.status, "active"))
      .orderBy(mataKuliah.title),
    db
      .select({
        id: courses.id,
        title: courses.title,
      })
      .from(courses)
      .orderBy(courses.title),
  ]);

  const courseOptionMap = new Map<string, { id: string; title: string }>();
  for (const c of legacyList) {
    courseOptionMap.set(c.id, c);
  }
  for (const c of canonicalCourses) {
    courseOptionMap.set(c.id, c);
  }
  const allCourses = Array.from(courseOptionMap.values()).sort((a, b) =>
    a.title.localeCompare(b.title, "id")
  );

  // 2. Build attempt query conditions
  const conditions = [eq(studentQuizAttempts.status, "completed")];

  let activeCourseIdentity = null;
  if (!isOverviewMode && courseIdParam) {
    activeCourseIdentity = await resolveCourseIdentity(courseIdParam);
    const resolvedIds = activeCourseIdentity
      ? activeCourseIdentity.allIds
      : [courseIdParam];
    conditions.push(
      resolvedIds.length === 1
        ? eq(quizTemplates.courseId, resolvedIds[0])
        : inArray(quizTemplates.courseId, resolvedIds)
    );
  }

  if (typeParam === "quiz") {
    conditions.push(ne(quizTemplates.category, "simulation"));
  } else if (typeParam === "simulation") {
    conditions.push(eq(quizTemplates.category, "simulation"));
  }

  if (isOverviewMode) {
    // OVERVIEW MODE: per-course aggregate metrics, no student ranking
    const groupedAttempts = await db
      .select({
        courseId: quizTemplates.courseId,
        legacyCourseTitle: courses.title,
        canonicalCourseTitle: mataKuliah.title,
        studentId: studentQuizAttempts.studentId,
        score: studentQuizAttempts.score,
      })
      .from(studentQuizAttempts)
      .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
      .innerJoin(user, eq(studentQuizAttempts.studentId, user.id))
      .leftJoin(courses, eq(quizTemplates.courseId, courses.id))
      .leftJoin(mataKuliah, eq(quizTemplates.courseId, mataKuliah.id))
      .where(and(...conditions));

    // Seed courseMap from allCourses so zero-activity courses appear
    const courseMap = new Map<
      string,
      { title: string; studentSet: Set<string>; attemptCount: number; totalScore: number; highestScore: number }
    >();

    for (const c of allCourses) {
      courseMap.set(c.id, {
        title: c.title,
        studentSet: new Set(),
        attemptCount: 0,
        totalScore: 0,
        highestScore: 0,
      });
    }

    for (const row of groupedAttempts) {
      const cid = row.courseId;
      const title = row.canonicalCourseTitle || row.legacyCourseTitle || row.courseId || "Umum";
      const score = row.score ?? 0;

      if (!courseMap.has(cid)) {
        courseMap.set(cid, {
          title,
          studentSet: new Set(),
          attemptCount: 0,
          totalScore: 0,
          highestScore: 0,
        });
      }

      const entry = courseMap.get(cid)!;
      entry.studentSet.add(row.studentId);
      entry.attemptCount += 1;
      entry.totalScore += score;
      if (score > entry.highestScore) entry.highestScore = score;
    }

    let courseInsights = Array.from(courseMap.entries()).map(([courseId, data]) => ({
      courseId,
      courseTitle: data.title,
      participatingStudents: data.studentSet.size,
      attemptCount: data.attemptCount,
      averageScore:
        data.attemptCount > 0
          ? Number((data.totalScore / data.attemptCount).toFixed(1))
          : 0,
      highestScore: data.highestScore,
    }));

    // Search filters course titles in overview mode
    if (searchParam) {
      courseInsights = courseInsights.filter((c) =>
        c.courseTitle.toLowerCase().includes(searchParam)
      );
    }

    courseInsights.sort((a, b) => a.courseTitle.localeCompare(b.courseTitle, "id"));

    const visibleCourseIds = new Set(courseInsights.map((ci) => ci.courseId));
    const uniqueAcrossVisible = new Set<string>();
    for (const row of groupedAttempts) {
      if (visibleCourseIds.has(row.courseId)) {
        uniqueAcrossVisible.add(row.studentId);
      }
    }
    const totalStudents = uniqueAcrossVisible.size;
    const totalAttempts = courseInsights.reduce((sum, c) => sum + c.attemptCount, 0);
    const totalScoreSum = courseInsights.reduce(
      (sum, c) => sum + (c.attemptCount > 0 ? c.averageScore * c.attemptCount : 0),
      0
    );

    return NextResponse.json({
      mode: "overview",
      courses: allCourses,
      courseInsights,
      summary: {
        totalStudents,
        totalAttempts,
        avgOverallScore:
          totalAttempts > 0 ? Number((totalScoreSum / totalAttempts).toFixed(1)) : 0,
        highestScore:
          courseInsights.length > 0
            ? Math.max(...courseInsights.map((c) => c.highestScore))
            : 0,
      },
    });
  }

  const view = await readAdminCourseLeaderboard(conditions, activeCourseIdentity?.title, searchParam);
  return NextResponse.json({ mode: "course", courses: allCourses, ...view });
}
