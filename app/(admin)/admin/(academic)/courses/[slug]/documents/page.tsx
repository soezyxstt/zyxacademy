import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { CourseDocumentsClient } from "@/app/(student)/courses/[id]/material/course-documents-client";
// DocumentListClient is composed inside CourseDocumentsClient for subcategory views
import { DocumentListClient } from "@/app/(student)/courses/[id]/material/document-list-client";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { listAdminCourseMaterials } from "@/lib/admin/course-material-preview";
import { getCourseDetailData } from "../../actions";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  return { title: pageTitle(t("metadata.pages.documentsTitle")) };
}

export default async function AdminCourseDocumentsPage({ params, searchParams }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug } = await params;
  const { tab } = await searchParams;
  const [data, identity] = await Promise.all([
    getCourseDetailData(slug),
    resolveCourseIdentity(slug),
  ]);
  if (!data || !identity) notFound();
  const materials = await listAdminCourseMaterials(identity);
  const chapters = data.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    orderIndex: chapter.orderIndex,
  }));

  return (
    <div className="space-y-4 font-sans">
      <CourseDetailHeader course={data.course} />
      <Suspense fallback={null}>
        <CourseDocumentsClient
          courseId={identity.primaryId}
          courseSlug={slug}
          courseTitle={data.course.title}
          materials={materials}
          chapters={chapters}
          defaultTab={tab}
          forcePageNavigation
          isAdmin
        />
      </Suspense>
    </div>
  );
}

