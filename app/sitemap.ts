import { MetadataRoute } from "next";
import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { eq } from "drizzle-orm";

// Cache sitemap for 24 hours to prevent heavy database queries on every crawler hit (P1-11)
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : "https://www.zyxacademy.com");

  // Public, indexable marketing pages only.
  const staticPaths = ["", "/about", "/plans", "/testimonial"];

  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${baseUrl}${path}`,
    changeFrequency: (path === "" ? "daily" : "weekly") as "daily" | "weekly",
    priority: path === "" ? 1.0 : 0.8,
  }));

  // Published blog articles
  const allBlogArticles = await db
    .select({ slug: blogArticles.slug, publishedAt: blogArticles.publishedAt })
    .from(blogArticles)
    .where(eq(blogArticles.status, "published"));

  const blogEntries: MetadataRoute.Sitemap = allBlogArticles.map((b) => ({
    url: `${baseUrl}/blog/${b.slug}`,
    lastModified: b.publishedAt ? new Date(b.publishedAt) : undefined,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const blogIndexEntry: MetadataRoute.Sitemap[number] = {
    url: `${baseUrl}/blog`,
    changeFrequency: "daily" as const,
    priority: 0.9,
  };

  return [...staticEntries, blogIndexEntry, ...blogEntries];
}
