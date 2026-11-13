import type { Metadata } from "next";
import { cache, Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Lock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { MaterialViewer } from "@/components/course/material-viewer";
import { MaterialReaderContentSkeleton } from "@/components/course/course-skeletons";
import { Reveal } from "@/components/ui/reveal";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import { EnrollmentForm } from "@/components/enrollment-form";
import { createMetadata } from "@/lib/site";
import { getMaterial, type CourseMaterial } from "@/lib/student-course-fixtures";
import {
  getCourse,
  getStudentCourseAccess,
  isFreeChapterScoped,
  getCanonicalPublishedArticle,
  getCanonicalPublishedTextProduct,
  getCourseTermIndex,
} from "@/lib/course-utils";
import { db } from "@/db";
import { aiMaterialInstances, diktats, courseMaterials, websiteMaterials, progress, studentMaterialProgress } from "@/db/schema";
import { eq, and, notLike } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { getAuthSession } from "@/lib/auth-session";
import { getMaterialMetadataTitle } from "./material-metadata";

type Props = { params: Promise<{ id: string; materialId: string }> };

const getReaderArticle = cache(getCanonicalPublishedArticle);

async function fetchMaterial(
  courseId: string,
  materialId: string,
  studentId: string,
  course: NonNullable<Awaited<ReturnType<typeof getCourse>>>,
  canDownloadDiktat: boolean,
): Promise<CourseMaterial | undefined> {
  const staticMat = getMaterial(courseId, materialId);
  if (staticMat) return staticMat;
  const compatibilityCourseId = course.legacyId ?? courseId;

  // Progress is personal and must never be shared with the material lookup.
  const completionPromise = (async () => {
    try {
      const [legacyResult, newResult] = await Promise.allSettled([
        db
          .select({ status: progress.status })
          .from(progress)
          .where(
            and(
              eq(progress.userId, studentId),
              eq(progress.materialId, materialId),
              eq(progress.status, "completed")
            )
          )
          .limit(1),
        db
          .select({ completionPercent: studentMaterialProgress.completionPercent })
          .from(studentMaterialProgress)
          .where(and(
            eq(studentMaterialProgress.studentId, studentId),
            eq(studentMaterialProgress.materialId, materialId),
          ))
          .limit(1),
      ]);

      if (legacyResult.status === "rejected") throw legacyResult.reason;
      if (legacyResult.value[0]) return true;
      if (newResult.status === "rejected") throw newResult.reason;
      return Boolean(newResult.value[0] && newResult.value[0].completionPercent >= 90);
    } catch (err) {
      console.error("Error checking material completion:", err);
      return false;
    }
  })();

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
      fileSize: isDiktat ? undefined : "Rangkuman Materi",
      body: canonicalProduct.contentMarkdown,
      url: downloadUrl,
      completed: await completionPromise,
      isPastYear: false,
      isPreview: false,
      chapterId: canonicalProduct.chapterId ?? undefined,
      chapterIds: canonicalProduct.chapterId ? [canonicalProduct.chapterId] : [],
    };
  }

  // Resolve independent compatibility sources together, but consume them in
  // their existing priority order. AI sections are loaded only as a last resort.
  const [diktatResult, webMaterialResult, courseMaterialResult] = await Promise.allSettled([
    db.select({ id: diktats.id, title: diktats.title, fileUrl: diktats.fileUrl, chapterIds: diktats.chapterIds })
      .from(diktats)
      .where(and(eq(diktats.id, materialId), eq(diktats.courseId, compatibilityCourseId), eq(diktats.status, "ready")))
      .limit(1),
    db.select({
      id: websiteMaterials.id,
      title: websiteMaterials.title,
      status: websiteMaterials.status,
      chapterId: websiteMaterials.chapterId,
      canonicalMarkdown: websiteMaterials.canonicalMarkdown,
    }).from(websiteMaterials)
      .where(and(eq(websiteMaterials.id, materialId), eq(websiteMaterials.courseId, compatibilityCourseId)))
      .limit(1),
    db.select({
      id: courseMaterials.id,
      title: courseMaterials.title,
      type: courseMaterials.type,
      subcategory: courseMaterials.subcategory,
      year: courseMaterials.year,
      fileUrl: courseMaterials.fileUrl,
      chapterIds: courseMaterials.chapterIds,
    }).from(courseMaterials)
      .where(and(eq(courseMaterials.id, materialId), eq(courseMaterials.courseId, compatibilityCourseId)))
      .limit(1),
  ]);

  // First check if it is a compiled diktat in the diktats table
  try {
    if (diktatResult.status === "rejected") throw diktatResult.reason;
    const [diktatRecord] = diktatResult.value;

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
        completed: await completionPromise,
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
    if (webMaterialResult.status === "rejected") throw webMaterialResult.reason;
    const [webMatRecord] = webMaterialResult.value;

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
        completed: await completionPromise,
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
    if (courseMaterialResult.status === "rejected") throw courseMaterialResult.reason;
    const [matRecord] = courseMaterialResult.value;

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
        completed: await completionPromise,
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
        completed: await completionPromise,
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
  const [course, t] = await Promise.all([getCourse(id), getTranslations("learning")]);
  const materialTitle = await getMaterialMetadataTitle(id, materialId, course?.legacyId ?? id);
  const title = course && materialTitle !== null ? `${materialTitle} (${course.title})` : materialTitle ?? t("metadata.materialTitleFallback");
  return createMetadata({
    title,
    description: materialTitle !== null && course ? t("metadata.readMaterial", { title: materialTitle, course: course.title }) : t("metadata.readMaterialFallback"),
    path: `/courses/${id}/material/${materialId}`,
  });
}

async function MaterialDetailContent({
  id,
  materialId,
  studentId,
  course,
}: {
  id: string;
  materialId: string;
  studentId: string;
  course: NonNullable<Awaited<ReturnType<typeof getCourse>>>;
}) {
  // Overlap canonical article and access queries once session and course are verified
  const [canonicalArticle, access] = await Promise.all([
    getReaderArticle(id, materialId, studentId),
    getStudentCourseAccess(studentId, id),
  ]);

  // 1. Canonical structured article first. Published V2 Article and Diktat
  // content falls through to the canonical text product reader below.
  if (canonicalArticle) {
    const hasFullContentAccess = Boolean(access?.hasFullContentAccess);
    const articleChapterIds = [
      canonicalArticle.chapterId,
    ].filter((ch): ch is string => Boolean(ch));
    const isFreeChapter = access?.tier === "free" && !access.hasFullContentAccess && isFreeChapterScoped(articleChapterIds, access.freeChapterIds);
    const isAllowed = hasFullContentAccess || isFreeChapter;
    if (!isAllowed) {
      return (
        <CoursePageShell title={<TranslatedText namespace="learning" messageKey="materialDetail.locked" />} description={<TranslatedText namespace="learning" messageKey="materialDetail.premiumDescription" values={{ course: course.title }} />} hideHeader>
          <div className="mb-4">
            <Button variant="ghost" size="sm" asChild className="gap-1.5 text-body-sm font-semibold text-muted-foreground hover:text-foreground">
              <Link href={`/courses/${id}/material`}>
                <ArrowLeft className="size-3.5" />
                <span><TranslatedText namespace="learning" messageKey="materialDetail.backToDocuments" /></span>
              </Link>
            </Button>
          </div>
          <Reveal>
            <div className="rounded-lg border border-border/70 bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                  <Lock className="size-5" />
                </div>
                <div>
                  <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="courseAccess.needToken" /></h3>
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    <TranslatedText namespace="learning" messageKey="materialDetail.activateToOpen" values={{ title: canonicalArticle.title }} />
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

    return <StructuredArticleReader article={canonicalArticle} course={course} pythonBrowserOnly={isFreeChapter} />;
  }

  // 2. Canonical text and legacy compatibility fallback
  const material = await fetchMaterial(id, materialId, studentId, course, Boolean(access?.policy.capabilities.canDownloadDiktat));
  if (!material) notFound();

  const hasFullContentAccess = Boolean(access?.hasFullContentAccess);
  const isFreePdf = Boolean(access) && material.kind === "pdf" && material.docCategory !== "diktat";
  const materialChapterIds = [
    ...(material.chapterIds ?? []),
    ...(material.chapterId ? [material.chapterId] : []),
  ];
  const isFreeChapter = access?.tier === "free" && !access.hasFullContentAccess && isFreeChapterScoped(materialChapterIds, access.freeChapterIds);
  const isAccessible = hasFullContentAccess || isFreePdf || isFreeChapter;

  if (!isAccessible) {
    return (
      <CoursePageShell title={<TranslatedText namespace="learning" messageKey="materialDetail.locked" />} description={<TranslatedText namespace="learning" messageKey="materialDetail.premiumDescription" values={{ course: course.title }} />} hideHeader>
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-body-sm font-semibold text-muted-foreground hover:text-foreground">
            <Link href={`/courses/${id}/material`}>
              <ArrowLeft className="size-3.5" />
              <span><TranslatedText namespace="learning" messageKey="materialDetail.backToDocuments" /></span>
            </Link>
          </Button>
        </div>
        <Reveal>
          <div className="rounded-lg border border-border/70 bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                <Lock className="size-5" />
              </div>
              <div>
                <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="courseAccess.needToken" /></h3>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  <TranslatedText namespace="learning" messageKey="materialDetail.activateToOpen" values={{ title: material.title }} />
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

  const termIndex = await getCourseTermIndex(id);

  return (
    <Suspense fallback={<MaterialReaderContentSkeleton courseId={id} courseTitle={course.title} />}>
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

export default async function CourseMaterialDetailPage({ params }: Props) {
  const { id, materialId } = await params;
  const session = await getAuthSession();
  const studentId = session?.user?.id;
  if (!studentId) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/material/${materialId}`)}`);
  }

  const course = await getCourse(id);
  if (!course) notFound();

  return (
    <Suspense fallback={<MaterialReaderContentSkeleton courseId={id} courseTitle={course.title} />}>
      <MaterialDetailContent
        id={id}
        materialId={materialId}
        studentId={studentId}
        course={course}
      />
    </Suspense>
  );
}
