import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { diktats, courses, chapters } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import { DiktatCompilerClient } from "./diktats-client";
import { storage } from "@/lib/storage";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FileStack } from "lucide-react";

export const metadata: Metadata = {
  title: pageTitle("Kompilasi Diktat"),
};

export default async function DiktatCompilerPage() {
  await assertTutorOrAdmin();

  const [allDiktats, allCourses, allChapters] = await Promise.all([
    db
      .select()
      .from(diktats)
      .orderBy(desc(diktats.createdAt))
      .limit(100),
    db.select({ id: courses.id, title: courses.title }).from(courses),
    db
      .select({
        id: chapters.id,
        courseId: chapters.courseId,
        title: chapters.title,
        orderIndex: chapters.orderIndex,
        status: chapters.status,
      })
      .from(chapters)
      .orderBy(asc(chapters.orderIndex)),
  ]);

  const serializedDiktats = allDiktats.map((d) => ({
    ...d,
    fileUrl: d.fileUrl ? storage.getUrl(d.fileUrl) : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));

  const courseMap = Object.fromEntries(allCourses.map((c) => [c.id, c.title]));

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={FileStack}
        title="Kompilasi Diktat"
        description="Kelola generasi PDF diktat otomatis."
      />
      <DiktatCompilerClient
        initialDiktats={serializedDiktats}
        courses={allCourses}
        chapters={allChapters}
        courseMap={courseMap}
      />
    </div>
  );
}
