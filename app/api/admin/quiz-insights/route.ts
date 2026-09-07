import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts, courses, mataKuliah, quizAiInsights } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, sql, desc } from "drizzle-orm";
import { resolveCourseIdentity, matchesCourseIdentity } from "@/lib/admin/course-identity";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseIdParam = searchParams.get("courseId");
  const categoryParam = searchParams.get("category");
  const searchParam = searchParams.get("search")?.toLowerCase();

  // 1. Fetch Quiz Templates
  const rawTemplates = await db
    .select({
      id: quizTemplates.id,
      title: quizTemplates.title,
      category: quizTemplates.category,
      courseId: quizTemplates.courseId,
      legacyCourseName: courses.title,
      canonicalCourseName: mataKuliah.title,
      status: quizTemplates.status,
      timeLimitSeconds: quizTemplates.timeLimitSeconds,
      createdAt: quizTemplates.createdAt,
    })
    .from(quizTemplates)
    .leftJoin(courses, eq(quizTemplates.courseId, courses.id))
    .leftJoin(mataKuliah, eq(quizTemplates.courseId, mataKuliah.id));

  // Aggregate stats per template
  const attemptStats = await db
    .select({
      templateId: studentQuizAttempts.templateId,
      totalAttempts: sql<number>`count(*)`,
      avgScore: sql<number>`round(avg(${studentQuizAttempts.score}))`,
      passCount: sql<number>`sum(case when ${studentQuizAttempts.score} >= 70 then 1 else 0 end)`,
    })
    .from(studentQuizAttempts)
    .where(eq(studentQuizAttempts.status, "completed"))
    .groupBy(studentQuizAttempts.templateId);

  const statsMap = new Map<string, { totalAttempts: number; avgScore: number; passRate: number }>();
  for (const row of attemptStats) {
    const total = Number(row.totalAttempts || 0);
    const avg = Number(row.avgScore || 0);
    const pass = Number(row.passCount || 0);
    const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;
    statsMap.set(row.templateId, { totalAttempts: total, avgScore: avg, passRate });
  }

  // AI insights map
  const insights = await db
    .select({
      id: quizAiInsights.id,
      templateId: quizAiInsights.templateId,
      examId: quizAiInsights.examId,
      createdAt: quizAiInsights.createdAt,
      sampleSize: quizAiInsights.sampleSize,
    })
    .from(quizAiInsights)
    .orderBy(desc(quizAiInsights.createdAt));

  const aiInsightsMap = new Map<string, { id: string; createdAt: Date; sampleSize: number }>();
  for (const row of insights) {
    if (row.templateId && !aiInsightsMap.has(row.templateId)) {
      aiInsightsMap.set(row.templateId, {
        id: row.id,
        createdAt: row.createdAt,
        sampleSize: row.sampleSize,
      });
    }
  }

  const items = rawTemplates.map((tpl) => {
    const stats = statsMap.get(tpl.id) || { totalAttempts: 0, avgScore: 0, passRate: 0 };
    const lastAi = aiInsightsMap.get(tpl.id) || null;
    return {
      type: "quiz_template" as const,
      id: tpl.id,
      title: tpl.title,
      category: tpl.category,
      courseId: tpl.courseId,
      courseName: tpl.canonicalCourseName || tpl.legacyCourseName || tpl.courseId,
      status: tpl.status,
      timeLimitSeconds: tpl.timeLimitSeconds,
      createdAt: tpl.createdAt,
      totalAttempts: stats.totalAttempts,
      avgScore: stats.avgScore,
      passRate: stats.passRate,
      lastAiInsight: lastAi,
    };
  });

  // Filter in memory if query params provided
  let filtered = items;
  if (courseIdParam && courseIdParam !== "all") {
    const identity = await resolveCourseIdentity(courseIdParam);
    if (identity) {
      filtered = filtered.filter((i) => matchesCourseIdentity(i.courseId, identity));
    } else {
      filtered = filtered.filter((i) => i.courseId === courseIdParam);
    }
  }
  if (categoryParam && categoryParam !== "all") {
    filtered = filtered.filter((i) => i.category === categoryParam);
  }
  if (searchParam) {
    filtered = filtered.filter(
      (i) => i.title.toLowerCase().includes(searchParam) || i.courseName.toLowerCase().includes(searchParam)
    );
  }

  return NextResponse.json({
    items: filtered,
    totalCount: filtered.length,
  });
}
