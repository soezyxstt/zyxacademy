"use client";

import type { DemoExperience } from "@/app/(marketing)/demo/demo-data";
import { TryoutListClient } from "@/app/(student)/courses/[id]/tryout/tryout-list-client";
import { StudentTryoutsView } from "@/components/course/student-tryouts-view";
import { Reveal } from "@/components/ui/reveal";
import { syntheticTryout } from "@/lib/demo/assessment/tryout";
import { useAppLocale } from "@/lib/i18n/client";

export function DemoTryoutList({ experience: { content, snapshot } }: { experience: DemoExperience }) {
  const { locale } = useAppLocale();
  const exam = syntheticTryout(snapshot.courseId, locale);
  return <StudentTryoutsView courseTitle={content.course.title}><Reveal>
    <TryoutListClient courseId={snapshot.courseId} isEnrolled tryouts={[{ id: exam.id, courseId: snapshot.courseId, title: exam.title, type: "tryout", status: "published", settings: exam.settings, questions: [], questionCount: exam.questions.length, isFree: true }]} />
  </Reveal></StudentTryoutsView>;
}
