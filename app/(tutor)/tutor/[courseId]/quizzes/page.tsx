import { notFound } from "next/navigation";
import { db } from "@/db";
import { quizTemplates, aiQuestionBank, courses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { verifyTutorAccess } from "@/app/actions/tutor-management";
import { QuizzesClient } from "./quizzes-client";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props) {
  const { courseId } = await params;
  const [c] = await db.select({ title: courses.title }).from(courses).where(eq(courses.id, courseId)).limit(1);
  return {
    title: pageTitle(c ? `Kelola Kuis: ${c.title}` : "Kelola Kuis"),
  };
}

export default async function TutorQuizzesPage({ params }: Props) {
  const { courseId } = await params;

  // Verify access
  await verifyTutorAccess(courseId);

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!course) notFound();

  // Load quiz templates
  const templatesList = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.courseId, courseId))
    .orderBy(desc(quizTemplates.createdAt));

  // Load all question bank questions
  const questionBankList = await db
    .select()
    .from(aiQuestionBank)
    .where(eq(aiQuestionBank.courseId, courseId))
    .orderBy(desc(aiQuestionBank.createdAt));

  return (
    <div className="px-6 py-8 max-w-5xl space-y-8 font-sans">
      <Reveal>
        <div className="flex flex-col gap-1">
          <h1 className="text-h5 font-heading font-bold text-foreground">
            Kelola Kuis & Bank Soal
          </h1>
          <p className="text-body-sm text-muted-foreground">
            {course.title} · Buat template kuis evaluasi dan simpan bank soal terstruktur.
          </p>
        </div>
      </Reveal>

      <Reveal>
        <QuizzesClient
          courseId={courseId}
          initialTemplates={templatesList}
          initialQuestionBank={questionBankList}
        />
      </Reveal>
    </div>
  );
}
