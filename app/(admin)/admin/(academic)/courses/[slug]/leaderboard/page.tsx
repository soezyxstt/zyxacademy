import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { AdminLeaderboardClient } from "@/components/admin/leaderboard/admin-leaderboard-client";
import { getCourseDetailData } from "../../actions";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  const { slug } = await params;
  try {
    const courseIdentity = await resolveCourseIdentity(slug);
    if (!courseIdentity) {
      return { title: pageTitle(t("metadata.pages.leaderboardTitle")) };
    }
    return {
      title: pageTitle(t("metadata.pages.leaderboardCourseTitle", { course: courseIdentity.title })),
      description: t("metadata.pages.leaderboardDescription", { course: courseIdentity.title }),
    };
  } catch {
    return { title: pageTitle(t("metadata.pages.leaderboardTitle")) };
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
        hideHeader
      />
    </div>
  );
}
