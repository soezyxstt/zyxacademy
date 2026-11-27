import { z } from "zod";

// Optional fields tolerate historical reports that predate individual sections.
const report = z.object({
  summaryOverview: z.string().optional(),
  misconceptions: z.array(z.object({ concept: z.string(), description: z.string(), frequency: z.string().optional(),
    targetedQuestions: z.array(z.string()).optional() })).optional(),
  teachingRecommendations: z.array(z.object({ topic: z.string(), actionItem: z.string(), rationale: z.string() })).optional(),
  hardestQuestionsAnalysis: z.array(z.object({ questionId: z.string(), promptSnippet: z.string(), accuracyRate: z.number(), diagnosis: z.string(), distractorTrap: z.string() })).optional(),
  easiestQuestionsAnalysis: z.array(z.object({ questionId: z.string(), promptSnippet: z.string(), accuracyRate: z.number(), reason: z.string() })).optional(),
  actionableNextSteps: z.array(z.string()).optional(),
});
export type QuizInsightReport = z.infer<typeof report>;
export function parseQuizInsight(raw: unknown) {
  const result = report.safeParse(raw);
  return result.success ? result.data : undefined;
}
export function courseQuizApi(quizId: string, courseId: string, action: "analyze" | "attempts", includeInProgress = true) {
  const query = new URLSearchParams({ expectedCourseId: courseId });
  if (action === "attempts") query.set("includeInProgress", String(includeInProgress));
  return `/api/admin/quiz-insights/${encodeURIComponent(quizId)}/${action}?${query}`;
}
