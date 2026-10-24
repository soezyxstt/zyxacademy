import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminDocumentWorkspace } from "@/components/admin/course-detail/admin-document-workspace";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { getAdminCourseMaterialPreview } from "@/lib/admin/course-material-preview";
import { getCourseDetailData } from "../../../actions";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

type Props = {
  params: Promise<{ slug: string; materialId: string }>;
  searchParams: Promise<{ mode?: "preview" | "edit" }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  return { title: pageTitle(t("metadata.pages.manageDocumentTitle")) };
}

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
    legacyChapterId: ch.legacyChapterId ?? null,
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
          status: (preview.status ?? "published") as "draft" | "published",
          source: preview.source,
          body: preview.contentMarkdown,
          chapterId: preview.babId ?? preview.article.chapterId ?? undefined,
          chapterIds: [preview.babId ?? preview.article.chapterId].filter((id): id is string => Boolean(id)),
        }
      : preview.material;

  const article = preview.renderer === "structured" ? preview.article : null;

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
      initialMode={mode === "edit" ? "edit" : "preview"}
    />
  );
}


