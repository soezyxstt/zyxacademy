"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CheckCircle2,
  ClipboardList,
  Compass,
  GraduationCap,
  History,
  Layers,
  Play,
  Trophy,
} from "lucide-react";
import { DashboardWeakConcepts } from "@/components/course/dashboard-weak-concepts";
import { StudentCourseProgressRow } from "@/components/dashboard/student-course-progress-row";
import { TranslatedText } from "@/components/i18n/translated-text";
import { Button } from "@/components/ui/button";
import { FormattedDate } from "@/components/ui/formatted-date";
import { cn } from "@/lib/utils";
import {
  REVIEW_GRADE_LABELS,
  REVIEW_GRADE_TONES,
  type StudentDashboardViewProps,
} from "@/features/student-dashboard/model/types";

/**
 * Compact single-column LMS feed for mobile viewports (<768px).
 * Feed order: Streak/Gamification -> Active Courses & Continue Reading ->
 * Due Flashcards -> Available Exams -> Weak Concepts -> Recommended Courses.
 */
export function StudentDashboardMobile(props: StudentDashboardViewProps) {
  if ("sections" in props) {
    const { sections } = props;
    const hasGranularSlots = Boolean(
      sections.gamification ||
        sections.activeAndReading ||
        sections.reviewQueue ||
        sections.availableAssessments ||
        sections.weakConcepts ||
        sections.recommendedCourses
    );

    if (hasGranularSlots) {
      return (
        <div className="flex w-full min-w-0 flex-col space-y-5">
          {sections.gamification ? <div className="min-w-0">{sections.gamification}</div> : null}
          {sections.activeAndReading ? (
            <div className="min-w-0">{sections.activeAndReading}</div>
          ) : null}
          {sections.reviewQueue ? <div className="min-w-0">{sections.reviewQueue}</div> : null}
          {sections.availableAssessments ? (
            <div className="min-w-0">{sections.availableAssessments}</div>
          ) : null}
          {sections.weakConcepts ? <div className="min-w-0">{sections.weakConcepts}</div> : null}
          {sections.recommendedCourses ? (
            <div className="min-w-0">{sections.recommendedCourses}</div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="flex w-full min-w-0 flex-col space-y-5">
        {sections.primary ? <div className="min-w-0 space-y-5">{sections.primary}</div> : null}
        {sections.secondary ? (
          <div className="min-w-0 space-y-5">{sections.secondary}</div>
        ) : null}
      </div>
    );
  }

  const {
    href = (path: string) => path,
    enrollments,
    courseProgress,
    inProgressDocuments,
    recommendedUnenrolledCourses,
    studentTargetCategory,
    totalDueFlashcards,
    firstCourseWithQueue,
    recentReviews,
    masteryConcepts,
    masterySection,
    availableExams,
    activateClassAction,
  } = props;

  return (
    <div className="flex w-full min-w-0 flex-col space-y-5">
      {/* 1. Active Courses */}
      <section className="min-w-0">
        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-border/40 pb-2">
          <h2 className="flex items-center gap-1.5 font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <GraduationCap className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <TranslatedText namespace="student" messageKey="dashboard.classesActive" />
          </h2>
          <div className="flex items-center gap-2">
            {activateClassAction}
            <Link
              href={href("/courses")}
              className="flex min-h-9 shrink-0 items-center gap-0.5 text-body-xs font-semibold text-brand-primary"
            >
              <TranslatedText namespace="student" messageKey="dashboard.viewAll" />
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
        <div className="divide-y divide-border/25">
          {enrollments.map((course) => {
            const { doneCount, total } = courseProgress[course.id];
            return (
              <StudentCourseProgressRow
                key={course.id}
                href={href(`/courses/${course.id}`)}
                category={course.category}
                title={course.title}
                doneCount={doneCount}
                total={total}
                nextConcept={courseProgress[course.id].nextConcept}
              />
            );
          })}
        </div>
      </section>

      {/* 2. Continue Reading */}
      <section className="min-w-0">
        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-border/40 pb-2">
          <h2 className="flex items-center gap-1.5 font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Bookmark className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <TranslatedText namespace="student" messageKey="dashboard.openMaterials" />
          </h2>
          {inProgressDocuments.length > 0 && (
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-body-xs font-semibold tabular-nums text-muted-foreground">
              <TranslatedText
                namespace="student"
                messageKey="dashboard.materialCount"
                values={{ count: inProgressDocuments.length }}
              />
            </span>
          )}
        </div>

        {inProgressDocuments.length > 0 ? (
          <div className="divide-y divide-border/25">
            {inProgressDocuments.map((doc) => {
              if (!doc) return null;
              return (
                <Link
                  key={doc.id}
                  href={
                    doc.href ??
                    href(
                      `/courses/${doc.courseId}/material/${doc.id}${doc.lastSectionId ? `?section=${encodeURIComponent(doc.lastSectionId)}` : ""}`
                    )
                  }
                  className="flex min-h-11 min-w-0 items-center justify-between gap-3 py-3 active:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex max-w-full shrink-0 break-words rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {doc.courseTitle}
                      </span>
                      <span className="text-body-xs capitalize text-muted-foreground">
                        ({doc.kind})
                      </span>
                    </div>
                    <h3 className="mt-1 min-w-0 break-words font-heading text-body-sm font-bold text-foreground">
                      {doc.title}
                    </h3>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded bg-muted">
                        <div
                          className="h-full rounded bg-brand-primary"
                          style={{ width: `${doc.completionPercent}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-body-xs font-semibold tabular-nums text-foreground">
                        {doc.completionPercent}%
                      </span>
                      {doc.lastSectionId && (
                        <span className="truncate text-body-xs text-muted-foreground">
                          , {doc.lastSectionId}
                        </span>
                      )}
                    </div>
                  </div>
                  <Play className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 py-2.5 text-muted-foreground">
            <CheckCircle2 className="size-5 shrink-0 text-status-success" aria-hidden />
            <p className="text-body-sm font-medium text-foreground">
              <TranslatedText namespace="student" messageKey="dashboard.documentsRead" />
            </p>
          </div>
        )}
      </section>

      {/* 3. Due Flashcards */}
      <section className="min-w-0">
        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-border/40 pb-2">
          <h2 className="flex items-center gap-1.5 font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <TranslatedText namespace="student" messageKey="dashboard.spacedRepetition" />
          </h2>
          <span
            className={cn(
              "shrink-0 rounded-md px-2 py-0.5 text-body-xs font-semibold tabular-nums",
              totalDueFlashcards > 0
                ? "bg-brand-secondary/15 text-brand-secondary"
                : "bg-status-success/15 text-status-success"
            )}
          >
            {totalDueFlashcards > 0 ? (
              <TranslatedText
                namespace="student"
                messageKey="dashboard.cardsDue"
                values={{ count: totalDueFlashcards }}
              />
            ) : (
              <TranslatedText namespace="student" messageKey="dashboard.allCardsDone" />
            )}
          </span>
        </div>

        {firstCourseWithQueue && (
          <Button asChild className="min-h-11 w-full rounded-lg text-body-sm font-semibold">
            <Link href={href(`/courses/${firstCourseWithQueue}/flashcard`)}>
              {totalDueFlashcards > 0 ? (
                <TranslatedText namespace="student" messageKey="dashboard.startFlashcardReview" />
              ) : (
                <TranslatedText
                  namespace="student"
                  messageKey="dashboard.openFlashcardCollection"
                />
              )}
              <ArrowRight className="ml-1.5 size-4" aria-hidden />
            </Link>
          </Button>
        )}

        {recentReviews.length > 0 && (
          <div className="mt-3 border-t border-border/30 pt-2.5">
            <span className="mb-1.5 flex items-center gap-1.5 text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              <History className="size-3.5 text-muted-foreground" aria-hidden />
              <TranslatedText namespace="student" messageKey="dashboard.recentReviews" />
            </span>
            <div className="divide-y divide-border/25">
              {recentReviews.slice(0, 3).map((review) => (
                <div key={review.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex shrink-0 rounded-md border px-1.5 py-0.2 text-body-2xs font-bold uppercase tracking-wider",
                        REVIEW_GRADE_TONES[review.grade] ||
                          "border-border bg-muted/40 text-muted-foreground"
                      )}
                    >
                      <TranslatedText
                        namespace="student"
                        messageKey={`dashboard.${REVIEW_GRADE_LABELS[review.grade] || "recentReviews"}`}
                      />
                    </span>
                    <span className="shrink-0 text-body-xs text-muted-foreground">
                      <FormattedDate date={review.reviewedAt} options={{ dateStyle: "medium" }} />
                    </span>
                  </div>
                  <p className="mt-1 truncate text-body-xs font-medium text-foreground">
                    {review.front}
                  </p>
                  <p className="mt-0.5 truncate text-body-xs text-muted-foreground">
                    {review.courseTitle}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 4. Available Exams */}
      <section className="min-w-0">
        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-border/40 pb-2">
          <h2 className="flex items-center gap-1.5 font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <ClipboardList className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <TranslatedText namespace="student" messageKey="dashboard.availableAssessments" />
          </h2>
          {availableExams.length > 0 && (
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-body-xs font-semibold tabular-nums text-muted-foreground">
              <TranslatedText
                namespace="student"
                messageKey="dashboard.examCount"
                values={{ count: availableExams.length }}
              />
            </span>
          )}
        </div>

        {availableExams.length > 0 ? (
          <div className="divide-y divide-border/25">
            {availableExams.slice(0, 4).map((exam) => (
              <Link
                key={exam.id}
                href={href(`/courses/${exam.courseId}/${exam.type}/${exam.id}`)}
                className="flex min-h-11 min-w-0 items-center justify-between gap-3 py-2.5 active:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <h4 className="min-w-0 break-words font-heading text-body-sm font-bold text-foreground">
                    {exam.title}
                  </h4>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-body-xs text-muted-foreground">
                    <span className="max-w-[140px] truncate font-medium text-foreground/80">
                      {exam.courseTitle}
                    </span>
                    <span className="text-border-strong">,</span>
                    <span className="shrink-0 capitalize">
                      <TranslatedText
                        namespace="student"
                        messageKey={
                          exam.type === "quiz" ? "dashboard.examQuiz" : "dashboard.examTryout"
                        }
                      />
                    </span>
                  </p>
                </div>
              </Link>
            ))}

            {availableExams.length > 4 && (
              <div className="border-t border-border/30 pt-2 text-center">
                <Link
                  href={href(
                    availableExams[0] ? `/courses/${availableExams[0].courseId}/quiz` : "/courses"
                  )}
                  className="inline-flex min-h-9 items-center gap-1 text-body-xs font-semibold text-brand-primary"
                >
                  <TranslatedText
                    namespace="student"
                    messageKey="dashboard.seeAllExams"
                    values={{ count: availableExams.length }}
                  />
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 py-2.5">
            <Trophy className="size-5 shrink-0 text-brand-secondary/70" aria-hidden />
            <p className="text-body-sm font-medium text-foreground">
              <TranslatedText namespace="student" messageKey="dashboard.allExamsDone" />
            </p>
          </div>
        )}
      </section>

      {/* 5. Weak Concepts */}
      {masterySection ?? (
        <section className="min-w-0">
          <DashboardWeakConcepts
            concepts={masteryConcepts}
            courseTitle={enrollments[0]?.title}
            showHeader={true}
          />
          {enrollments[0]?.id && (
            <Link
              href={href(`/courses/${enrollments[0].id}/mastery`)}
              className="mt-2.5 inline-flex min-h-9 items-center gap-1 border-t border-border/30 pt-2 text-body-xs font-semibold text-brand-primary"
            >
              <TranslatedText namespace="student" messageKey="dashboard.fullMasteryMap" />
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </section>
      )}

      {/* 6. Recommended Courses */}
      {recommendedUnenrolledCourses.length > 0 && (
        <section className="min-w-0">
          <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-border/40 pb-2">
            <div className="flex items-center gap-1.5">
              <Compass className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <h2 className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <TranslatedText namespace="student" messageKey="dashboard.recommendedCourses" />
              </h2>
              {studentTargetCategory && (
                <span className="shrink-0 rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {studentTargetCategory === "TPB" ? "TPB" : studentTargetCategory}
                </span>
              )}
            </div>
            <Link
              href={href("/courses")}
              className="flex min-h-9 shrink-0 items-center gap-0.5 text-body-xs font-semibold text-brand-primary"
            >
              <TranslatedText namespace="student" messageKey="dashboard.viewAll" />
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </div>

          <div className="divide-y divide-border/25">
            {recommendedUnenrolledCourses.map((course) => (
              <Link
                key={course.id}
                href={href(`/courses/${course.id}`)}
                className="flex min-h-11 min-w-0 items-center justify-between gap-3 py-2.5 active:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {course.category}
                    </span>
                    <span className="text-body-xs text-muted-foreground">
                      <TranslatedText
                        namespace="student"
                        messageKey="dashboard.materialCount"
                        values={{ count: course.materialsCount }}
                      />
                    </span>
                  </div>
                  <h3 className="mt-1 break-words font-heading text-body-sm font-bold text-foreground">
                    {course.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
