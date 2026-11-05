import { StudentQuizReview } from "@/components/course/student-quiz-review";
import { StudentQuizGateway } from "@/components/course/student-quiz-gateway";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Lock, ArrowLeft } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { QuizPlayer } from "@/components/course/quiz-player";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata} from "@/lib/site";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts, aiQuestionBank, knowledgeObjects, chapters } from "@/db/schema";
import { and, or, eq, desc, sql, inArray } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { QuizStartButton } from "./quiz-start-button";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";
import { normalizeDate } from "@/lib/date-utils";
import { extractFreeQuizChapterScope, getCourse, isFreeQuizTemplate } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { resolveCourseAccess } from "@/lib/student/course-access";

type Props = {
  params: Promise<{ id: string; quizId: string }>;
  searchParams: Promise<{ attemptId?: string; viewDiscussion?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, quizId } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");

  const courseIds = course
    ? [...new Set([course.id, course.canonicalId, course.legacyId, id].filter((value): value is string => Boolean(value)))]
    : [];
  const [template] = courseIds.length > 0
    ? await db
        .select({ title: quizTemplates.title })
        .from(quizTemplates)
        .where(and(eq(quizTemplates.id, quizId), inArray(quizTemplates.courseId, courseIds)))
        .limit(1)
    : [];

  const title = course && template ? `${template.title} (${course.title})` : template ? template.title : t("metadata.quizTitleFallback");
  const description = course && template ? t("metadata.quizDetailDescription", { title: template.title, course: course.title }) : t("metadata.quizDescription");

  return createMetadata({
    title,
    description,
    path: `/courses/${id}/quiz/${quizId}`,
  });
}


/**
 * Formats a duration in seconds into human-readable Indonesian minutes and seconds.
 */

/**
 * Extracts display text strings from option structures.
 */
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

/**
 * Server component page for taking a quiz or reviewing completed quiz attempts.
 */
export default async function CourseQuizTakePage({ params, searchParams }: Props) {
  const { id, quizId } = await params;
  const { attemptId, viewDiscussion } = await searchParams;

  const session = await getAuthSession();
  const studentId = session?.user?.id;
  if (!studentId) {
    return redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/quiz/${quizId}`)}`);
  }

  const course = await getCourse(id);

  const courseIds = course
    ? [...new Set([course.id, course.canonicalId, course.legacyId, id].filter((value): value is string => Boolean(value)))]
    : [];
  const [template] = courseIds.length > 0
    ? await db
        .select()
        .from(quizTemplates)
        .where(and(eq(quizTemplates.id, quizId), inArray(quizTemplates.courseId, courseIds)))
        .limit(1)
    : [];

  if (!course || !template) notFound();

  const role = (session.user as { role?: string | null }).role;
  // The central resolver binds staff access to this active course. A tutor
  // without an assignment must not see draft quizzes or use the attempt flow
  // merely because the session contains a teacher-like role string.
  const access = await resolveCourseAccess({
    courseId: course.canonicalId ?? course.id,
    userId: studentId,
    roleHint: role,
  });
  const isStaff = access.tier === "staff";
  if (template.status === "draft" && !isStaff) {
    notFound();
  }

  // Access is resolved on the server. Free users may start only a regular
  // quiz whose complete chapter scope is within the first two chapters.
  const isEnrolled = access.tier === "enrolled";
  const parsedAccessRules = typeof template.selectionRules === "string"
    ? (() => { try { return JSON.parse(template.selectionRules); } catch { return {}; } })()
    : template.selectionRules;
  const rules = (parsedAccessRules ?? {}) as {
    tags?: string[];
    count?: number;
    difficulty_proportions?: Record<string, number>;
    chapterId?: string;
    chapterIds?: string[];
    fixedQuestionIds?: string[];
    fixed_question_ids?: string[];
    questionIds?: string[];
    question_ids?: string[];
  };
  const isFree = access?.tier === "free";
  const isFreeQuizScoped = isFree && isFreeQuizTemplate(template, access.freeChapterIds);
  const isAccessible = access.hasCourseAccess && (isStaff || isEnrolled || isFreeQuizScoped);

  const rawFixedQuestionIds = rules.fixedQuestionIds
    ?? rules.fixed_question_ids
    ?? rules.questionIds
    ?? rules.question_ids;
  const declaredFixedQuestionIds = Array.isArray(rawFixedQuestionIds)
    ? rawFixedQuestionIds.map((questionId) => typeof questionId === "string" ? questionId.trim() : "")
    : null;
  const hasMalformedFixedQuestionIds = rawFixedQuestionIds !== undefined
    && (!declaredFixedQuestionIds
      || declaredFixedQuestionIds.some((questionId) => !questionId)
      || new Set(declaredFixedQuestionIds).size !== declaredFixedQuestionIds.length);
  const fixedQuestionIds = declaredFixedQuestionIds && !hasMalformedFixedQuestionIds
    ? [...new Set(declaredFixedQuestionIds)]
    : [];

  const requestedFreeChapterIds = isFree ? extractFreeQuizChapterScope(rules) : null;
  const freeQuizChapterIds = requestedFreeChapterIds
    ? [...new Set(
        access.freeChapters
          .filter((chapter) => [chapter.id, chapter.canonicalId, chapter.legacyId]
            .some((chapterId) => chapterId && requestedFreeChapterIds.includes(chapterId)))
          .flatMap((chapter) => [chapter.id, chapter.canonicalId, chapter.legacyId])
          .filter((chapterId): chapterId is string => Boolean(chapterId)),
      )]
    : [];

  // Check if questions are available for this template
  const tags = (rules.tags as string[] | undefined) || [];
  const tagConditions = tags.map(
    (tag) => sql`exists (select 1 from jsonb_array_elements_text(${aiQuestionBank.tags}::jsonb) as tag_value where tag_value = ${tag})`
  );
  const tagCondition = tags.length > 0 ? or(...tagConditions) : undefined;
  const quizEligibilityCondition = or(
    eq(aiQuestionBank.origin, "zyx_original"),
    eq(aiQuestionBank.origin, "itb_example"),
    eq(aiQuestionBank.quizEligible, true),
  );
  const chapterScopeCondition = isFree
    ? freeQuizChapterIds.length > 0
      ? sql`exists (select 1 from ${knowledgeObjects} inner join ${chapters} on ${chapters.id} = ${knowledgeObjects.chapterId} where ${knowledgeObjects.id} = ${aiQuestionBank.knowledgeObjectId} and ${knowledgeObjects.status} = 'active' and ${chapters.status} = 'published' and ${inArray(chapters.id, freeQuizChapterIds)})`
      : sql`0 = 1`
    : undefined;
  const questionStateCondition = isFree
    ? and(eq(aiQuestionBank.status, "active"), eq(aiQuestionBank.isStale, false))
    : undefined;
  const fixedQuestionCondition = fixedQuestionIds.length > 0
    ? inArray(aiQuestionBank.id, fixedQuestionIds)
    : undefined;
  const availabilityTagCondition = fixedQuestionIds.length > 0 ? undefined : tagCondition;

  const [questionsCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiQuestionBank)
    .where(
      and(
        eq(aiQuestionBank.courseId, template.courseId),
        eq(aiQuestionBank.reviewStatus, 'published'),
        quizEligibilityCondition,
        questionStateCondition,
        availabilityTagCondition,
        chapterScopeCondition,
        fixedQuestionCondition,
      )
    );
  const availableQuestionCount = questionsCountRow?.count ?? 0;
  const questionsCount = hasMalformedFixedQuestionIds
    ? 0
    : fixedQuestionIds.length > 0
    ? availableQuestionCount === fixedQuestionIds.length ? availableQuestionCount : 0
    : availableQuestionCount;

  if (!isAccessible) {
    return (
      <CoursePageShell title={<TranslatedText namespace="learning" messageKey="quizTake.locked" />} description={<TranslatedText namespace="learning" messageKey="quizTake.premiumDescription" values={{ course: course.title }} />} hideHeader>
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-body-xs font-semibold text-muted-foreground hover:text-foreground">
            <Link href={`/courses/${id}/quiz`}>
              <ArrowLeft className="size-3.5" />
              <span><TranslatedText namespace="learning" messageKey="quizTake.backToList" /></span>
            </Link>
          </Button>
        </div>
        <Reveal>
          <div className="rounded-lg border border-border/70 bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                <Lock className="size-5" />
              </div>
              <div>
                <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="courseAccess.needToken" /></h3>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  Aktifkan kelas untuk membuka &ldquo;{template.title}&rdquo;.
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

  // Check if they are reviewing a completed attempt
  let isReview = false;
  if (attemptId) {
    const [att] = await db
      .select({ status: studentQuizAttempts.status })
      .from(studentQuizAttempts)
      .where(and(
        eq(studentQuizAttempts.id, attemptId),
        eq(studentQuizAttempts.studentId, studentId),
        eq(studentQuizAttempts.templateId, quizId),
      ))
      .limit(1);
    if (att?.status === "completed") {
      isReview = true;
    }
  }

  const parsedRules = typeof template.selectionRules === "string"
    ? (() => { try { return JSON.parse(template.selectionRules); } catch { return {}; } })()
    : (template.selectionRules as Record<string, any>) || {};

  const now = new Date();
  const openDate = template.openAt ? new Date(template.openAt) : null;
  const closeDate = template.closeAt ? new Date(template.closeAt) : null;

  const isClosedManually = template.manualStatus === "closed";
  const isOpenManually = template.manualStatus === "open";
  const isQuizClosed = isClosedManually || (!isOpenManually && closeDate && now > closeDate);

  const explanationRelease = parsedRules?.explanationRelease || ((template as any).showDiscussion === false ? "never" : "after_close");
  const canViewDiscussion = explanationRelease === "immediate" || (explanationRelease === "after_close" && isQuizClosed);
  const isViewDiscussion = viewDiscussion === "true" && canViewDiscussion && explanationRelease !== "never";

  if (!isReview && !isViewDiscussion) {
    if (isClosedManually) {
      return (
        <CoursePageShell title={<TranslatedText namespace="learning" messageKey="quizTake.closed" />} description={template.title} hideHeader>
          <Reveal>
            <div className="rounded-lg border border-border/70 bg-card p-5 text-center">
                <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="quizTake.closed" /></h3>
              <p className="mt-2 text-body-sm text-muted-foreground">
                Kuis ini telah ditutup secara manual oleh admin/tutor.
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <Button asChild variant="outline" size="sm" className="rounded-md border-border/80">
                  <Link href={`/courses/${id}/quiz`}><TranslatedText namespace="learning" messageKey="quizTake.backToList" /></Link>
                </Button>
                {canViewDiscussion && (
                  <Button asChild size="sm" className="rounded-md bg-brand-primary text-primary-foreground">
                    <Link href={`?viewDiscussion=true`}><TranslatedText namespace="learning" messageKey="quizTake.viewDiscussion" /></Link>
                  </Button>
                )}
              </div>
            </div>
          </Reveal>
        </CoursePageShell>
      );
    }

    if (!isOpenManually) {
      if (openDate && now < openDate) {
        return (
          <CoursePageShell title={<TranslatedText namespace="learning" messageKey="quizTake.notOpen" />} description={template.title} hideHeader>
            <Reveal>
              <div className="rounded-lg border border-border/70 bg-card p-5 text-center">
                <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="quizTake.notOpen" /></h3>
                <p className="mt-2 text-body-sm text-muted-foreground">
                  Kuis ini dijadwalkan untuk dibuka pada tanggal{" "}
                  <strong className="text-foreground">{openDate.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</strong>.
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <Button asChild variant="outline" size="sm" className="rounded-md border-border/80">
                    <Link href={`/courses/${id}/quiz`}><TranslatedText namespace="learning" messageKey="quizTake.backToList" /></Link>
                  </Button>
                </div>
              </div>
            </Reveal>
          </CoursePageShell>
        );
      }

      if (closeDate && now > closeDate) {
        return (
          <CoursePageShell title={<TranslatedText namespace="learning" messageKey="quizTake.closed" />} description={template.title} hideHeader>
            <Reveal>
              <div className="rounded-lg border border-border/70 bg-card p-5 text-center">
                <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="quizTake.closed" /></h3>
                <p className="mt-2 text-body-sm text-muted-foreground">
                  Akses kuis ini telah berakhir sejak tanggal{" "}
                  <strong className="text-foreground">{closeDate.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</strong>.
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <Button asChild variant="outline" size="sm" className="rounded-md border-border/80">
                    <Link href={`/courses/${id}/quiz`}><TranslatedText namespace="learning" messageKey="quizTake.backToList" /></Link>
                  </Button>
                  {canViewDiscussion && (
                    <Button asChild size="sm" className="rounded-md bg-brand-primary text-primary-foreground">
                      <Link href={`?viewDiscussion=true`}><TranslatedText namespace="learning" messageKey="quizTake.viewDiscussion" /></Link>
                    </Button>
                  )}
                </div>
              </div>
            </Reveal>
          </CoursePageShell>
        );
      }
    }
  }

  // Fetch previous attempts for list
  const previousAttempts = await db
    .select()
    .from(studentQuizAttempts)
    .where(
      and(
        eq(studentQuizAttempts.studentId, studentId),
        eq(studentQuizAttempts.templateId, quizId)
      )
    )
    .orderBy(desc(studentQuizAttempts.startedAt));

  // Determine active in-progress attempt
  const inProgressAttempt = previousAttempts.find((a) => a.status === "in_progress");

  // ───────────────────────────────────────────────────────────────────────────
  // STATE A, B, C: Unified Discussion & Review
  // ───────────────────────────────────────────────────────────────────────────
  const completedAttempts = previousAttempts.filter((a) => a.status === "completed");

  let targetAttempt = null;
  if (attemptId) {
    targetAttempt = previousAttempts.find((a) => a.id === attemptId);
    if (!targetAttempt) notFound();
  } else if (isViewDiscussion) {
    targetAttempt = completedAttempts[0] || null;
  }

  const isDiscussionOpen = canViewDiscussion && explanationRelease !== "never";
  const shouldShowUnifiedView = (targetAttempt?.status === "completed") || isViewDiscussion;

  // STATE B: Active player taking quiz
  if (targetAttempt?.status === "in_progress") {
    const formattedExam = {
      id: template.id,
      courseId: template.courseId,
      title: template.title,
      type: "quiz" as const,
      status: "published" as const,
      settings: {
        timeLimitSeconds: template.timeLimitSeconds ?? undefined,
        timeLimitMinutes: template.timeLimitSeconds ? Math.round(template.timeLimitSeconds / 60) : 15,
        maxAttempts: template.maxAttempts ?? undefined,
        canGoBack: parsedRules?.canGoBack ?? true,
        requireAllAnswered: parsedRules?.requireAllAnswered ?? false,
        perQuestionTimerEnabled: parsedRules?.perQuestionTimerEnabled ?? false,
        perQuestionTimers: parsedRules?.perQuestionTimers,
        defaultQuestionTimerSeconds: parsedRules?.defaultQuestionTimerSeconds,
        shuffleQuestions: parsedRules?.shuffleQuestions,
        shuffleOptions: parsedRules?.shuffleOptions,
      },
      questions: (targetAttempt.questionsSnapshot as unknown as Array<{
        id: string;
        prompt: string;
        question_type?: string;
        options: string[];
        origin?: "zyx_original" | "historical_reference" | "itb_example";
        sourceEventName?: string | null;
        sourceReferenceId?: string | null;
      }>).map((q, idx) => {
        const isMultiple = q.question_type === "multiple_choices";
        return {
          id: q.id,
          order: idx + 1,
          type: isMultiple ? "multiple_choices" : ((q.question_type as any) || "multiple_choice"),
          prompt: q.prompt,
          options: publicOptionTexts(q.options),
          origin: q.origin,
          sourceEventName: q.sourceEventName,
          sourceReferenceId: q.sourceReferenceId,
        };
      }),
    };

    const initialAnswers: Record<string, any> = {};
    if (targetAttempt.answersSnapshot && typeof targetAttempt.answersSnapshot === "object") {
      const qSnapshot = (targetAttempt.questionsSnapshot as any[]) || [];
      for (const [qId, sel] of Object.entries(targetAttempt.answersSnapshot as Record<string, any>)) {
        if (Array.isArray(sel)) {
          const qObj = qSnapshot.find((x) => x.id === qId);
          const isMultiple = qObj?.question_type === "multiple_choices";
          if (isMultiple) {
            initialAnswers[qId] = sel.filter((item) => typeof item === "number");
          } else if (sel.length > 0 && typeof sel[0] === "number") {
            initialAnswers[qId] = sel[0];
          } else {
            initialAnswers[qId] = sel;
          }
        } else {
          initialAnswers[qId] = sel;
        }
      }
    }
    const startedAtMs = targetAttempt.startedAt ? normalizeDate(targetAttempt.startedAt).getTime() : undefined;
    const closeAtMs = template.closeAt ? normalizeDate(template.closeAt).getTime() : undefined;

    return (
      <CoursePageShell title={template.title} hideHeader>
        <Reveal>
          <QuizPlayer
            courseId={id}
            exam={formattedExam}
            attemptId={targetAttempt.id}
            initialAnswers={initialAnswers}
            startedAtMs={startedAtMs}
            closeAtMs={closeAtMs}
          />
        </Reveal>
      </CoursePageShell>
    );
  }

  // Unified State
  if (shouldShowUnifiedView) {
    const rawSnapshot = (targetAttempt?.questionsSnapshot as Array<{
      id: string;
      prompt: string;
      options: string[];
      correct_indices: number[];
      explanation: string;
      difficulty: string;
      origin?: "zyx_original" | "historical_reference" | "itb_example";
      sourceEventName?: string | null;
      sourceReferenceId?: string | null;
    }>) ?? [];
    const snapshot = rawSnapshot.map((question) => ({
      ...question,
      options: publicOptionTexts(question.options),
    }));
    const answers = (targetAttempt?.answersSnapshot as Record<string, number[]>) ?? {};

    let unseenSnapshot: Array<{
      id: string;
      prompt: string;
      options: string[];
      correct_indices: number[];
      explanation: string;
      difficulty: string;
      origin?: "zyx_original" | "historical_reference" | "itb_example";
      sourceEventName?: string | null;
      sourceReferenceId?: string | null;
    }> = [];

    if (isDiscussionOpen) {
      const rules = typeof template.selectionRules === "string"
        ? JSON.parse(template.selectionRules)
        : template.selectionRules as Record<string, any>;

      let selected: any[] = [];
      const fixedQuestionIds = rules?.fixedQuestionIds as string[] | undefined;

      if (fixedQuestionIds && fixedQuestionIds.length > 0) {
        selected = await db.select().from(aiQuestionBank).where(
          and(
            eq(aiQuestionBank.courseId, template.courseId),
            eq(aiQuestionBank.reviewStatus, 'published'),
            quizEligibilityCondition,
            questionStateCondition,
            chapterScopeCondition,
            inArray(aiQuestionBank.id, fixedQuestionIds)
          )
        );
        selected.sort((a, b) => fixedQuestionIds.indexOf(a.id) - fixedQuestionIds.indexOf(b.id));
      } else {
        const tags = (rules?.tags as string[] | undefined) || [];
        const tagConditions = tags.map(
          (tag) => sql`exists (select 1 from jsonb_array_elements_text(${aiQuestionBank.tags}::jsonb) as tag_value where tag_value = ${tag})`
        );
        const tagCondition = tags.length > 0 ? or(...tagConditions) : undefined;

        selected = await db.select().from(aiQuestionBank).where(
          and(
            eq(aiQuestionBank.courseId, template.courseId),
            eq(aiQuestionBank.reviewStatus, 'published'),
            quizEligibilityCondition,
            questionStateCondition,
            chapterScopeCondition,
            tagCondition
          )
        ).orderBy(desc(aiQuestionBank.createdAt));
      }

      const answeredIds = new Set(snapshot.map(q => q.id));
      const filteredSelected = selected.filter(q => !answeredIds.has(q.id));

      unseenSnapshot = filteredSelected.map((q) => {
        let opts = q.options;
        if (typeof opts === "string") {
          try { opts = JSON.parse(opts); } catch { opts = []; }
        }
        let corrects = q.correctIndices;
        if (typeof corrects === "string") {
          try { corrects = JSON.parse(corrects); } catch { corrects = []; }
        }
        return {
          id: q.id,
          prompt: q.prompt,
          options: publicOptionTexts(opts),
          correct_indices: Array.isArray(corrects) ? corrects : [],
          difficulty: q.difficulty,
          explanation: q.explanation || "",
          origin: q.origin,
          sourceEventName: q.sourceEventName,
          sourceReferenceId: q.sourceReferenceId,
        };
      });
    }

    return <StudentQuizReview id={id} quizId={quizId} template={{ title: template.title }} targetAttempt={targetAttempt ? { id: targetAttempt.id, score: targetAttempt.score, durationSeconds: targetAttempt.durationSeconds, submittedAt: targetAttempt.submittedAt, gradingStatus: targetAttempt.gradingStatus } : null} snapshot={snapshot} answers={answers} unseenSnapshot={unseenSnapshot} />;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STATE D: Gateway Confirmation page (Default if no attemptId)
  // ───────────────────────────────────────────────────────────────────────────
  return <StudentQuizGateway id={id} courseTitle={course.title}
    template={{ id: template.id, title: template.title, selectionRules: { count: (template.selectionRules as {count?:number})?.count }, timeLimitSeconds: template.timeLimitSeconds, maxAttempts: template.maxAttempts }}
    completedAttempts={completedAttempts.map(({id,score,submittedAt,durationSeconds}) => ({id,score,submittedAt,durationSeconds}))}
    inProgressAttempt={inProgressAttempt ? {id:inProgressAttempt.id} : null}
    questionsCount={questionsCount}
    startAction={<QuizStartButton courseId={id} templateId={template.id} />}
  />;
}
