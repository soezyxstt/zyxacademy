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
import { StudentDashboardSection } from "@/components/dashboard/student-dashboard-section";
import { TranslatedText } from "@/components/i18n/translated-text";
import { Button } from "@/components/ui/button";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";
import {
  REVIEW_GRADE_LABELS,
  REVIEW_GRADE_TONES,
  type StudentDashboardViewProps,
} from "@/features/student-dashboard/model/types";

export function StudentDashboardDesktop(props: StudentDashboardViewProps) {
  if ("sections" in props) {
    const { sections } = props;
    const primaryColumn = sections.primary ?? (
      <>
        {sections.activeAndReading}
        {sections.weakConcepts}
      </>
    );
    const secondaryColumn = sections.secondary ?? (
      <>
        {sections.todayPlan}
        {sections.gamification}
        {sections.reviewQueue}
        {sections.availableAssessments}
        {sections.recommendedCourses}
      </>
    );

    return (
      <Reveal duration="duration-700" className="w-full min-w-0">
        <div className="grid w-full min-w-0 gap-10 lg:grid-cols-12">
          <div className="min-w-0 space-y-10 lg:col-span-7">
            {primaryColumn}
          </div>
          <div className="min-w-0 space-y-10 lg:col-span-5 lg:border-l lg:border-border/35 lg:pl-10">
            {secondaryColumn}
          </div>
        </div>
      </Reveal>
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
    <Reveal duration="duration-700" className="w-full min-w-0">
      <div className="grid w-full min-w-0 gap-(--section-gap) lg:grid-cols-12">
        {/* Left Column (Primary learning track) - 7 cols */}
        <div className="min-w-0 space-y-(--section-gap) lg:col-span-7">
          <StudentDashboardSection
            title={
              <>
                <GraduationCap className="size-4 text-brand-primary" />
                <TranslatedText namespace="student" messageKey="dashboard.classesActive" />
              </>
            }
            actions={
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                {activateClassAction}
                <Link
                  href={href("/courses")}
                  className="flex shrink-0 items-center gap-0.5 text-body-xs font-bold text-brand-primary hover:underline"
                >
                  <TranslatedText namespace="student" messageKey="dashboard.viewAll" />
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            }
          >
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
          </StudentDashboardSection>

          {/* Documents In Progress */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
              <h2 className="flex items-center gap-2 font-heading text-section-title font-bold text-foreground">
                <Bookmark className="size-4 text-brand-primary" />
                <TranslatedText namespace="student" messageKey="dashboard.openMaterials" />
              </h2>
              {inProgressDocuments.length > 0 && (
                <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-body-xs font-semibold text-muted-foreground">
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
                    <div
                      key={doc.id}
                      className="group -mx-2 rounded-xl px-2 py-(--row-padding) transition-colors hover:bg-muted/40"
                    >
                      <Link
                        href={
                          doc.href ??
                          href(
                            `/courses/${doc.courseId}/material/${doc.id}${doc.lastSectionId ? `?section=${encodeURIComponent(doc.lastSectionId)}` : ""}`
                          )
                        }
                        className="flex min-w-0 items-center justify-between gap-3 sm:gap-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex max-w-full shrink-0 break-words rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {doc.courseTitle}
                            </span>
                            <span className="text-body-xs capitalize text-muted-foreground">
                              ({doc.kind})
                            </span>
                          </div>
                          <h3 className="mt-1.5 min-w-0 break-words font-heading text-body-sm font-bold text-foreground transition-colors group-hover:text-brand-primary">
                            {doc.title}
                          </h3>
                          <div className="mt-2 flex max-w-xs flex-wrap items-center gap-2 sm:gap-3">
                            <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded bg-muted sm:w-24">
                              <div
                                className="h-full rounded bg-brand-primary transition-all duration-300"
                                style={{ width: `${doc.completionPercent}%` }}
                              />
                            </div>
                            <span className="shrink-0 text-body-xs font-semibold text-foreground">
                              {doc.completionPercent}%
                            </span>
                            {doc.lastSectionId && (
                              <span className="max-w-[120px] truncate text-body-xs text-muted-foreground">
                                , {doc.lastSectionId}
                              </span>
                            )}
                          </div>
                        </div>
                        <Play
                          className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
                          aria-hidden
                        />
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-3 py-4 text-center">
                <CheckCircle2 className="mb-2 size-8 text-status-success/60" />
                <p className="text-body-sm font-medium text-foreground">
                  <TranslatedText namespace="student" messageKey="dashboard.documentsRead" />
                </p>
              </div>
            )}
          </section>

          {/* Recommended Courses for Student Major */}
          {recommendedUnenrolledCourses.length > 0 && (
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Compass className="size-4 text-brand-primary" />
                  <h2 className="font-heading text-section-title font-bold text-foreground">
                    <TranslatedText namespace="student" messageKey="dashboard.recommendedCourses" />
                  </h2>
                  {studentTargetCategory && (
                    <span className="shrink-0 rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-2xs font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20">
                      {studentTargetCategory === "TPB" ? "TPB" : studentTargetCategory}
                    </span>
                  )}
                </div>
                <Link
                  href={href("/courses")}
                  className="flex shrink-0 items-center gap-0.5 text-body-xs font-bold text-brand-primary hover:underline"
                >
                  <TranslatedText namespace="student" messageKey="dashboard.viewAll" />
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>

              <div className="divide-y divide-border/25">
                {recommendedUnenrolledCourses.map((course) => (
                  <div
                    key={course.id}
                    className="group -mx-2 rounded-xl px-2 py-(--row-padding) transition-colors hover:bg-muted/40"
                  >
                    <Link
                      href={href(`/courses/${course.id}`)}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-2xs font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20">
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
                        <h3 className="mt-1 break-words font-heading text-body-sm font-bold text-foreground transition-colors group-hover:text-brand-primary">
                          {course.title}
                        </h3>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right Column (Review, Mastery & Available Quizzes) - 5 cols */}
        <div className="min-w-0 space-y-(--section-gap) lg:col-span-5">
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
              <h2 className="flex items-center gap-2 font-heading text-section-title font-bold text-foreground">
                <Layers className="size-4 text-brand-primary" />
                <TranslatedText namespace="student" messageKey="dashboard.spacedRepetition" />
              </h2>
              <span
                className={cn(
                  "shrink-0 rounded-md px-2 py-0.5 text-body-xs font-semibold",
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
              <Button asChild className="w-full rounded-lg text-body-sm font-semibold">
                <Link href={href(`/courses/${firstCourseWithQueue}/flashcard`)}>
                  {totalDueFlashcards > 0 ? (
                    <TranslatedText namespace="student" messageKey="dashboard.startFlashcardReview" />
                  ) : (
                    <TranslatedText
                      namespace="student"
                      messageKey="dashboard.openFlashcardCollection"
                    />
                  )}
                  <ArrowRight className="ml-1.5 size-4" />
                </Link>
              </Button>
            )}

            <div className="mt-4 border-t border-border/40 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-body-xs font-semibold text-foreground">
                  <History className="size-3.5 text-muted-foreground" />
                  <TranslatedText namespace="student" messageKey="dashboard.recentReviews" />
                </span>
              </div>

              {recentReviews.length > 0 ? (
                <div className="divide-y divide-border/25">
                  {recentReviews.map((review) => (
                    <div key={review.id} className="px-1 py-2.5">
                      <div className="flex items-start justify-between gap-2">
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
              ) : (
                <p className="py-2 text-center text-body-xs text-muted-foreground">
                  <TranslatedText namespace="student" messageKey="dashboard.noRecentReviews" />
                </p>
              )}
            </div>
          </section>

          {masterySection ?? (
            <section>
              <DashboardWeakConcepts
                concepts={masteryConcepts}
                courseTitle={enrollments[0]?.title}
                showHeader={true}
              />
              {enrollments[0]?.id && (
                <Link
                  href={href(`/courses/${enrollments[0].id}/mastery`)}
                  className="mt-3 inline-flex items-center gap-1 border-t border-border/40 pt-2.5 text-body-xs font-semibold text-brand-primary hover:underline"
                >
                  <TranslatedText namespace="student" messageKey="dashboard.fullMasteryMap" />
                  <ArrowUpRight className="size-3.5" />
                </Link>
              )}
            </section>
          )}

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
              <h2 className="flex items-center gap-2 font-heading text-section-title font-bold text-foreground">
                <ClipboardList className="size-4 text-brand-primary" />
                <TranslatedText namespace="student" messageKey="dashboard.availableAssessments" />
              </h2>
              {availableExams.length > 0 && (
                <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-body-xs font-semibold text-muted-foreground">
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
                  <div
                    key={exam.id}
                    className="group -mx-2 rounded-xl px-2 py-(--row-padding) transition-colors hover:bg-muted/40"
                  >
                    <Link
                      href={href(`/courses/${exam.courseId}/${exam.type}/${exam.id}`)}
                      className="flex min-w-0 items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="min-w-0 break-words font-heading text-body-sm font-bold text-foreground transition-colors group-hover:text-brand-primary">
                          {exam.title}
                        </h4>
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-body-xs text-muted-foreground">
                          <span className="max-w-[120px] truncate font-semibold text-brand-primary">
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
                  </div>
                ))}

                {availableExams.length > 4 && (
                  <div className="border-t border-border/40 pt-2 text-center">
                    <Link
                      href={href(
                        availableExams[0] ? `/courses/${availableExams[0].courseId}/quiz` : "/courses"
                      )}
                      className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
                    >
                      <TranslatedText
                        namespace="student"
                        messageKey="dashboard.seeAllExams"
                        values={{ count: availableExams.length }}
                      />
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-3 py-4 text-center">
                <Trophy className="mb-2 size-8 text-brand-secondary/60" />
                <p className="text-body-sm font-medium text-foreground">
                  <TranslatedText namespace="student" messageKey="dashboard.allExamsDone" />
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </Reveal>
  );
}
