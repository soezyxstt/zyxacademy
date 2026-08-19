import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import { checkEnrollment, getDailyTrivia } from "@/app/(student)/dashboard/actions";
import { DailyQuizSection } from "@/components/course/daily-quiz-section";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { ChapterOutline } from "@/components/course/chapter-outline";
import { CourseTodayPlan } from "@/components/course/course-today-plan";
import { DashboardWeakConcepts } from "@/components/course/dashboard-weak-concepts";
import { studentCardClass } from "@/components/course/course-surfaces";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { getCourse, getCourseChapterOutline } from "@/lib/course-utils";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { StudyStatisticsCard } from "@/components/course/study-statistics-card";
import { RecentActivityCard } from "@/components/course/recent-activity-card";
import { getCourseLearningSummary, getCourseDailyPlan } from "@/lib/learning-analytics";
import { getMastery } from "@/lib/mastery-store";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  return {
    title: pageTitle(course ? course.title : "Kelas"),
    description: course?.description ?? "Ringkasan kelas",
  };
}

export default async function CourseOverviewPage({ params }: Props) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) return null;

  const session = await auth.api.getSession({ headers: await headers() });
  const studentId = session?.user?.id;

  // Independent reads run together to keep TTFB low.
  const [isEnrolled, dailyTrivia, chapterOutline] = await Promise.all([
    checkEnrollment(id),
    getDailyTrivia(id),
    getCourseChapterOutline(id, studentId),
  ]);

  const showDailyPlan = true;
  const showMastery = true;

  const [learningSummary, dailyPlan, masteryConcepts] =
    studentId && isEnrolled
      ? await Promise.all([
          getCourseLearningSummary(id, studentId),
          showDailyPlan ? getCourseDailyPlan(studentId, id) : Promise.resolve(null),
          showMastery ? getMastery(studentId, id) : Promise.resolve([]),
        ])
      : [null, null, [] as Awaited<ReturnType<typeof getMastery>>];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Course",
        name: course.title,
        description: course.description ?? undefined,
        provider: {
          "@type": "Organization",
          name: "Zyx Academy",
          sameAs: "https://www.zyxacademy.com",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Beranda", item: "https://www.zyxacademy.com" },
          { "@type": "ListItem", position: 2, name: "Courses", item: "https://www.zyxacademy.com/courses" },
          { "@type": "ListItem", position: 3, name: course.title },
        ],
      },
    ],
  };

  // Strip the dash-separated suffix list from the description copy
  const shortDescription = course.description ? course.description.split(" - ")[0] : "";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CoursePageShell title={course.title} description={shortDescription} icon={BookOpen}>
        <Reveal>
          {/* Enrollment banner (unenrolled only) */}
          {!isEnrolled && (
            <div className="mb-6 rounded-lg border border-brand-secondary/25 bg-brand-secondary/5 p-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] md:items-center">
                <div>
                  <h3 className="font-heading text-body-base font-bold text-brand-secondary">
                    Pratinjau gratis
                  </h3>
                  <p className="mt-1 max-w-2xl text-body-sm text-muted-foreground">
                    Dokumen terbuka. Token membuka kuis premium, tryout, peringkat, dan riwayat nilai.
                  </p>
                </div>
                <EnrollmentForm className="w-full" />
              </div>
            </div>
          )}

          {/* Learning loop (enrolled only): diagnose -> plan -> practice, mirrors the landing */}
          {isEnrolled && learningSummary && (
            <>
              <div
                className={cn(
                  "mb-6 grid gap-4",
                  showDailyPlan && dailyPlan && showMastery && "md:grid-cols-2",
                )}
              >
                {showDailyPlan && dailyPlan && <CourseTodayPlan plan={dailyPlan} />}
                {showMastery && (
                  <div className={studentCardClass("flex flex-col text-left")}>
                    <DashboardWeakConcepts
                      concepts={masteryConcepts}
                      courseTitle={course.title}
                    />
                    <Link
                      href={`/courses/${id}/mastery`}
                      className="mt-4 inline-flex items-center gap-1.5 text-body-sm font-semibold text-brand-primary hover:underline"
                    >
                      Lihat peta lengkap
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                )}
              </div>
              <div className="mb-6">
                <StudyStatisticsCard data={learningSummary.studyStatistics} />
              </div>
              <div className="mb-6">
                <RecentActivityCard data={learningSummary.recentActivities} />
              </div>
            </>
          )}

          {/* Syllabus: the chapters and their materials, with progress */}
          <div className="mb-6">
            <ChapterOutline courseId={id} chapters={chapterOutline} isEnrolled={isEnrolled} />
          </div>

          {/* Daily trivia (below the fold) */}
          <DailyQuizSection courseId={id} courseTitle={course.title} dailyTrivia={dailyTrivia} />
        </Reveal>
      </CoursePageShell>
    </>
  );
}
