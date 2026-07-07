"use server";

import { headers } from "next/headers";
import { db } from "@/db";
import {
  courses as coursesTable,
  aiMaterialInstances,
  websiteMaterials,
  diktats,
  courseMaterials,
  exams,
  quizTemplates,
  enrollments,
  blogArticles,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, gt, desc } from "drizzle-orm";
import { getSiteSearchDocuments } from "@/lib/site-search-index";
import type { SiteSearchDocument } from "@/lib/site-search-index";

export async function getStudentSearchDocuments(): Promise<SiteSearchDocument[]> {
  const staticDocs = getSiteSearchDocuments();
  const docs: SiteSearchDocument[] = [...staticDocs];
  
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    const user = session?.user;

    let dbCourses: any[] = [];
    if (!user?.id || user.role === "admin") {
      dbCourses = await db.select().from(coursesTable);
    } else {
      const now = new Date();
      dbCourses = await db
        .select({
          id: coursesTable.id,
          title: coursesTable.title,
          category: coursesTable.category,
          description: coursesTable.description,
        })
        .from(enrollments)
        .innerJoin(coursesTable, eq(enrollments.courseId, coursesTable.id))
        .where(
          and(
            eq(enrollments.userId, user.id),
            gt(enrollments.expiresAt, now)
          )
        );
    }

    for (const course of dbCourses) {
      docs.push({
        id: `course:${course.id}`,
        title: course.title,
        subtitle: `${course.category} · Course`,
        href: `/courses/${course.id}`,
        group: "Course",
        keywords: `${course.id} ${course.category} course`,
        content: `${course.title}. ${course.description || ""}`,
      });

      docs.push({
        id: `course:${course.id}:mastery`,
        title: `Penguasaan; ${course.title}`,
        subtitle: `Course · Mastery`,
        href: `/courses/${course.id}/mastery`,
        group: "Course",
        keywords: `mastery penguasaan ${course.title}`,
        content: `Peta penguasaan materi untuk ${course.title}`,
      });

      docs.push({
        id: `course:${course.id}:path`,
        title: `Jalur belajar; ${course.title}`,
        subtitle: `Course · Study Path`,
        href: `/courses/${course.id}/path`,
        group: "Course",
        keywords: `study path jalur belajar ${course.title}`,
        content: `Rencana studi terpersonalisasi untuk ${course.title}`,
      });

      docs.push({
        id: `course:${course.id}:flashcard`,
        title: `Flashcard; ${course.title}`,
        subtitle: `Course · Flashcard`,
        href: `/courses/${course.id}/flashcard`,
        group: "Course",
        keywords: `flashcard kartu ingatan ${course.title}`,
        content: `Kartu ingatan untuk ${course.title}`,
      });

      docs.push({
        id: `course:${course.id}:leaderboard`,
        title: `Papan skor; ${course.title}`,
        subtitle: `Course · Leaderboard`,
        href: `/courses/${course.id}/leaderboard`,
        group: "Course",
        keywords: `leaderboard papan skor peringkat ${course.title}`,
        content: `Papan peringkat siswa untuk ${course.title}`,
      });

      // Fetch materials
      const dbMats = await db
        .select({ id: aiMaterialInstances.id, title: aiMaterialInstances.title })
        .from(aiMaterialInstances)
        .where(eq(aiMaterialInstances.courseId, course.id));

      const dbDiktats = await db
        .select({ id: diktats.id, title: diktats.title })
        .from(diktats)
        .where(and(eq(diktats.courseId, course.id), eq(diktats.status, "ready")));

      const dbManuals = await db
        .select({ id: courseMaterials.id, title: courseMaterials.title, type: courseMaterials.type })
        .from(courseMaterials)
        .where(eq(courseMaterials.courseId, course.id));

      const dbWebMats = await db
        .select({ id: websiteMaterials.id, title: websiteMaterials.title })
        .from(websiteMaterials)
        .where(eq(websiteMaterials.courseId, course.id));

      dbMats.forEach((m) => {
        docs.push({
          id: `material:${course.id}:${m.id}`,
          title: m.title.replace(/^\[DRAF\]\s*/, ""),
          subtitle: `${course.title} · artikel`,
          href: `/courses/${course.id}/material/${m.id}`,
          group: "Materi",
          keywords: `article ${course.title} artikel`,
          content: m.title,
        });
      });

      dbDiktats.forEach((d) => {
        docs.push({
          id: `material:${course.id}:${d.id}`,
          title: d.title,
          subtitle: `${course.title} · PDF`,
          href: `/courses/${course.id}/material/${d.id}`,
          group: "Materi",
          keywords: `pdf ${course.title} PDF`,
          content: d.title,
        });
      });

      dbManuals.forEach((m) => {
        const kindLabel = m.type === "contoh_soal" ? "soal" : "materi";
        docs.push({
          id: `material:${course.id}:${m.id}`,
          title: m.title,
          subtitle: `${course.title} · PDF`,
          href: `/courses/${course.id}/material/${m.id}`,
          group: "Materi",
          keywords: `pdf ${course.title} PDF ${kindLabel}`,
          content: m.title,
        });
      });

      dbWebMats.forEach((m) => {
        docs.push({
          id: `material:${course.id}:${m.id}`,
          title: m.title,
          subtitle: `${course.title} · artikel`,
          href: `/courses/${course.id}/material/${m.id}`,
          group: "Materi",
          keywords: `article ${course.title} artikel`,
          content: m.title,
        });
      });

      // Fetch exams
      const dbQuizzes = await db
        .select({ id: quizTemplates.id, title: quizTemplates.title })
        .from(quizTemplates)
        .where(eq(quizTemplates.courseId, course.id));

      const dbTryouts = await db
        .select({ id: exams.id, title: exams.title })
        .from(exams)
        .where(and(eq(exams.courseId, course.id), eq(exams.type, "tryout"), eq(exams.status, "published")));

      dbQuizzes.forEach((q) => {
        docs.push({
          id: `exam:${course.id}:${q.id}`,
          title: q.title,
          subtitle: `${course.title} · Kuis`,
          href: `/courses/${course.id}/quiz/${q.id}`,
          group: "Evaluasi",
          keywords: `quiz ${course.title} ujian latihan soal`,
          content: q.title,
        });
      });

      dbTryouts.forEach((t) => {
        docs.push({
          id: `exam:${course.id}:${t.id}`,
          title: t.title,
          subtitle: `${course.title} · Tryout`,
          href: `/courses/${course.id}/tryout/${t.id}`,
          group: "Evaluasi",
          keywords: `tryout ${course.title} ujian latihan soal`,
          content: t.title,
        });
      });
    }

    // Fetch published blog articles
    const dbArticles = await db
      .select({
        id: blogArticles.id,
        title: blogArticles.title,
        slug: blogArticles.slug,
        category: blogArticles.category,
        summary: blogArticles.summary,
        tags: blogArticles.tags,
      })
      .from(blogArticles)
      .where(eq(blogArticles.status, "published"));

    dbArticles.forEach((article) => {
      const tagsStr = Array.isArray(article.tags) ? article.tags.join(" ") : "";
      docs.push({
        id: `blog:${article.id}`,
        title: article.title,
        subtitle: `Blog · ${article.category.replace("_", " ")}`,
        href: `/blog/${article.slug}`,
        group: "Materi",
        keywords: `blog article artikel ${article.category} ${tagsStr}`,
        content: `${article.title}. ${article.summary}`,
      });
    });

    return docs;
  } catch (error) {
    console.error("Error fetching student search documents, falling back to static:", error);
    return staticDocs;
  }
}
