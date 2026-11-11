import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { MaterialWorkspace } from "@/components/admin/material-workspace";
import { assertAdmin } from "@/lib/auth/admin-guards-server";
import { resolveCourseIdentity, matchesCourseIdentity } from "@/lib/admin/course-identity";
import { getProductBundleImport } from "@/lib/bundle/product-staging";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { getCourseDetailData } from "../../../../actions";
import { loadMaterialWorkspaceData } from "@/app/(admin)/admin/(academic)/materials/data";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string; bundleId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  const { slug, bundleId } = await params;
  try {
    const [identity, bundle] = await Promise.all([
      resolveCourseIdentity(slug),
      getProductBundleImport(bundleId),
    ]);
    if (!identity || !bundle || !matchesCourseIdentity(bundle.courseId, identity)) {
      return { title: pageTitle(t("metadata.pages.productReviewNotFound")) };
    }
    return {
      title: pageTitle(t("metadata.pages.productReviewCourseTitle", { course: identity.title })),
      description: t("metadata.pages.productReviewDescription", { course: identity.title }),
    };
  } catch {
    return { title: pageTitle(t("metadata.pages.productReviewFallbackTitle")) };
  }
}

export default async function CourseProductReviewDetailPage({ params }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug, bundleId } = await params;

  const [courseData, identity, bundle] = await Promise.all([
    getCourseDetailData(slug),
    resolveCourseIdentity(slug),
    getProductBundleImport(bundleId),
  ]);

  if (!courseData || !identity || !bundle || !matchesCourseIdentity(bundle.courseId, identity)) {
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

  return (
    <div className="space-y-4 font-sans">
      <CourseDetailHeader
        course={courseData.course}
        breadcrumbs={[
          { label: "Mata Kuliah", href: "/admin/courses" },
          { label: identity.title, href: `/admin/courses/${encodeURIComponent(identity.slug)}` },
          { label: "Review Materi", href: `/admin/courses/${encodeURIComponent(identity.slug)}/review?tab=product` },
          { label: "Product Bundle" },
        ]}
      />
      <MaterialWorkspace
        {...data}
        mode="product-detail"
        detailId={bundleId}
        lockedCourse={lockedCourse}
        backHref={`/admin/courses/${encodeURIComponent(identity.slug)}/review?tab=product`}
        backLabel={`Kembali ke Review ${identity.title}`}
        hideHeader
      />
    </div>
  );
}
