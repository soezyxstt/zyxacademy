import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { aiMaterialInstances, courses, chapters, masterTeachingDocuments, websiteMaterials } from "@/db/schema";
import { desc, eq, asc } from "drizzle-orm";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { MaterialInstancesClient } from "./materials-client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { BookText } from "lucide-react";

export const metadata: Metadata = {
  title: pageTitle("Materi"),
};

type Props = {
  searchParams: Promise<{ courseId?: string }>;
};

export default async function AIMaterialsPage({ searchParams }: Props) {
  await assertAdmin();

  const { courseId } = await searchParams;

  const [instances, assessments, webMaterials, allCourses, allChapters] = await Promise.all([
    db
      .select({
        id: aiMaterialInstances.id,
        title: aiMaterialInstances.title,
        courseId: aiMaterialInstances.courseId,
        sourceType: aiMaterialInstances.sourceType,
        summary: aiMaterialInstances.summary,
        keywords: aiMaterialInstances.keywords,
        pineconeSyncStatus: aiMaterialInstances.pineconeSyncStatus,
        lastSyncError: aiMaterialInstances.lastSyncError,
        createdAt: aiMaterialInstances.createdAt,
      })
      .from(aiMaterialInstances)
      .orderBy(desc(aiMaterialInstances.createdAt))
      .limit(100),
    db
      .select({
        id: masterTeachingDocuments.id,
        title: masterTeachingDocuments.title,
        courseId: masterTeachingDocuments.courseId,
        version: masterTeachingDocuments.version,
        status: masterTeachingDocuments.status,
        createdAt: masterTeachingDocuments.createdAt,
      })
      .from(masterTeachingDocuments)
      .where(eq(masterTeachingDocuments.type, 'assessment'))
      .orderBy(desc(masterTeachingDocuments.createdAt))
      .limit(100),
    db
      .select({
        id: websiteMaterials.id,
        title: websiteMaterials.title,
        courseId: websiteMaterials.courseId,
        chapterId: websiteMaterials.chapterId,
        slug: websiteMaterials.slug,
        canonicalMarkdown: websiteMaterials.canonicalMarkdown,
        status: websiteMaterials.status,
        createdAt: websiteMaterials.createdAt,
      })
      .from(websiteMaterials)
      .orderBy(desc(websiteMaterials.createdAt))
      .limit(100),
    db.select({ id: courses.id, title: courses.title }).from(courses),
    db.select({
      id: chapters.id,
      courseId: chapters.courseId,
      title: chapters.title,
      orderIndex: chapters.orderIndex,
    }).from(chapters).orderBy(asc(chapters.orderIndex)),
  ]);

  const formattedInstances = instances.map(i => ({
    ...i,
    createdAt: i.createdAt.toISOString(),
  }));

  const formattedAssessments = assessments.map(a => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
  }));

  const formattedWebMaterials = webMaterials.map(wm => ({
    ...wm,
    createdAt: wm.createdAt.toISOString(),
  }));

  const courseMap = Object.fromEntries(allCourses.map((c) => [c.id, c.title]));

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={BookText}
        title="Materi Pembelajaran"
        description="Kelola materi kuliah dan dokumen referensi pembelajaran."
      />
      <MaterialInstancesClient
        instances={formattedInstances}
        assessments={formattedAssessments}
        webMaterials={formattedWebMaterials}
        courses={allCourses}
        chapters={allChapters}
        courseMap={courseMap}
        prefillCourseId={courseId}
      />
    </div>
  );
}
