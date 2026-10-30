"use client";

import { QuizAnalyticsView } from "@/components/course/quiz-analytics-view";

export default function QuizAnalyticsFixture() {
  return <main className="min-h-screen bg-background p-4 text-foreground"><QuizAnalyticsView attemptId="visual-attempt" courseId="visual-math" /></main>;
}
