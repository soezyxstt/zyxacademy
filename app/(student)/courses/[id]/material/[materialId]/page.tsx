import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { MaterialViewer } from "@/components/course/material-viewer";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { getMaterial, type CourseMaterial } from "@/lib/student-course-fixtures";
import { getCourse } from "@/lib/course-utils";
import { db } from "@/db";
import { aiMaterialInstances, diktats, courseMaterials, websiteMaterials, progress, studentMaterialProgress } from "@/db/schema";
import { eq, and, notLike } from "drizzle-orm";
import { env } from "@/lib/env";
import { storage } from "@/lib/storage";
import { buildCourseTermIndex } from "@/lib/term-index";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

type Props = { params: Promise<{ id: string; materialId: string }> };

async function fetchMaterial(courseId: string, materialId: string, studentId?: string): Promise<CourseMaterial | undefined> {
  const staticMat = getMaterial(courseId, materialId);
  if (staticMat) return staticMat;

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

  // First check if it is a compiled diktat in the diktats table
  try {
    const [diktatRecord] = await db
      .select()
      .from(diktats)
      .where(eq(diktats.id, materialId));

    if (diktatRecord) {
      return {
        id: diktatRecord.id,
        courseId,
        title: diktatRecord.title,
        kind: "pdf",
        docCategory: "diktat",
        fileSize: "PDF File",
        url: diktatRecord.fileUrl ? storage.getUrl(diktatRecord.fileUrl) : undefined,
        completed,
        isPastYear: false,
        isPreview: true,
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
      .where(eq(websiteMaterials.id, materialId));

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
      .where(eq(courseMaterials.id, materialId));

    if (matRecord) {
      return {
        id: matRecord.id,
        courseId,
        title: matRecord.title,
        kind: "pdf",
        docCategory: matRecord.type === "contoh_soal" ? "soal" : "materi",
        fileSize: "PDF File",
        url: matRecord.fileUrl ? storage.getUrl(matRecord.fileUrl) : undefined,
        completed,
        isPastYear: false,
        isPreview: true,
      };
    }
  } catch (error) {
    console.error("Error fetching course material record:", error);
  }

  try {
    const dbMaterial = await db.query.aiMaterialInstances.findFirst({
      where: and(eq(aiMaterialInstances.id, materialId), notLike(aiMaterialInstances.title, "[DRAF]%")),
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
  const material = await fetchMaterial(id, materialId, studentId);
  if (!course || !material) notFound();

  const isEnrolled = await checkEnrollment(id);
  const isFree = material.isPastYear || material.isPreview;
  const isAccessible = isEnrolled || isFree;

  if (!isAccessible) {
    return (
      <CoursePageShell title="Materi terkunci" description={`${course.title} · konten premium`} hideHeader>
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

  const materialLiveEnabled = env.FEATURE_MATERIAL_LIVE === "1";
  const termIndex = materialLiveEnabled ? await buildCourseTermIndex(id) : [];

  return (
    <Suspense fallback={<div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <MaterialViewer
        material={material}
        chapterId={material.chapterId}
        ragEnabled
        termIndex={termIndex}
        materialLiveEnabled={materialLiveEnabled}
      />
    </Suspense>
  );
}
