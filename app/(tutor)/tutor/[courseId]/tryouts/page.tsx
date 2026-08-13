import { notFound } from "next/navigation";
import { db } from "@/db";
import { aiQuestionBank, exams, questions, courses } from "@/db/schema";
import { eq, and, desc, inArray, asc } from "drizzle-orm";
import { verifyTutorAccess } from "@/app/actions/tutor-management";
import { TryoutsClient } from "./tryouts-client";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props) {
  const { courseId } = await params;
  const [c] = await db.select({ title: courses.title }).from(courses).where(eq(courses.id, courseId)).limit(1);
  return {
    title: pageTitle(c ? `Kelola Tryout: ${c.title}` : "Kelola Tryout"),
    description: c
      ? `Buat dan kelola tryout untuk ${c.title}.`
      : "Buat dan kelola tryout untuk kelas.",
  };
}

export default async function TutorTryoutsPage({ params }: Props) {
  const { courseId } = await params;

  // Verify access
  await verifyTutorAccess(courseId);

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!course) notFound();

  // Load all tryout exams
  const tryoutsList = await db
    .select()
    .from(exams)
    .where(and(eq(exams.courseId, courseId), eq(exams.type, "tryout")))
    .orderBy(desc(exams.createdAt));

  // Load questions for these tryouts
  const tryoutIds = tryoutsList.map((t) => t.id);
  const questionsList = tryoutIds.length > 0
    ? await db
        .select()
        .from(questions)
        .where(inArray(questions.examId, tryoutIds))
        .orderBy(asc(questions.order))
    : [];
  const questionBank = await db
    .select({
      id: aiQuestionBank.id,
      prompt: aiQuestionBank.prompt,
      questionType: aiQuestionBank.questionType,
      difficulty: aiQuestionBank.difficulty,
      origin: aiQuestionBank.origin,
      sourceEventName: aiQuestionBank.sourceEventName,
    })
    .from(aiQuestionBank)
    .where(and(eq(aiQuestionBank.courseId, courseId), eq(aiQuestionBank.reviewStatus, "published")))
    .orderBy(asc(aiQuestionBank.createdAt));

  return (
    <div className="px-6 py-8 max-w-5xl space-y-8 font-sans">
      <Reveal>
        <div className="flex flex-col gap-1">
          <h1 className="text-h4 font-heading font-bold text-foreground">
            Kelola Tryout Ujian
          </h1>
          <p className="text-body-sm text-muted-foreground">
            {course.title} · Buat ujian simulasi terstruktur, atur waktu, dan tambahkan pertanyaan esai/pilihan ganda.
          </p>
        </div>
      </Reveal>

      <Reveal>
        <TryoutsClient
          courseId={courseId}
          initialTryouts={tryoutsList}
          initialQuestions={questionsList}
          questionBank={questionBank}
        />
      </Reveal>
    </div>
  );
}
