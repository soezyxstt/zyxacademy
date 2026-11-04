"use client";

import { ClipboardList, Layers3 } from "lucide-react";
import type { DemoSummary } from "./demo-shell";
import type { DemoExperience } from "@/app/(marketing)/demo/demo-data";
import { ChapterOutlineList } from "@/components/course/chapter-outline-list";
import { demoChapterOutline } from "@/lib/demo/chapter-outline";
import { getCalendarMonthLabel, getCalendarMonthRange } from "@/lib/date-utils";
import { StudyStatisticsCard } from "@/components/course/study-statistics-card";
import { RecentActivityCard } from "@/components/course/recent-activity-card";
import { demoProgress } from "@/lib/demo/progress-overlay";
import { emptyOverlay } from "@/lib/demo/session-overlay";
import { DashboardWeakConcepts } from "@/components/course/dashboard-weak-concepts";
import { CourseCatalogClient } from "@/app/(student)/courses/course-catalog-client";
import { StudentDashboardSection } from "@/components/dashboard/student-dashboard-section";
import { StudentCourseProgressRow } from "@/components/dashboard/student-course-progress-row";
import { useStudentExperience } from "@/components/student-experience-provider";
import { PageHeader } from "@/components/page-header";
import { LocalizedPublicLink } from "@/components/localized-public-link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { useDemoSession } from "./demo-session";

type Props = { experiences: DemoSummary[]; selected: DemoExperience; view?: "dashboard" | "courses" | "progress" | "history" };
export function DemoDashboard({ experiences, selected, view = "dashboard" }: Props) {
  const { snapshot, content: { course } } = selected;
  const { courseHref, route } = useStudentExperience();
  const sorted = [...experiences].sort((a, b) => a.content.course.title.localeCompare(b.content.course.title));
  const t = useTranslations("marketing");
  const { locale } = useAppLocale();
  const { overlay, overlays } = useDemoSession();
  const progress = demoProgress(snapshot, overlay);
  const title = view === "dashboard" ? t("demo.session.greeting", { name: snapshot.displayName }) : t(`demo.views.${view}`);
  const courseSection = <section className="space-y-4"><StudentCourseProgressRow href={courseHref(snapshot.courseId)} category={course.category} title={course.title} doneCount={progress.completedMaterials} total={snapshot.course.totalMaterials} nextConcept={snapshot.course.nextConcept} /><div className="flex flex-wrap gap-2">{(["article", "diktat", "flashcards", "quiz", "tryout"] as const).map((path) => <Button key={path} asChild variant="outline" size="sm"><LocalizedPublicLink href={route(path)}>{t(`demo.views.${path}`)}</LocalizedPublicLink></Button>)}</div></section>;
  const chapters = <ChapterOutlineList showCount={false} chapters={demoChapterOutline({ snapshot, chapterTitle: course.chapterTitle, articleId: selected.content.article.id, overlay, articleHref: route("article"), availableLabel: t("demo.session.chapterAvailable"), mockLabel: (percent) => t("demo.session.mockChapterProgress", { percent }) })} />;
  const monthly = new Map<string, { materialsCompleted: number; flashcardsReviewed: number; quizzesCompleted: number }>();
  for (const day of progress.history) {
    const month = getCalendarMonthRange(day.date).startIso;
    const total = monthly.get(month) ?? { materialsCompleted: 0, flashcardsReviewed: 0, quizzesCompleted: 0 };
    total.materialsCompleted += day.materialsCompleted;
    total.flashcardsReviewed += day.flashcardsReviewed;
    total.quizzesCompleted += day.quizzesCompleted;
    monthly.set(month, total);
  }
  const monthlyHistory = <RecentActivityCard data={[...monthly].map(([month, total]) => ({ id: month, type: "daily_summary" as const, timestamp: getCalendarMonthLabel(month, locale === "en" ? "en-US" : "id-ID"), title: t("demo.session.dailyCounts", { materials: total.materialsCompleted, reviews: total.flashcardsReviewed, quizzes: total.quizzesCompleted }) }))} />;
  const statistics = <div className="space-y-3"><StudyStatisticsCard data={{ studyTimeMin: null, completedMaterialsCount: progress.completedMaterials, cardsReviewedCount: null, currentStreakDays: snapshot.streakDays }} /><div className="flex items-center gap-2 text-body-sm text-muted-foreground"><Layers3 className="size-4" /><span>{t("demo.session.dueCount", { count: progress.dueCount })}</span></div></div>;
  const documents = <section className="rounded-xl border bg-card p-5"><h2 className="font-heading text-body-base font-bold">{t("demo.session.inProgress")}</h2>{snapshot.inProgressDocuments.filter((d) => !overlay.events.some((e) => e.kind === "article" && e.id === d.id)).length ? <div className="mt-2 divide-y">{snapshot.inProgressDocuments.filter((d) => !overlay.events.some((e) => e.kind === "article" && e.id === d.id)).map((d) => <div key={d.id} className="flex justify-between gap-3 py-3 text-body-sm"><span>{d.title}</span><span>{d.completionPercent}%</span></div>)}</div> : <p className="mt-3 text-body-sm text-muted-foreground">{t("demo.session.noDocuments")}</p>}</section>;
  const concepts = <section className="rounded-xl border bg-card p-5"><DashboardWeakConcepts courseTitle={course.title} hideTrend concepts={snapshot.weakConcepts.map((item) => ({ conceptName: item.title, masteryScore: item.masteryPercent, evidenceCount: 0, isMeasured: true }))} /></section>;
  const assessments = <section className="rounded-xl border bg-card p-5"><h2 className="flex items-center gap-2 font-heading text-body-base font-bold"><ClipboardList className="size-4" />{t("demo.session.assessments")}</h2>{snapshot.availableAssessments.filter((a) => a.type === "quiz").length ? <div className="mt-2 divide-y">{snapshot.availableAssessments.filter((a) => a.type === "quiz").map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-body-sm"><span>{a.title}</span></div>)}</div> : <p className="mt-3 text-body-sm text-muted-foreground">{t("demo.session.noAssessments")}</p>}<div className="mt-3"><Button asChild variant="outline" size="sm"><LocalizedPublicLink href={route("quiz")}>{t("demo.session.practiceQuiz")}</LocalizedPublicLink></Button></div></section>;
  const history = <RecentActivityCard data={progress.history.map((day) => ({ id: day.date, type: "daily_summary" as const, timestamp: day.date, title: t("demo.session.dailyCounts", { materials: day.materialsCompleted, reviews: day.flashcardsReviewed, quizzes: day.quizzesCompleted }) }))} />;
  const reviews = <section className="rounded-xl border bg-card p-5"><h2 className="font-heading text-body-base font-bold">{t("demo.session.recentReviews")}</h2>{snapshot.flashcards.recentReviews.length ? <div className="mt-2 divide-y">{snapshot.flashcards.recentReviews.map((r) => <div key={r.id} className="flex justify-between gap-3 py-3 text-body-sm"><span>{r.front}</span><span className="shrink-0 text-muted-foreground">{r.reviewedOn} · {r.grade}/4</span></div>)}</div> : <p className="mt-3 text-body-sm text-muted-foreground">{t("demo.session.noReviews")}</p>}</section>;
  return <div className="space-y-6"><PageHeader title={title} />
    {view === "dashboard" && <>{statistics}<StudentDashboardSection title={t("demo.views.courses")}><div className="divide-y">{sorted.map(({ content, snapshot: item }) => <StudentCourseProgressRow key={item.courseId} href={courseHref(item.courseId)} category={content.course.category} title={content.course.title} doneCount={demoProgress(item, overlays[item.courseId] ?? emptyOverlay()).completedMaterials} total={item.course.totalMaterials} nextConcept={item.course.nextConcept} />)}</div></StudentDashboardSection><div className="grid gap-4 lg:grid-cols-2">{documents}{assessments}</div></>}
    {view === "courses" && <CourseCatalogClient showCounts={false} groups={[{ jurusan: t("demo.views.courses"), isStudentMajor: false, courses: sorted.map(({ content, snapshot: item }) => ({ id: item.courseId, title: content.course.title, category: content.course.category, description: content.course.description ?? "", materialsCount: item.course.totalMaterials, quizzesCount: 0, tryoutsCount: 0 })) }]} />}
    {view === "progress" && <><Tabs defaultValue="overview" paramKey="progress"><TabsList><TabsTrigger value="overview">{t("demo.session.overview")}</TabsTrigger><TabsTrigger value="concepts">{t("demo.session.weakConcepts")}</TabsTrigger></TabsList><TabsContent value="overview" className="space-y-4">{statistics}{courseSection}{chapters}{documents}</TabsContent><TabsContent value="concepts">{concepts}</TabsContent></Tabs></>}
    {view === "history" && <Tabs defaultValue="activity" paramKey="history"><TabsList><TabsTrigger value="activity">{t("demo.session.dailyActivity")}</TabsTrigger><TabsTrigger value="monthly">{t("demo.session.monthlyActivity")}</TabsTrigger><TabsTrigger value="reviews">{t("demo.session.recentReviews")}</TabsTrigger><TabsTrigger value="assessments">{t("demo.session.assessments")}</TabsTrigger></TabsList><TabsContent value="activity">{history}<p className="mt-3 text-body-xs text-muted-foreground">{t("demo.session.scoresUnavailable")}</p></TabsContent><TabsContent value="monthly">{monthlyHistory}</TabsContent><TabsContent value="reviews">{reviews}</TabsContent><TabsContent value="assessments">{assessments}</TabsContent></Tabs>}
  </div>;
}
