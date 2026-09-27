import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { Video as VideoIcon } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { pageTitle } from "@/lib/site";
import { getCourseVideosData } from "@/app/actions/video-actions";
import { CourseVideosClient } from "@/components/course/video/course-videos-client";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Reveal } from "@/components/ui/reveal";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getCourseVideosData(id);
  const title = data?.course?.title || "Video";

  return {
    title: pageTitle(`${title} - Video`),
    description: `Playlist dan video pembelajaran untuk ${title}.`,
  };
}

export default async function StudentCourseVideosPage({ params }: Props) {
  const { id } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/video`)}`);
  }

  const data = await getCourseVideosData(id);
  if (!data) notFound();

  return (
    <CoursePageShell
      title={`Video: ${data.course.title}`}
      icon={VideoIcon}
      backHref={`/courses/${id}`}
      backLabel="Kembali ke Kelas"
    >
      <Reveal>
        <Suspense fallback={null}>
          <CourseVideosClient
            courseId={data.course.id}
            courseSlug={data.courseSlug}
            courseTitle={data.course.title}
            initialPlaylists={data.playlists}
            chapters={data.chapters}
            canManage={false}
          />
        </Suspense>
      </Reveal>
    </CoursePageShell>
  );
}
