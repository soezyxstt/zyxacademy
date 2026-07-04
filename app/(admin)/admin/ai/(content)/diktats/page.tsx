import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { diktats, courses, chapters } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import { DiktatCompilerClient } from "./diktats-client";
import { storage } from "@/lib/storage";

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
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 space-y-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">Kompilasi Diktat</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Kelola generasi PDF diktat otomatis.
        </p>
      </div>
      <DiktatCompilerClient
        initialDiktats={serializedDiktats}
        courses={allCourses}
        chapters={allChapters}
        courseMap={courseMap}
      />
    </div>
  );
}
