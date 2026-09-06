import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Lock, ChevronRight, Calendar, Award, Clock, AlertTriangle, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { QuizPlayer } from "@/components/course/quiz-player";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts, aiQuestionBank } from "@/db/schema";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { and, or, eq, desc, sql, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { QuizStartButton } from "./quiz-start-button";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { cn } from "@/lib/utils";
import { FormattedDate } from "@/components/ui/formatted-date";
import { MistakeFeedbackButton } from "@/components/pka/mistake-feedback-button";
import { normalizeDate } from "@/lib/date-utils";
import { ZyraMark } from "@/components/course/zyra-mark";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import { getCourse } from "@/lib/course-utils";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";

type Props = {
  params: Promise<{ id: string; quizId: string }>;
  searchParams: Promise<{ attemptId?: string; viewDiscussion?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, quizId } = await params;
  const course = await getCourse(id);

  const [template] = await db
    .select({ title: quizTemplates.title })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, quizId))
    .limit(1);

  return {
    title: pageTitle(course && template ? `${course.title} - ${template.title}` : "Kuis"),
    description: course && template
      ? `Kerjakan kuis ${template.title}; bagian dari ${course.title}.`
      : "Kerjakan kuis interaktif untuk mengukur pemahaman.",
  };
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} menit ${s} detik` : `${s} detik`;
}

export default async function CourseQuizTakePage({ params, searchParams }: Props) {
  const { id, quizId } = await params;
  const { attemptId, viewDiscussion } = await searchParams;

  const session = await auth.api.getSession({ headers: await headers() });
  const studentId = session?.user?.id;
  if (!studentId) return redirect("/sign-in");

  const course = await getCourse(id);

  const [template] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, quizId))
    .limit(1);

  if (!course || !template) notFound();

  const role = (session.user as { role?: string | null }).role;
  const isStaff =
    (await hasAnyPeran(session.user.id, ["admin", "tutor"], { allowAdmin: true })) ||
    role === "admin" ||
    role === "teacher";
  if (template.status === "draft" && !isStaff) {
    notFound();
  }

  const isEnrolled = await checkEnrollment(id);
  const isFree = template.visibility === "free";
  const isAccessible = isEnrolled || isFree;

  // Check if questions are available for this template
  const rules = template.selectionRules as {
    tags?: string[];
    count?: number;
    difficulty_proportions?: Record<string, number>;
  };
  const tags = (rules.tags as string[] | undefined) || [];
  const tagConditions = tags.map(
    (tag) => sql`exists (select 1 from json_each(${aiQuestionBank.tags}) where json_each.value = ${tag})`
  );
  const tagCondition = tags.length > 0 ? or(...tagConditions) : undefined;

  const [questionsCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiQuestionBank)
    .where(
      and(
        eq(aiQuestionBank.courseId, template.courseId),
        eq(aiQuestionBank.reviewStatus, 'published'),
        tagCondition
      )
    );
  const questionsCount = questionsCountRow?.count ?? 0;

  if (!isAccessible) {
    return (
      <CoursePageShell title="Kuis terkunci" description={`${course.title} · kuis premium`} hideHeader>
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
      .where(eq(studentQuizAttempts.id, attemptId))
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
        correct_indices: number[];
        origin?: "zyx_original" | "itb_example";
        sourceEventName?: string | null;
        sourceReferenceId?: string | null;
      }>).map((q, idx) => ({
        id: q.id,
        order: idx + 1,
        type: (q.question_type as any) || "multiple_choice",
        prompt: q.prompt,
        options: q.options || [],
        correctIndex: q.correct_indices?.[0] ?? 0,
        origin: q.origin,
        sourceEventName: q.sourceEventName,
        sourceReferenceId: q.sourceReferenceId,
      })),
    };

    const initialAnswers: Record<string, any> = {};
    if (targetAttempt.answersSnapshot && typeof targetAttempt.answersSnapshot === "object") {
      for (const [qId, sel] of Object.entries(targetAttempt.answersSnapshot as Record<string, any>)) {
        if (Array.isArray(sel) && sel.length > 0 && typeof sel[0] === "number") {
          initialAnswers[qId] = sel[0];
        } else {
          initialAnswers[qId] = sel;
        }
      }
    }
    const startedAtMs = targetAttempt.startedAt ? normalizeDate(targetAttempt.startedAt).getTime() : undefined;
    const closeAtMs = template.closeAt ? normalizeDate(template.closeAt).getTime() : undefined;

    return (
      <CoursePageShell title={template.title} description="Jawab kuis berikut dengan teliti." hideHeader>
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
    const snapshot = (targetAttempt?.questionsSnapshot as Array<{
      id: string;
      prompt: string;
      options: string[];
      correct_indices: number[];
      explanation: string;
      difficulty: string;
      origin?: "zyx_original" | "itb_example";
      sourceEventName?: string | null;
      sourceReferenceId?: string | null;
    }>) ?? [];
    const answers = (targetAttempt?.answersSnapshot as Record<string, number[]>) ?? {};

    let unseenSnapshot: Array<{
      id: string;
      prompt: string;
      options: string[];
      correct_indices: number[];
      explanation: string;
      difficulty: string;
      origin?: "zyx_original" | "itb_example";
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
            inArray(aiQuestionBank.id, fixedQuestionIds)
          )
        );
        selected.sort((a, b) => fixedQuestionIds.indexOf(a.id) - fixedQuestionIds.indexOf(b.id));
      } else {
        const tags = (rules?.tags as string[] | undefined) || [];
        const tagConditions = tags.map(
          (tag) => sql`exists (select 1 from json_each(${aiQuestionBank.tags}) where json_each.value = ${tag})`
        );
        const tagCondition = tags.length > 0 ? or(...tagConditions) : undefined;

        selected = await db.select().from(aiQuestionBank).where(
          and(
            eq(aiQuestionBank.courseId, template.courseId),
            eq(aiQuestionBank.reviewStatus, 'published'),
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
          options: Array.isArray(opts) ? opts : [],
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
        eyebrow={
          <div className="flex items-center gap-1.5 text-body-xs text-muted-foreground uppercase tracking-widest">
            <Link href={`/courses/${id}/quiz`} className="hover:text-primary transition-colors">Kuis</Link>
            <ChevronRight className="size-3" />
            <span className="truncate max-w-[200px]">{template.title}</span>
          </div>
        }
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
                    <ZyraMark className="mr-1.5 size-4" />
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

                  let isCorrect = false;
                  if (qType === "short_answer" || (Array.isArray((q as any).acceptable_answers) && (q as any).acceptable_answers.length > 0)) {
                    const acceptable = (q as any).acceptable_answers || [];
                    const text = typeof rawSubmitted === "string" ? rawSubmitted : Array.isArray(rawSubmitted) ? String(rawSubmitted[0] ?? "") : "";
                    const trimmed = text.trim().toLowerCase();
                    isCorrect = trimmed.length > 0 && acceptable.some((ans: string) => ans.trim().toLowerCase() === trimmed);
                  } else if (qType === "essay") {
                    const text = typeof rawSubmitted === "string" ? rawSubmitted : Array.isArray(rawSubmitted) ? String(rawSubmitted[0] ?? "") : "";
                    isCorrect = text.trim().length > 0;
                  } else if (qType === "multiple_choice" || !qType) {
                    const firstIdx = studentSelected[0];
                    isCorrect = firstIdx !== undefined && correctIndices.includes(firstIdx);
                  } else {
                    isCorrect =
                      studentSelected.length === correctIndices.length &&
                      studentSelected.every((val: number) => correctIndices.includes(val));
                  }

                  return (
                    <div
                      key={q.id}
                      className={cn(
                        "rounded-xl border border-border/80 bg-card p-5 shadow-2xs transition-all relative overflow-hidden",
                        isCorrect ? "border-status-success/30 bg-status-success/5" : "border-status-error/20 bg-status-error/5"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0 left-0 w-1 h-full",
                          isCorrect ? "bg-status-success" : "bg-status-error"
                        )}
                      />

                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-2.5">
                          <span className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-lg text-body-sm font-bold text-white shadow-xs",
                            isCorrect ? "bg-status-success" : "bg-status-error"
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
                              {isCorrect ? (
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

                      {/* Options list */}
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

                      {/* Explanation box */}
                      {q.explanation && (
                        <div className="mt-4 ml-9 space-y-3 border-t border-border/80 pt-4">
                          <div className="flex items-center gap-2 text-brand-primary">
                            <ZyraMark className="size-4" />
                            <h4 className="font-heading text-body-xs font-bold uppercase tracking-wider">Pembahasan Soal oleh Zyra</h4>
                          </div>
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
                          <div className="flex items-center gap-2 text-brand-primary">
                            <ZyraMark className="size-4" />
                            <h4 className="font-heading text-body-xs font-bold uppercase tracking-wider">Pembahasan Soal oleh Zyra</h4>
                          </div>
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
      eyebrow={
        <div className="flex items-center gap-1.5 text-body-xs text-muted-foreground uppercase tracking-widest">
          <Link href={`/courses/${id}/quiz`} className="hover:text-primary transition-colors">Kuis</Link>
          <ChevronRight className="size-3" />
          <span className="truncate max-w-[200px]">{template.title}</span>
        </div>
      }
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
                <p>Silakan baca ketentuan pengerjaan kuis berikut:</p>
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
              <p className="text-body-xs text-muted-foreground mt-1">Daftar percobaan kuis Anda sebelumnya:</p>
            </div>

            {completedAttempts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 bg-muted/10 p-5 text-center">
                <p className="text-body-xs text-muted-foreground">Belum ada percobaan selesai.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {completedAttempts.map((attempt, idx) => (
                  <li key={attempt.id} className="rounded-lg border border-border/80 bg-card/60 p-3.5 shadow-2xs hover:border-brand-primary/45 transition-colors">
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
