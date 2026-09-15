import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Lock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { MaterialViewer } from "@/components/course/material-viewer";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { getMaterial, type CourseMaterial } from "@/lib/student-course-fixtures";
import { getCourse, getStudentCourseAccess, isFreeChapterScoped } from "@/lib/course-utils";
import { getCanonicalPublishedArticle, getCanonicalPublishedTextProduct } from "@/lib/articles/structured-repository";
import { db } from "@/db";
import { aiMaterialInstances, diktats, courseMaterials, websiteMaterials, progress, studentMaterialProgress } from "@/db/schema";
import { eq, and, notLike } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { buildCourseTermIndex } from "@/lib/term-index";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

type Props = { params: Promise<{ id: string; materialId: string }> };

async function fetchMaterial(courseId: string, materialId: string, studentId?: string): Promise<CourseMaterial | undefined> {
  const staticMat = getMaterial(courseId, materialId);
  if (staticMat) return staticMat;
  const course = await getCourse(courseId);
  const compatibilityCourseId = course?.legacyId ?? courseId;
  const studentAccess = studentId ? await getStudentCourseAccess(studentId, courseId) : null;
  const canDownloadDiktat = Boolean(studentAccess?.policy.capabilities.canDownloadDiktat);

  let completed = false;
  if (studentId) {
    try {
      const [existingLegacy] = await db
        .select({ status: progress.status })
        .from(progress)
        .where(
          and(
            eq(progress.userId, studentId),
            eq(progress.materialId, materialId),
            eq(progress.status, "completed")
          )
        )
        .limit(1);

      if (existingLegacy) {
        completed = true;
      } else {
        const [existingNew] = await db
          .select({ completionPercent: studentMaterialProgress.completionPercent })
          .from(studentMaterialProgress)
          .where(
            and(
              eq(studentMaterialProgress.studentId, studentId),
              eq(studentMaterialProgress.materialId, materialId)
            )
          )
          .limit(1);
        if (existingNew && existingNew.completionPercent >= 90) {
          completed = true;
        }
      }
    } catch (err) {
      console.error("Error checking material completion:", err);
    }
  }

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

  const canonicalProduct = await getCanonicalPublishedTextProduct(courseId, materialId);
  if (canonicalProduct) {
    const isDiktat = canonicalProduct.productType === "diktat";
    const downloadUrl = (isDiktat && canonicalProduct.fileKey)
      ? `/api/courses/${encodeURIComponent(courseId)}/diktats/${encodeURIComponent(canonicalProduct.id)}/pdf${canDownloadDiktat ? "?download=1" : ""}`
      : undefined;

    return {
      id: canonicalProduct.id,
      courseId,
      title: sanitizeMaterialTitle(canonicalProduct.title),
      kind: "article",
      docCategory: isDiktat ? "diktat" : "materi",
      fileSize: isDiktat ? "Diktat Resmi" : "Rangkuman Materi",
      body: canonicalProduct.contentMarkdown,
      url: downloadUrl,
      completed,
      isPastYear: false,
      isPreview: false,
      chapterId: canonicalProduct.chapterId ?? undefined,
      chapterIds: canonicalProduct.chapterId ? [canonicalProduct.chapterId] : [],
    };
  }

  // First check if it is a compiled diktat in the diktats table
  try {
    const [diktatRecord] = await db
      .select()
      .from(diktats)
      .where(and(
        eq(diktats.id, materialId),
        eq(diktats.courseId, compatibilityCourseId),
        eq(diktats.status, "ready"),
      ))
      .limit(1);

    if (diktatRecord) {
      return {
        id: diktatRecord.id,
        courseId,
        title: diktatRecord.title,
        kind: "pdf",
        docCategory: "diktat",
        fileSize: "PDF File",
        url: diktatRecord.fileUrl
          ? `/api/courses/${encodeURIComponent(courseId)}/diktats/${encodeURIComponent(diktatRecord.id)}/pdf${canDownloadDiktat ? "?download=1" : ""}`
          : undefined,
        completed,
        isPastYear: false,
        isPreview: true,
        chapterIds: Array.isArray(diktatRecord.chapterIds) ? diktatRecord.chapterIds : [],
      };
    }
  } catch (error) {
    console.error("Error fetching diktat record:", error);
  }

  // Check in websiteMaterials table
  try {
    const [webMatRecord] = await db
      .select()
      .from(websiteMaterials)
      .where(and(eq(websiteMaterials.id, materialId), eq(websiteMaterials.courseId, compatibilityCourseId)));

    // Drafts must never be reachable by direct URL ; fall through to 404.
    if (webMatRecord && webMatRecord.status === "published") {
      return {
        id: webMatRecord.id,
        courseId,
        title: webMatRecord.title,
        kind: "article" as const,
        docCategory: "materi" as const,
        fileSize: "Disusun otomatis",
        body: webMatRecord.canonicalMarkdown,
        completed,
        isPastYear: false,
        isPreview: true,
        chapterId: webMatRecord.chapterId,
        chapterIds: [webMatRecord.chapterId],
      };
    }
  } catch (error) {
    console.error("Error fetching website material record:", error);
  }

  // Check in course_materials table
  try {
    const [matRecord] = await db
      .select()
      .from(courseMaterials)
      .where(and(eq(courseMaterials.id, materialId), eq(courseMaterials.courseId, compatibilityCourseId)));

    if (matRecord) {
      let docCategory: "materi" | "soal" | "solusi" = "materi";
      if (matRecord.type === "contoh_soal" || matRecord.type === "soal") {
        docCategory = "soal";
      } else if (matRecord.type === "pembahasan_soal") {
        docCategory = "solusi";
      }

      return {
        id: matRecord.id,
        courseId,
        title: matRecord.title,
        kind: "pdf",
        docCategory,
        subcategory: matRecord.subcategory,
        year: matRecord.year,
        fileSize: "PDF File",
        url: matRecord.fileUrl ? storage.getUrl(matRecord.fileUrl) : undefined,
        completed,
        isPastYear: Boolean(matRecord.year),
        isPreview: true,
        chapterIds: Array.isArray(matRecord.chapterIds) ? matRecord.chapterIds : [],
      };
    }
  } catch (error) {
    console.error("Error fetching course material record:", error);
  }

  try {
    const dbMaterial = await db.query.aiMaterialInstances.findFirst({
      where: and(
        eq(aiMaterialInstances.id, materialId),
        eq(aiMaterialInstances.courseId, compatibilityCourseId),
        notLike(aiMaterialInstances.title, "[DRAF]%"),
      ),
      with: {
        sections: {
          orderBy: (s, { asc }) => [asc(s.orderIndex)],
          with: {
            chunks: {
              orderBy: (c, { asc }) => [asc(c.orderIndex)],
            },
          },
        },
      },
    });

    if (dbMaterial) {
      const body = dbMaterial.sections
        .map((s) => {
          const sectionTitle = s.title ? `## ${s.title}\n\n` : "";
          const content = s.chunks.map((c) => c.chunkText).join("\n\n");
          return sectionTitle + content;
        })
        .join("\n\n");

      return {
        id: dbMaterial.id,
        courseId,
        title: dbMaterial.title.replace(/^\[DRAF\]\s*/, ""),
        kind: "article",
        docCategory: "materi",
        fileSize: "Disusun otomatis",
        body,
        completed,
        isPastYear: false,
        isPreview: true, // Allow review without enrolling for simplicity
        chapterIds: Array.isArray(dbMaterial.chapterIds) ? dbMaterial.chapterIds : [],
      };
    }
  } catch (error) {
    console.error("Error fetching db material:", error);
  }
  return undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, materialId } = await params;
  const course = await getCourse(id);

  // Check canonical structured article first
  const canonicalArticle = await getCanonicalPublishedArticle(id, materialId);
  if (canonicalArticle) {
    return {
      title: pageTitle(course ? `${course.title} - ${canonicalArticle.title}` : canonicalArticle.title),
      description: course
        ? `Baca materi ${canonicalArticle.title}; bagian dari ${course.title}.`
        : "Baca materi pelajaran dan artikel terstruktur.",
    };
  }

  const material = await fetchMaterial(id, materialId);
  return {
    title: pageTitle(course && material ? `${course.title} - ${material.title}` : "Materi"),
    description: material && course
      ? `Baca materi ${material.title}; bagian dari ${course.title}.`
      : "Baca materi pelajaran dan diktat kuliah.",
  };
}

export default async function CourseMaterialDetailPage({ params }: Props) {
  const { id, materialId } = await params;
  const course = await getCourse(id);
  const session = await auth.api.getSession({ headers: await headers() });
  const studentId = session?.user?.id;
  if (!studentId) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/material/${materialId}`)}`);
  }

  // 1. Canonical structured article first. Published V2 Article and Diktat
  // content falls through to the canonical text product reader below.
  const canonicalArticle = await getCanonicalPublishedArticle(id, materialId, studentId);
  if (canonicalArticle && course) {
    const access = studentId ? await getStudentCourseAccess(studentId, id) : null;
    const isAllowed = Boolean(access) && (
      access?.tier !== "free"
      || isFreeChapterScoped([canonicalArticle.chapterId].filter((chapterId): chapterId is string => Boolean(chapterId)), access.freeChapterIds)
    );
    if (!isAllowed) {
      return (
        <CoursePageShell title="Materi terkunci" description={`${course.title} · konten premium`} hideHeader>
          <div className="mb-4">
            <Button variant="ghost" size="sm" asChild className="gap-1.5 text-body-xs font-semibold text-muted-foreground hover:text-foreground">
              <Link href={`/courses/${id}/material`}>
                <ArrowLeft className="size-3.5" />
                <span>Kembali ke Dokumen</span>
              </Link>
            </Button>
          </div>
          <Reveal>
            <div className="rounded-lg border border-border/70 bg-card/75 p-4 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                  <Lock className="size-5" />
                </div>
                <div>
                  <h3 className="font-heading text-body-base font-bold text-foreground">Butuh token kelas</h3>
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    Aktifkan kelas untuk membuka &ldquo;{canonicalArticle.title}&rdquo;.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <EnrollmentForm />
              </div>
            </div>
          </Reveal>
        </CoursePageShell>
      );
    }

    return <StructuredArticleReader article={canonicalArticle} course={course} />;
  }

  // 2. Untouched legacy fallback
  const material = await fetchMaterial(id, materialId, studentId);
  if (!course || !material) notFound();

  const access = studentId ? await getStudentCourseAccess(studentId, id) : null;
  const isFreeMaterial = material.kind === "article"
    || material.kind === "quiz"
    || material.docCategory === "diktat";
  const isAccessible = Boolean(access) && (
    access?.tier !== "free"
    || (
      isFreeMaterial
      && isFreeChapterScoped(
        [
          ...(material.chapterIds ?? []),
          ...(material.chapterId ? [material.chapterId] : []),
        ],
        access.freeChapterIds,
      )
    )
  );

  if (!isAccessible) {
    return (
      <CoursePageShell title="Materi terkunci" description={`${course.title} · konten premium`} hideHeader>
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-body-xs font-semibold text-muted-foreground hover:text-foreground">
            <Link href={`/courses/${id}/material`}>
              <ArrowLeft className="size-3.5" />
              <span>Kembali ke Dokumen</span>
            </Link>
          </Button>
        </div>
        <Reveal>
          <div className="rounded-lg border border-border/70 bg-card/75 p-4 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                <Lock className="size-5" />
              </div>
              <div>
                <h3 className="font-heading text-body-base font-bold text-foreground">Butuh token kelas</h3>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  Aktifkan kelas untuk membuka &ldquo;{material.title}&rdquo;.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <EnrollmentForm />
            </div>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  const termIndex = await buildCourseTermIndex(id);

  return (
    <Suspense fallback={<div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <MaterialViewer
        material={material}
        chapterId={material.chapterId}
        ragEnabled
        accessTier={access?.tier}
        termIndex={termIndex}
        materialLiveEnabled={true}
        course={course}
        canDownload={Boolean(access?.policy.capabilities.canDownloadDiktat)}
      />
    </Suspense>
  );
}
