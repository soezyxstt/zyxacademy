import { projectPublicBlogCard, readPublishedBlogArticle, readRelatedPublishedBlogArticles } from "@/lib/blog/marketing-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const { slug } = await params;
  if (!slug || slug.length > 256 || /[\/\\]/.test(slug)) {
    return Response.json({ error: "missing" }, { status: 404, headers });
  }
  try {
    const article = await readPublishedBlogArticle(slug);
    if (!article) return Response.json({ error: "missing" }, { status: 404, headers });
    const related = await readRelatedPublishedBlogArticles(article.id);
    return Response.json({
      article: { ...projectPublicBlogCard(article), author: article.author?.name ?? null, content: article.content },
      related: related.map(projectPublicBlogCard),
    }, { headers });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
