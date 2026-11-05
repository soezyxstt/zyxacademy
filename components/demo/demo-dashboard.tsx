"use client";

import { ApplicationPage } from "@/components/application-page";
import { ActivateClassModal } from "@/components/dashboard/activate-class-modal";
import { StudentDashboardContent } from "@/components/dashboard/student-dashboard-content";
import { TodayPlan } from "@/components/dashboard/today-plan";
import type { DemoSummary } from "./demo-shell";
import type { DemoExperience } from "@/app/(marketing)/demo/demo-data";
import { demoProgress } from "@/lib/demo/progress-overlay";
import { emptyOverlay } from "@/lib/demo/session-overlay";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useTranslations } from "@/lib/i18n/client";
import { useDemoSession } from "./demo-session";
import type { ReactNode } from "react";

export function DemoDashboard({ experiences, selected, masterySection, todayPlan }: { experiences: DemoSummary[]; selected: DemoSummary; masterySection?: ReactNode; todayPlan: ReactNode }) {
  const { snapshot } = selected;
  const { href } = useStudentExperience();
  const { overlays } = useDemoSession();
  const sorted = [...experiences].sort((a,b) => a.content.course.title.localeCompare(b.content.course.title));
  return <ApplicationPage className="pb-16">
      {todayPlan}
      <StudentDashboardContent href={href}
        enrollments={sorted.map(item => item.content.course)}
        courseProgress={Object.fromEntries(sorted.map(({snapshot: item}) => [item.courseId, {doneCount: demoProgress(item, overlays[item.courseId] ?? emptyOverlay()).completedMaterials, total: item.course.totalMaterials, nextConcept: item.course.nextConcept ?? undefined}]))}
        inProgressDocuments={sorted.flatMap(({snapshot: item,content}) => {
          const article = content.article;
          if (article && (overlays[item.courseId] ?? emptyOverlay()).events.some(event => event.kind === "article" && event.id === `demo-article-${article.id}`.slice(0,128))) return [];
          return item.inProgressDocuments.map(doc => ({id:article?.id ?? doc.id,title:article?.title ?? doc.title,completionPercent:doc.completionPercent,kind:"article",courseId:item.courseId,courseTitle:content.course.title,href:href(`/courses/${item.courseId}/material${article ? `/${article.id}` : ""}`)}));
        })}
        recommendedUnenrolledCourses={[]}
        studentTargetCategory="TPB"
        totalDueFlashcards={sorted.reduce((sum, {snapshot: item}) => sum + demoProgress(item, overlays[item.courseId] ?? emptyOverlay()).dueCount, 0)}
        firstCourseWithQueue={snapshot.courseId}
        recentReviews={sorted.flatMap(({snapshot: item,content}) => item.flashcards.recentReviews.map(review => ({...review,id:`${item.courseId}:${review.id}`,reviewedAt:review.reviewedOn,courseTitle:content.course.title})))}
        masteryConcepts={snapshot.weakConcepts.map(concept => ({conceptName:concept.title,masteryScore:concept.masteryPercent,evidenceCount:3,isMeasured:true,trend:"stable"}))}
        masterySection={masterySection}
        availableExams={sorted.flatMap(({snapshot: item,content}) => item.availableAssessments.map(exam => ({...exam,id:`${item.courseId}:${exam.id}`,courseId:item.courseId,courseTitle:content.course.title})))}
        activateClassAction={<ActivateClassModal />}
      />
  </ApplicationPage>;
}

export function DemoTodayPlan({ selected }: { selected: DemoExperience }) {
  const { snapshot } = selected;
  const { route } = useStudentExperience();
  const t = useTranslations("marketing");
  const { overlay, record } = useDemoSession();
  const progress = demoProgress(snapshot, overlay);
  const completed = (id: string) => overlay.events.some(event => event.id === id);
  return <TodayPlan firstName={snapshot.displayName.split(" ")[0]} adapter={{
        data: { streak: { current: snapshot.streakDays, longest: snapshot.streakDays }, items: [
          { id: selected.content.article.id, kind: "module", title: selected.content.article.title, href: route("article"), done: completed(`demo-article-${selected.content.article.id}`.slice(0,128)) },
          { id: "fictional-review-plan", kind: "flashcards", title: t("demo.views.flashcards"), count: progress.dueCount, href: route("flashcards"), done: completed("fictional-review-plan") },
          { id: "fictional-quiz-plan", kind: "quiz", title: t("demo.session.practiceQuiz"), href: route("quiz"), done: completed("fictional-quiz-plan") },
        ] }, complete: id => record(id === "fictional-review-plan" ? "review" : id === "fictional-quiz-plan" ? "quiz" : "article", id === selected.content.article.id ? `demo-article-${id}`.slice(0,128) : id, id === "fictional-review-plan" ? 3 : undefined),
      }} />;
}
