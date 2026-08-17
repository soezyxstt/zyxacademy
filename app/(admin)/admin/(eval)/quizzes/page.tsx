import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { quizTemplates, courses } from "@/db/schema";
import { desc } from "drizzle-orm";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import { QuizzesCurationClient } from "./quizzes-client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { NotebookPen } from "lucide-react";

export const metadata: Metadata = {
  title: pageTitle("Kelola Template Kuis"),
};

type Props = {
  searchParams: Promise<{ courseId?: string; tags?: string }>;
};

export default async function AIQuizzesPage({ searchParams }: Props) {
  await assertTutorOrAdmin();

  const { courseId: prefillCourseId, tags: prefillTags } = await searchParams;

  const [templates, allCourses] = await Promise.all([
    db
      .select()
      .from(quizTemplates)
      .orderBy(desc(quizTemplates.createdAt)),
    db.select({ id: courses.id, title: courses.title }).from(courses),
  ]);

  const courseMap = Object.fromEntries(allCourses.map((c) => [c.id, c.title]));

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={NotebookPen}
        title="Template Kuis"
        description="Kelola kuis mandiri dan kurasi soal-soal AI."
      />
      <QuizzesCurationClient
        initialTemplates={templates}
        courses={allCourses}
        courseMap={courseMap}
        prefillCourseId={prefillCourseId}
        prefillTags={prefillTags}
      />
    </div>
  );
}
