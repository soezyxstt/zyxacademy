import { notFound } from "next/navigation";
import { db } from "@/db";
import { submissions, exams, user, courses } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { verifyTutorAccess } from "@/app/actions/tutor-management";
import { GradingClient } from "./grading-client";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props) {
  const { courseId } = await params;
  const [c] = await db.select({ title: courses.title }).from(courses).where(eq(courses.id, courseId)).limit(1);
  return {
    title: pageTitle(c ? `Penilaian Tryout: ${c.title}` : "Penilaian Tryout"),
    description: c
      ? `Nilai dan review jawaban tryout siswa untuk ${c.title}.`
      : "Nilai dan review jawaban tryout siswa.",
  };
}

export default async function TutorGradingPage({ params }: Props) {
  const { courseId } = await params;

  // Verify access
  await verifyTutorAccess(courseId);

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!course) notFound();

  // Load all student submissions for tryouts in this course
  const submissionsList = await db
    .select({
      id: submissions.id,
      studentName: user.name,
      studentEmail: user.email,
      examTitle: exams.title,
      status: submissions.status,
      score: submissions.score,
      teacherNotes: submissions.teacherNotes,
      answersSnapshot: submissions.answersSnapshot,
      questionsSnapshot: submissions.questionsSnapshot,
      submittedAt: submissions.submittedAt,
    })
    .from(submissions)
    .innerJoin(exams, eq(submissions.examId, exams.id))
    .innerJoin(user, eq(submissions.userId, user.id))
    .where(and(eq(exams.courseId, courseId), eq(exams.type, "tryout")))
    .orderBy(desc(submissions.submittedAt));

  return (
    <div className="px-6 py-8 max-w-5xl space-y-8 font-sans">
      <Reveal>
        <div className="flex flex-col gap-1">
          <h1 className="text-h5 font-heading font-bold text-foreground">
            Penilaian Tryout & Ujian
          </h1>
          <p className="text-body-sm text-muted-foreground">
            {course.title} · Periksa jawaban essay siswa, masukkan skor akhir, dan berikan masukan belajar.
          </p>
        </div>
      </Reveal>

      <Reveal>
        <GradingClient courseId={courseId} initialSubmissions={submissionsList} />
      </Reveal>
    </div>
  );
}
