import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { DocumentListClient } from "@/app/(student)/courses/[id]/material/document-list-client";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { listAdminCourseMaterials } from "@/lib/admin/course-material-preview";
import { getCourseDetailData } from "../../actions";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export const metadata: Metadata = {
  title: pageTitle("Dokumen Mata Kuliah"),
};

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
        <DocumentListClient
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

