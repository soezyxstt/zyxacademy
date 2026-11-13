"use client";

import { useStudentExperience } from "@/components/student-experience-provider";
import { useDemoQuizHistory } from "./use-demo-quiz-history";
import type { ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import type { DemoExperience } from "@/app/(marketing)/demo/demo-data";
import { QuizListClient } from "@/app/(student)/courses/[id]/quiz/quiz-list-client";
import { QuizStartButton } from "@/app/(student)/courses/[id]/quiz/[quizId]/quiz-start-button";
import { StudentQuizListView } from "@/components/course/student-quiz-list-view";
import { StudentQuizGateway } from "@/components/course/student-quiz-gateway";
import { Reveal } from "@/components/ui/reveal";

export function DemoQuizList({ experience: { content, snapshot } }: { experience: DemoExperience }) {
  const { href } = useStudentExperience();
  const attempts = useDemoQuizHistory(snapshot);
  const requested = useSearchParams().get("access");
  const access = requested === "free" || requested === "premium" ? requested : "all";
  const assessment = snapshot.availableAssessments.find(item => item.type === "quiz");
  const templates: ComponentProps<typeof QuizListClient>["templates"] = assessment && access !== "premium" ? [{ id: assessment.id, title: assessment.title, visibility: "free", category: "chapter", selectionRules: { count: content.collections.quiz.total }, timeLimitSeconds: 900, manualStatus: "open", openAt: null, closeAt: null }] : [];
  return <StudentQuizListView href={href} id={snapshot.courseId} courseTitle={content.course.title} access={access}>
    <Reveal><QuizListClient courseId={snapshot.courseId} hasFullContentAccess templates={templates} attempts={attempts} /></Reveal>
  </StudentQuizListView>;
}

export function DemoQuizGateway({ experience: { content, snapshot } }: { experience: DemoExperience }) {
  const { href } = useStudentExperience();
  const attempts = useDemoQuizHistory(snapshot);
  const assessment = snapshot.availableAssessments.find(item => item.type === "quiz");
  if (!assessment) return null;
  return <StudentQuizGateway href={href} id={snapshot.courseId} courseTitle={content.course.title}
    template={{ id: assessment.id, title: assessment.title, selectionRules: { count: content.collections.quiz.total }, timeLimitSeconds: 900, maxAttempts: null }}
    completedAttempts={attempts} inProgressAttempt={null} questionsCount={content.collections.quiz.total}
    startAction={<QuizStartButton courseId={snapshot.courseId} templateId={assessment.id} />}
  />;
}
