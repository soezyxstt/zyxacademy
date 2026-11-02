import type { MetadataRoute } from "next";
import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PUBLIC_LOCALE_ROUTES, localizedPublicPath } from "@/lib/public-locale-routes";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : "https://www.zyxacademy.com");

  const indexableStaticPaths = PUBLIC_LOCALE_ROUTES.filter(
    (path) => !path.startsWith("/demo"),
  );
  const staticEntries: MetadataRoute.Sitemap = indexableStaticPaths.flatMap((path) => {
    const idPath = localizedPublicPath("id", path);
    const enPath = localizedPublicPath("en", path);
    if (!idPath || !enPath) return [];
    const priority = path === "/" ? 1 : path === "/blog" ? 0.9 : 0.7;
    const changeFrequency = (path === "/" || path === "/blog" ? "daily" : "weekly") as "daily" | "weekly";
    const alternates = { languages: { id: `${baseUrl}${idPath}`, en: `${baseUrl}${enPath}` } };
    return [idPath, enPath].map((localizedPath) => ({
      url: `${baseUrl}${localizedPath}`,
      changeFrequency,
      priority,
      alternates,
    }));
  });

  // Article bodies are authored and remain available at their existing URLs.
  // They have no English alternate until an actual translation is published.
  const articles = await db
    .select({ slug: blogArticles.slug, publishedAt: blogArticles.publishedAt })
    .from(blogArticles)
    .where(eq(blogArticles.status, "published"));

  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${baseUrl}/blog/${article.slug}`,
    lastModified: article.publishedAt ? new Date(article.publishedAt) : undefined,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [
    ...staticEntries,
    // The catalog shell is publicly readable, while individual course pages
    // redirect unauthenticated visitors and are never advertised here.
    { url: `${baseUrl}/courses`, changeFrequency: "weekly", priority: 0.7 },
    ...articleEntries,
  ];
}
