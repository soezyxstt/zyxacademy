import { createFixturePublicClient, type PublicScenario } from "@/packages/native-parity/operations/public-fixtures";
import type { PublicBlogCard } from "@/packages/native-parity/operations/public-contract";
const client = createFixturePublicClient();
const card = (value: PublicBlogCard) => ({ ...value, id: value.slug, status: "published", publishedAt: value.publishedAt ? new Date(value.publishedAt) : null });
export async function readMarketingBlogList(category: Parameters<typeof client.blog>[0], page: number) {
  const data = await client.blog(category, page);
  return { ...data, articles: data.articles.map(card), sections: data.sections.map(section => ({ ...section, entries: section.entries.map(card) })) };
}
export async function readPublishedBlogArticle(slug: string) {
  const data = await client.article(slug);
  return data ? { ...card(data.article), content: data.article.content, author: { name: data.article.author } } : null;
}
export async function readStaffBlogArticle() { return null; }
export async function readRelatedPublishedBlogArticles(articleId: string) {
  const data = await client.article(articleId);
  return data?.related.map(card) ?? [];
}
