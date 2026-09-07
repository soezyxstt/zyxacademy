import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { AdminMaterialPreviewBar } from "@/components/admin/course-detail/admin-material-preview-bar";
import { MaterialViewer } from "@/components/course/material-viewer";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { getAdminCourseMaterialPreview } from "@/lib/admin/course-material-preview";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";

type Props = {
  params: Promise<{ slug: string; materialId: string }>;
};

export const metadata: Metadata = { title: pageTitle("Preview Materi") };

export default async function AdminCourseMaterialPreviewPage({ params }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug, materialId } = await params;
  const identity = await resolveCourseIdentity(slug);
  if (!identity) notFound();

  const preview = await getAdminCourseMaterialPreview(identity, materialId);
  if (!preview) notFound();

  const documentsHref = `/admin/courses/${encodeURIComponent(slug)}/documents`;
  const title = preview.renderer === "structured" ? preview.article.title : preview.material.title;

  return (
    <div className="min-h-screen bg-background font-sans">
      <AdminMaterialPreviewBar
        source={preview.source}
        materialId={materialId}
        courseSlug={slug}
        title={title}
      />
      {preview.renderer === "structured" ? (
        <StructuredArticleReader
          article={preview.article}
          course={{ id: identity.primaryId, title: identity.title }}
          mode="admin-preview"
          backHref={documentsHref}
        />
      ) : (
        <Suspense fallback={<div className="p-8 text-body-sm text-muted-foreground">Memuat preview...</div>}>
          <MaterialViewer
            material={preview.material}
            chapterId={preview.material.chapterId}
            course={{ title: identity.title }}
            mode="admin-preview"
            backHref={documentsHref}
          />
        </Suspense>
      )}
    </div>
  );
}
