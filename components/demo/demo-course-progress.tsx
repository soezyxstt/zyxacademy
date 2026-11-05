"use client";

import { useStudentExperience } from "@/components/student-experience-provider";
import { BarChart3 } from "lucide-react";
import type { DemoSummary } from "./demo-shell";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { StudentCourseProgressView } from "@/components/course/student-course-progress-view";
import { Reveal } from "@/components/ui/reveal";
import { TranslatedText } from "@/components/i18n/translated-text";
import { demoProgress } from "@/lib/demo/progress-overlay";
import { useDemoSession } from "./demo-session";

export function DemoCourseProgress({ experience: { snapshot, content } }: { experience: DemoSummary }) {
  const { href } = useStudentExperience();
  const { overlay } = useDemoSession();
  const progress = demoProgress(snapshot, overlay);
  const reviewed = progress.history.reduce((sum, day) => sum + day.flashcardsReviewed, 0);
  return <CoursePageShell title={<TranslatedText namespace="learning" messageKey="progress.title" values={{ course: content.course.title }} />} icon={BarChart3}>
    <Reveal><StudentCourseProgressView href={href} courseId={snapshot.courseId}
      statistics={{ studyTimeMin: progress.completedMaterials * 12, completedMaterialsCount: progress.completedMaterials, cardsReviewedCount: reviewed, currentStreakDays: snapshot.streakDays }}
      activities={progress.history.slice(0,5).map(day => ({ id: day.date, type: "daily_summary", timestamp: day.date,
        title: `${day.materialsCompleted} materi, ${day.flashcardsReviewed} flashcard, ${day.quizzesCompleted} kuis`,
      }))}
    /></Reveal>
  </CoursePageShell>;
}
