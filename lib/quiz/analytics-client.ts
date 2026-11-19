import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requestJson, ApiError } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";
import type { ComputedQuizMetrics, StudentQuizDiagnosis } from "@/lib/student-quiz-analytics/types";

const mastery = z.enum(["strong", "adequate", "developing", "needs_reinforcement", "insufficient_evidence"]);
const trend = z.enum(["improving", "stable", "inconsistent", "declining", "insufficient_evidence"]);
const counts = { totalQuestions: z.number(), correctCount: z.number(), accuracyPercent: z.number() };
const evidence = z.array(z.object({ question_id: z.string().optional(), observation: z.string() }));
const insight = z.object({ observation: z.string(), interpretation: z.string(), suggestion: z.string() });

export const computedQuizMetricsSchema = z.object({
  quizTitle: z.string(), courseId: z.string(), templateId: z.string(), attemptId: z.string(),
  score: z.number(), correctCount: z.number(), incorrectCount: z.number(), unansweredCount: z.number(),
  totalQuestions: z.number(), durationSeconds: z.number(),
  conceptMastery: z.array(z.object({
    concept: z.string(), ...counts, incorrectCount: z.number(), status: mastery,
    previousAccuracyPercent: z.number().optional(), trend: trend.optional(), subconcepts: z.array(z.string()).optional(),
  })),
  cognitiveSkills: z.array(z.object({ skill: z.string(), ...counts, status: mastery })),
  difficultyBreakdown: z.array(z.object({ difficulty: z.string(), ...counts })),
  timeAnalysis: z.object({
    totalDurationSeconds: z.number(), avgTimePerQuestionSeconds: z.number(), fastAnswerCount: z.number(),
    fastIncorrectCount: z.number(), slowAnswerCount: z.number(),
  }),
  historicalComparison: z.object({
    totalAttemptsAnalyzed: z.number(), scoreTrend: z.array(z.number()), overallImprovementDelta: z.number(),
    consistentlyWeakConcepts: z.array(z.string()), improvedConcepts: z.array(z.string()),
  }),
}) satisfies z.ZodType<ComputedQuizMetrics>;

export const quizDiagnosisSchema = z.object({
  headline: z.string(), overall_summary: z.string(), performance_level: z.enum(["excellent", "good", "developing", "needs_support"]),
  strengths: z.array(z.object({ title: z.string(), description: z.string(), evidence })),
  focus_areas: z.array(z.object({ title: z.string(), description: z.string(), importance: z.string(), evidence })),
  concept_diagnostics: z.array(z.object({
    concept: z.string(), status: mastery, summary: z.string(), evidence: z.array(z.string()), recommended_action: z.string(),
  })),
  error_patterns: z.array(z.object({
    category: z.enum(["conceptual_misunderstanding", "procedural_error", "calculation_error", "question_misinterpretation", "representation_error", "prerequisite_gap", "incomplete_reasoning", "inconsistent_application", "insufficient_evidence"]),
    title: z.string(), description: z.string(), confidence: z.enum(["high", "medium", "low"]),
    supporting_questions: z.array(z.string()), correction_strategy: z.string(),
  })),
  skill_diagnostics: z.array(z.object({ skill: z.string(), status: mastery, summary: z.string() })),
  time_insights: z.array(insight), confidence_insights: z.array(insight).optional(),
  progress_insights: z.array(z.object({ concept_or_skill: z.string(), trend, description: z.string() })),
  study_plan: z.array(z.object({
    priority: z.number(), focus: z.string(), reason: z.string(), action: z.string(), success_check: z.string(),
    resource_type: z.enum(["material", "ko", "flashcard", "zyra", "quiz"]).optional(), resource_id: z.string().optional(), resource_url: z.string().optional(),
  })),
  encouragement: z.string(), limitations: z.array(z.string()),
}) satisfies z.ZodType<StudentQuizDiagnosis>;

export const quizAnalyticsSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed", "not_available"]),
  attemptId: z.string().optional(),
  computedMetrics: computedQuizMetricsSchema.nullish(),
  aiDiagnosis: quizDiagnosisSchema.nullish(),
  errorMessage: z.string().nullish(),
});

export type QuizAnalyticsData = z.infer<typeof quizAnalyticsSchema>;

export async function fetchQuizAnalytics(attemptId: string, signal?: AbortSignal): Promise<QuizAnalyticsData> {
  const data = await requestJson(`/api/quiz/attempts/${encodeURIComponent(attemptId)}/analytics`, quizAnalyticsSchema, { signal });
  if ((data.attemptId && data.attemptId !== attemptId) || (data.computedMetrics && data.computedMetrics.attemptId !== attemptId)) {
    throw new ApiError(409, "Quiz analytics identity changed");
  }
  return data;
}

export function quizAnalyticsQuery(userId: string, attemptId: string) {
  return queryOptions({
    queryKey: queryKeys.quizzes.analytics(userId, attemptId),
    queryFn: ({ signal }) => fetchQuizAnalytics(attemptId, signal),
    staleTime: 30_000,
    // The existing GET enqueues missing analytics. Do not replay it through retries.
    retry: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchInterval: (query) => query.state.status !== "error" && query.state.data?.status === "processing" ? 4000 : false,
  });
}

export function recomputeQuizAnalytics(attemptId: string) {
  return requestJson(`/api/quiz/attempts/${encodeURIComponent(attemptId)}/analytics`, z.object({
    attemptId: z.literal(attemptId), status: z.literal("processing"), message: z.string(),
  }), { method: "POST" });
}
