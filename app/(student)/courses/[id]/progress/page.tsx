import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Target, History, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata, pageTitle } from "@/lib/site";
import { getCourse } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { getCourseLearningSummary } from "@/lib/learning-analytics";
import { StudyStatisticsCard } from "@/components/course/study-statistics-card";
import { RecentActivityCard } from "@/components/course/recent-activity-card";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");

  return createMetadata({
    title: course ? t("metadata.progressTitle", { course: course.title }) : t("metadata.progressTitleFallback"),
    description: t("metadata.progressDescription"),
    path: `/courses/${id}/progress`,
  });
}


export default async function CourseProgressPage({ params }: Props) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) notFound();

  const session = await getAuthSession();
  const studentId = session?.user?.id;
  const isEnrolled = await checkEnrollment(id);

  if (!isEnrolled) {
    return (
      <CoursePageShell title={<TranslatedText namespace="learning" messageKey="progress.title" values={{ course: course.title }} />} icon={BarChart3}>
        <Reveal>
          <div className="rounded-xl border border-brand-secondary/25 bg-brand-secondary/5 p-6">
            <h3 className="font-heading text-body-base font-bold text-brand-secondary">
              <TranslatedText namespace="learning" messageKey="courseAccess.limited" />
            </h3>
            <p className="mt-1 text-body-sm text-muted-foreground">
              <TranslatedText namespace="learning" messageKey="progress.enterToken" />
            </p>
            <div className="mt-4 max-w-md">
              <EnrollmentForm className="w-full" />
            </div>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  const learningSummary = studentId ? await getCourseLearningSummary(id, studentId) : null;

  return (
    <CoursePageShell title={<TranslatedText namespace="learning" messageKey="progress.title" values={{ course: course.title }} />} icon={BarChart3}>
      <Reveal>
        <div className="space-y-6">
          <StudyStatisticsCard data={learningSummary?.studyStatistics ?? null} />
          <RecentActivityCard data={learningSummary?.recentActivities ?? null} />

          <section className="text-left">
            <h3 className="mb-3 font-heading text-body-base font-bold text-foreground">
              <TranslatedText namespace="learning" messageKey="progress.moreAnalysis" />
            </h3>
            <div className="divide-y divide-border/40">
              <Link
                href={`/courses/${id}/mastery`}
                className="group flex items-center justify-between py-3 transition-colors hover:text-brand-primary"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                    <Target className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-body-sm font-semibold text-foreground group-hover:text-brand-primary">
                      <TranslatedText namespace="learning" messageKey="progress.masteryMap" />
                    </p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary" />
              </Link>

              <Link
                href={`/courses/${id}/my-results`}
                className="group flex items-center justify-between py-3 transition-colors hover:text-brand-primary"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-brand-secondary/10 text-brand-secondary">
                    <History className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-body-sm font-semibold text-foreground group-hover:text-brand-primary">
                      <TranslatedText namespace="learning" messageKey="progress.quizResults" />
                    </p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary" />
              </Link>
            </div>
          </section>
        </div>
      </Reveal>
    </CoursePageShell>
  );
}
