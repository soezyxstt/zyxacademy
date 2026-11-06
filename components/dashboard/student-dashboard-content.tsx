
import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { GraduationCap, Play, CheckCircle2, Bookmark, Trophy, ArrowUpRight, ArrowRight, History, Layers, Compass, ClipboardList } from "lucide-react";
import { StudentDashboardSection } from "./student-dashboard-section";
import { StudentCourseProgressRow } from "./student-course-progress-row";
import { DashboardWeakConcepts } from "@/components/course/dashboard-weak-concepts";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Reveal } from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import { TranslatedText } from "@/components/i18n/translated-text";
import { cn } from "@/lib/utils";

export type StudentDashboardContentProps = {
 href?: (path: string) => string;
  enrollments: { id: string; title: string; category: string }[];
  courseProgress: Record<string, { doneCount: number; total: number; nextConcept?: string }>;
  inProgressDocuments: { id: string; title: string; kind: string; courseId: string; courseTitle: string; completionPercent: number; lastSectionId?: string | null }[];
  recommendedUnenrolledCourses: { id: string; title: string; category: string; materialsCount: number }[];
  studentTargetCategory: string | null;
  totalDueFlashcards: number;
  firstCourseWithQueue?: string;
  recentReviews: { id: string; front: string; grade: number; reviewedAt: Date | string; courseTitle: string }[];
  masteryConcepts: ComponentProps<typeof DashboardWeakConcepts>["concepts"];
  availableExams: { id: string; title: string; courseId: string; courseTitle: string; type: string }[];
  activateClassAction: ReactNode;
};

export type StreamedStudentDashboardContentProps = {
  sections: { primary: ReactNode; secondary: ReactNode };
};

export function StudentDashboardContent(props: StudentDashboardContentProps | StreamedStudentDashboardContentProps) {
  if ("sections" in props) {
    return (
      <Reveal duration="duration-700" className="w-full min-w-0">
        <div className="grid gap-6 lg:grid-cols-12 w-full min-w-0">
          <div className="space-y-6 lg:col-span-7 min-w-0">{props.sections.primary}</div>
          <div className="space-y-6 lg:col-span-5 min-w-0">{props.sections.secondary}</div>
        </div>
      </Reveal>
    );
  }
  const { href = (path: string) => path,  enrollments, courseProgress, inProgressDocuments, recommendedUnenrolledCourses, studentTargetCategory, totalDueFlashcards, firstCourseWithQueue, recentReviews, masteryConcepts, availableExams, activateClassAction } = props;

  return (
            <Reveal duration="duration-700" className="w-full min-w-0">
              <div className="grid gap-6 lg:grid-cols-12 w-full min-w-0">
                {/* Left Column (Primary learning track) - 7 cols */}
                <div className="space-y-6 lg:col-span-7 min-w-0">
                  {/* Classes list Section */}
                  <StudentDashboardSection title={<><GraduationCap className="size-4 text-brand-primary" /><TranslatedText namespace="student" messageKey="dashboard.classesActive" /></>} actions={<div className="flex flex-wrap items-center gap-2 sm:gap-2.5">{activateClassAction}<Link href={href("/courses")} className="text-body-xs font-bold text-brand-primary hover:underline flex items-center gap-0.5 shrink-0"><TranslatedText namespace="student" messageKey="dashboard.viewAll" /><ArrowUpRight className="size-3.5" /></Link></div>}>
                    <div className="divide-y divide-border/30">
                      {enrollments.map((course) => {
                        const { doneCount, total } = courseProgress[course.id];

                        return (
                          <StudentCourseProgressRow key={course.id} href={href(`/courses/${course.id}`)} category={course.category} title={course.title} doneCount={doneCount} total={total} nextConcept={courseProgress[course.id].nextConcept} />
                        );
                      })}
                    </div>
                  </StudentDashboardSection>

                  {/* Documents In Progress */}
                  <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                      <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                        <Bookmark className="size-4 text-brand-primary" />
                        <TranslatedText namespace="student" messageKey="dashboard.openMaterials" />
                      </h2>
                      {inProgressDocuments.length > 0 && (
                        <span className="text-body-xs font-semibold bg-muted px-2 py-0.5 rounded-md text-muted-foreground shrink-0">
                          <TranslatedText namespace="student" messageKey="dashboard.materialCount" values={{ count: inProgressDocuments.length }} />
                        </span>
                      )}
                    </div>

                    {inProgressDocuments.length > 0 ? (
                      <div className="divide-y divide-border/30">
                        {inProgressDocuments.map((doc) => {
                          if (!doc) return null;
                          return (
                            <div
                              key={doc.id}
                              className="group py-3 px-2 -mx-2 rounded-xl transition-colors hover:bg-muted/40"
                            >
                              <Link
                                href={`/courses/${doc.courseId}/material/${doc.id}${doc.lastSectionId ? `?section=${encodeURIComponent(doc.lastSectionId)}` : ""}`}
                                className="flex items-center justify-between gap-3 sm:gap-4 min-w-0"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex max-w-full break-words rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                                      {doc.courseTitle}
                                    </span>
                                    <span className="text-body-xs text-muted-foreground capitalize">
                                      ({doc.kind})
                                    </span>
                                  </div>
                                  <h3 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors mt-1.5 break-words min-w-0">
                                    {doc.title}
                                  </h3>
                                  {/* Completion Progress Bar */}
                                  <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3 max-w-xs">
                                    <div className="h-1.5 w-20 sm:w-24 shrink-0 overflow-hidden rounded bg-muted">
                                      <div
                                        className="h-full bg-brand-primary transition-all duration-300 rounded"
                                        style={{ width: `${doc.completionPercent}%` }}
                                      />
                                    </div>
                                    <span className="text-body-xs font-semibold text-foreground shrink-0">{doc.completionPercent}%</span>
                                    {doc.lastSectionId && (
                                      <span className="max-w-[120px] truncate text-body-xs text-muted-foreground">, {doc.lastSectionId}</span>
                                    )}
                                  </div>
                                </div>
                                <Button size="sm" variant="outline" className="rounded-md gap-1.5 shrink-0 pointer-events-none group-hover:bg-muted transition-colors">
                                  <Play className="size-3 fill-current" />
                                  <TranslatedText namespace="student" messageKey="dashboard.continue" />
                                </Button>
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-dashed border-border/60 bg-muted/15">
                        <CheckCircle2 className="size-8 text-status-success/60 mb-2" />
                        <p className="text-body-sm font-medium text-foreground"><TranslatedText namespace="student" messageKey="dashboard.documentsRead" /></p>
                        <p className="text-body-xs text-muted-foreground mt-0.5"><TranslatedText namespace="student" messageKey="dashboard.newClassMaterial" /></p>
                      </div>
                    )}
                  </section>

                  {/* Recommended Courses for Student Major */}
                  {recommendedUnenrolledCourses.length > 0 && (
                    <section>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Compass className="size-4 text-brand-primary" />
                          <h2 className="font-heading text-body-base font-bold text-foreground">
                            <TranslatedText namespace="student" messageKey="dashboard.recommendedCourses" />
                          </h2>
                          {studentTargetCategory && (
                            <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-2xs font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20 shrink-0">
                              {studentTargetCategory === "TPB" ? "TPB" : studentTargetCategory}
                            </span>
                          )}
                        </div>
                        <Link
                          href={href("/courses")}
                          className="text-body-xs font-bold text-brand-primary hover:underline flex items-center gap-0.5 shrink-0"
                        >
                          <TranslatedText namespace="student" messageKey="dashboard.viewAll" />
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      </div>

                      <div className="divide-y divide-border/30">
                        {recommendedUnenrolledCourses.map((course) => (
                          <div
                            key={course.id}
                            className="group py-2.5 px-2 -mx-2 rounded-xl transition-colors hover:bg-muted/40"
                          >
                            <Link
                              href={href(`/courses/${course.id}`)}
                              className="flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex rounded-md bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary uppercase tracking-wider ring-1 ring-brand-primary/20">
                                    {course.category}
                                  </span>
                                  <span className="text-body-xs text-muted-foreground">
                                    <TranslatedText namespace="student" messageKey="dashboard.materialCount" values={{ count: course.materialsCount }} />
                                  </span>
                                </div>
                                <h3 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors break-words mt-1">
                                  {course.title}
                                </h3>
                              </div>
                              <div className="flex size-7 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground group-hover:text-brand-primary group-hover:border-brand-primary/30 transition-all shrink-0">
                                <ArrowRight className="size-4" />
                              </div>
                            </Link>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                {/* Right Column (Review, Mastery & Available Quizzes) - 5 cols */}
                <div className="space-y-6 lg:col-span-5 min-w-0">
                  {/* Status Spaced Repetition & Aktivitas Ulasan */}
                  <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                      <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                        <Layers className="size-4 text-brand-primary" />
                        <TranslatedText namespace="student" messageKey="dashboard.spacedRepetition" />
                      </h2>
                      <span className={cn(
                        "text-body-xs font-semibold px-2 py-0.5 rounded-md shrink-0",
                        totalDueFlashcards > 0
                          ? "bg-brand-secondary/15 text-brand-secondary"
                          : "bg-status-success/15 text-status-success"
                      )}>
                        {totalDueFlashcards > 0
                          ? <TranslatedText namespace="student" messageKey="dashboard.cardsDue" values={{ count: totalDueFlashcards }} />
                          : <TranslatedText namespace="student" messageKey="dashboard.allCardsDone" />}
                      </span>
                    </div>

                    <p className="text-body-xs text-muted-foreground leading-relaxed">
                      <TranslatedText namespace="student" messageKey="dashboard.spacedRepetitionDescription" />
                    </p>

                    {firstCourseWithQueue && (
                      <Button asChild className="w-full mt-3 rounded-lg text-body-sm font-semibold">
                        <Link href={href(`/courses/${firstCourseWithQueue}/flashcard`)}>
                          {totalDueFlashcards > 0
                            ? <TranslatedText namespace="student" messageKey="dashboard.startFlashcardReview" />
                            : <TranslatedText namespace="student" messageKey="dashboard.openFlashcardCollection" />}
                          <ArrowRight className="ml-1.5 size-4" />
                        </Link>
                      </Button>
                    )}

                    {/* Integrated Recent Reviews */}
                    <div className="mt-4 pt-3 border-t border-border/40">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-body-xs font-semibold text-foreground flex items-center gap-1.5">
                          <History className="size-3.5 text-muted-foreground" />
                          <TranslatedText namespace="student" messageKey="dashboard.recentReviews" />
                        </span>
                      </div>

                      {recentReviews.length > 0 ? (
                        <div className="divide-y divide-border/30">
                          {recentReviews.map((review) => {
                            const gradeLabels: Record<number, string> = {
                              1: "gradeAgain",
                              2: "gradeHard",
                              3: "gradeGood",
                              4: "gradeEasy",
                            };
                            const gradeColors: Record<number, string> = {
                              1: "text-status-error bg-status-error/10 border-status-error/20",
                              2: "text-brand-secondary bg-brand-secondary/10 border-brand-secondary/20",
                              3: "text-brand-primary bg-brand-primary/10 border-brand-primary/20",
                              4: "text-status-success bg-status-success/10 border-status-success/20",
                            };
                            return (
                              <div
                                key={review.id}
                                className="py-2.5 px-1"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className={cn(
                                    "inline-flex rounded-md border px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider shrink-0",
                                    gradeColors[review.grade] || "text-muted-foreground border-border bg-muted/40"
                                  )}>
                                    <TranslatedText namespace="student" messageKey={`dashboard.${gradeLabels[review.grade] || "recentReviews"}`} />
                                  </span>
                                  <span className="text-body-xs text-muted-foreground shrink-0">
                                    <FormattedDate date={review.reviewedAt} options={{ dateStyle: "medium" }} />
                                  </span>
                                </div>
                                <p className="text-body-xs font-medium text-foreground mt-1 truncate">
                                  {review.front}
                                </p>
                                <p className="text-body-xs text-muted-foreground mt-0.5 truncate">
                                  {review.courseTitle}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-body-xs text-muted-foreground py-2 text-center"><TranslatedText namespace="student" messageKey="dashboard.noRecentReviews" /></p>
                      )}
                    </div>
                  </section>

                  {/* Peta Penguasaan */}
                  <section>
                    <DashboardWeakConcepts
                      concepts={masteryConcepts}
                      courseTitle={enrollments[0]?.title}
                      showHeader={true}
                    />
                    {enrollments[0]?.id && (
                      <Link
                        href={href(`/courses/${enrollments[0].id}/mastery`)}
                        className="mt-3 pt-2.5 border-t border-border/40 inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
                      >
                        <TranslatedText namespace="student" messageKey="dashboard.fullMasteryMap" />
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    )}
                  </section>

                  {/* Quizzes and Tryouts */}
                  <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                      <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                        <ClipboardList className="size-4 text-brand-primary" />
                        <TranslatedText namespace="student" messageKey="dashboard.availableAssessments" />
                      </h2>
                      {availableExams.length > 0 && (
                        <span className="text-body-xs font-semibold bg-muted px-2 py-0.5 rounded-md text-muted-foreground shrink-0">
                          <TranslatedText namespace="student" messageKey="dashboard.examCount" values={{ count: availableExams.length }} />
                        </span>
                      )}
                    </div>

                    {availableExams.length > 0 ? (
                      <div className="divide-y divide-border/30">
                        {availableExams.slice(0, 4).map((exam) => (
                          <div
                            key={exam.id}
                            className="group py-2.5 px-2 -mx-2 rounded-xl transition-colors hover:bg-muted/40"
                          >
                            <Link
                              href={href(`/courses/${exam.courseId}/${exam.type}/${exam.id}`)}
                              className="flex items-center justify-between gap-3 min-w-0"
                            >
                              <div className="min-w-0 flex-1">
                                <h4 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors break-words min-w-0">
                                  {exam.title}
                                </h4>
                                <p className="text-body-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
                                  <span className="font-semibold text-brand-primary truncate max-w-[120px]">{exam.courseTitle}</span>
                                  <span className="text-border-strong">,</span>
                                  <span className="capitalize shrink-0"><TranslatedText namespace="student" messageKey={exam.type === "quiz" ? "dashboard.examQuiz" : "dashboard.examTryout"} /></span>
                                </p>
                              </div>
                              <Button size="sm" className="rounded-md shrink-0 pointer-events-none group-hover:bg-brand-primary/95 transition-all text-body-sm h-8 px-3">
                                <TranslatedText namespace="student" messageKey="dashboard.workOnIt" />
                              </Button>
                            </Link>
                          </div>
                        ))}

                        {availableExams.length > 4 && (
                          <div className="pt-2 text-center border-t border-border/40">
                            <Link
                              href={href(availableExams[0] ? `/courses/${availableExams[0].courseId}/quiz` : "/courses")}
                              className="text-body-xs font-semibold text-brand-primary hover:underline inline-flex items-center gap-1"
                            >
                              <TranslatedText namespace="student" messageKey="dashboard.seeAllExams" values={{ count: availableExams.length }} />
                              <ArrowUpRight className="size-3.5" />
                            </Link>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-dashed border-border/60 bg-muted/15">
                        <Trophy className="size-8 text-brand-secondary/60 mb-2" />
                        <p className="text-body-sm font-medium text-foreground"><TranslatedText namespace="student" messageKey="dashboard.allExamsDone" /></p>
                        <p className="text-body-xs text-muted-foreground mt-0.5"><TranslatedText namespace="student" messageKey="dashboard.newPracticeLater" /></p>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </Reveal>
  );
}
