import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Sparkles } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { pkaSimulationStages, quizTemplates, studentQuizAttempts } from "@/db/schema";
import { pageTitle } from "@/lib/site";
import { cn } from "@/lib/utils";
import { PKA_SUBJECTS, PKA_SUBJECT_LABELS, type PkaSubject } from "@/lib/pka-config";
import { getSubjectStageState, recordPkaStageResult } from "@/lib/pka-simulation";
import { requirePkaSession } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { QuizPlayer } from "@/components/course/quiz-player";
import { QuizStartButton } from "@/app/(student)/courses/[id]/quiz/[quizId]/quiz-start-button";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { quizOptionClasses, quizOptionLetterClasses } from "@/components/course/quiz-option-styles";
import { MistakeFeedbackButton } from "@/components/pka/mistake-feedback-button";
import { Reveal } from "@/components/ui/reveal";

import { normalizeDate } from "@/lib/date-utils";

type Props = {
  params: Promise<{ subject: string; stage: string }>;
  searchParams: Promise<{ attemptId?: string }>;
};

function isPkaSubject(value: string): value is PkaSubject {
  return (PKA_SUBJECTS as readonly string[]).includes(value);
}

function stagePath(subject: string, stage: number | string) {
  return `/courses/tutorial-pka/simulasi/${subject}/${stage}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subject, stage } = await params;
  const label = isPkaSubject(subject) ? PKA_SUBJECT_LABELS[subject] : "PKA";
  return { title: pageTitle(`${label} - Stage ${stage}`) };
}

export default async function PkaStagePage({ params, searchParams }: Props) {
  const { subject, stage: stageParam } = await params;
  const { attemptId } = await searchParams;
  const stage = Number(stageParam);

  if (!isPkaSubject(subject) || !Number.isInteger(stage) || stage < 1 || stage > 3) notFound();

  const userId = await requirePkaSession(stagePath(subject, stage));

  const [stageRow] = await db
    .select()
    .from(pkaSimulationStages)
    .where(and(eq(pkaSimulationStages.subject, subject), eq(pkaSimulationStages.stage, stage)))
    .limit(1);
  if (!stageRow) notFound();

  const [template] = await db.select().from(quizTemplates).where(eq(quizTemplates.id, stageRow.quizTemplateId)).limit(1);
  if (!template) notFound();

  const stageStates = await getSubjectStageState(userId, subject);
  const thisStageState = stageStates.find((s) => s.stage === stage)!;

  if (thisStageState.status === "locked") {
    return (
      <CoursePageShell>
        <div className="space-y-6">
          <BackLink />
          <Reveal>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
              <AlertTriangle className="size-5 shrink-0 text-status-warning" />
              <div>
                <h1 className="font-heading text-h6 font-bold text-foreground">Stage {stage} masih terkunci</h1>
                <p className="mt-1 text-body-sm text-muted-foreground">Selesaikan stage sebelumnya terlebih dahulu untuk membuka stage ini.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </CoursePageShell>
    );
  }

  // ── Attempt-specific states ────────────────────────────────────────────
  if (attemptId) {
    const [attempt] = await db
      .select()
      .from(studentQuizAttempts)
      .where(and(eq(studentQuizAttempts.id, attemptId), eq(studentQuizAttempts.studentId, userId)))
      .limit(1);
    if (!attempt) notFound();

    if (attempt.status === "completed") {
      await recordPkaStageResult(attempt.id);
      const passed = (attempt.score ?? 0) >= stageRow.passScoreThreshold;
      const snapshot = attempt.questionsSnapshot as Array<{
        id: string;
        prompt: string;
        options: string[];
        correct_indices: number[];
        explanation: string;
      }>;
      const answers = (attempt.answersSnapshot as Record<string, number[]>) ?? {};

      return (
        <CoursePageShell>
          <div className="space-y-6">
            <BackLink />
            <Reveal>
              <div
                className={cn(
                  "flex items-center gap-4 rounded-xl border p-5 shadow-sm",
                  passed ? "border-status-success/30 bg-status-success/5" : "border-status-error/20 bg-status-error/5",
                )}
              >
                {passed ? <CheckCircle2 className="size-8 shrink-0 text-status-success" /> : <XCircle className="size-8 shrink-0 text-status-error" />}
                <div>
                  <h1 className="font-heading text-h5 font-bold text-foreground">
                    {PKA_SUBJECT_LABELS[subject]} - Stage {stage}: {attempt.score}%
                  </h1>
                  <p className="text-body-sm text-muted-foreground">
                    {passed
                      ? "Lolos ambang stage ini. Stage berikutnya otomatis dilewati."
                      : `Belum mencapai ambang ${stageRow.passScoreThreshold}%. Stage berikutnya kini terbuka.`}
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div className="space-y-4">
                <h2 className="font-heading text-h6 font-bold text-foreground">Pembahasan</h2>
                {snapshot.map((q, idx) => {
                  const selected = answers[q.id] ?? [];
                  const correct = q.correct_indices ?? [];
                  const isCorrect = selected.length === correct.length && selected.every((v) => correct.includes(v));
                  const selectedText = selected.map((i) => q.options[i]).filter(Boolean).join("; ");
                  return (
                    <div key={q.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <div className="flex items-start gap-2.5">
                        <span className={quizOptionLetterClasses(isCorrect ? "correct" : "wrong")}>{idx + 1}</span>
                        <div className="flex-1 text-body-base font-medium text-foreground">
                          <MarkdownRenderer content={q.prompt} className="space-y-3" />
                        </div>
                      </div>
                      <ul className="mt-3 space-y-2 pl-9">
                        {q.options.map((opt, i) => {
                          const isSelected = selected.includes(i);
                          const isRight = correct.includes(i);
                          const state = isSelected && isRight ? "correct" : isSelected && !isRight ? "wrong" : isRight ? "correct" : "idle";
                          return (
                            <li key={i} className={quizOptionClasses(state)}>
                              <span className={quizOptionLetterClasses(state)}>{String.fromCharCode(65 + i)}</span>
                              <MarkdownRenderer content={opt} className="space-y-3" />
                            </li>
                          );
                        })}
                      </ul>
                      {q.explanation && (
                        <div className="mt-4 ml-9 space-y-3 border-t border-border/80 pt-4">
                          <div className="flex items-center gap-2 text-brand-primary">
                            <Sparkles className="size-4 animate-pulse" />
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
                            selectedAnswer={selectedText || "(tidak menjawab)"}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Reveal>
          </div>
        </CoursePageShell>
      );
    }

    if (attempt.status === "in_progress") {
      const initialAnswers: Record<string, number> = {};
      if (attempt.answersSnapshot && typeof attempt.answersSnapshot === "object") {
        for (const [qId, sel] of Object.entries(attempt.answersSnapshot as Record<string, number[]>)) {
          if (Array.isArray(sel) && sel.length > 0 && typeof sel[0] === "number") {
            initialAnswers[qId] = sel[0];
          }
        }
      }
      const startedAtMs = attempt.startedAt ? normalizeDate(attempt.startedAt).getTime() : undefined;
      const closeAtMs = template.closeAt ? normalizeDate(template.closeAt).getTime() : undefined;

      const formattedExam = {
        id: template.id,
        courseId: template.courseId,
        title: template.title,
        questions: (attempt.questionsSnapshot as unknown as Array<{ id: string; prompt: string; options: string[]; correct_indices: number[] }>).map(
          (q, idx) => ({
            id: q.id,
            order: idx + 1,
            type: "multiple_choice" as const,
            prompt: q.prompt,
            options: q.options,
            correctIndex: q.correct_indices?.[0] ?? 0,
          }),
        ),
        settings: { timeLimitMinutes: template.timeLimitSeconds ? Math.round(template.timeLimitSeconds / 60) : 15 },
      };

      return (
        <CoursePageShell>
          <div className="space-y-6">
            <BackLink />
            <Reveal>
              <QuizPlayer
                courseId={template.courseId}
                exam={formattedExam}
                attemptId={attempt.id}
                redirectBasePath={stagePath(subject, stage)}
                initialAnswers={initialAnswers}
                startedAtMs={startedAtMs}
                closeAtMs={closeAtMs}
              />
            </Reveal>
          </div>
        </CoursePageShell>
      );
    }
  }

  // ── Gateway (no attemptId) ─────────────────────────────────────────────
  const previousAttempts = await db
    .select()
    .from(studentQuizAttempts)
    .where(and(eq(studentQuizAttempts.studentId, userId), eq(studentQuizAttempts.templateId, template.id)))
    .orderBy(desc(studentQuizAttempts.startedAt));
  const inProgress = previousAttempts.find((a) => a.status === "in_progress");

  return (
    <CoursePageShell>
      <div className="space-y-6">
        <BackLink />
        <Reveal>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h1 className="font-heading text-h5 font-bold text-foreground">
              {PKA_SUBJECT_LABELS[subject]} - Stage {stage}
            </h1>
            <p className="mt-2 text-body-sm text-muted-foreground">
              Ambang lolos stage ini: {stageRow.passScoreThreshold}%. Durasi{" "}
              {template.timeLimitSeconds ? `${Math.round(template.timeLimitSeconds / 60)} menit` : "tanpa batas"}.
            </p>
            <div className="mt-5">
              {inProgress ? (
                <Link
                  href={`${stagePath(subject, stage)}?attemptId=${inProgress.id}`}
                  className="inline-flex items-center rounded-md bg-brand-secondary px-6 py-2 text-body-sm font-bold text-white shadow-sm transition-colors duration-150 hover:bg-brand-secondary/90"
                >
                  Lanjutkan simulasi
                </Link>
              ) : (
                <QuizStartButton
                  courseId={template.courseId}
                  templateId={template.id}
                  label="Mulai simulasi"
                  redirectBasePath={stagePath(subject, stage)}
                />
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </CoursePageShell>
  );
}

function BackLink() {
  return (
    <Link
      href="/courses/tutorial-pka/simulasi"
      className="inline-flex items-center gap-1.5 text-body-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Kembali ke Simulasi
    </Link>
  );
}
