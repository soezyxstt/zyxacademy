import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import { pageTitle } from "@/lib/site";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { CourseVideosClient } from "@/components/course/video/course-videos-client";
import { getCourseVideosData } from "@/app/actions/video-actions";
import { Video as VideoIcon } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

type Props = {
  params: Promise<{ courseId: string }>;
};

/**
 * Generates page metadata for the tutor course video management page.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  const t = await getTranslations("tutor.routeTitles");
  return {
    title: pageTitle(t("videos")),
    description: t("videosDescription", { courseId }),
  };
}

/**
 * Tutor course video management page rendering playlist controls and video upload tools.
 */
export default async function TutorCourseVideosPage({ params }: Props) {
  const { courseId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/tutor");

  try {
    await requireTutorCourseAccess(session.user.id, courseId, { allowAdmin: true });
  } catch {
    redirect("/tutor");
  }

  const data = await getCourseVideosData(courseId);
  if (!data) notFound();

  return (
    <ApplicationPage spacing="space-y-6">
      <PageHeader
        title={<><TranslatedText namespace="tutor" messageKey="routeTitles.videos" />: {data.course.title}</>}
        icon={VideoIcon}
        backHref={`/tutor/${courseId}`}
        backLabel={<TranslatedText namespace="tutor" messageKey="routeTitles.backToCourse" />}
      />
      <Suspense fallback={null}>
        <CourseVideosClient
          courseId={data.course.id}
          courseSlug={data.courseSlug}
          courseTitle={data.course.title}
          initialPlaylists={data.playlists}
          chapters={data.chapters}
          canManage={true}
        />
      </Suspense>
    </ApplicationPage>
  );
}
