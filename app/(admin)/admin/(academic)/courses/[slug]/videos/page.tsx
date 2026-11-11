import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards-server";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { CourseVideosClient } from "@/components/course/video/course-videos-client";
import { getCourseVideosData } from "@/app/actions/video-actions";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  return { title: pageTitle(t("metadata.pages.videosTitle")), description: t("metadata.pages.videosDescription") };
}

/**
 * Admin course video management page providing playlist authoring and video uploading.
 */
export default async function AdminCourseVideosPage({ params }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug } = await params;
  const data = await getCourseVideosData(slug);
  if (!data) notFound();

  return (
    <div className="space-y-4 font-sans">
      <CourseDetailHeader
        course={{
          id: data.course.id,
          title: data.course.title,
          category: data.course.category,
        }}
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
    </div>
  );
}
