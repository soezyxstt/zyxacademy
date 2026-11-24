"use client";

import { QuizAnalyticsView } from "@/components/course/quiz-analytics-view";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavbar } from "@/components/navigation/mobile-top-navbar";

export default function QuizAnalyticsFixture() {
  return (
    <MobileChromeProvider>
      <MobileTopNavbar title="Analisis kuis" />
      <main className="min-h-screen bg-background p-4 text-foreground">
        <QuizAnalyticsView attemptId="visual-attempt" courseId="visual-math" />
      </main>
    </MobileChromeProvider>
  );
}
