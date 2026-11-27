import "server-only";

import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { storage } from "@/lib/storage";
import {
  blogCategories,
  blogCategoryPreviewCount,
  blogFeaturedCount,
  blogPageSize,
  type BlogCategory,
  type PublicBlogCard,
} from "@/packages/native-parity/operations/public-contract";

const cardColumns = {
  id: true, slug: true, title: true, summary: true, status: true, category: true,
  thumbnailUrl: true, publishedAt: true, readMinutes: true,
} as const;

export type MarketingBlogCard = Pick<typeof blogArticles.$inferSelect, keyof typeof cardColumns>;

export async function readMarketingBlogList(category: BlogCategory | null, page: number, staff: boolean) {
  const status = staff ? inArray(blogArticles.status, ["published", "draft"]) : eq(blogArticles.status, "published");
  const filter = (value: BlogCategory | null) => and(status, value ? eq(blogArticles.category, value) : undefined);
  const cards = (value: BlogCategory | null, limit: number, offset = 0) => db.query.blogArticles.findMany({
    columns: cardColumns,
    where: filter(value),
    orderBy: [desc(blogArticles.publishedAt), desc(blogArticles.createdAt), desc(blogArticles.id)],
    limit,
    offset,
  });
  const [countRows, articles, sections] = await Promise.all([
    db.select({ total: count() }).from(blogArticles).where(filter(category)),
    category ? cards(category, blogPageSize, (page - 1) * blogPageSize) : cards(null, blogFeaturedCount),
    category ? [] : Promise.all(blogCategories.map(async ({ id }) => ({
      category: id,
      entries: await cards(id, blogFeaturedCount + blogCategoryPreviewCount),
    }))),
  ]);
  const featured = new Set(articles.map((article) => article.id));
  return {
    total: countRows[0]?.total ?? 0,
    articles,
    sections: sections.flatMap(({ category: value, entries }) => {
      const preview = entries.filter((article) => !featured.has(article.id)).slice(0, blogCategoryPreviewCount);
      return preview.length ? [{ category: value, entries: preview }] : [];
    }),
  };
}

export const readPublishedBlogArticle = cache(async (slug: string) => db.query.blogArticles.findFirst({
  columns: { ...cardColumns, content: true },
  where: and(eq(blogArticles.slug, slug), eq(blogArticles.status, "published")),
  with: { author: { columns: { name: true } } },
}));

export const readStaffBlogArticle = cache(async (slug: string) => db.query.blogArticles.findFirst({
  columns: { ...cardColumns, content: true },
  where: eq(blogArticles.slug, slug),
  with: { author: { columns: { name: true } } },
}));

export function readRelatedPublishedBlogArticles(articleId: string) {
  return db.query.blogArticles.findMany({
    columns: cardColumns,
    where: and(eq(blogArticles.status, "published"), ne(blogArticles.id, articleId)),
    orderBy: [desc(blogArticles.publishedAt)],
    limit: 5,
  });
}

export function projectPublicBlogCard(row: MarketingBlogCard): PublicBlogCard {
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    thumbnailUrl: row.thumbnailUrl?.startsWith("http") ? storage.getUrl(row.thumbnailUrl) : row.thumbnailUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    readMinutes: row.readMinutes,
  };
}
