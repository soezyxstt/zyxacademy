import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts, courses, mataKuliah, quizAiInsights } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, desc } from "drizzle-orm";


type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: templateId } = await params;

  // 1. Fetch template details
  const [template] = await db
    .select({
      id: quizTemplates.id,
      title: quizTemplates.title,
      category: quizTemplates.category,
      courseId: quizTemplates.courseId,
      legacyCourseName: courses.title,
      canonicalCourseName: mataKuliah.title,
      status: quizTemplates.status,
      timeLimitSeconds: quizTemplates.timeLimitSeconds,
      selectionRules: quizTemplates.selectionRules,
      createdAt: quizTemplates.createdAt,
    })
    .from(quizTemplates)
    .leftJoin(courses, eq(quizTemplates.courseId, courses.id))
    .leftJoin(mataKuliah, eq(quizTemplates.courseId, mataKuliah.id))
    .where(eq(quizTemplates.id, templateId))
    .limit(1);

  if (!template) {
    return NextResponse.json({ error: "Quiz template not found" }, { status: 404 });
  }

  const resolvedCourseName =
    template.canonicalCourseName || template.legacyCourseName || template.courseId;

  // 2. Fetch all student attempts for this template
  const attempts = await db
    .select({
      id: studentQuizAttempts.id,
      studentId: studentQuizAttempts.studentId,
      score: studentQuizAttempts.score,
      durationSeconds: studentQuizAttempts.durationSeconds,
      status: studentQuizAttempts.status,
      questionsSnapshot: studentQuizAttempts.questionsSnapshot,
      answersSnapshot: studentQuizAttempts.answersSnapshot,
      submittedAt: studentQuizAttempts.submittedAt,
    })
    .from(studentQuizAttempts)
    .where(eq(studentQuizAttempts.templateId, templateId));

  const completedAttempts = attempts.filter((a) => a.status === "completed" && a.score !== null);
  const totalStarted = attempts.length;
  const totalCompleted = completedAttempts.length;

  // KPI Calculations
  let avgScore = 0;
  let minScore = 0;
  let maxScore = 0;
  let medianScore = 0;
  let avgDuration = 0;

  const scoreRanges = {
    range0_20: 0,
    range21_40: 0,
    range41_60: 0,
    range61_80: 0,
    range81_100: 0,
  };

  if (totalCompleted > 0) {
    const scores = completedAttempts.map((a) => Number(a.score || 0)).sort((a, b) => a - b);
    const totalScoreSum = scores.reduce((sum, s) => sum + s, 0);
    avgScore = Math.round(totalScoreSum / totalCompleted);
    minScore = scores[0];
    maxScore = scores[scores.length - 1];

    const mid = Math.floor(scores.length / 2);
    medianScore = scores.length % 2 !== 0 ? scores[mid] : Math.round((scores[mid - 1] + scores[mid]) / 2);

    const durations = completedAttempts
      .map((a) => Number(a.durationSeconds || 0))
      .filter((d) => d > 0);
    if (durations.length > 0) {
      avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    }

    for (const score of scores) {
      if (score <= 20) scoreRanges.range0_20++;
      else if (score <= 40) scoreRanges.range21_40++;
      else if (score <= 60) scoreRanges.range41_60++;
      else if (score <= 80) scoreRanges.range61_80++;
      else scoreRanges.range81_100++;
    }
  }

  // 3. Question Item & Distractor Analysis
  interface QuestionStatItem {
    questionId: string;
    prompt: string;
    options: string[];
    correctIndices: number[];
    tags: string[];
    difficulty: string;
    explanation?: string;
    distractorMap?: any[];
    totalAnswers: number;
    correctCount: number;
    accuracyRate: number;
    optionCounts: Record<number, number>;
  }

  const questionStatsMap = new Map<string, QuestionStatItem>();

  for (const attempt of completedAttempts) {
    const questions = (attempt.questionsSnapshot as any[]) || [];
    const answers = (attempt.answersSnapshot as Record<string, number[]>) || {};

    for (const q of questions) {
      const qId = q.id;
      if (!qId) continue;

      if (!questionStatsMap.has(qId)) {
        questionStatsMap.set(qId, {
          questionId: qId,
          prompt: q.prompt || q.content || "Soal tanpa teks",
          options: Array.isArray(q.options) ? q.options : [],
          correctIndices: Array.isArray(q.correct_indices) ? q.correct_indices : Array.isArray(q.correctIndices) ? q.correctIndices : [],
          tags: Array.isArray(q.tags) ? q.tags : [],
          difficulty: q.difficulty || "medium",
          explanation: q.explanation || "",
          distractorMap: Array.isArray(q.distractorMap) ? q.distractorMap : [],
          totalAnswers: 0,
          correctCount: 0,
          accuracyRate: 0,
          optionCounts: {},
        });
      }

      const stat = questionStatsMap.get(qId)!;
      const userSelected = answers[qId] || [];

      stat.totalAnswers += 1;

      // Check correctness
      const isCorrect =
        userSelected.length === stat.correctIndices.length &&
        userSelected.every((idx) => stat.correctIndices.includes(idx));

      if (isCorrect) {
        stat.correctCount += 1;
      }

      // Count option choices
      for (const sel of userSelected) {
        stat.optionCounts[sel] = (stat.optionCounts[sel] || 0) + 1;
      }
    }
  }

  // Calculate final accuracy rates
  const questionItems: QuestionStatItem[] = Array.from(questionStatsMap.values()).map((q) => {
    const accuracy = q.totalAnswers > 0 ? Math.round((q.correctCount / q.totalAnswers) * 100) : 0;
    return {
      ...q,
      accuracyRate: accuracy,
    };
  });

  // Sort hardest to easiest
  questionItems.sort((a, b) => a.accuracyRate - b.accuracyRate);

  // 4. Tag / Concept Breakdown
  const conceptStatsMap = new Map<string, { tag: string; totalAnswered: number; correctCount: number; accuracyRate: number }>();
  for (const q of questionItems) {
    for (const tag of q.tags) {
      if (!conceptStatsMap.has(tag)) {
        conceptStatsMap.set(tag, { tag, totalAnswered: 0, correctCount: 0, accuracyRate: 0 });
      }
      const cStat = conceptStatsMap.get(tag)!;
      cStat.totalAnswered += q.totalAnswers;
      cStat.correctCount += q.correctCount;
    }
  }

  const conceptItems = Array.from(conceptStatsMap.values()).map((c) => ({
    ...c,
    accuracyRate: c.totalAnswered > 0 ? Math.round((c.correctCount / c.totalAnswered) * 100) : 0,
  }));
  conceptItems.sort((a, b) => a.accuracyRate - b.accuracyRate);

  // 5. Fetch latest cached AI Insight
  const [latestAiInsight] = await db
    .select()
    .from(quizAiInsights)
    .where(eq(quizAiInsights.templateId, templateId))
    .orderBy(desc(quizAiInsights.createdAt))
    .limit(1);

  return NextResponse.json({
    template: {
      ...template,
      courseName: resolvedCourseName,
    },
    summary: {
      totalStarted,
      totalCompleted,
      completionRate: totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 0,
      avgScore,
      minScore,
      maxScore,
      medianScore,
      avgDurationSeconds: avgDuration,
      scoreRanges,
    },
    questionAnalysis: questionItems,
    conceptAnalysis: conceptItems,
    latestAiInsight: latestAiInsight || null,
  });
}
