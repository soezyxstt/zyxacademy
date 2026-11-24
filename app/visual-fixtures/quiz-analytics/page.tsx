"use client";

import { QuizAnalyticsView } from "@/components/course/quiz-analytics-view";
import { ApplicationPage } from "@/components/application-page";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavbar } from "@/components/navigation/mobile-top-navbar";

export default function QuizAnalyticsFixture() {
  return (
    <MobileChromeProvider>
      <MobileTopNavbar title="Analisis kuis" />
      <main className="min-h-screen bg-background text-foreground">
        <ApplicationPage><QuizAnalyticsView attemptId="visual-attempt" courseId="visual-math" /></ApplicationPage>
      </main>
    </MobileChromeProvider>
  );
}
