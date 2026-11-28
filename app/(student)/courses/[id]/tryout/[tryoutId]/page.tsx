import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Lock } from "lucide-react";
import { checkFullCourseContentAccess } from "@/app/(student)/dashboard/actions";
import { getAuthSession } from "@/lib/auth-session";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { TryoutForm } from "@/components/course/tryout-form";
import { StudentSubmissionReviewView } from "@/components/course/student-submission-review-view";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata } from "@/lib/site";
import { getCourse } from "@/lib/course-utils";
import { db } from "@/db";
import { exams, questions } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";
import type { ExamFixture, QuestionType } from "@/lib/student-course-fixtures";
import type { ExtendedSubmissionReview } from "@/app/(student)/courses/[id]/my-results/[submissionId]/review-client";
import { TranslatedText } from "@/components/i18n/translated-text";
import { FormattedDate } from "@/components/ui/formatted-date";
import { getTranslations } from "@/lib/i18n/server";
import { recordAssessmentDiscussionAccess } from "@/lib/asesmen/discussion-access";

type Props = {
  params: Promise<{ id: string; tryoutId: string }>;
  searchParams: Promise<{ view?: string; viewDiscussion?: string }>;
};

function publicOptionTexts(value: unknown): string[] {
  const options = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  return options
    .map((option) => {
      if (typeof option === "string") return option;
      if (!option || typeof option !== "object" || Array.isArray(option)) return null;
      const record = option as Record<string, unknown>;
      for (const key of ["text", "label", "value", "content"]) {
        if (typeof record[key] === "string") return record[key];
      }
      return null;
    })
    .filter((option): option is string => option !== null);
}

function publicExamSettings(value: unknown): ExamFixture["settings"] {
  const parsed =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return null;
          }
        })()
      : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { timeLimitMinutes: 90, maxAttempts: 2 };
  }

  const settings = parsed as Record<string, unknown>;
  return {
    ...(typeof settings.timeLimitMinutes === "number"
      ? { timeLimitMinutes: settings.timeLimitMinutes }
      : {}),
    ...(typeof settings.maxAttempts === "number" ? { maxAttempts: settings.maxAttempts } : {}),
    ...(typeof settings.oneTimeOnly === "boolean" ? { oneTimeOnly: settings.oneTimeOnly } : {}),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, tryoutId } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");

  let examTitle = t("metadata.tryoutTitleFallback");
  const [dbExam] = course
    ? await db
        .select({ title: exams.title })
        .from(exams)
        .where(
          and(
            eq(exams.id, tryoutId),
            eq(exams.courseId, course.legacyId ?? id),
            eq(exams.type, "tryout"),
            eq(exams.status, "published"),
          ),
        )
        .limit(1)
    : [];
  if (dbExam) examTitle = dbExam.title;

  return createMetadata({
    title: course ? `${examTitle} (${course.title})` : examTitle,
    description: course
      ? t("metadata.tryoutDetailDescription", { title: examTitle, course: course.title })
      : t("metadata.tryoutDescription"),
    path: `/courses/${id}/tryout/${tryoutId}`,
  });
}

export default async function CourseTryoutTakePage({ params, searchParams }: Props) {
  const { id, tryoutId } = await params;
  const { view, viewDiscussion } = await searchParams;
  const isDirectReview = view === "review" || viewDiscussion === "true";

  const course = await getCourse(id);
  if (!course) notFound();

  const [dbExam] = await db
    .select()
    .from(exams)
    .where(
      and(
        eq(exams.id, tryoutId),
        eq(exams.courseId, course.legacyId ?? id),
        eq(exams.type, "tryout"),
        eq(exams.status, "published"),
      ),
    )
    .limit(1);
  if (!dbExam) notFound();

  // Enforce openAt and closeAt check for taking (direct review still allowed after close)
  const now = new Date();
  const openDate = dbExam.openAt ? new Date(dbExam.openAt) : null;
  const closeDate = dbExam.closeAt ? new Date(dbExam.closeAt) : null;

  if (!isDirectReview && openDate && now < openDate) {
    return (
      <CoursePageShell
        title={<TranslatedText namespace="learning" messageKey="tryoutTake.notOpen" />}
        description={dbExam.title}
        hideHeader
      >
        <Reveal>
          <div className="py-4 text-center">
            <h3 className="font-heading text-body-base font-bold text-foreground">
              <TranslatedText namespace="learning" messageKey="tryoutTake.notOpen" />
            </h3>
            <p className="mt-2 text-body-sm text-muted-foreground">
              <TranslatedText namespace="learning" messageKey="tryoutTake.opensOn" />{" "}
              <strong className="text-foreground">
                <FormattedDate
                  date={openDate}
                  options={{ dateStyle: "medium", timeStyle: "short" }}
                />
              </strong>
              .
            </p>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  if (!isDirectReview && closeDate && now > closeDate) {
    return (
      <CoursePageShell
        title={<TranslatedText namespace="learning" messageKey="tryoutTake.closed" />}
        description={dbExam.title}
        hideHeader
      >
        <Reveal>
          <div className="py-4 text-center">
            <h3 className="font-heading text-body-base font-bold text-foreground">
              <TranslatedText namespace="learning" messageKey="tryoutTake.closed" />
            </h3>
            <p className="mt-2 text-body-sm text-muted-foreground">
              <TranslatedText namespace="learning" messageKey="tryoutTake.closedSince" />{" "}
              <strong className="text-foreground">
                <FormattedDate
                  date={closeDate}
                  options={{ dateStyle: "medium", timeStyle: "short" }}
                />
              </strong>
              .
            </p>
            <div className="mt-5 flex justify-center">
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href={`/courses/${id}/tryout/${tryoutId}?view=review`}>
                  <BookOpen className="size-4" aria-hidden />
                  Lihat Pembahasan
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  const [hasFullContentAccess, session] = await Promise.all([
    checkFullCourseContentAccess(id),
    getAuthSession(),
  ]);

  if (!hasFullContentAccess) {
    return (
      <CoursePageShell
        title={<TranslatedText namespace="learning" messageKey="tryoutTake.locked" />}
        description={
          <TranslatedText
            namespace="learning"
            messageKey="tryoutTake.premiumDescription"
            values={{ course: course.title }}
          />
        }
        backHref={`/courses/${id}/tryout`}
        backLabel={<TranslatedText namespace="learning" messageKey="tryoutTake.backToList" />}
      >
        <Reveal>
          <div className="border-t border-border/70 py-3">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                <Lock className="size-5" />
              </div>
              <div>
                <h3 className="font-heading text-body-base font-bold text-foreground">
                  <TranslatedText namespace="learning" messageKey="tryoutTake.needToken" />
                </h3>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  <TranslatedText
                    namespace="learning"
                    messageKey="tryoutTake.activateToOpen"
                    values={{ exam: dbExam.title }}
                  />
                </p>
              </div>
            </div>
            <div className="mt-4">
              <EnrollmentForm />
            </div>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  const dbQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, tryoutId))
    .orderBy(asc(questions.order));

  if (isDirectReview) {
    let openedBeforeCompletion = true;
    if (session?.user?.id) {
      const accessRecord = await recordAssessmentDiscussionAccess({
        userId: session.user.id,
        courseId: course.canonicalId ?? course.id,
        assessmentKind: "tryout",
        assessmentId: tryoutId,
      });
      openedBeforeCompletion = accessRecord.openedBeforeCompletion;
    }

    const review: ExtendedSubmissionReview = {
      id: `direct-review-${dbExam.id}`,
      courseId: id,
      examId: dbExam.id,
      examTitle: dbExam.title,
      examType: "tryout",
      leaderboardEligible: !openedBeforeCompletion,
      items: dbQuestions.map((q) => {
        const content = typeof q.content === "string" ? JSON.parse(q.content) : q.content;
        const options = publicOptionTexts(content.options);
        const qType = (q.type as QuestionType) || "multiple_choice";

        let correctIndices: number[] | undefined;
        let correctAnswerLabel: string | undefined;

        if (qType === "multiple_choice" && typeof content.correctIndex === "number") {
          correctIndices = [content.correctIndex];
          correctAnswerLabel =
            String.fromCharCode(65 + content.correctIndex) +
            ". " +
            (options[content.correctIndex] ?? "");
        } else if (qType === "multiple_choices" && Array.isArray(content.correctIndices)) {
          correctIndices = content.correctIndices;
          correctAnswerLabel = content.correctIndices
            .map((idx: number) => String.fromCharCode(65 + idx))
            .join(", ");
        } else if (qType === "short_answer" && Array.isArray(content.acceptableAnswers)) {
          correctAnswerLabel = content.acceptableAnswers.join(" / ");
        }

        return {
          questionId: q.id,
          prompt: content.prompt ?? "",
          promptUi: content.promptUi ?? content.prompt_ui ?? null,
          questionType: qType,
          options: options.length > 0 ? options : undefined,
          correctIndices,
          acceptableAnswers: Array.isArray(content.acceptableAnswers)
            ? content.acceptableAnswers
            : undefined,
          userAnswer: "",
          correct: null,
          correctAnswerLabel,
          explanationText: content.explanation ?? "",
          explanationUi: content.explanationUi ?? content.explanation_ui ?? null,
          explanationImage: content.explanationImage ?? undefined,
          explanationVideoUrl: content.explanationVideoUrl ?? undefined,
          explanationVideoKind: content.explanationVideoKind ?? undefined,
          origin: content.origin,
          sourceEventName: content.sourceEventName,
          sourceReferenceId: content.sourceReferenceId,
        };
      }),
    };

    const isStillOpen = (!openDate || now >= openDate) && (!closeDate || now <= closeDate);

    return (
      <StudentSubmissionReviewView
        courseId={id}
        backHref={`/courses/${id}/tryout`}
        backLabel={<TranslatedText namespace="learning" messageKey="tryoutTake.backToList" />}
        listItem={{
          id: review.id,
          courseId: id,
          examId: dbExam.id,
          examTitle: dbExam.title,
          examType: "tryout",
          status: "completed",
          score: null,
          submittedAt: new Date().toISOString(),
        }}
        review={review}
        isDirectPreview={true}
        leaderboardEligible={!openedBeforeCompletion}
        startActionHref={isStillOpen ? `/courses/${id}/tryout/${tryoutId}` : undefined}
        defaultViewMode="focused"
      />
    );
  }

  const exam = {
    id: dbExam.id,
    courseId: id,
    title: dbExam.title,
    type: "tryout" as const,
    status: dbExam.status,
    settings: publicExamSettings(dbExam.settings),
    questions: dbQuestions.map((q) => {
      const content = typeof q.content === "string" ? JSON.parse(q.content) : q.content;
      return {
        id: q.id,
        order: q.order,
        type: q.type as any,
        prompt: content.prompt,
        options: publicOptionTexts(content.options),
        acceptsImage: content.acceptsImage,
        acceptsFile: content.acceptsFile,
        origin: content.origin,
        sourceEventName: content.sourceEventName,
        sourceReferenceId: content.sourceReferenceId,
      };
    }),
  } as unknown as ExamFixture;

  return (
    <CoursePageShell
      title={exam.title}
      description={<TranslatedText namespace="learning" messageKey="tryoutTake.instructions" />}
      hideHeader
    >
      {dbQuestions.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5 text-body-xs text-muted-foreground">
          <span>
            Membuka pembahasan sebelum mengerjakan membuat nilai tidak masuk leaderboard, namun pengerjaan tetap tercatat.
          </span>
          <Button asChild variant="outline" size="xs" className="shrink-0 gap-1.5">
            <Link href={`/courses/${id}/tryout/${tryoutId}?view=review`}>
              <BookOpen className="size-3.5" aria-hidden />
              Lihat Pembahasan
            </Link>
          </Button>
        </div>
      )}
      <TryoutForm
        courseId={id}
        visualCourseId={dbExam.courseId}
        exam={exam}
        userId={session?.user?.id ?? null}
      />
    </CoursePageShell>
  );
}
