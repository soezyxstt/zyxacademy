import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { pkaSimulationStages, quizTemplates, studentQuizAttempts } from "@/db/schema";
import { createMetadata } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";
import { cn } from "@/lib/utils";
import { PKA_SUBJECTS, type PkaSubject } from "@/lib/pka-config";
import { getSubjectStageState, recordPkaStageResult } from "@/lib/pka-simulation";
import { requirePkaSession } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { QuizPlayer } from "@/components/course/quiz-player";
import { QuizStartButton } from "@/app/(student)/courses/[id]/quiz/[quizId]/quiz-start-button";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { quizOptionClasses, quizOptionLetterClasses } from "@/components/course/quiz-option-styles";
import { MistakeFeedbackButton } from "@/components/pka/mistake-feedback-button";
import { Reveal } from "@/components/ui/reveal";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import { isShortAnswerCorrect } from "@/lib/quiz/short-answer";

import { normalizeDate } from "@/lib/date-utils";

type Props = {
  params: Promise<{ subject: string; stage: string }>;
  searchParams: Promise<{ attemptId?: string }>;
};

function isPkaSubject(value: string): value is PkaSubject {
  return (PKA_SUBJECTS as readonly string[]).includes(value);
}

function subjectLabelKey(subject: PkaSubject) {
  switch (subject) {
    case "matematika": return "subjectMathematics";
    case "fisika": return "subjectPhysics";
    case "kimia": return "subjectChemistry";
  }
}

function stagePath(subject: string, stage: number | string) {
  return `/courses/tutorial-pka/simulasi/${subject}/${stage}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subject, stage } = await params;
  const t = await getTranslations("studentExtras.pka");
  const label = isPkaSubject(subject) ? t(subjectLabelKey(subject)) : t("pka");
  return createMetadata({
    title: t("stageMetadataTitle", { subject: label, stage }),
    description: t("stageMetadataDescription", { subject: label, stage }),
    path: `/courses/tutorial-pka/simulasi/${subject}/${stage}`,
  });
}


export default async function PkaStagePage({ params, searchParams }: Props) {
  const { subject, stage: stageParam } = await params;
  const { attemptId } = await searchParams;
  const stage = Number(stageParam);
  const t = await getTranslations("studentExtras.pka");
  const subjectName = isPkaSubject(subject) ? t(subjectLabelKey(subject)) : t("pka");

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
                <h1 className="font-heading text-h5 font-bold text-foreground"><TranslatedText namespace="studentExtras.pka" messageKey="stageLocked" values={{ stage }} /></h1>
                <p className="mt-1 text-body-sm text-muted-foreground"><TranslatedText namespace="studentExtras.pka" messageKey="completePrevious" /></p>
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
        origin?: "zyx_original" | "itb_example";
        sourceEventName?: string | null;
        sourceReferenceId?: string | null;
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
                    <TranslatedText namespace="studentExtras.pka" messageKey="stageScoreTitle" values={{ subject: subjectName, stage, score: attempt.score ?? 0 }} />
                  </h1>
                  <p className="text-body-sm text-muted-foreground">
                    {passed
                      ? <TranslatedText namespace="studentExtras.pka" messageKey="passedStage" />
                      : t("failedStageThreshold", { threshold: stageRow.passScoreThreshold })}
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div className="space-y-4">
                <h2 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="studentExtras.pka" messageKey="explanation" /></h2>
                <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                {snapshot.map((q, idx) => {
                  const rawSel = answers[q.id];
                  const qType = (q as any).question_type || (q as any).questionType || (q as any).type;
                  const selected = Array.isArray(rawSel)
                    ? rawSel
                    : typeof rawSel === "number"
                    ? [rawSel]
                    : [];
                  const correct = q.correct_indices ?? (q as any).correctIndices ?? [];

                  const isMultiple = qType === "multiple_choices" || correct.length > 1;
                  let isCorrect = false;
                  if (qType === "short_answer" || (Array.isArray((q as any).acceptable_answers) && (q as any).acceptable_answers.length > 0)) {
                    isCorrect = isShortAnswerCorrect(rawSel, (q as any).acceptable_answers);
                  } else if (qType === "essay") {
                    const text = typeof rawSel === "string" ? rawSel : Array.isArray(rawSel) ? String(rawSel[0] ?? "") : "";
                    isCorrect = text.trim().length > 0;
                  } else if (!isMultiple && (qType === "multiple_choice" || !qType)) {
                    const firstIdx = selected[0];
                    isCorrect = firstIdx !== undefined && correct.includes(firstIdx);
                  } else {
                    isCorrect = selected.length === correct.length && selected.every((v: number) => correct.includes(v));
                  }

                  const selectedText = typeof rawSel === "string" ? rawSel : selected.map((i: number) => q.options[i]).filter(Boolean).join("; ");
                  return (
                    <div key={q.id} className="p-4">
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
                          <h4 className="font-heading text-body-xs font-bold uppercase tracking-wider text-foreground"><TranslatedText namespace="studentExtras.pka" messageKey="explanation" /></h4>
                          <div className="text-body-sm text-muted-foreground leading-relaxed">
                            <MarkdownRenderer content={q.explanation} className="space-y-3" />
                          </div>
                        </div>
                      )}
                      {!isCorrect && (
                        <div className="mt-3 ml-9">
                          <MistakeFeedbackButton
                            questionId={q.id}
                            selectedAnswer={selectedText || t("notAnswered")}
                          />
                        </div>
                      )}
                      <QuestionSourceCitation origin={q.origin} sourceEventName={q.sourceEventName} />
                    </div>
                  );
                })}
                </div>
              </div>
            </Reveal>
          </div>
        </CoursePageShell>
      );
    }

    if (attempt.status === "in_progress") {
      const initialAnswers: Record<string, any> = {};
      if (attempt.answersSnapshot && typeof attempt.answersSnapshot === "object") {
        const qSnapshot = (attempt.questionsSnapshot as any[]) || [];
        for (const [qId, sel] of Object.entries(attempt.answersSnapshot as Record<string, any>)) {
          if (Array.isArray(sel)) {
            const qObj = qSnapshot.find((x) => x.id === qId);
            const isMultiple = qObj?.question_type === "multiple_choices" || (Array.isArray(qObj?.correct_indices) && qObj.correct_indices.length > 1);
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
      const startedAtMs = attempt.startedAt ? normalizeDate(attempt.startedAt).getTime() : undefined;
      const closeAtMs = template.closeAt ? normalizeDate(template.closeAt).getTime() : undefined;

      const formattedExam = {
        id: template.id,
        courseId: template.courseId,
        title: template.title,
        questions: (attempt.questionsSnapshot as unknown as Array<{ id: string; prompt: string; question_type?: string; options: string[]; correct_indices: number[]; origin?: "zyx_original" | "itb_example"; sourceEventName?: string | null; sourceReferenceId?: string | null }>).map(
          (q, idx) => {
            const isMultiple = q.question_type === "multiple_choices" || (Array.isArray(q.correct_indices) && q.correct_indices.length > 1);
            return {
              id: q.id,
              order: idx + 1,
              type: isMultiple ? "multiple_choices" : ((q.question_type as any) || "multiple_choice"),
              prompt: q.prompt,
              options: q.options,
              correctIndex: q.correct_indices?.[0] ?? 0,
              origin: q.origin,
              sourceEventName: q.sourceEventName,
              sourceReferenceId: q.sourceReferenceId,
            };
          },
        ),
        settings: {
          timeLimitSeconds: template.timeLimitSeconds ?? undefined,
          timeLimitMinutes: template.timeLimitSeconds ? Math.round(template.timeLimitSeconds / 60) : 15,
        },
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
              <TranslatedText namespace="studentExtras.pka" messageKey="stageTitle" values={{ subject: subjectName, stage }} />
            </h1>
            <p className="mt-2 text-body-sm text-muted-foreground">
              <TranslatedText namespace="studentExtras.pka" messageKey="stageInstructions" values={{ threshold: stageRow.passScoreThreshold, duration: template.timeLimitSeconds ? `${Math.round(template.timeLimitSeconds / 60)} ${t("minutes")}` : t("noTimeLimit") }} />
            </p>
            <div className="mt-5">
              {inProgress ? (
                <Link
                  href={`${stagePath(subject, stage)}?attemptId=${inProgress.id}`}
                  className="inline-flex items-center rounded-md bg-brand-secondary px-6 py-2 text-body-sm font-bold text-white shadow-sm transition-colors duration-150 hover:bg-brand-secondary/90"
                >
                  <TranslatedText namespace="studentExtras.pka" messageKey="continueSimulation" />
                </Link>
              ) : (
                <QuizStartButton
                  courseId={template.courseId}
                  templateId={template.id}
                  label={<TranslatedText namespace="studentExtras.pka" messageKey="startSimulation" />}
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
      <TranslatedText namespace="studentExtras.pka" messageKey="backToSimulation" />
    </Link>
  );
}
