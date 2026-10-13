import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata, pageTitle } from "@/lib/site";
import { db } from "@/db";
import { studentQuizAttempts, submissions, exams } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { AttemptReview } from "@/components/course/attempt-review";
import { ReviewClient } from "./review-client";
import { getCourse } from "@/lib/course-utils";

type Props = { params: Promise<{ id: string; submissionId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, submissionId } = await params;
  const course = await getCourse(id);

  return createMetadata({
    title: course ? `Tinjau Jawaban ${course.title}` : "Tinjau Jawaban",
    description: "Tinjau jawaban kuis atau tryout Anda dengan pembahasan terstruktur.",
    path: `/courses/${id}/my-results/${submissionId}`,
  });
}


export default async function SubmissionReviewPage({ params }: Props) {
  const { id, submissionId } = await params;
  
  const course = await getCourse(id);

  if (!course) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) notFound();

  // 1. Check if it's a quiz attempt
  const [attempt] = await db
    .select()
    .from(studentQuizAttempts)
    .where(
      and(
        eq(studentQuizAttempts.id, submissionId),
        eq(studentQuizAttempts.studentId, session.user.id)
      )
    )
    .limit(1);

  if (attempt) {
    return (
      <CoursePageShell title="Review kuis" description="Pembahasan kuis Anda" hideHeader>
        <Reveal>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Button
              asChild
              variant="outline"
              className="interactive rounded-md border-border/80 text-muted-foreground hover:text-foreground"
            >
              <Link href={`/courses/${id}/my-results`}>Kembali ke hasil</Link>
            </Button>

            <Button asChild size="sm" className="rounded-md bg-brand-primary text-white hover:bg-brand-primary/90 font-semibold shadow-xs">
              <Link href={`/courses/${id}/my-results/${submissionId}/summary`}>
                Lihat Diagnosis & Rencana Belajar
              </Link>
            </Button>
          </div>

          <AttemptReview attemptId={submissionId} />
        </Reveal>
      </CoursePageShell>
    );
  }

  // 2. Otherwise try loading from database
  let listItem: any = null;
  let review: any = null;

  if (!listItem || !review) {
    const [dbSub] = await db
      .select({
        id: submissions.id,
        examId: submissions.examId,
        status: submissions.status,
        score: submissions.score,
        teacherNotes: submissions.teacherNotes,
        answersSnapshot: submissions.answersSnapshot,
        questionsSnapshot: submissions.questionsSnapshot,
        submittedAt: submissions.submittedAt,
        examTitle: exams.title,
      })
      .from(submissions)
      .innerJoin(exams, eq(submissions.examId, exams.id))
      .where(and(eq(submissions.id, submissionId), eq(submissions.userId, session.user.id)))
      .limit(1);

    if (dbSub) {
      const qSnapshot = typeof dbSub.questionsSnapshot === "string"
        ? JSON.parse(dbSub.questionsSnapshot)
        : dbSub.questionsSnapshot || [];
      const aSnapshot = typeof dbSub.answersSnapshot === "string"
        ? JSON.parse(dbSub.answersSnapshot)
        : dbSub.answersSnapshot || {};

      listItem = {
        id: dbSub.id,
        courseId: id,
        examId: dbSub.examId,
        examTitle: dbSub.examTitle,
        examType: "tryout",
        status: dbSub.status as any,
        score: dbSub.score,
        submittedAt: dbSub.submittedAt ? dbSub.submittedAt.toISOString() : new Date().toISOString(),
      };

      review = {
        id: dbSub.id,
        courseId: id,
        examId: dbSub.examId,
        examTitle: dbSub.examTitle,
        examType: "tryout",
        items: qSnapshot.map((q: any) => {
          const ans = aSnapshot[q.id];
          const isCorrect = q.type === "multiple_choice"
            ? (ans?.index === q.correctIndex)
            : q.type === "multiple_choices"
            ? (ans?.indices?.length === q.correctIndices?.length && ans?.indices?.every((val: number) => q.correctIndices.includes(val)))
            : q.type === "short_answer"
            ? (q.acceptableAnswers?.map((x: string) => x.trim().toLowerCase()).includes((ans?.text || "").trim().toLowerCase()))
            : null;

          let userAnswerLabel = "";
          if (q.type === "multiple_choice" && ans?.index !== null) {
            userAnswerLabel = String.fromCharCode(65 + ans.index) + ". " + q.options[ans.index];
          } else if (q.type === "multiple_choices" && ans?.indices) {
            userAnswerLabel = ans.indices.map((idx: number) => String.fromCharCode(65 + idx)).join(", ");
          } else {
            userAnswerLabel = ans?.text || "";
          }

          let correctAnswerLabel = "";
          if (q.type === "multiple_choice") {
            correctAnswerLabel = String.fromCharCode(65 + q.correctIndex) + ". " + q.options[q.correctIndex];
          } else if (q.type === "multiple_choices") {
            correctAnswerLabel = q.correctIndices?.map((idx: number) => String.fromCharCode(65 + idx)).join(", ");
          } else if (q.type === "short_answer") {
            correctAnswerLabel = q.acceptableAnswers?.join(" / ");
          }

          return {
            questionId: q.id,
            prompt: q.prompt,
            questionType: q.type,
            userAnswer: userAnswerLabel,
            correct: isCorrect,
            correctAnswerLabel: correctAnswerLabel || undefined,
            teacherNote: dbSub.teacherNotes,
            explanationText: q.explanation || "",
            origin: q.origin,
            sourceEventName: q.sourceEventName,
            sourceReferenceId: q.sourceReferenceId,
          };
        }),
      };
    }
  }

  if (!listItem || !review) notFound();

  return (
    <CoursePageShell title="Review jawaban" description={review.examTitle} hideHeader>
      <Reveal>
        <div className="mb-4">
          <Button
            asChild
            variant="outline"
            className="interactive rounded-md border-border/80 text-muted-foreground hover:text-foreground"
          >
            <Link href={`/courses/${id}/my-results`}>Kembali ke hasil</Link>
          </Button>
        </div>

        <ReviewClient courseId={id} listItem={listItem} review={review} />
      </Reveal>
    </CoursePageShell>
  );
}
