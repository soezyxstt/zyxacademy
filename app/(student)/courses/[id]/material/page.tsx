import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { pageTitle } from "@/lib/site";
import { getCourse, getCourseChapterOutline } from "@/lib/course-utils";
import { DocumentListClient } from "./document-list-client";
import { Reveal } from "@/components/ui/reveal";
import { db } from "@/db";
import { aiMaterialInstances, websiteMaterials, diktats, diktatMateri, bab, courseMaterials, progress, studentMaterialProgress } from "@/db/schema";
import { eq, and, notLike } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getCanonicalPublishedArticlesForCourse } from "@/lib/articles/structured-repository";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);

  return {
    title: pageTitle(course ? `${course.title} - Materi` : "Materi"),
    description: course
      ? `Dokumen dan materi belajar ${course.title}; modul, diktat, dan contoh soal.`
      : "Dokumen dan materi belajar; modul, diktat, dan contoh soal.",
  };
}

export default async function CourseMaterialListPage({ params }: Props) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) return null;
  const compatibilityCourseId = course.legacyId ?? id;

  const session = await auth.api.getSession({ headers: await headers() });
  const studentId = session?.user?.id;

  const completedMaterialIds = new Set<string>();
  if (studentId) {
    try {
      const userProgress = await db
        .select({
          materialId: studentMaterialProgress.materialId,
          completionPercent: studentMaterialProgress.completionPercent,
        })
        .from(studentMaterialProgress)
        .where(eq(studentMaterialProgress.studentId, studentId));

      for (const p of userProgress) {
        if (p.completionPercent >= 90) {
          completedMaterialIds.add(p.materialId);
        }
      }

      const legacyProgress = await db
        .select({ materialId: progress.materialId })
        .from(progress)
        .where(and(eq(progress.userId, studentId), eq(progress.status, "completed")));

      for (const p of legacyProgress) {
        if (p.materialId) completedMaterialIds.add(p.materialId);
      }
    } catch (err) {
      console.error("Error loading progress in materials list:", err);
    }
  }

  // Published canonical content is student-visible independently of the V3 authoring flag.
  const canonicalArticles = await getCanonicalPublishedArticlesForCourse(id, studentId);

  // Set of chapters mapped to canonical articles (for legacy suppression)
  const canonicalMappedChapterIds = new Set<string>();
  for (const art of canonicalArticles) {
    if (art.chapterId) canonicalMappedChapterIds.add(art.chapterId);
    if (art.legacyChapterId) canonicalMappedChapterIds.add(art.legacyChapterId);
    if (art.babId) canonicalMappedChapterIds.add(art.babId);
  }

  const courseChapters = (await getCourseChapterOutline(id, studentId)).map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    orderIndex: chapter.orderIndex,
  }));

  // Fetch db-backed materials (active only ; drafts and archived instances stay hidden)
  const dbMaterials = await db
    .select({
      id: aiMaterialInstances.id,
      title: aiMaterialInstances.title,
      chapterIds: aiMaterialInstances.chapterIds,
      thumbnailUrl: aiMaterialInstances.thumbnailUrl,
    })
    .from(aiMaterialInstances)
    .where(and(eq(aiMaterialInstances.courseId, compatibilityCourseId), notLike(aiMaterialInstances.title, "[DRAF]%")));

  // Fetch compiled diktats
  const courseDiktats = await db
    .select({
      id: diktats.id,
      title: diktats.title,
      fileUrl: diktats.fileUrl,
      updatedAt: diktats.updatedAt,
      chapterIds: diktats.chapterIds,
      thumbnailUrl: diktats.thumbnailUrl,
    })
    .from(diktats)
    .where(and(eq(diktats.courseId, compatibilityCourseId), eq(diktats.status, "ready")));

  const canonicalDiktats = course.canonicalId
    ? await db
        .select({
          id: diktatMateri.id,
          title: diktatMateri.title,
          babId: diktatMateri.babId,
          legacyChapterId: bab.legacyChapterId,
        })
        .from(diktatMateri)
        .leftJoin(bab, eq(diktatMateri.babId, bab.id))
        .where(and(eq(diktatMateri.mataKuliahId, course.canonicalId), eq(diktatMateri.status, "published")))
    : [];

  // Fetch website materials (AST articles, 1:1 with chapters) ; published only
  const webMaterials = await db
    .select({
      id: websiteMaterials.id,
      title: websiteMaterials.title,
      chapterId: websiteMaterials.chapterId,
      canonicalMarkdown: websiteMaterials.canonicalMarkdown,
      thumbnailUrl: websiteMaterials.thumbnailUrl,
    })
    .from(websiteMaterials)
    .where(and(eq(websiteMaterials.courseId, compatibilityCourseId), eq(websiteMaterials.status, "published")));

  // Fetch manual PDF materials
  const manualMaterials = await db
    .select({
      id: courseMaterials.id,
      title: courseMaterials.title,
      type: courseMaterials.type,
      subcategory: courseMaterials.subcategory,
      year: courseMaterials.year,
      fileUrl: courseMaterials.fileUrl,
      chapterIds: courseMaterials.chapterIds,
      updatedAt: courseMaterials.updatedAt,
      thumbnailUrl: courseMaterials.thumbnailUrl,
    })
    .from(courseMaterials)
    .where(eq(courseMaterials.courseId, compatibilityCourseId));

function sanitizeMaterialTitle(rawTitle: string): string {
  const trimmed = rawTitle.replace(/^\[DRAF\]\s*/i, "").trim();
  if (/^Staging Product Diktat/i.test(trimmed)) {
    return "Diktat: Sistem Bilangan Real dan Pertaksamaan";
  }
  if (/^Staging Product Article/i.test(trimmed)) {
    return "Catatan Kuliah: Sifat Medan dan Bilangan Real";
  }
  if (/^Staging Product/i.test(trimmed)) {
    return trimmed.replace(/^Staging Product\s*/i, "Materi: ");
  }
  return trimmed;
}

  const mappedCanonical = canonicalArticles.map((a) => ({
    id: a.id,
    courseId: id,
    title: sanitizeMaterialTitle(a.title),
    kind: "article" as const,
    docCategory: "materi" as const,
    fileSize: `${a.totalEstimatedReadingMinutes} menit baca`,
    completed: a.completed,
    isPastYear: false,
    isPreview: false,
    chapterId: a.chapterId ?? undefined,
    chapterIds: a.chapterId ? [a.chapterId] : [],
  }));

  const mappedCanonicalDiktats = canonicalDiktats.map((diktat) => ({
    id: diktat.id,
    courseId: id,
    title: sanitizeMaterialTitle(diktat.title),
    kind: "article" as const,
    docCategory: "diktat" as const,
    fileSize: "Diktat Resmi",
    completed: completedMaterialIds.has(diktat.id),
    isPastYear: false,
    isPreview: false,
    chapterId: diktat.legacyChapterId ?? diktat.babId ?? undefined,
    chapterIds: [diktat.legacyChapterId ?? diktat.babId].filter((chapterId): chapterId is string => Boolean(chapterId)),
  }));
  const canonicalDiktatChapterIds = new Set(mappedCanonicalDiktats.flatMap((diktat) => diktat.chapterIds));
  const visibleCourseDiktats = courseDiktats.filter((diktat) => {
    const chapterIds = Array.isArray(diktat.chapterIds) ? diktat.chapterIds : [];
    return !chapterIds.some((chapterId) => canonicalDiktatChapterIds.has(chapterId));
  });

  const mappedDiktats = visibleCourseDiktats.map((d) => ({
    id: d.id,
    courseId: id,
    title: sanitizeMaterialTitle(d.title),
    kind: "pdf" as const,
    docCategory: "diktat" as const,
    fileSize: "PDF Diktat",
    completed: completedMaterialIds.has(d.id),
    isPastYear: false,
    isPreview: true,
    url: d.fileUrl ? storage.getUrl(d.fileUrl) : undefined,
    thumbnailUrl: d.thumbnailUrl ? storage.getUrl(d.thumbnailUrl) : undefined,
    chapterIds: d.chapterIds as string[],
  }));

  const mappedDb = dbMaterials.filter((material) => {
    const chapterIds = Array.isArray(material.chapterIds) ? material.chapterIds : [];
    return !chapterIds.some((chapterId) => canonicalMappedChapterIds.has(chapterId));
  }).map((m) => ({
    id: m.id,
    courseId: id,
    title: sanitizeMaterialTitle(m.title),
    kind: "article" as const,
    docCategory: "materi" as const,
    fileSize: "Rangkuman Materi",
    completed: completedMaterialIds.has(m.id),
    isPastYear: false,
    isPreview: true,
    thumbnailUrl: m.thumbnailUrl ? storage.getUrl(m.thumbnailUrl) : undefined,
    chapterIds: m.chapterIds as string[],
  }));

  const mappedManual = manualMaterials.map((m) => {
    let docCategory: "materi" | "soal" | "solusi" = "materi";
    if (m.type === "contoh_soal" || m.type === "soal") {
      docCategory = "soal";
    } else if (m.type === "pembahasan_soal") {
      docCategory = "solusi";
    }

    return {
      id: m.id,
      courseId: id,
      title: sanitizeMaterialTitle(m.title),
      kind: "pdf" as const,
      docCategory,
      subcategory: m.subcategory,
      year: m.year,
      fileSize: "Berkas PDF",
      completed: completedMaterialIds.has(m.id),
      isPastYear: Boolean(m.year),
      isPreview: true,
      url: storage.getUrl(m.fileUrl),
      thumbnailUrl: m.thumbnailUrl ? storage.getUrl(m.thumbnailUrl) : undefined,
      chapterIds: m.chapterIds as string[],
    };
  });

  // Suppress legacy website material only for the same mapped chapter as canonical articles
  const mappedWeb = webMaterials
    .filter((m) => !canonicalMappedChapterIds.has(m.chapterId))
    .map((m) => ({
      id: m.id,
      courseId: id,
      title: sanitizeMaterialTitle(m.title),
      kind: "article" as const,
      docCategory: "materi" as const,
      fileSize: "Artikel Web",
      body: m.canonicalMarkdown,
      completed: completedMaterialIds.has(m.id),
      isPastYear: false,
      isPreview: true,
      thumbnailUrl: m.thumbnailUrl ? storage.getUrl(m.thumbnailUrl) : undefined,
      chapterId: m.chapterId,
      chapterIds: m.chapterId ? [m.chapterId] : [],
    }));

  const allMaterials = [...mappedCanonical, ...mappedCanonicalDiktats, ...mappedDiktats, ...mappedDb, ...mappedWeb, ...mappedManual];

  return (
    <CoursePageShell
      title={`Materi Belajar: ${course.title}`}
      description="Pelajari bahan belajar, ringkasan rumus, dan diktat kuliah."
      icon={FileText}
    >
      <Reveal>
        <DocumentListClient courseId={id} materials={allMaterials} chapters={courseChapters} />
      </Reveal>
    </CoursePageShell>
  );
}
