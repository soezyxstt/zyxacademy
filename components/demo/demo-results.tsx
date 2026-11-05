"use client";

import { useStudentExperience } from "@/components/student-experience-provider";
import { useDemoQuizHistory } from "./use-demo-quiz-history";
import { History } from "lucide-react";
import type { DemoExperience } from "@/app/(marketing)/demo/demo-data";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { StudentCourseResultsList, type StudentResultRow } from "@/components/course/student-course-results-list";
import { Reveal } from "@/components/ui/reveal";
import { TranslatedText } from "@/components/i18n/translated-text";

export function DemoResults({ experience: { content, snapshot } }: { experience: DemoExperience }) {
  const experience = useStudentExperience();
  const attempts = useDemoQuizHistory(snapshot);
  const rows: StudentResultRow[] = attempts.map(attempt => ({ id: attempt.id, examTitle: `Latihan ${content.course.chapterTitle}`, examType: "quiz", status: attempt.status, score: attempt.score, submittedAt: attempt.submittedAt.toISOString() }));
  if (experience.overlay?.events.some(event => event.id === "fictional-tryout-complete")) rows.unshift({ id: "fictional-local-tryout", examTitle: "Tryout latihan", examType: "tryout", status: "pending_review", score: null, submittedAt: snapshot.asOf });
  return <CoursePageShell title={<TranslatedText namespace="learning" messageKey="results.title" values={{ course: content.course.title }} />} icon={History}>
    <Reveal><StudentCourseResultsList href={experience.href} id={snapshot.courseId} allSubmissions={rows} /></Reveal>
  </CoursePageShell>;
}
