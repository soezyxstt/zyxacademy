import { StudentCourseProgressView } from "@/components/course/student-course-progress-view";
import { Suspense } from "react";
import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { notFound } from "next/navigation";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { CourseProgressContentSkeleton } from "@/components/course/course-skeletons";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata } from "@/lib/site";
import { getCourse } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { getCourseLearningSummary } from "@/lib/learning-analytics";
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

async function CourseProgressSummarySection({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId?: string;
}) {
  const isEnrolled = await checkEnrollment(courseId);

  if (!isEnrolled) {
    return (
      <div className="rounded-xl border border-brand-secondary/25 bg-brand-secondary/5 p-4">
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
    );
  }

  const learningSummary = studentId ? await getCourseLearningSummary(courseId, studentId) : null;

  return <StudentCourseProgressView courseId={courseId} statistics={learningSummary?.studyStatistics ?? null} activities={learningSummary?.recentActivities ?? null} />;
}

export default async function CourseProgressPage({ params }: Props) {
  const { id } = await params;
  const [course, session] = await Promise.all([
    getCourse(id),
    getAuthSession(),
  ]);
  if (!course) notFound();

  const studentId = session?.user?.id;

  return (
    <CoursePageShell title={<TranslatedText namespace="learning" messageKey="progress.title" values={{ course: course.title }} />} icon={BarChart3}>
      <Reveal>
        <Suspense fallback={<CourseProgressContentSkeleton />}>
          <CourseProgressSummarySection courseId={id} studentId={studentId} />
        </Suspense>
      </Reveal>
    </CoursePageShell>
  );
}
