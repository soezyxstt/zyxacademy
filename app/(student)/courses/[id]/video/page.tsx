import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { Video as VideoIcon } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { CourseVideoListSkeleton } from "@/components/course/course-skeletons";
import { createMetadata } from "@/lib/site";
import { getAuthSession } from "@/lib/auth-session";
import { getCourse } from "@/lib/course-utils";
import { getCourseVideosData } from "@/app/actions/video-actions";
import { CourseVideosClient } from "@/components/course/video/course-videos-client";
import { Reveal } from "@/components/ui/reveal";

import { EnrollmentForm } from "@/components/enrollment-form";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * Generates page metadata for the student course video page using resolved course identity.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const identity = await resolveCourseIdentity(id);
  const title = identity?.title || "Video";
  const t = await getTranslations("learning");

  return createMetadata({
    title: t("metadata.videoTitle", { course: title }),
    description: t("metadata.videoDescription", { course: title }),
    path: `/courses/${id}/video`,
  });
}

async function CourseVideosContent({
  id,
  userId,
  roleHint,
}: {
  id: string;
  userId: string;
  roleHint?: string | null;
}) {
  const [access, data] = await Promise.all([
    resolveCourseAccess({
      courseId: id,
      userId,
      roleHint,
    }),
    getCourseVideosData(id),
  ]);

  if (!data) notFound();
  const isEnrolled = access.isEnrolled || access.tier === "staff";

  return (
    <Reveal>
      {!isEnrolled && (
        <div className="mb-6 rounded-lg border border-brand-secondary/25 bg-brand-secondary/5 p-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] md:items-center">
            <div>
              <h3 className="font-heading text-body-base font-bold text-brand-secondary">
                <TranslatedText namespace="learning" messageKey="quizPage.activationTitle" />
              </h3>
              <p className="mt-1 max-w-2xl text-body-sm text-muted-foreground">
                <TranslatedText namespace="learning" messageKey="videoPage.activationDescription" />
              </p>
            </div>
            <EnrollmentForm className="w-full" />
          </div>
        </div>
      )}
      <CourseVideosClient
        courseId={data.course.id}
        courseSlug={data.courseSlug}
        courseTitle={data.course.title}
        initialPlaylists={data.playlists}
        chapters={data.chapters}
        canManage={false}
        isEnrolled={isEnrolled}
      />
    </Reveal>
  );
}

/**
 * Student course video page rendering playlists and videos for enrolled learners.
 */
export default async function StudentCourseVideosPage({ params }: Props) {
  const { id } = await params;

  const [session, course] = await Promise.all([
    getAuthSession(),
    getCourse(id),
  ]);
  if (!session?.user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/video`)}`);
  }
  if (!course) notFound();

  return (
    <CoursePageShell
      title={<TranslatedText namespace="learning" messageKey="videoPage.title" values={{ course: course.title }} />}
      icon={VideoIcon}
      backHref={`/courses/${id}`}
      backLabel={<TranslatedText namespace="learning" messageKey="videoPage.backToCourse" />}
    >
      <Suspense fallback={<CourseVideoListSkeleton />}>
        <CourseVideosContent
          id={id}
          userId={session.user.id}
          roleHint={(session.user as { role?: string | null }).role}
        />
      </Suspense>
    </CoursePageShell>
  );
}
