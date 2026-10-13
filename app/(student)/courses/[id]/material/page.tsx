import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { createMetadata, pageTitle } from "@/lib/site";
import {
  getCourse,
  getCourseChapterOutline,
  getStudentCourseAccess,
  extractFreeQuizChapterScope,
  isFreeChapterScoped,
  isFreeQuizTemplate,
} from "@/lib/course-utils";
import { CourseDocumentsClient } from "./course-documents-client";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { db } from "@/db";
import { aiMaterialInstances, websiteMaterials, diktats, diktatMateri, bab, courseMaterials, progress, studentMaterialProgress, quizTemplates, studentQuizAttempts, exams } from "@/db/schema";
import { eq, and, notLike, ne, desc } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getCanonicalPublishedArticlesForCourse } from "@/lib/articles/structured-repository";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);

  return createMetadata({
    title: course ? `Materi ${course.title}` : "Materi Belajar",
    description: course
      ? `Dokumen dan materi belajar ${course.title}; modul, diktat, dan contoh soal.`
      : "Dokumen dan materi belajar; modul, diktat, dan contoh soal.",
    path: `/courses/${id}/material`,
  });
}


export default async function CourseMaterialListPage({ params, searchParams }: Props) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialTab = resolvedSearchParams?.tab;
  const course = await getCourse(id);
  if (!course) return null;
  const compatibilityCourseId = course.legacyId ?? id;

  const session = await auth.api.getSession({ headers: await headers() });
  const studentId = session?.user?.id;
  if (!studentId) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/material`)}`);
  }
  const studentAccess = studentId ? await getStudentCourseAccess(studentId, id) : null;
  const isFreeAccess = studentAccess?.tier === "free";
  const canDownloadDiktat = Boolean(studentAccess?.policy.capabilities.canDownloadDiktat);
  const freeChapterIds = new Set(studentAccess?.freeChapterIds ?? []);

  const completedMaterialIds = new Set<string>();
  if (studentId) {
    try {
      const userProgress = await db
        .select({ materialId: studentMaterialProgress.materialId, completionPercent: studentMaterialProgress.completionPercent })
        .from(studentMaterialProgress)
        .where(eq(studentMaterialProgress.studentId, studentId));
      for (const p of userProgress) if (p.completionPercent >= 90) completedMaterialIds.add(p.materialId);

      const legacyProgress = await db
        .select({ materialId: progress.materialId })
        .from(progress)
        .where(and(eq(progress.userId, studentId), eq(progress.status, "completed")));
      for (const p of legacyProgress) if (p.materialId) completedMaterialIds.add(p.materialId);
    } catch (err) {
      console.error("Error loading progress in materials list:", err);
    }
  }

  const canonicalArticles = await getCanonicalPublishedArticlesForCourse(id, studentId);
  const canonicalMappedChapterIds = new Set<string>();
  for (const art of canonicalArticles) {
    if (art.chapterId) canonicalMappedChapterIds.add(art.chapterId);
    if (art.legacyChapterId) canonicalMappedChapterIds.add(art.legacyChapterId);
    if (art.babId) canonicalMappedChapterIds.add(art.babId);
  }

  const courseChapters = (await getCourseChapterOutline(id, studentId)).map((chapter) => ({ id: chapter.id, title: chapter.title, orderIndex: chapter.orderIndex }));

  const dbMaterials = await db
    .select({ id: aiMaterialInstances.id, title: aiMaterialInstances.title, chapterIds: aiMaterialInstances.chapterIds, thumbnailUrl: aiMaterialInstances.thumbnailUrl })
    .from(aiMaterialInstances)
    .where(and(eq(aiMaterialInstances.courseId, compatibilityCourseId), notLike(aiMaterialInstances.title, "[DRAF]%")));

  const courseDiktats = await db
    .select({ id: diktats.id, title: diktats.title, fileUrl: diktats.fileUrl, updatedAt: diktats.updatedAt, chapterIds: diktats.chapterIds, thumbnailUrl: diktats.thumbnailUrl })
    .from(diktats)
    .where(and(eq(diktats.courseId, compatibilityCourseId), eq(diktats.status, "ready")));

  const canonicalDiktats = course.canonicalId
    ? await db
        .select({ id: diktatMateri.id, title: diktatMateri.title, fileKey: diktatMateri.fileKey, babId: diktatMateri.babId, legacyChapterId: bab.legacyChapterId })
        .from(diktatMateri)
        .leftJoin(bab, eq(diktatMateri.babId, bab.id))
        .where(and(eq(diktatMateri.mataKuliahId, course.canonicalId), eq(diktatMateri.status, "published")))
    : [];

  const webMaterials = await db
    .select({ id: websiteMaterials.id, title: websiteMaterials.title, chapterId: websiteMaterials.chapterId, canonicalMarkdown: websiteMaterials.canonicalMarkdown, thumbnailUrl: websiteMaterials.thumbnailUrl })
    .from(websiteMaterials)
    .where(and(eq(websiteMaterials.courseId, compatibilityCourseId), eq(websiteMaterials.status, "published")));

  const manualMaterials = await db
    .select({ id: courseMaterials.id, title: courseMaterials.title, type: courseMaterials.type, subcategory: courseMaterials.subcategory, year: courseMaterials.year, fileUrl: courseMaterials.fileUrl, chapterIds: courseMaterials.chapterIds, updatedAt: courseMaterials.updatedAt, thumbnailUrl: courseMaterials.thumbnailUrl })
    .from(courseMaterials)
    .where(eq(courseMaterials.courseId, compatibilityCourseId));

  const courseQuizzes = await db
    .select({
      id: quizTemplates.id,
      title: quizTemplates.title,
      category: quizTemplates.category,
      visibility: quizTemplates.visibility,
      status: quizTemplates.status,
      selectionRules: quizTemplates.selectionRules,
    })
    .from(quizTemplates)
    .where(and(eq(quizTemplates.courseId, compatibilityCourseId), eq(quizTemplates.status, "published"), ne(quizTemplates.category, "simulation")))
    .orderBy(desc(quizTemplates.createdAt));

  const courseTryouts = await db
    .select({ id: exams.id, title: exams.title, settings: exams.settings })
    .from(exams)
    .where(and(eq(exams.courseId, compatibilityCourseId), eq(exams.type, "tryout"), eq(exams.status, "published")));

  const completedQuizIds = new Set<string>();
  if (studentId) {
    try {
      const userAttempts = await db.select({ templateId: studentQuizAttempts.templateId, status: studentQuizAttempts.status }).from(studentQuizAttempts).where(eq(studentQuizAttempts.studentId, studentId));
      for (const a of userAttempts) if (a.status === "completed") completedQuizIds.add(a.templateId);
    } catch (err) {
      console.error("Error loading student quiz attempts:", err);
    }
  }

  function sanitizeMaterialTitle(rawTitle: string): string {
    const trimmed = rawTitle.replace(/^\[DRAF\]\s*/i, "").trim();
    if (/^Staging Product Diktat/i.test(trimmed)) return "Diktat: Sistem Bilangan Real dan Pertaksamaan";
    if (/^Staging Product Article/i.test(trimmed)) return "Catatan Kuliah: Sifat Medan dan Bilangan Real";
    if (/^Staging Product/i.test(trimmed)) return trimmed.replace(/^Staging Product\s*/i, "Materi: ");
    return trimmed;
  }

  const mappedCanonical = canonicalArticles.map((a) => ({
    id: a.id,
    courseId: id,
    title: sanitizeMaterialTitle(a.title),
    kind: "article" as const,
    docCategory: "materi" as const,
    tabGroup: "materi" as const,
    fileSize: `${a.totalEstimatedReadingMinutes} menit baca`,
    completed: a.completed,
    isPastYear: false,
    isPreview: false,
    thumbnailUrl: `/api/courses/${encodeURIComponent(id)}/material/${encodeURIComponent(a.id)}/cover.svg`,
    chapterId: a.chapterId ?? undefined,
    chapterIds: a.chapterId ? [a.chapterId] : [],
    href: `/courses/${id}/material/${a.id}`,
  }));

  const mappedCanonicalDiktats = canonicalDiktats.map((diktat) => ({
    id: diktat.id,
    courseId: id,
    title: sanitizeMaterialTitle(diktat.title),
    kind: "article" as const,
    docCategory: "diktat" as const,
    tabGroup: "diktat" as const,
    completed: completedMaterialIds.has(diktat.id),
    isPastYear: false,
    isPreview: false,
    thumbnailUrl: `/api/courses/${encodeURIComponent(id)}/material/${encodeURIComponent(diktat.id)}/cover.svg`,
    chapterId: diktat.legacyChapterId ?? diktat.babId ?? undefined,
    chapterIds: [diktat.legacyChapterId ?? diktat.babId].filter((chapterId): chapterId is string => Boolean(chapterId)),
    url: diktat.fileKey
      ? `/api/courses/${encodeURIComponent(id)}/diktats/${encodeURIComponent(diktat.id)}/pdf${canDownloadDiktat ? "?download=1" : ""}`
      : undefined,
    href: `/courses/${id}/material/${diktat.id}`,
    source: "canonical-diktat" as const,
  }));

  const canonicalDiktatChapterIds = new Set(mappedCanonicalDiktats.flatMap((diktat) => diktat.chapterIds));
  const visibleCourseDiktats = courseDiktats.filter((diktat) => {
    const chapterIds = Array.isArray(diktat.chapterIds) ? diktat.chapterIds : [];
    return !chapterIds.some((chapterId) => canonicalDiktatChapterIds.has(chapterId));
  });

  const mappedDiktats = visibleCourseDiktats.map((d) => ({
    id: d.id, courseId: id, title: sanitizeMaterialTitle(d.title), kind: "pdf" as const, docCategory: "diktat" as const, tabGroup: "diktat" as const,
    fileSize: "PDF Diktat", completed: completedMaterialIds.has(d.id), isPastYear: false, isPreview: true,
    url: d.fileUrl
      ? `/api/courses/${encodeURIComponent(id)}/diktats/${encodeURIComponent(d.id)}/pdf${canDownloadDiktat ? "?download=1" : ""}`
      : undefined,
    thumbnailUrl: d.thumbnailUrl ? storage.getUrl(d.thumbnailUrl) : d.fileUrl ? `/api/courses/${id}/material/${d.id}/thumbnail` : undefined,
    chapterIds: d.chapterIds as string[], href: `/courses/${id}/material/${d.id}`, source: "legacy-diktat" as const,
  }));

  const mappedDb = dbMaterials.filter((material) => {
    const chapterIds = Array.isArray(material.chapterIds) ? material.chapterIds : [];
    return !chapterIds.some((chapterId) => canonicalMappedChapterIds.has(chapterId));
  }).map((m) => ({
    id: m.id, courseId: id, title: sanitizeMaterialTitle(m.title), kind: "article" as const, docCategory: "materi" as const, tabGroup: "materi" as const,
    fileSize: "Rangkuman Materi", completed: completedMaterialIds.has(m.id), isPastYear: false, isPreview: true,
    thumbnailUrl: m.thumbnailUrl ? storage.getUrl(m.thumbnailUrl) : undefined, chapterIds: m.chapterIds as string[], href: `/courses/${id}/material/${m.id}`,
  }));

  const isAssessmentMaterial = (type: string, subcategory?: string | null) => {
    if (type === "soal" || type === "contoh_soal" || type === "pembahasan_soal") return true;
    if (subcategory && ["kuis", "kbf", "uts", "uas", "tutorial"].includes(subcategory)) return true;
    return false;
  };

  const mappedManual = manualMaterials.map((m) => {
    const isAssessment = isAssessmentMaterial(m.type, m.subcategory);
    let docCategory: "materi" | "soal" | "solusi" = "materi";
    if (m.type === "contoh_soal" || m.type === "soal") docCategory = "soal";
    else if (m.type === "pembahasan_soal") docCategory = "solusi";
    else if (isAssessment) docCategory = "soal";
    const tabGroup = isAssessment ? ("bank_soal" as const) : ("pdf" as const);
    const fileSizeLabel = isAssessment ? m.type === "pembahasan_soal" ? "Pembahasan Soal" : "Lembar Soal" : "Berkas PDF ITB";
    return {
      id: m.id, courseId: id, title: sanitizeMaterialTitle(m.title), kind: "pdf" as const, docCategory, tabGroup, subcategory: m.subcategory, year: m.year,
      fileSize: fileSizeLabel, completed: completedMaterialIds.has(m.id), isPastYear: Boolean(m.year), isPreview: true, url: storage.getUrl(m.fileUrl),
      thumbnailUrl: m.thumbnailUrl ? storage.getUrl(m.thumbnailUrl) : m.fileUrl ? `/api/courses/${id}/material/${m.id}/thumbnail` : undefined,
      chapterIds: m.chapterIds as string[], href: `/courses/${id}/material/${m.id}`,
    };
  });

  const mappedWeb = webMaterials.filter((m) => !canonicalMappedChapterIds.has(m.chapterId)).map((m) => ({
    id: m.id, courseId: id, title: sanitizeMaterialTitle(m.title), kind: "article" as const, docCategory: "materi" as const, tabGroup: "materi" as const,
    fileSize: undefined, body: m.canonicalMarkdown, completed: completedMaterialIds.has(m.id), isPastYear: false, isPreview: true,
    thumbnailUrl: m.thumbnailUrl ? storage.getUrl(m.thumbnailUrl) : undefined, chapterId: m.chapterId, chapterIds: m.chapterId ? [m.chapterId] : [], href: `/courses/${id}/material/${m.id}`,
  }));

  const freeQuizIds = new Set(
    courseQuizzes
      .filter((quiz) => isFreeQuizTemplate(quiz, freeChapterIds))
      .map((q) => q.id)
  );

  const mappedQuizzes = courseQuizzes.map((q) => {
    let qCount = 10;
    let quizChapterIds: string[] = [];
    try {
      const rules = typeof q.selectionRules === "string" ? JSON.parse(q.selectionRules) : q.selectionRules;
      if (rules?.count) qCount = Number(rules.count);
      quizChapterIds = extractFreeQuizChapterScope(q.selectionRules) ?? [];
    } catch {}
    const isFree = freeQuizIds.has(q.id);
    return {
      id: q.id,
      courseId: id,
      title: q.title,
      kind: "quiz" as const,
      docCategory: "soal" as const,
      tabGroup: "bank_soal" as const,
      subcategory: "kuis",
      fileSize: `${qCount} Soal · Kuis Interaktif`,
      completed: completedQuizIds.has(q.id),
      isPastYear: false,
      isPreview: isFree,
      chapterIds: quizChapterIds,
      href: `/courses/${id}/quiz/${q.id}`,
    };
  });

  const mappedTryouts = courseTryouts.map((t) => {
    let duration = 90;
    try {
      const parsed = typeof t.settings === "string" ? JSON.parse(t.settings) : t.settings;
      if (parsed?.timeLimitMinutes) duration = parsed.timeLimitMinutes;
    } catch {}
    return { id: t.id, courseId: id, title: t.title, kind: "tryout" as const, docCategory: "soal" as const, tabGroup: "bank_soal" as const, subcategory: "tryout", fileSize: `${duration} Menit · Tryout Ujian`, completed: false, isPastYear: false, isPreview: false, chapterIds: [], href: `/courses/${id}/tryout/${t.id}` };
  });

  const allMaterials = [...mappedCanonical, ...mappedCanonicalDiktats, ...mappedDiktats, ...mappedDb, ...mappedWeb, ...mappedManual, ...mappedQuizzes, ...mappedTryouts];
  const isEnrolled = studentAccess?.tier === "standard";
  const materialsWithLockState = allMaterials.map((material) => {
    // PDF materials (materi PDF, bank soal ITB / lembar soal tutorial / ujian) and qualifying free quizzes are free
    const isFreeContent =
      (material.kind === "pdf" && material.docCategory !== "diktat") ||
      (material.kind === "quiz" && freeQuizIds.has(material.id));
    const locked = !isEnrolled && !isFreeContent;
    return {
      ...material,
      locked,
    };
  });
  const lockedMaterialCount = materialsWithLockState.filter((m) => m.locked).length;

  return (
    <CoursePageShell title={`Materi Belajar: ${course.title}`} description="Pelajari bahan belajar, ringkasan rumus, dan diktat kuliah." icon={FileText}>
      <Reveal>
        {!isEnrolled && (
          <div className="mb-6 rounded-lg border border-brand-secondary/25 bg-brand-secondary/5 p-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] md:items-center">
              <div>
                <h3 className="font-heading text-body-base font-bold text-brand-secondary">
                  Aktivasi token kelas
                </h3>
                <p className="mt-1 max-w-2xl text-body-sm text-muted-foreground">
                  Berkas PDF materi, latihan soal ITB, dan kuis uji coba bab awal dapat diakses gratis. Masukkan token kelas untuk membuka seluruh kuis interaktif, tryout ujian, materi lengkap, flashcard, dan diktat.
                </p>
              </div>
              <EnrollmentForm className="w-full" />
            </div>
          </div>
        )}
        <Suspense fallback={null}>
          <CourseDocumentsClient
            courseId={id}
            materials={materialsWithLockState}
            chapters={courseChapters}
            defaultTab={initialTab}
            accessTier={studentAccess?.tier}
            lockedMaterialCount={lockedMaterialCount}
          />
        </Suspense>
      </Reveal>
    </CoursePageShell>
  );
}
