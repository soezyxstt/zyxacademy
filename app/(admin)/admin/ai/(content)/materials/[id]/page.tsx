import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { aiMaterialInstances, courses, chapters, knowledgeObjects, websiteMaterials } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { MaterialDetailClient } from "./detail-client";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const instance = await db.query.aiMaterialInstances.findFirst({
    where: eq(aiMaterialInstances.id, id),
  });
  return {
    title: pageTitle(instance ? `Detail: ${instance.title.replace(/^\[DRAF\]\s*/, "")}` : "Detail Materi"),
  };
}

export default async function MaterialDetailPage({ params }: Props) {
  await assertAdmin();
  const { id } = await params;

  const instance = await db.query.aiMaterialInstances.findFirst({
    where: eq(aiMaterialInstances.id, id),
  });

  if (!instance) {
    notFound();
  }

  const course = await db.query.courses.findFirst({
    where: eq(courses.id, instance.courseId),
  });

  if (!course) {
    notFound();
  }

  // Get chapters for this material instance
  const chapterIds = (instance.chapterIds || []) as string[];
  const hasChapters = chapterIds.length > 0;

  const courseChapters = hasChapters
    ? await db.query.chapters.findMany({
        where: inArray(chapters.id, chapterIds),
        orderBy: [asc(chapters.orderIndex)],
      })
    : [];

  // Get knowledge objects for these chapters
  const kos = hasChapters
    ? await db.query.knowledgeObjects.findMany({
        where: inArray(knowledgeObjects.chapterId, chapterIds),
        orderBy: [asc(knowledgeObjects.learningOrder)],
      })
    : [];

  // Get website materials for these chapters
  const webMaterials = hasChapters
    ? await db.query.websiteMaterials.findMany({
        where: inArray(websiteMaterials.chapterId, chapterIds),
      })
    : [];

  return (
    <div className="space-y-8">
      <MaterialDetailClient
        instance={instance}
        course={course}
        chapters={courseChapters}
        knowledgeObjects={kos}
        websiteMaterials={webMaterials}
      />
    </div>
  );
}
