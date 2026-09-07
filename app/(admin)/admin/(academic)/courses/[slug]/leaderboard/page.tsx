import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { AdminLeaderboardClient } from "@/components/admin/leaderboard/admin-leaderboard-client";
import { getCourseDetailData } from "../../actions";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const courseIdentity = await resolveCourseIdentity(slug);
    if (!courseIdentity) {
      return { title: pageTitle("Papan Peringkat") };
    }
    return {
      title: pageTitle(`Papan Peringkat: ${courseIdentity.title}`),
      description: `Peringkat siswa untuk mata kuliah ${courseIdentity.title}.`,
    };
  } catch {
    return { title: pageTitle("Papan Peringkat") };
  }
}

export default async function AdminCourseLeaderboardPage({ params }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug } = await params;
  const data = await getCourseDetailData(slug);
  if (!data) notFound();

  const courseIdentity = await resolveCourseIdentity(slug);
  const compatibleCourseIds = courseIdentity ? courseIdentity.allIds : [data.course.id];

  return (
    <div className="space-y-4 font-sans">
      <CourseDetailHeader course={data.course} />
      <AdminLeaderboardClient
        lockedCourse={{
          id: data.course.id,
          slug,
          title: data.course.title,
          compatibleCourseIds,
        }}
        backHref={`/admin/courses/${encodeURIComponent(slug)}`}
        backLabel={`Kembali ke ${data.course.title}`}
      />
    </div>
  );
}
