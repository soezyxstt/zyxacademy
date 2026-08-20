import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts, courses, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, and, ne, desc } from "drizzle-orm";

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

  // 1. Fetch all courses for combobox selector
  const allCourses = await db
    .select({
      id: courses.id,
      title: courses.title,
    })
    .from(courses)
    .orderBy(courses.title);

  // 2. Build attempt query conditions
  const conditions = [eq(studentQuizAttempts.status, "completed")];

  if (!isOverviewMode) {
    conditions.push(eq(quizTemplates.courseId, courseIdParam));
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
        courseTitle: courses.title,
        studentId: studentQuizAttempts.studentId,
        score: studentQuizAttempts.score,
      })
      .from(studentQuizAttempts)
      .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
      .innerJoin(user, eq(studentQuizAttempts.studentId, user.id))
      .leftJoin(courses, eq(quizTemplates.courseId, courses.id))
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
      const title = row.courseTitle || row.courseId || "Umum";
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

  // 3. Fetch completed attempts with relations (course-scoped student ranking)
  const rawAttempts = await db
    .select({
      attemptId: studentQuizAttempts.id,
      studentId: studentQuizAttempts.studentId,
      studentName: user.name,
      studentEmail: user.email,
      studentImage: user.image,
      score: studentQuizAttempts.score,
      durationSeconds: studentQuizAttempts.durationSeconds,
      submittedAt: studentQuizAttempts.submittedAt,
      templateId: studentQuizAttempts.templateId,
      quizTitle: quizTemplates.title,
      quizCategory: quizTemplates.category,
      courseId: quizTemplates.courseId,
      courseTitle: courses.title,
    })
    .from(studentQuizAttempts)
    .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
    .innerJoin(user, eq(studentQuizAttempts.studentId, user.id))
    .leftJoin(courses, eq(quizTemplates.courseId, courses.id))
    .where(and(...conditions))
    .orderBy(desc(studentQuizAttempts.submittedAt));

  // 4. Aggregate metrics per student
  type StudentAttemptDetail = {
    id: string;
    title: string;
    category: string;
    courseId: string;
    courseTitle: string;
    score: number;
    durationSeconds: number;
    submittedAt: string | null;
  };

  type AggregatedStudent = {
    studentId: string;
    studentName: string;
    studentEmail: string;
    studentImage: string | null;
    attempts: StudentAttemptDetail[];
    courseNames: string[];
    totalScore: number;
    totalDuration: number;
    bestScore: number;
    lastAttemptAt: string | null;
  };

  const studentMap = new Map<string, AggregatedStudent>();

  for (const item of rawAttempts) {
    const studentId = item.studentId;
    const score = item.score ?? 0;
    const duration = item.durationSeconds ?? 0;
    const courseTitle = item.courseTitle || item.courseId || "Umum";
    const submittedAtIso = item.submittedAt ? item.submittedAt.toISOString() : null;

    if (!studentMap.has(studentId)) {
      studentMap.set(studentId, {
        studentId,
        studentName: item.studentName || "Siswa",
        studentEmail: item.studentEmail || "-",
        studentImage: item.studentImage || null,
        attempts: [],
        courseNames: [],
        totalScore: 0,
        totalDuration: 0,
        bestScore: 0,
        lastAttemptAt: submittedAtIso,
      });
    }

    const current = studentMap.get(studentId)!;
    current.attempts.push({
      id: item.attemptId,
      title: item.quizTitle,
      category: item.quizCategory,
      courseId: item.courseId,
      courseTitle,
      score,
      durationSeconds: duration,
      submittedAt: submittedAtIso,
    });

    if (!current.courseNames.includes(courseTitle)) {
      current.courseNames.push(courseTitle);
    }

    current.totalScore += score;
    current.totalDuration += duration;
    if (score > current.bestScore) {
      current.bestScore = score;
    }
  }

  // 5. Transform and format student summaries
  let rankedStudents = Array.from(studentMap.values()).map((s) => {
    const attemptCount = s.attempts.length;
    const avgScore = attemptCount > 0 ? Number((s.totalScore / attemptCount).toFixed(1)) : 0;
    const avgDuration = attemptCount > 0 ? Math.round(s.totalDuration / attemptCount) : 0;

    return {
      studentId: s.studentId,
      studentName: s.studentName,
      studentEmail: s.studentEmail,
      studentImage: s.studentImage,
      attemptCount,
      avgScore,
      bestScore: s.bestScore,
      totalScore: s.totalScore,
      avgDuration,
      lastAttemptAt: s.lastAttemptAt,
      courseNames: s.courseNames,
      attempts: s.attempts,
    };
  });

  // 6. Apply search filter if query is specified
  if (searchParam) {
    rankedStudents = rankedStudents.filter(
      (s) =>
        s.studentName.toLowerCase().includes(searchParam) ||
        s.studentEmail.toLowerCase().includes(searchParam)
    );
  }

  // 7. Sort by deterministic tie-breakers:
  //    1) avgScore (descending)
  //    2) totalScore (descending)
  //    3) attemptCount (descending)
  //    4) avgDuration (ascending)
  rankedStudents.sort((a, b) => {
    if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.attemptCount !== a.attemptCount) return b.attemptCount - a.attemptCount;
    return a.avgDuration - b.avgDuration;
  });

  // Assign sequential rank 1..N
  const studentsWithRank = rankedStudents.map((s, index) => ({
    ...s,
    rank: index + 1,
  }));

  // 8. Overall KPI metrics for current scope
  const totalStudents = studentsWithRank.length;
  const totalAttempts = rawAttempts.length;
  const avgOverallScore =
    totalAttempts > 0
      ? Number(
          (
            rawAttempts.reduce((acc, curr) => acc + (curr.score ?? 0), 0) /
            totalAttempts
          ).toFixed(1)
        )
      : 0;
  const highestScore =
    totalAttempts > 0 ? Math.max(...rawAttempts.map((a) => a.score ?? 0)) : 0;

  return NextResponse.json({
    mode: "course",
    courses: allCourses,
    students: studentsWithRank,
    summary: {
      totalStudents,
      totalAttempts,
      avgOverallScore,
      highestScore,
    },
  });
}
