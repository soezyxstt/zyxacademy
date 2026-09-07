import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { AdminMaterialPreviewBar } from "@/components/admin/course-detail/admin-material-preview-bar";
import { AdminDocumentWorkspace } from "@/components/admin/course-detail/admin-document-workspace";
import { MaterialViewer } from "@/components/course/material-viewer";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { getAdminCourseMaterialPreview } from "@/lib/admin/course-material-preview";
import { getCourseDetailData } from "../../../actions";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";

type Props = {
  params: Promise<{ slug: string; materialId: string }>;
  searchParams: Promise<{ mode?: "preview" | "edit" }>;
};

export const metadata: Metadata = { title: pageTitle("Kelola Dokumen") };

export default async function AdminCourseMaterialPreviewPage({ params, searchParams }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug, materialId } = await params;
  const { mode } = await searchParams;

  const [identity, data] = await Promise.all([
    resolveCourseIdentity(slug),
    getCourseDetailData(slug),
  ]);

  if (!identity || !data) notFound();

  const preview = await getAdminCourseMaterialPreview(identity, materialId);
  if (!preview) notFound();

  const chapters = data.chapters.map((ch) => ({
    id: ch.id,
    courseId: ch.courseId,
    title: ch.title,
    orderIndex: ch.orderIndex,
  }));

  const material =
    preview.renderer === "structured"
      ? {
          id: preview.article.id,
          courseId: identity.primaryId,
          title: preview.article.title,
          kind: "article" as const,
          docCategory: "materi" as const,
          tabGroup: "materi" as const,
          fileSize: "Artikel",
          completed: false,
          isPastYear: false,
          isPreview: false,
          status: "published" as const,
          source: preview.source,
          chapterId: preview.article.chapterId ?? undefined,
        }
      : preview.material;

  const article = preview.renderer === "structured" ? preview.article : null;

  if (mode === "edit") {
    return (
      <AdminDocumentWorkspace
        courseSlug={slug}
        courseTitle={identity.title}
        courseId={identity.primaryId}
        materialId={materialId}
        source={preview.source}
        material={material}
        article={article}
        chapters={chapters}
        initialMode="edit"
      />
    );
  }

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


