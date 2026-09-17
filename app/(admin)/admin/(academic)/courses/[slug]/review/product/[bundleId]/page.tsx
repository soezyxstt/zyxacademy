import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { MaterialWorkspace } from "@/components/admin/material-workspace";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { resolveCourseIdentity, matchesCourseIdentity } from "@/lib/admin/course-identity";
import { getProductBundleImport } from "@/lib/bundle/product-staging";
import { pageTitle } from "@/lib/site";
import { getCourseDetailData } from "../../../../actions";
import { loadMaterialWorkspaceData } from "@/app/(admin)/admin/(academic)/materials/data";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string; bundleId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, bundleId } = await params;
  try {
    const [identity, bundle] = await Promise.all([
      resolveCourseIdentity(slug),
      getProductBundleImport(bundleId),
    ]);
    if (!identity || !bundle || !matchesCourseIdentity(bundle.courseId, identity)) {
      return { title: pageTitle("Review Product - Tidak Ditemukan") };
    }
    return {
      title: pageTitle(`Review Product - ${identity.title}`),
      description: `Review detail hasil generasi Product untuk mata kuliah ${identity.title}.`,
    };
  } catch {
    return { title: pageTitle("Review Product") };
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
      <CourseDetailHeader course={courseData.course} />
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
