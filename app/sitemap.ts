import { MetadataRoute } from "next";
import { db } from "@/db";
import { courses, aiMaterialInstances, diktats, quizTemplates, exams, blogArticles } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : "https://www.zyxacademy.com");

  const staticPaths = ["", "/about", "/plans", "/testimonial", "/courses"];

  const staticEntries = staticPaths.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: path === "" ? 1.0 : 0.8,
  }));

  const allCourses = await db
    .select({ id: courses.id })
    .from(courses);

  const courseEntries = allCourses.flatMap((c) => [
    {
      url: `${baseUrl}/courses/${c.id}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/courses/${c.id}/leaderboard`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.3,
    },
    {
      url: `${baseUrl}/courses/${c.id}/mastery`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.4,
    },
    {
      url: `${baseUrl}/courses/${c.id}/path`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/courses/${c.id}/flashcard`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.4,
    },
  ]);

  const allMaterials = await db
    .select({ id: aiMaterialInstances.id, courseId: aiMaterialInstances.courseId })
    .from(aiMaterialInstances);

  const materialEntries = allMaterials.map((m) => ({
    url: `${baseUrl}/courses/${m.courseId}/material/${m.id}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const allDiktats = await db
    .select({ id: diktats.id, courseId: diktats.courseId })
    .from(diktats)
    .where(eq(diktats.status, "ready"));

  const diktatEntries = allDiktats.map((d) => ({
    url: `${baseUrl}/courses/${d.courseId}/material/${d.id}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  const allQuizzes = await db
    .select({ id: quizTemplates.id, courseId: quizTemplates.courseId })
    .from(quizTemplates);

  const quizEntries = allQuizzes.map((q) => ({
    url: `${baseUrl}/courses/${q.courseId}/quiz/${q.id}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  const allTryouts = await db
    .select({ id: exams.id, courseId: exams.courseId })
    .from(exams)
    .where(and(eq(exams.type, "tryout"), eq(exams.status, "published")));

  const tryoutEntries = allTryouts.map((t) => ({
    url: `${baseUrl}/courses/${t.courseId}/tryout/${t.id}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  const allBlogArticles = await db
    .select({ slug: blogArticles.slug, publishedAt: blogArticles.publishedAt })
    .from(blogArticles)
    .where(eq(blogArticles.status, "published"));

  const blogEntries = allBlogArticles.map((b) => ({
    url: `${baseUrl}/blog/${b.slug}`,
    lastModified: b.publishedAt ? new Date(b.publishedAt) : new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const blogIndexEntry = {
    url: `${baseUrl}/blog`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.9,
  };

  return [
    ...staticEntries,
    blogIndexEntry,
    ...blogEntries,
    ...courseEntries,
    ...materialEntries,
    ...diktatEntries,
    ...quizEntries,
    ...tryoutEntries,
  ];
}
