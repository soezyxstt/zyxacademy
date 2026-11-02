import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Lock, ChevronRight, Calendar, Award, Clock, AlertTriangle, ArrowLeft, CheckCircle2, XCircle, FileText, Download, Check } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { QuizPlayer } from "@/components/course/quiz-player";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata, pageTitle } from "@/lib/site";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts, aiQuestionBank, knowledgeObjects, chapters } from "@/db/schema";
import { auth } from "@/lib/auth";
import { and, or, eq, desc, sql, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { QuizStartButton } from "./quiz-start-button";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";
import { FormattedDate } from "@/components/ui/formatted-date";
import { MistakeFeedbackButton } from "@/components/pka/mistake-feedback-button";
import { normalizeDate } from "@/lib/date-utils";
import { isShortAnswerCorrect, deduplicateAcceptableAnswers } from "@/lib/quiz/short-answer";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import { extractFreeQuizChapterScope, getCourse, isFreeQuizTemplate } from "@/lib/course-utils";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";

type Props = {
  params: Promise<{ id: string; quizId: string }>;
  searchParams: Promise<{ attemptId?: string; viewDiscussion?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, quizId } = await params;
  const course = await getCourse(id);

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

  const title = course && template ? `${template.title} (${course.title})` : template ? template.title : "Kuis";
  const description = course && template
    ? `Kerjakan kuis ${template.title}; bagian dari ${course.title}.`
    : "Kerjakan kuis interaktif untuk mengukur pemahaman materi.";

  return createMetadata({
    title,
    description,
    path: `/courses/${id}/quiz/${quizId}`,
  });
}


/**
 * Formats a duration in seconds into human-readable Indonesian minutes and seconds.
 */
function formatDuration(seconds: number | null) {
  if (seconds == null) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} menit ${s} detik` : `${s} detik`;
}

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

  const session = await auth.api.getSession({ headers: await headers() });
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
      <CoursePageShell title="Kuis terkunci" description={`${course.title}, kuis premium`} hideHeader>
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-body-xs font-semibold text-muted-foreground hover:text-foreground">
            <Link href={`/courses/${id}/quiz`}>
              <ArrowLeft className="size-3.5" />
              <span>Kembali ke Daftar Kuis</span>
            </Link>
          </Button>
        </div>
        <Reveal>
          <div className="rounded-lg border border-border/70 bg-card/75 p-4 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                <Lock className="size-5" />
              </div>
              <div>
                <h3 className="font-heading text-body-base font-bold text-foreground">Butuh token kelas</h3>
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
        <CoursePageShell title="Kuis Sudah Ditutup" description={template.title} hideHeader>
          <Reveal>
            <div className="rounded-lg border border-border/70 bg-card/75 p-5 backdrop-blur-sm text-center">
                <h3 className="font-heading text-body-base font-bold text-foreground">Kuis Ditutup</h3>
              <p className="mt-2 text-body-sm text-muted-foreground">
                Kuis ini telah ditutup secara manual oleh admin/tutor.
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <Button asChild variant="outline" size="sm" className="rounded-md border-border/80">
                  <Link href={`/courses/${id}/quiz`}>Kembali ke Daftar Kuis</Link>
                </Button>
                {canViewDiscussion && (
                  <Button asChild size="sm" className="rounded-md bg-brand-primary text-white">
                    <Link href={`?viewDiscussion=true`}>Lihat Pembahasan</Link>
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
          <CoursePageShell title="Kuis Belum Dibuka" description={template.title} hideHeader>
            <Reveal>
              <div className="rounded-lg border border-border/70 bg-card/75 p-5 backdrop-blur-sm text-center">
                <h3 className="font-heading text-body-base font-bold text-foreground">Kuis Belum Dibuka</h3>
                <p className="mt-2 text-body-sm text-muted-foreground">
                  Kuis ini dijadwalkan untuk dibuka pada tanggal{" "}
                  <strong className="text-foreground">{openDate.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</strong>.
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <Button asChild variant="outline" size="sm" className="rounded-md border-border/80">
                    <Link href={`/courses/${id}/quiz`}>Kembali ke Daftar Kuis</Link>
                  </Button>
                </div>
              </div>
            </Reveal>
          </CoursePageShell>
        );
      }

      if (closeDate && now > closeDate) {
        return (
          <CoursePageShell title="Kuis Sudah Ditutup" description={template.title} hideHeader>
            <Reveal>
              <div className="rounded-lg border border-border/70 bg-card/75 p-5 backdrop-blur-sm text-center">
                <h3 className="font-heading text-body-base font-bold text-foreground">Kuis Sudah Ditutup</h3>
                <p className="mt-2 text-body-sm text-muted-foreground">
                  Akses kuis ini telah berakhir sejak tanggal{" "}
                  <strong className="text-foreground">{closeDate.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</strong>.
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <Button asChild variant="outline" size="sm" className="rounded-md border-border/80">
                    <Link href={`/courses/${id}/quiz`}>Kembali ke Daftar Kuis</Link>
                  </Button>
                  {canViewDiscussion && (
                    <Button asChild size="sm" className="rounded-md bg-brand-primary text-white">
                      <Link href={`?viewDiscussion=true`}>Lihat Pembahasan</Link>
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

    return (
      <CoursePageShell
        title={targetAttempt ? "Analisis Jawaban & Pembahasan" : "Pembahasan Kuis"}
        description={template.title}
        hideHeader
      >
        <Reveal>
          <div className="space-y-6 font-sans">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button asChild variant="outline" size="sm" className="rounded-md border-border/80 text-muted-foreground">
                <Link href={`/courses/${id}/quiz/${quizId}`}>
                  <ArrowLeft className="mr-1.5 size-4" />
                  Kembali Ke Kuis
                </Link>
              </Button>

              {targetAttempt && (
                <Button asChild size="sm" className="rounded-md bg-brand-primary text-white hover:bg-brand-primary/90 font-semibold shadow-xs">
                  <Link href={`/courses/${id}/quiz/${quizId}/summary/${targetAttempt.id}`}>
                    Lihat Diagnosis & Rencana Belajar
                  </Link>
                </Button>
              )}
            </div>

            {targetAttempt && (
              <AdminStatStrip className="sm:grid-cols-3">
                <AdminStatStripItem icon={Award} label="Skor akhir" value={`${targetAttempt.score}%`} tone="brand" />
                <AdminStatStripItem icon={Clock} label="Waktu pengerjaan" value={formatDuration(targetAttempt.durationSeconds)} tone="info" />
                <AdminStatStripItem
                  icon={Calendar}
                  label="Dikumpulkan pada"
                  value={targetAttempt.submittedAt ? (
                    <FormattedDate
                      date={targetAttempt.submittedAt}
                      options={{ dateStyle: "medium", timeStyle: "short" }}
                    />
                  ) : "-"}
                  tone="brand-secondary"
                />
              </AdminStatStrip>
            )}

            {!targetAttempt && (
              <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/5 p-5 backdrop-blur-md text-center">
                <h3 className="font-heading text-body-base font-bold text-brand-primary">Pembahasan Keseluruhan</h3>
                <p className="mt-1 text-body-sm text-brand-primary/80">
                  Anda tidak mengerjakan kuis ini. Berikut adalah seluruh kumpulan soal yang mungkin muncul pada kuis ini beserta penjelasannya.
                </p>
              </div>
            )}

            {/* Answered Questions */}
            {snapshot.length > 0 && (
              <div className="space-y-6">
                <h2 className="font-heading text-body-base font-bold text-foreground border-b border-border/60 pb-2">
                  Soal yang Anda Kerjakan
                </h2>
                {snapshot.map((q, idx) => {
                  const rawSubmitted = answers[q.id];
                  const qType = (q as any).question_type || (q as any).questionType || (q as any).type;
                  const studentSelected = Array.isArray(rawSubmitted)
                    ? rawSubmitted
                    : typeof rawSubmitted === "number"
                    ? [rawSubmitted]
                    : [];

                  const correctIndices = q.correct_indices ?? (q as any).correctIndices ?? [];

                  const submittedText = typeof rawSubmitted === "string"
                    ? rawSubmitted
                    : rawSubmitted && typeof rawSubmitted === "object" && "text" in rawSubmitted && typeof rawSubmitted.text === "string"
                    ? rawSubmitted.text
                    : Array.isArray(rawSubmitted)
                    ? String(rawSubmitted[0] ?? "")
                    : "";

                  const submittedFileKey = rawSubmitted && typeof rawSubmitted === "object" && "fileKey" in rawSubmitted && typeof rawSubmitted.fileKey === "string"
                    ? rawSubmitted.fileKey
                    : null;

                  const submittedFileName = rawSubmitted && typeof rawSubmitted === "object" && "fileName" in rawSubmitted && typeof rawSubmitted.fileName === "string"
                    ? rawSubmitted.fileName
                    : null;

                  const submittedFileSize = rawSubmitted && typeof rawSubmitted === "object" && "fileSize" in rawSubmitted && typeof rawSubmitted.fileSize === "string"
                    ? rawSubmitted.fileSize
                    : null;

                  const isMultiple = qType === "multiple_choices" || correctIndices.length > 1;
                  let isCorrect = false;
                  if (qType === "short_answer" || (Array.isArray((q as any).acceptable_answers) && (q as any).acceptable_answers.length > 0)) {
                    isCorrect = isShortAnswerCorrect(submittedText, (q as any).acceptable_answers);
                  } else if (qType === "essay") {
                    isCorrect = submittedText.trim().length > 0 || Boolean(submittedFileKey);
                  } else if (!isMultiple && (qType === "multiple_choice" || !qType)) {
                    const firstIdx = studentSelected[0];
                    isCorrect = firstIdx !== undefined && correctIndices.includes(firstIdx);
                  } else {
                    isCorrect =
                      studentSelected.length === correctIndices.length &&
                      studentSelected.every((val: number) => correctIndices.includes(val));
                  }

                  const isEssayPending = qType === "essay" && targetAttempt?.gradingStatus === "pending";

                  return (
                    <div
                      key={q.id}
                      className={cn(
                        "rounded-xl border border-border/80 bg-card p-5 shadow-2xs transition-all relative overflow-hidden",
                        isEssayPending
                          ? "border-brand-secondary/30 bg-brand-secondary/5"
                          : isCorrect
                          ? "border-status-success/30 bg-status-success/5"
                          : "border-status-error/20 bg-status-error/5"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0 left-0 w-1 h-full",
                          isEssayPending
                            ? "bg-brand-secondary"
                            : isCorrect
                            ? "bg-status-success"
                            : "bg-status-error"
                        )}
                      />

                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-2.5">
                          <span className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-lg text-body-sm font-bold text-white shadow-xs",
                            isEssayPending
                              ? "bg-brand-secondary"
                              : isCorrect
                              ? "bg-status-success"
                              : "bg-status-error"
                          )}>
                            {idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-body-xs font-semibold uppercase tracking-wider",
                                q.difficulty === "easy" && "text-status-success",
                                q.difficulty === "medium" && "text-status-warning",
                                q.difficulty === "hard" && "text-status-error"
                              )}>
                                {q.difficulty}
                              </span>
                              {qType === "essay" ? (
                                isEssayPending ? (
                                  <span className="inline-flex items-center gap-0.5 text-body-xs text-brand-secondary font-semibold">
                                    <Clock className="size-3.5" /> Menunggu Koreksi
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-body-xs text-status-success font-semibold">
                                    <CheckCircle2 className="size-3.5" /> Telah Dinilai
                                  </span>
                                )
                              ) : isCorrect ? (
                                <span className="inline-flex items-center gap-0.5 text-body-xs text-status-success font-semibold">
                                  <CheckCircle2 className="size-3.5" /> Benar
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-body-xs text-status-error font-semibold">
                                  <XCircle className="size-3.5" /> Salah
                                </span>
                              )}
                            </div>
                            <div className="mt-2 text-body-base leading-relaxed text-foreground/90 font-medium">
                              <MarkdownRenderer content={q.prompt} className="space-y-3" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Content rendering depending on question type */}
                      {qType === "short_answer" ? (
                        <div className="mt-4 pl-9 space-y-2.5">
                          <div className="rounded-lg border border-border bg-background/60 p-3">
                            <span className="text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                              Jawaban Anda:
                            </span>
                            <div className="text-body-sm font-medium text-foreground">
                              {submittedText.trim() ? (
                                <MathText as="span">{submittedText.trim()}</MathText>
                              ) : (
                                <span className="text-muted-foreground italic">(Tidak menjawab)</span>
                              )}
                            </div>
                          </div>
                          {Array.isArray((q as any).acceptable_answers) && (q as any).acceptable_answers.length > 0 && (() => {
                            const displayAnswers = deduplicateAcceptableAnswers((q as any).acceptable_answers);
                            if (displayAnswers.length === 0) return null;
                            return (
                              <div className="rounded-lg border border-status-success/30 bg-status-success/5 p-3 space-y-2">
                                <span className="text-body-2xs font-semibold uppercase tracking-wider text-status-success block">
                                  Kunci Jawaban yang Diterima{displayAnswers.length > 1 ? ` (${displayAnswers.length} variasi format)` : ""}:
                                </span>
                                <div className="flex flex-wrap gap-2 pt-0.5">
                                  {displayAnswers.map((ans, aIdx) => (
                                    <div
                                      key={aIdx}
                                      className="inline-flex items-center gap-1.5 rounded-md border border-status-success/25 bg-background/80 px-2.5 py-1 text-body-sm font-medium text-foreground shadow-2xs"
                                    >
                                      <Check className="size-3.5 text-status-success shrink-0" />
                                      <MathText as="span">{ans}</MathText>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : qType === "essay" ? (
                        <div className="mt-4 pl-9 space-y-3">
                          <div className="rounded-lg border border-border bg-background/60 p-3.5">
                            <span className="text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                              Jawaban Esai Anda:
                            </span>
                            <p className="text-body-sm font-medium text-foreground whitespace-pre-wrap leading-relaxed">
                              {submittedText.trim() || <span className="text-muted-foreground italic">(Tidak menuliskan esai teks)</span>}
                            </p>
                          </div>

                          {submittedFileName && (
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-card p-3">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-status-success/10 text-status-success">
                                  <FileText className="size-4" />
                                </span>
                                <div className="min-w-0">
                                  <p className="max-w-[200px] truncate text-body-xs font-bold text-foreground md:max-w-xs">{submittedFileName}</p>
                                  <p className="text-body-2xs text-muted-foreground">{submittedFileSize || "PDF / Gambar"} • Cloudflare R2</p>
                                </div>
                              </div>
                              {submittedFileKey ? (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  asChild
                                  className="gap-1 rounded-md border-border/80 text-muted-foreground hover:text-foreground"
                                >
                                  <a
                                    href={`/api/storage/file/${submittedFileKey.split("/").map(encodeURIComponent).join("/")}?download=1`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Download className="size-3.5" />
                                    Unduh Lampiran
                                  </a>
                                </Button>
                              ) : null}
                            </div>
                          )}

                          {isEssayPending ? (
                            <div className="flex items-center gap-2 rounded-lg border border-brand-secondary/30 bg-brand-secondary/5 p-3 text-body-xs text-brand-secondary">
                              <Clock className="size-4 shrink-0" />
                              <span>Jawaban esai ini sedang menunggu koreksi dan penilaian oleh tutor.</span>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        /* Options list for Multiple Choice */
                        <ul className="mt-4 pl-9 space-y-2">
                          {q.options.map((opt, i) => {
                            const isStudentChoice = studentSelected.includes(i);
                            const isCorrectChoice = correctIndices.includes(i);

                            return (
                              <li
                                key={i}
                                className={cn(
                                  "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-body-sm font-medium leading-normal",
                                  isStudentChoice && isCorrectChoice
                                    ? "border-status-success bg-status-success/10 text-status-success"
                                    : isStudentChoice && !isCorrectChoice
                                    ? "border-status-error bg-status-error/10 text-status-error"
                                    : !isStudentChoice && isCorrectChoice
                                    ? "border-status-success/50 border-dashed bg-status-success/5 text-foreground"
                                    : "border-border bg-background/50 text-muted-foreground"
                                )}
                              >
                                <span className={cn(
                                  "flex size-6 shrink-0 items-center justify-center rounded-full text-body-xs font-bold font-sans",
                                  isStudentChoice && isCorrectChoice
                                    ? "bg-status-success text-white"
                                    : isStudentChoice && !isCorrectChoice
                                    ? "bg-status-error text-white"
                                    : isCorrectChoice
                                    ? "border border-status-success text-status-success"
                                    : "bg-muted text-muted-foreground"
                                )}>
                                  {String.fromCharCode(65 + i)}
                                </span>
                                <div className="flex-1">
                                  <MarkdownRenderer content={opt} className="space-y-3" />
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {/* Explanation box */}
                      {q.explanation && (
                        <div className="mt-4 ml-9 space-y-3 border-t border-border/80 pt-4">
                          <h4 className="font-heading text-body-xs font-bold uppercase tracking-wider text-foreground">Pembahasan</h4>
                          <div className="text-body-sm text-muted-foreground leading-relaxed">
                            <MarkdownRenderer content={q.explanation} className="space-y-3" />
                          </div>
                        </div>
                      )}
                      {!isCorrect && (
                        <div className="mt-3 ml-9">
                          <MistakeFeedbackButton
                            questionId={q.id}
                            selectedAnswer={studentSelected.map((i) => q.options[i]).filter(Boolean).join("; ") || "(tidak menjawab)"}
                          />
                        </div>
                      )}
                      <QuestionSourceCitation origin={q.origin} sourceEventName={q.sourceEventName} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Unseen Questions */}
            {unseenSnapshot.length > 0 && (
              <div className="space-y-6 mt-10">
                <h2 className="font-heading text-body-base font-bold text-foreground border-b border-border/60 pb-2">
                  Soal Lainnya dalam Bank Soal <span className="text-body-sm font-medium text-muted-foreground ml-2">(Tidak Didapatkan)</span>
                </h2>
                {unseenSnapshot.map((q, idx) => {
                  const correctIndices = q.correct_indices ?? [];

                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border border-border/80 bg-card p-5 shadow-2xs relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-2.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg text-body-sm font-bold text-foreground bg-muted border border-border/50">
                            {snapshot.length + idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-body-xs font-semibold uppercase tracking-wider",
                                q.difficulty === "easy" && "text-status-success",
                                q.difficulty === "medium" && "text-status-warning",
                                q.difficulty === "hard" && "text-status-error"
                              )}>
                                {q.difficulty}
                              </span>
                            </div>
                            <div className="mt-2 text-body-base leading-relaxed text-foreground/90 font-medium">
                              <MarkdownRenderer content={q.prompt} className="space-y-3" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <ul className="mt-4 pl-9 space-y-2">
                        {q.options.map((opt, i) => {
                          const isCorrectChoice = correctIndices.includes(i);
                          return (
                            <li
                              key={i}
                              className={cn(
                                "flex items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors",
                                isCorrectChoice
                                  ? "border-status-success/30 bg-status-success/10"
                                  : "border-border/40 bg-muted/20"
                              )}
                            >
                              <span
                                className={cn(
                                  "flex size-6 shrink-0 items-center justify-center rounded-full text-body-xs font-bold",
                                  isCorrectChoice
                                    ? "bg-status-success text-white"
                                    : "bg-muted text-muted-foreground border border-border/60"
                                )}
                              >
                                {String.fromCharCode(65 + i)}
                              </span>
                              <span
                                className={cn(
                                  "text-body-sm font-medium",
                                  isCorrectChoice ? "text-foreground" : "text-muted-foreground"
                                )}
                              >
                                <MarkdownRenderer content={opt} className="inline-block" />
                              </span>
                              {isCorrectChoice && (
                                  <div className="ml-auto flex items-center text-status-success text-body-xs font-bold gap-1 uppercase tracking-wider">
                                  <CheckCircle2 className="size-4" />
                                  Kunci
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>

                      {q.explanation && (
                        <div className="mt-4 ml-9 space-y-3 border-t border-border/80 pt-4">
                          <h4 className="font-heading text-body-xs font-bold uppercase tracking-wider text-foreground">Pembahasan</h4>
                          <div className="text-body-sm text-muted-foreground leading-relaxed">
                            <MarkdownRenderer content={q.explanation} className="space-y-3" />
                          </div>
                        </div>
                      )}
                      <QuestionSourceCitation origin={q.origin} sourceEventName={q.sourceEventName} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STATE D: Gateway Confirmation page (Default if no attemptId)
  // ───────────────────────────────────────────────────────────────────────────
  const attemptsLeft = template.maxAttempts
    ? Math.max(0, template.maxAttempts - completedAttempts.length)
    : null;

  return (
    <CoursePageShell
      title={template.title}
      description={`${course.title} · Kuis Evaluasi`}
      hideHeader
    >
      <Reveal>
        <div className="grid grid-cols-1 gap-6 font-sans lg:grid-cols-12">

          {/* Details Column */}
          <div className="space-y-5 lg:col-span-8">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-body-base font-bold text-foreground">Instruksi Kuis</h2>

              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 border-y border-border/60 py-4 text-center">
                <div>
                  <span className="block text-body-xs font-semibold text-muted-foreground uppercase tracking-wide">Jumlah Soal</span>
                  <span className="font-heading text-h6 font-bold text-foreground">
                    {((template.selectionRules as { count?: number })?.count ?? 10)} Soal
                  </span>
                </div>

                <div>
                  <span className="block text-body-xs font-semibold text-muted-foreground uppercase tracking-wide">Durasi</span>
                  <span className="font-heading text-h6 font-bold text-foreground">
                    {template.timeLimitSeconds ? `${Math.round(template.timeLimitSeconds / 60)} menit` : "Tanpa batas"}
                  </span>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <span className="block text-body-xs font-semibold text-muted-foreground uppercase tracking-wide">Sisa Percobaan</span>
                  <span className="font-heading text-h6 font-bold text-foreground">
                    {template.maxAttempts ? `${attemptsLeft} / ${template.maxAttempts}` : "Bebas"}
                  </span>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-body-sm text-muted-foreground leading-relaxed">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Kuis ini bersifat mandiri dan dinilai secara otomatis setelah pengumpulan.</li>
                  <li>Waktu pengerjaan akan berjalan otomatis saat tombol kuis ditekan.</li>
                  <li>Draft jawaban Anda tersimpan otomatis di browser secara berkala.</li>
                  <li>Jika tab browser tertutup secara tidak sengaja, kuis dapat dilanjutkan kembali selama batas waktu pengerjaan belum habis.</li>
                </ul>
              </div>

              {/* Action buttons */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {inProgressAttempt ? (
                  <Button asChild className="bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-md interactive shadow-sm">
                    <Link href={`?attemptId=${inProgressAttempt.id}`}>
                      Lanjutkan Kuis
                    </Link>
                  </Button>
                ) : template.maxAttempts && attemptsLeft !== null && attemptsLeft <= 0 ? (
                  <div className="flex items-center gap-2 text-status-error font-semibold text-body-sm bg-status-error/10 p-3 rounded-lg border border-status-error/20 w-full justify-center">
                    <AlertTriangle className="size-4" />
                    Batas percobaan maksimal telah tercapai. Anda tidak dapat memulai kuis ini lagi.
                  </div>
                ) : questionsCount === 0 ? (
                  <div className="flex items-center gap-2 text-status-error font-semibold text-body-sm bg-status-error/10 p-3 rounded-lg border border-status-error/20 w-full justify-center">
                    <AlertTriangle className="size-4" />
                    Soal kuis belum tersedia untuk kelas ini. Hubungi pengajar Anda untuk mempublikasikan soal kuis.
                  </div>
                ) : (
                  <QuizStartButton courseId={id} templateId={template.id} />
                )}

                <Button asChild variant="outline" className="border-border/80 rounded-md">
                  <Link href={`/courses/${id}/quiz`}>Batal</Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Previous Attempts Sidebar */}
          <div className="space-y-4 lg:col-span-4 lg:border-l lg:border-border lg:pl-6">
            <div>
              <h3 className="font-heading text-body-base font-bold text-foreground">Riwayat Percobaan</h3>
            </div>

            {completedAttempts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 bg-muted/10 p-5 text-center">
                <p className="text-body-xs text-muted-foreground">Belum ada percobaan selesai.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                {completedAttempts.map((attempt, idx) => (
                  <li key={attempt.id} className="p-3.5 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-body-xs font-bold text-foreground">Percobaan #{completedAttempts.length - idx}</span>
                      <span className="font-heading text-body-base font-bold text-brand-primary">{attempt.score}%</span>
                    </div>

                    <div className="mt-2 space-y-1 text-body-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="size-3" />
                        <span>
                          {attempt.submittedAt?.toLocaleDateString("id-ID", {
                            dateStyle: "medium",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="size-3" />
                        <span>Durasi: {formatDuration(attempt.durationSeconds)}</span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <Button asChild variant="outline" size="sm" className="w-full rounded-md font-semibold text-body-xs border-border/80">
                        <Link href={`?attemptId=${attempt.id}`}>
                          Lihat Pembahasan
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </Reveal>
    </CoursePageShell>
  );
}
