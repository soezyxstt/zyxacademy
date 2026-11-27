import { projectPublicBlogCard, readMarketingBlogList } from "@/lib/blog/marketing-repository";
import { parseBlogQuery } from "@/packages/native-parity/operations/public-contract";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { category, page } = parseBlogQuery(searchParams.get("category"), searchParams.get("page"));
  try {
    const result = await readMarketingBlogList(category, page, false);
    return Response.json({
      total: result.total,
      articles: result.articles.map(projectPublicBlogCard),
      sections: result.sections.map((section) => ({
        category: section.category,
        entries: section.entries.map(projectPublicBlogCard),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
