import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { studentCardClass } from "@/components/course/course-surfaces";
import { pageTitle } from "@/lib/site";
import { getCourse } from "@/lib/course-utils";
import { DocumentListClient } from "./document-list-client";
import { Reveal } from "@/components/ui/reveal";
import { db } from "@/db";
import { aiMaterialInstances, websiteMaterials, diktats, courseMaterials, chapters, progress, studentMaterialProgress } from "@/db/schema";
import { eq, and, notLike } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { storage } from "@/lib/storage";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { FormattedDate } from "@/components/ui/formatted-date";

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

  // Fetch chapters
  const courseChapters = await db
    .select({
      id: chapters.id,
      title: chapters.title,
      orderIndex: chapters.orderIndex,
    })
    .from(chapters)
    .where(eq(chapters.courseId, id))
    .orderBy(chapters.orderIndex);

  // Fetch db-backed materials (active only ; drafts and archived instances stay hidden)
  const dbMaterials = await db
    .select({
      id: aiMaterialInstances.id,
      title: aiMaterialInstances.title,
      chapterIds: aiMaterialInstances.chapterIds,
      thumbnailUrl: aiMaterialInstances.thumbnailUrl,
    })
    .from(aiMaterialInstances)
    .where(and(eq(aiMaterialInstances.courseId, id), notLike(aiMaterialInstances.title, "[DRAF]%")));

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
    .where(and(eq(diktats.courseId, id), eq(diktats.status, "ready")));

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
    .where(and(eq(websiteMaterials.courseId, id), eq(websiteMaterials.status, "published")));

  // Fetch manual PDF materials
  const manualMaterials = await db
    .select({
      id: courseMaterials.id,
      title: courseMaterials.title,
      type: courseMaterials.type,
      fileUrl: courseMaterials.fileUrl,
      chapterIds: courseMaterials.chapterIds,
      updatedAt: courseMaterials.updatedAt,
      thumbnailUrl: courseMaterials.thumbnailUrl,
    })
    .from(courseMaterials)
    .where(eq(courseMaterials.courseId, id));

  const mappedDiktats = courseDiktats.map((d) => ({
    id: d.id,
    courseId: id,
    title: d.title,
    kind: "pdf" as const,
    docCategory: "diktat" as const,
    fileSize: "PDF File",
    completed: completedMaterialIds.has(d.id),
    isPastYear: false,
    isPreview: true,
    url: d.fileUrl ? storage.getUrl(d.fileUrl) : undefined,
    thumbnailUrl: d.thumbnailUrl ? storage.getUrl(d.thumbnailUrl) : undefined,
    chapterIds: d.chapterIds as string[],
  }));

  const mappedDb = dbMaterials.map((m) => ({
    id: m.id,
    courseId: id,
    title: m.title.replace(/^\[DRAF\]\s*/, ""),
    kind: "article" as const,
    docCategory: "materi" as const,
    fileSize: "Materi Zyx",
    completed: completedMaterialIds.has(m.id),
    isPastYear: false,
    isPreview: true,
    thumbnailUrl: m.thumbnailUrl ? storage.getUrl(m.thumbnailUrl) : undefined,
    chapterIds: m.chapterIds as string[],
  }));

  const mappedManual = manualMaterials.map((m) => ({
    id: m.id,
    courseId: id,
    title: m.title,
    kind: "pdf" as const,
    docCategory: m.type === "contoh_soal" ? ("soal" as const) : ("materi" as const),
    fileSize: m.type === "contoh_soal" ? "Contoh Soal" : "Materi Kelas",
    completed: completedMaterialIds.has(m.id),
    isPastYear: false,
    isPreview: true,
    url: storage.getUrl(m.fileUrl),
    thumbnailUrl: m.thumbnailUrl ? storage.getUrl(m.thumbnailUrl) : undefined,
    chapterIds: m.chapterIds as string[],
  }));

  const mappedWeb = webMaterials.map((m) => ({
    id: m.id,
    courseId: id,
    title: m.title,
    kind: "article" as const,
    docCategory: "materi" as const,
    fileSize: "Disusun otomatis",
    body: m.canonicalMarkdown ? m.canonicalMarkdown.slice(0, 600) : undefined,
    completed: completedMaterialIds.has(m.id),
    isPastYear: false,
    isPreview: true,
    thumbnailUrl: m.thumbnailUrl ? storage.getUrl(m.thumbnailUrl) : undefined,
    chapterIds: [m.chapterId],
  }));

  const allMaterials = [...mappedDiktats, ...mappedDb, ...mappedWeb, ...mappedManual];


  return (
    <CoursePageShell
      title={`Materi Belajar: ${course.title}`}
      description="Pelajari bahan belajar, ringkasan rumus, dan diktat kuliah."
      icon={FileText}
    >
      <Reveal>
        {courseDiktats.length > 0 && (
          <div className="mb-8 space-y-3 text-left">
            <h2 className="font-heading text-body-base font-bold text-foreground">Diktat Kuliah (PDF)</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {courseDiktats.map((d) => (
                <div key={d.id} className={studentCardClass("justify-between")}>
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-status-error/15 text-status-error">
                      <FileText className="size-5" />
                    </span>
                    <div>
                      <h3 className="font-heading text-body-sm font-bold text-foreground line-clamp-1">{d.title}</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Dikompilasi otomatis dari materi terbaru</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground select-none">
                      Diperbarui: <FormattedDate date={d.updatedAt} options={{ day: "numeric", month: "short", year: "numeric" }} />
                    </span>
                    {d.fileUrl && (
                      <Button asChild size="xs" className="rounded-lg bg-gradient-to-r from-brand-secondary to-brand-secondary/90 hover:opacity-95 text-white font-semibold shadow-xs">
                        <a href={storage.getUrl(d.fileUrl)} target="_blank" rel="noopener noreferrer">Unduh PDF</a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <DocumentListClient courseId={id} materials={allMaterials} chapters={courseChapters} />
      </Reveal>
    </CoursePageShell>
  );
}
