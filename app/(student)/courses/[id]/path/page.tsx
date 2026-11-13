import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Compass } from "lucide-react";
import { checkFullCourseContentAccess } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { CourseStudyPathSkeleton } from "@/components/course/course-skeletons";
import { studentCardClass } from "@/components/course/course-surfaces";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata } from "@/lib/site";
import { getCourse } from "@/lib/course-utils";
import { StudyPathTimeline } from "@/components/course/study-path-timeline";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");
  return createMetadata({
    title: course ? t("metadata.pathTitle", { course: course.title }) : t("metadata.pathTitleFallback"),
    description: course?.description ?? t("metadata.pathDescription"),
    path: `/courses/${id}/path`,
  });
}

async function CoursePathContent({ id }: { id: string }) {
  const hasFullContentAccess = await checkFullCourseContentAccess(id);

  if (!hasFullContentAccess) {
    return (
      <Reveal>
        <div className={studentCardClass("mx-auto max-w-xl text-center py-12")}>
          <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="path.lockedTitle" /></h3>
          <p className="mt-2 text-body-sm text-muted-foreground leading-relaxed">
            <TranslatedText namespace="learning" messageKey="path.lockedDescription" />
          </p>
          <div className="mt-6 flex justify-center">
            <EnrollmentForm className="w-full max-w-sm" />
          </div>
        </div>
      </Reveal>
    );
  }

  return <StudyPathTimeline courseId={id} />;
}

export default async function CoursePathPage({ params }: Props) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) notFound();

  return (
    <CoursePageShell
      title={<TranslatedText namespace="learning" messageKey="path.title" values={{ course: course.title }} />}
      icon={Compass}
    >
      <Suspense fallback={<CourseStudyPathSkeleton />}>
        <CoursePathContent id={id} />
      </Suspense>
    </CoursePageShell>
  );
}
