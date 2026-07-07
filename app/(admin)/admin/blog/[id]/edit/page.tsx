import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await db.query.blogArticles.findFirst({
    where: eq(blogArticles.id, id)
  });

  if (!article) notFound();

  return (
    <div className="p-6">
      <MarkdownEditor initialData={article} />
    </div>
  );
}
