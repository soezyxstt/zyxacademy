import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { Video as VideoIcon } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { createMetadata, pageTitle } from "@/lib/site";
import { getCourseVideosData } from "@/app/actions/video-actions";
import { CourseVideosClient } from "@/components/course/video/course-videos-client";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Reveal } from "@/components/ui/reveal";

import { EnrollmentForm } from "@/components/enrollment-form";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { resolveCourseAccess } from "@/lib/student/course-access";

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

  return createMetadata({
    title: `Video Pembelajaran ${title}`,
    description: `Playlist dan video pembelajaran untuk ${title}.`,
    path: `/courses/${id}/video`,
  });
}


/**
 * Student course video page rendering playlists and videos for enrolled learners.
 */
export default async function StudentCourseVideosPage({ params }: Props) {
  const { id } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/video`)}`);
  }

  const access = await resolveCourseAccess({
    courseId: id,
    userId: session.user.id,
    roleHint: (session.user as { role?: string | null }).role,
  });

  const isEnrolled = access.isEnrolled || access.tier === "staff";

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
        {!isEnrolled && (
          <div className="mb-6 rounded-lg border border-brand-secondary/25 bg-brand-secondary/5 p-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] md:items-center">
              <div>
                <h3 className="font-heading text-body-base font-bold text-brand-secondary">
                  Aktivasi token kelas
                </h3>
                <p className="mt-1 max-w-2xl text-body-sm text-muted-foreground">
                  Masukkan token kelas untuk membuka seluruh video dan materi.
                </p>
              </div>
              <EnrollmentForm className="w-full" />
            </div>
          </div>
        )}
        <Suspense fallback={null}>
          <CourseVideosClient
            courseId={data.course.id}
            courseSlug={data.courseSlug}
            courseTitle={data.course.title}
            initialPlaylists={data.playlists}
            chapters={data.chapters}
            canManage={false}
            isEnrolled={isEnrolled}
          />
        </Suspense>
      </Reveal>
    </CoursePageShell>
  );
}
