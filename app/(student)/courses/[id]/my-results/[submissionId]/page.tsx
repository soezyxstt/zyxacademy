import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata } from "@/lib/site";
import { db } from "@/db";
import { studentQuizAttempts, submissions, exams } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { AttemptReview } from "@/components/course/attempt-review";
import { StudentSubmissionReviewView } from "@/components/course/student-submission-review-view";
import { getCourse } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

type Props = { params: Promise<{ id: string; submissionId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, submissionId } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");

  return createMetadata({
    title: course
      ? t("metadata.reviewTitle", { course: course.title })
      : t("metadata.reviewTitleFallback"),
    description: t("metadata.reviewDescription"),
    path: `/courses/${id}/my-results/${submissionId}`,
  });
}

export default async function SubmissionReviewPage({ params }: Props) {
  const { id, submissionId } = await params;

  const course = await getCourse(id);

  if (!course) notFound();

  const session = await getAuthSession();
  if (!session?.user) notFound();

  // 1. Check if it's a quiz attempt
  const [attempt] = await db
    .select()
    .from(studentQuizAttempts)
    .where(
      and(
        eq(studentQuizAttempts.id, submissionId),
        eq(studentQuizAttempts.studentId, session.user.id),
      ),
    )
    .limit(1);

  if (attempt) {
    return (
      <CoursePageShell
        title={<TranslatedText namespace="learning" messageKey="reviewPage.quizTitle" />}
        hideHeader
      >
        <Reveal>
          <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
            <Button
              asChild
              size="sm"
              className="rounded-md bg-brand-primary font-semibold text-primary-foreground shadow-xs hover:bg-brand-primary/90"
            >
              <Link href={`/courses/${id}/my-results/${submissionId}/summary`}>
                <TranslatedText namespace="learning" messageKey="reviewPage.viewDiagnosis" />
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
  let leaderboardEligible = true;

  if (!listItem || !review) {
    const [dbSub] = await db
      .select({
        id: submissions.id,
        examId: submissions.examId,
        status: submissions.status,
        score: submissions.score,
        leaderboardEligible: submissions.leaderboardEligible,
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
      leaderboardEligible = dbSub.leaderboardEligible ?? true;
      const qSnapshot =
        typeof dbSub.questionsSnapshot === "string"
          ? JSON.parse(dbSub.questionsSnapshot)
          : dbSub.questionsSnapshot || [];
      const aSnapshot =
        typeof dbSub.answersSnapshot === "string"
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
        leaderboardEligible,
        items: qSnapshot.map((q: any) => {
          const ans = aSnapshot[q.id];
          const isCorrect =
            q.type === "multiple_choice"
              ? ans?.index === q.correctIndex
              : q.type === "multiple_choices"
                ? ans?.indices?.length === q.correctIndices?.length &&
                  ans?.indices?.every((val: number) => q.correctIndices.includes(val))
                : q.type === "short_answer"
                  ? q.acceptableAnswers
                      ?.map((x: string) => x.trim().toLowerCase())
                      .includes((ans?.text || "").trim().toLowerCase())
                  : null;

          let userAnswerLabel = "";
          if (q.type === "multiple_choice" && ans?.index !== null && ans?.index !== undefined) {
            userAnswerLabel = String.fromCharCode(65 + ans.index) + ". " + (q.options?.[ans.index] ?? "");
          } else if (q.type === "multiple_choices" && Array.isArray(ans?.indices)) {
            userAnswerLabel = ans.indices
              .map((idx: number) => String.fromCharCode(65 + idx))
              .join(", ");
          } else {
            userAnswerLabel = ans?.text || "";
          }

          let correctAnswerLabel = "";
          if (q.type === "multiple_choice" && typeof q.correctIndex === "number") {
            correctAnswerLabel =
              String.fromCharCode(65 + q.correctIndex) + ". " + (q.options?.[q.correctIndex] ?? "");
          } else if (q.type === "multiple_choices" && Array.isArray(q.correctIndices)) {
            correctAnswerLabel = q.correctIndices
              .map((idx: number) => String.fromCharCode(65 + idx))
              .join(", ");
          } else if (q.type === "short_answer") {
            correctAnswerLabel = q.acceptableAnswers?.join(" / ");
          }

          const studentSelectedIndices =
            q.type === "multiple_choice" && typeof ans?.index === "number"
              ? [ans.index]
              : q.type === "multiple_choices" && Array.isArray(ans?.indices)
                ? ans.indices
                : undefined;

          const correctIndices =
            q.type === "multiple_choice" && typeof q.correctIndex === "number"
              ? [q.correctIndex]
              : q.type === "multiple_choices" && Array.isArray(q.correctIndices)
                ? q.correctIndices
                : undefined;

          return {
            questionId: q.id,
            prompt: q.prompt,
            promptUi: q.promptUi ?? q.prompt_ui ?? null,
            questionType: q.type,
            options: Array.isArray(q.options) ? q.options : undefined,
            studentSelectedIndices,
            correctIndices,
            acceptableAnswers: Array.isArray(q.acceptableAnswers) ? q.acceptableAnswers : undefined,
            userAnswer: userAnswerLabel,
            submittedFileKey: ans?.fileKey ?? null,
            submittedFileName: ans?.fileName ?? null,
            submittedFileSize: ans?.fileSize ?? null,
            correct: isCorrect,
            correctAnswerLabel: correctAnswerLabel || undefined,
            teacherNote: dbSub.teacherNotes,
            explanationText: q.explanation || "",
            explanationUi: q.explanationUi ?? q.explanation_ui ?? null,
            explanationImage: q.explanationImage ?? undefined,
            explanationVideoUrl: q.explanationVideoUrl ?? undefined,
            explanationVideoKind: q.explanationVideoKind ?? undefined,
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
    <StudentSubmissionReviewView
      courseId={id}
      backHref={`/courses/${id}/my-results`}
      listItem={listItem}
      review={review}
      leaderboardEligible={leaderboardEligible}
    />
  );
}
