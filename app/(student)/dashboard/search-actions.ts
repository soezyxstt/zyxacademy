"use server";

import { headers } from "next/headers";
import { db } from "@/db";
import {
  aiMaterialInstances,
  websiteMaterials,
  diktats,
  courseMaterials,
  exams,
  quizTemplates,
  blogArticles,
  artikel,
  bab,
  diktatMateri,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { getSiteSearchDocuments, isMarketingHref } from "@/lib/site-search-index";
import type { SiteSearchDocument } from "@/lib/site-search-index";
import { listStudentCourses } from "@/lib/student/course-catalog";
import { resolveStudentSearchCandidates, type StudentSearchCandidate } from "@/lib/search/student-course-results";

export async function getStudentSearchDocuments(): Promise<SiteSearchDocument[]> {
  const staticDocs = getSiteSearchDocuments();
  const docs: SiteSearchDocument[] = [...staticDocs];
  
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    const user = session?.user;

    if (!user?.id) return staticDocs.filter((doc) => isMarketingHref(doc.href));
    const dbCourses = await listStudentCourses();

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
      const legacyCourseId = course.legacyId ?? course.id;
      const canonicalArticles = course.canonicalId
        ? await db
            .select({
              id: artikel.id,
              title: artikel.title,
              babId: artikel.babId,
              legacyChapterId: bab.legacyChapterId,
            })
            .from(artikel)
            .leftJoin(bab, eq(artikel.babId, bab.id))
            .where(and(eq(artikel.mataKuliahId, course.canonicalId), eq(artikel.status, "published")))
        : [];
      const canonicalDiktats = course.canonicalId
        ? await db
            .select({ id: diktatMateri.id, title: diktatMateri.title })
            .from(diktatMateri)
            .where(and(eq(diktatMateri.mataKuliahId, course.canonicalId), eq(diktatMateri.status, "published")))
        : [];
      const dbMats = await db
        .select({ id: aiMaterialInstances.id, title: aiMaterialInstances.title })
        .from(aiMaterialInstances)
        .where(eq(aiMaterialInstances.courseId, legacyCourseId));

      const dbDiktats = await db
        .select({ id: diktats.id, title: diktats.title })
        .from(diktats)
        .where(and(eq(diktats.courseId, legacyCourseId), eq(diktats.status, "ready")));

      const dbManuals = await db
        .select({
          id: courseMaterials.id,
          title: courseMaterials.title,
          type: courseMaterials.type,
          subcategory: courseMaterials.subcategory,
          year: courseMaterials.year,
        })
        .from(courseMaterials)
        .where(eq(courseMaterials.courseId, legacyCourseId));

      const dbWebMats = await db
        .select({ id: websiteMaterials.id, title: websiteMaterials.title, chapterId: websiteMaterials.chapterId })
        .from(websiteMaterials)
        .where(eq(websiteMaterials.courseId, legacyCourseId));

      canonicalArticles.forEach((article) => {
        docs.push({
          id: `material:${course.id}:${article.id}`,
          title: article.title,
          subtitle: `${course.title} · Artikel`,
          href: `/courses/${course.id}/material/${article.id}`,
          group: "Materi",
          keywords: `artikel canonical ${course.title}`,
          content: article.title,
        });
      });
      canonicalDiktats.forEach((diktat) => {
        docs.push({
          id: `material:${course.id}:${diktat.id}`,
          title: diktat.title,
          subtitle: `${course.title} · Diktat`,
          href: `/courses/${course.id}/material/${diktat.id}`,
          group: "Materi",
          keywords: `diktat canonical ${course.title}`,
          content: diktat.title,
        });
      });

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
        const kindLabel = m.type === "contoh_soal" || m.type === "soal" ? "soal" : m.type === "pembahasan_soal" ? "pembahasan soal solusi" : "materi";
        const subLabel = m.subcategory ? ` ${m.subcategory}` : "";
        const yearLabel = m.year ? ` ${m.year}` : "";
        docs.push({
          id: `material:${course.id}:${m.id}`,
          title: m.title,
          subtitle: `${course.title} · PDF${yearLabel}`,
          href: `/courses/${course.id}/material/${m.id}`,
          group: "Materi",
          keywords: `pdf ${course.title} PDF ${kindLabel}${subLabel}${yearLabel}`,
          content: m.title,
        });
      });

      const canonicalChapterIds = new Set(
        canonicalArticles.flatMap((article) => [article.babId, article.legacyChapterId].filter((id): id is string => Boolean(id))),
      );
      dbWebMats.filter((material) => !canonicalChapterIds.has(material.chapterId)).forEach((m) => {
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
        .where(eq(quizTemplates.courseId, legacyCourseId));

      const dbTryouts = await db
        .select({ id: exams.id, title: exams.title })
        .from(exams)
        .where(and(eq(exams.courseId, legacyCourseId), eq(exams.type, "tryout"), eq(exams.status, "published")));

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

    if (user.role !== "admin" && user.role !== "teacher") {
      const candidates = new Map<SiteSearchDocument, StudentSearchCandidate>();
      for (const doc of docs) {
        const match = /^\/courses\/([^/]+)(?:\/(material|quiz|tryout)\/([^/]+))?/.exec(doc.href);
        if (!match) continue;
        const [, courseId, section, entityId] = match;
        candidates.set(doc, { courseId, entityId: entityId ?? courseId, type: section === "tryout" ? "exam" : section ?? "course" });
      }
      const allowed = await resolveStudentSearchCandidates(user.id, [...candidates.values()]);
      for (let index = docs.length - 1; index >= 0; index--) {
        const candidate = candidates.get(docs[index]);
        if (!candidate) continue;
        const title = allowed.get(candidate);
        if (!title) docs.splice(index, 1);
        else {
          const section = candidate.type === "course" ? docs[index].href.split("/")[3] : undefined;
          const label: Record<string, string> = { mastery: "Penguasaan", path: "Jalur belajar", flashcard: "Flashcard", leaderboard: "Papan skor" };
          const safeTitle = section && label[section] ? `${label[section]}; ${title}` : title;
          docs[index] = { ...docs[index], title: safeTitle, subtitle: "", keywords: safeTitle, content: safeTitle };
        }
      }
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
    return staticDocs.filter((doc) => isMarketingHref(doc.href));
  }
}

export async function getMarketingSearchDocuments(): Promise<SiteSearchDocument[]> {
  const staticDocs = getSiteSearchDocuments().filter((doc) => isMarketingHref(doc.href));
  const docs: SiteSearchDocument[] = [...staticDocs];

  try {
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
        group: "Materi & Artikel",
        keywords: `blog article artikel ${article.category} ${tagsStr}`,
        content: `${article.title}. ${article.summary || ""}`,
      });
    });

    return docs;
  } catch (error) {
    console.error("Error fetching marketing search documents, falling back to static:", error);
    return staticDocs;
  }
}

