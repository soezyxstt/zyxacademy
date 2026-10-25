import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PenLine } from "lucide-react";
import { TranslatedText } from "@/components/i18n/translated-text";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await db.query.blogArticles.findFirst({
    where: eq(blogArticles.id, id)
  });

  if (!article) notFound();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={PenLine}
        title={<TranslatedText namespace="adminOps" messageKey="blogList.edit" />}
        description={article.title}
        backHref="/admin/blog"
      />
      <MarkdownEditor initialData={article} />
    </div>
  );
}
