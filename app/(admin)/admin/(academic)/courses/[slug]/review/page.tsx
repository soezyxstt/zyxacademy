import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { MaterialWorkspace } from "@/components/admin/material-workspace";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { getCourseDetailData } from "../../actions";
import { loadMaterialWorkspaceData } from "../../../materials/data";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ section?: string; tab?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  const { slug } = await params;
  try {
    const identity = await resolveCourseIdentity(slug);
    if (!identity) {
      return { title: pageTitle(t("metadata.pages.reviewNotFound")) };
    }
    return {
      title: pageTitle(t("metadata.pages.reviewCourseTitle", { course: identity.title })),
      description: t("metadata.pages.reviewDescription", { course: identity.title }),
    };
  } catch {
    return { title: pageTitle(t("metadata.pages.reviewFallbackTitle")) };
  }
}

export default async function AdminCourseReviewPage({ params, searchParams }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug } = await params;
  const { section, tab } = await searchParams;

  const [courseData, identity] = await Promise.all([
    getCourseDetailData(slug),
    resolveCourseIdentity(slug),
  ]);

  if (!courseData || !identity) {
    notFound();
  }

  const data = await loadMaterialWorkspaceData({
    courseIds: identity.allIds,
  });

  const lockedCourse = {
    id: identity.primaryId,
    title: identity.title,
    slug: identity.slug,
  };

  const selectedTab = tab ?? section;
  const initialReviewTab = selectedTab === "product" ? "product" : "idea";

  return (
    <div className="space-y-4 font-sans">
      <CourseDetailHeader
        course={courseData.course}
        breadcrumbs={[
          { label: "Mata Kuliah", href: "/admin/courses" },
          { label: identity.title, href: `/admin/courses/${encodeURIComponent(identity.slug)}` },
          { label: "Review Materi" },
        ]}
      />
      <MaterialWorkspace
        {...data}
        mode="review"
        initialReviewTab={initialReviewTab}
        lockedCourse={lockedCourse}
        backHref={`/admin/courses/${encodeURIComponent(identity.slug)}/review`}
        backLabel={`Kembali ke Review ${identity.title}`}
        hideHeader
      />
    </div>
  );
}
