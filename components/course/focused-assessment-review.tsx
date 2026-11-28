"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FileText,
  HelpCircle,
  Info,
  LayoutList,
  Lock,
  Square,
  Video,
  XCircle,
} from "lucide-react";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/react/collapsible";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { InteractiveDocumentAttempt } from "@/components/course/interactive-document-context";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import { AssessmentUiRenderer } from "@/components/course/assessment-ui-sdk/assessment-ui-renderer";
import { ZyraInlineExplanationHost } from "@/components/course/zyra-inline-explanation-host";
import type { AssessmentUiSpec } from "@/lib/zyra/inline-explanation";
import { deduplicateAcceptableAnswers } from "@/lib/quiz/short-answer";
import { getYoutubeEmbedUrl } from "@/lib/youtube";
import { cn } from "@/lib/utils";

export type FocusedReviewStatus =
  | "correct"
  | "incorrect"
  | "pending"
  | "unanswered"
  | "study";

export type FocusedReviewQuestion = {
  id: string;
  order?: number;
  section?: "answered" | "unseen";
  prompt: string;
  promptUi?: Record<string, unknown> | null;
  questionType: "multiple_choice" | "multiple_choices" | "short_answer" | "essay";
  difficulty?: string | null;
  status: FocusedReviewStatus;
  statusLabel?: string;
  options?: string[];
  studentSelectedIndices?: number[];
  correctIndices?: number[];
  submittedText?: string;
  acceptableAnswers?: string[];
  userAnswerLabel?: string;
  correctAnswerLabel?: string;
  submittedFileKey?: string | null;
  submittedFileName?: string | null;
  submittedFileSize?: string | null;
  isEssayPending?: boolean;
  teacherNote?: string | null;
  explanationMarkdown?: string | null;
  explanationUi?: Record<string, unknown> | null;
  explanationImage?: string | null;
  explanationVideoUrl?: string | null;
  explanationVideoKind?: "youtube" | "r2";
  origin?: "zyx_original" | "historical_reference" | "itb_example";
  sourceEventName?: string | null;
  sourceReferenceId?: string | null;
  attemptContext?: {
    courseId: string;
    attemptId: string;
    questionId: string;
  } | null;
  mistakeAction?: ReactNode;
};

export type FocusedAssessmentReviewProps = {
  courseId: string;
  assessmentKind: "quiz" | "tryout";
  assessmentId: string;
  title?: string;
  questions: FocusedReviewQuestion[];
  defaultViewMode?: "focused" | "all";
  initialQuestionIndex?: number;
  syncQueryParam?: boolean;
  statsSlot?: ReactNode;
  isDirectPreview?: boolean;
  leaderboardEligible?: boolean;
  noticeSlot?: ReactNode;
  startActionHref?: string;
  startActionLabel?: string;
  isVideoUnlocked?: boolean;
  answeredSectionTitle?: string;
  unseenSectionTitle?: string;
  renderUiSpec?: (args: {
    spec: Record<string, unknown> | null | undefined;
    fallbackMarkdown?: string | null;
    courseId: string;
    renderBlockAfter?: (blockId: string) => ReactNode;
    className?: string;
  }) => ReactNode;
  renderExplanationHost?: (args: {
    question: FocusedReviewQuestion;
    children: (renderBlockAfter: (blockId: string) => ReactNode) => ReactNode;
  }) => ReactNode;
};

const LEADERBOARD_NOTICE_TEXT =
  "Pembahasan dibuka sebelum mengerjakan; nilai tidak dihitung di leaderboard, namun pengerjaan tetap tercatat.";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

function statusDotClass(status: FocusedReviewStatus): string {
  switch (status) {
    case "correct":
      return "bg-status-success";
    case "incorrect":
      return "bg-status-error";
    case "pending":
      return "bg-status-warning";
    case "unanswered":
    case "study":
    default:
      return "bg-muted-foreground/45";
  }
}

function statusBadgeNumberClass(status: FocusedReviewStatus): string {
  switch (status) {
    case "correct":
      return "bg-status-success text-white";
    case "incorrect":
      return "bg-status-error text-white";
    case "pending":
      return "bg-brand-secondary text-white";
    case "unanswered":
    case "study":
    default:
      return "bg-muted text-foreground border border-border/60";
  }
}

function defaultStatusLabel(q: FocusedReviewQuestion): string {
  if (q.statusLabel) return q.statusLabel;
  if (q.status === "correct") return q.questionType === "essay" ? "Telah Dinilai" : "Benar";
  if (q.status === "incorrect") return "Salah";
  if (q.status === "pending") return "Menunggu Koreksi";
  if (q.status === "unanswered") return "Belum Dikerjakan";
  return "Mode Belajar";
}

function StatusInlineIndicator({ question }: { question: FocusedReviewQuestion }) {
  const label = defaultStatusLabel(question);

  if (question.status === "pending") {
    return (
      <span className="inline-flex items-center gap-0.5 text-body-xs font-semibold text-brand-secondary">
        <Clock className="size-3.5" aria-hidden /> {label}
      </span>
    );
  }
  if (question.status === "correct") {
    return (
      <span className="inline-flex items-center gap-0.5 text-body-xs font-semibold text-status-success">
        <CheckCircle2 className="size-3.5" aria-hidden /> {label}
      </span>
    );
  }
  if (question.status === "incorrect") {
    return (
      <span className="inline-flex items-center gap-0.5 text-body-xs font-semibold text-status-error">
        <XCircle className="size-3.5" aria-hidden /> {label}
      </span>
    );
  }
  if (question.status === "unanswered") {
    return (
      <span className="inline-flex items-center gap-0.5 text-body-xs font-semibold text-muted-foreground">
        <HelpCircle className="size-3.5" aria-hidden /> {label}
      </span>
    );
  }
  return null;
}

export function FocusedAssessmentReview({
  courseId,
  assessmentKind,
  assessmentId,
  questions,
  defaultViewMode = "focused",
  initialQuestionIndex = 0,
  syncQueryParam = true,
  statsSlot,
  isDirectPreview = false,
  leaderboardEligible,
  noticeSlot,
  startActionHref,
  startActionLabel,
  isVideoUnlocked = true,
  answeredSectionTitle,
  unseenSectionTitle,
  renderUiSpec,
  renderExplanationHost,
}: FocusedAssessmentReviewProps) {
  const safeInitial =
    questions.length > 0
      ? Math.max(0, Math.min(initialQuestionIndex, questions.length - 1))
      : 0;

  const [viewMode, setViewMode] = useState<"focused" | "all">(defaultViewMode);
  const [activeIndex, setActiveIndex] = useState<number>(safeInitial);

  // Sync from URL ?q=N on client mount
  useEffect(() => {
    if (!syncQueryParam || typeof window === "undefined" || questions.length === 0) return;
    const raw = new URLSearchParams(window.location.search).get("q");
    if (!raw) return;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= questions.length) {
      setActiveIndex(parsed - 1);
    }
  }, [syncQueryParam, questions.length]);

  const selectQuestion = useCallback(
    (nextIndex: number, switchToFocused = false) => {
      if (questions.length === 0) return;
      const clamped = Math.max(0, Math.min(nextIndex, questions.length - 1));
      setActiveIndex(clamped);
      if (switchToFocused) {
        setViewMode("focused");
      }
      if (syncQueryParam && typeof window !== "undefined") {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("q", String(clamped + 1));
          window.history.replaceState(null, "", url.toString());
        } catch {
          // Ignore history errors in restricted environments
        }
      }
    },
    [questions.length, syncQueryParam],
  );

  // Keyboard navigation (ArrowLeft / ArrowRight) in focused mode
  useEffect(() => {
    if (viewMode !== "focused" || questions.length <= 1) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectQuestion(activeIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        selectQuestion(activeIndex + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewMode, activeIndex, questions.length, selectQuestion]);

  const showLeaderboardNotice = leaderboardEligible === false || isDirectPreview;
  const clampedActiveIndex =
    questions.length > 0 ? Math.max(0, Math.min(activeIndex, questions.length - 1)) : 0;

  const renderMarkdownOrUi = (args: {
    spec?: Record<string, unknown> | null;
    fallbackMarkdown?: string | null;
    renderBlockAfter?: (blockId: string) => ReactNode;
    className?: string;
  }) => {
    if (renderUiSpec) {
      return renderUiSpec({
        spec: args.spec,
        fallbackMarkdown: args.fallbackMarkdown,
        courseId,
        renderBlockAfter: args.renderBlockAfter,
        className: args.className,
      });
    }
    if (!args.spec && !args.fallbackMarkdown) return null;
    return (
      <AssessmentUiRenderer
        spec={args.spec}
        fallbackMarkdown={args.fallbackMarkdown}
        courseId={courseId}
        renderBlockAfter={args.renderBlockAfter}
        className={args.className}
      />
    );
  };

  const renderQuestionArticle = (q: FocusedReviewQuestion, displayIndex: number) => {
    const isUnseen = q.section === "unseen" || q.status === "study";
    const options = q.options ?? [];
    const studentSelected = q.studentSelectedIndices ?? [];
    const correctIndices = q.correctIndices ?? [];
    const hasExplanation = Boolean(
      q.explanationUi || q.explanationMarkdown || q.explanationImage || q.explanationVideoUrl,
    );

    const explanationContent = (renderBlockAfter?: (blockId: string) => ReactNode) => (
      <>
        {(q.explanationUi || q.explanationMarkdown) && (
          <div className="text-body-sm leading-relaxed text-muted-foreground">
            <InteractiveDocumentAttempt
              value={
                q.attemptContext
                  ? {
                      courseId: q.attemptContext.courseId,
                      attemptId: q.attemptContext.attemptId,
                      questionId: q.attemptContext.questionId,
                      field: "explanation",
                    }
                  : null
              }
            >
              {renderMarkdownOrUi({
                spec: q.explanationUi,
                fallbackMarkdown: q.explanationMarkdown,
                renderBlockAfter,
                className: "text-body-sm leading-relaxed text-muted-foreground",
              })}
            </InteractiveDocumentAttempt>
          </div>
        )}

        {q.explanationImage && (
          <div className="relative mx-auto mt-3 aspect-video max-w-md overflow-hidden rounded-xl border border-border shadow-xs">
            <Image
              src={q.explanationImage}
              unoptimized
              alt={`Diagram pembahasan soal ${displayIndex + 1}`}
              fill
              className="object-cover"
            />
          </div>
        )}

        {q.explanationVideoUrl && (
          <div className="mt-4 space-y-2">
            <span className="flex items-center gap-1.5 text-body-xs font-bold text-foreground">
              <Video className="size-3.5 text-brand-primary" aria-hidden />
              Video Pembahasan Tutor
            </span>
            <div className="relative aspect-video w-full max-w-xl overflow-hidden rounded-xl border border-border bg-black shadow-sm">
              {isVideoUnlocked ? (
                q.explanationVideoKind === "youtube" ? (
                  (() => {
                    const embed = getYoutubeEmbedUrl(q.explanationVideoUrl);
                    return embed ? (
                      <iframe
                        title={`Video pembahasan soal ${displayIndex + 1}`}
                        src={embed}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="h-full w-full border-0"
                      />
                    ) : (
                      <p className="p-4 text-body-sm text-white">Video tidak dapat dimuat.</p>
                    );
                  })()
                ) : (
                  <video
                    src={q.explanationVideoUrl}
                    controls
                    preload="metadata"
                    className="h-full w-full"
                  />
                )
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 p-4 text-center">
                  <span className="mb-3 flex size-10 items-center justify-center rounded-full border border-brand-secondary/35 bg-brand-secondary/20 text-brand-secondary">
                    <Lock className="size-5" aria-hidden />
                  </span>
                  <h5 className="font-heading text-body-sm font-bold text-white">
                    Video Pembahasan Terkunci
                  </h5>
                  <p className="mt-1 max-w-sm text-body-xs leading-relaxed text-white/80">
                    Aktifkan paket belajar untuk membuka video pembahasan tutor.
                  </p>
                  <Button
                    asChild
                    size="sm"
                    className="mt-4 h-9 bg-brand-secondary text-body-sm font-semibold text-white hover:bg-brand-secondary/95"
                  >
                    <Link href="/plans">
                      Lihat Paket
                      <ExternalLink className="ml-1 size-3" aria-hidden />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );

    return (
      <article key={q.id} className="min-w-0 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg text-body-sm font-bold tabular-nums shadow-xs",
                statusBadgeNumberClass(q.status),
              )}
            >
              {q.order ?? displayIndex + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {q.difficulty ? (
                  <span
                    className={cn(
                      "text-body-xs font-semibold uppercase tracking-wider",
                      q.difficulty === "easy" && "text-status-success",
                      q.difficulty === "medium" && "text-status-warning",
                      q.difficulty === "hard" && "text-status-error",
                    )}
                  >
                    {q.difficulty}
                  </span>
                ) : null}
                <StatusInlineIndicator question={q} />
              </div>
              <div className="mt-2 text-body-base font-medium leading-relaxed text-foreground/90">
                <InteractiveDocumentAttempt
                  value={
                    q.attemptContext
                      ? {
                          courseId: q.attemptContext.courseId,
                          attemptId: q.attemptContext.attemptId,
                          questionId: q.attemptContext.questionId,
                          field: "prompt",
                        }
                      : null
                  }
                >
                  {renderMarkdownOrUi({
                    spec: q.promptUi,
                    fallbackMarkdown: q.prompt,
                  })}
                </InteractiveDocumentAttempt>
              </div>
            </div>
          </div>
        </div>

        {/* Answer display for all question types */}
        {q.questionType === "short_answer" ? (
          <div className="mt-4 space-y-2.5 sm:pl-9">
            {!isUnseen && (
              <div className="border-t border-border/60 pt-3">
                <span className="mb-1 block text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Jawaban Anda:
                </span>
                <div className="text-body-sm font-medium text-foreground">
                  {(q.submittedText ?? q.userAnswerLabel ?? "").trim() ? (
                    <MathText as="span">
                      {(q.submittedText ?? q.userAnswerLabel ?? "").trim()}
                    </MathText>
                  ) : (
                    <span className="italic text-muted-foreground">(Tidak menjawab)</span>
                  )}
                </div>
              </div>
            )}

            {Array.isArray(q.acceptableAnswers) && q.acceptableAnswers.length > 0 ? (
              (() => {
                const displayAnswers = deduplicateAcceptableAnswers(q.acceptableAnswers);
                if (displayAnswers.length === 0) return null;
                return (
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <span className="block text-body-2xs font-semibold uppercase tracking-wider text-status-success">
                      Kunci Jawaban yang Diterima
                      {displayAnswers.length > 1
                        ? ` (${displayAnswers.length} variasi format)`
                        : ""}
                      :
                    </span>
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      {displayAnswers.map((ans, aIdx) => (
                        <div
                          key={aIdx}
                          className="inline-flex items-center gap-1.5 rounded-md border border-status-success/25 bg-background/80 px-2.5 py-1 text-body-sm font-medium text-foreground shadow-2xs"
                        >
                          <Check className="size-3.5 shrink-0 text-status-success" aria-hidden />
                          <MathText as="span">{ans}</MathText>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()
            ) : q.correctAnswerLabel ? (
              <div className="border-t border-border/60 pt-3 text-body-sm">
                <span className="font-semibold text-muted-foreground">Kunci Jawaban: </span>
                <MathText as="span" className="font-semibold text-status-success">
                  {q.correctAnswerLabel}
                </MathText>
              </div>
            ) : null}
          </div>
        ) : q.questionType === "essay" ? (
          <div className="mt-4 space-y-3 sm:pl-9">
            {!isUnseen && (
              <div className="border-t border-border/60 pt-3">
                <span className="mb-1 block text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Jawaban Esai Anda:
                </span>
                <p className="whitespace-pre-wrap text-body-sm font-medium leading-relaxed text-foreground">
                  {(q.submittedText ?? q.userAnswerLabel ?? "").trim() || (
                    <span className="italic text-muted-foreground">
                      (Tidak menuliskan esai teks)
                    </span>
                  )}
                </p>
              </div>
            )}

            {q.submittedFileName && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-status-success/10 text-status-success">
                    <FileText className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="max-w-[200px] truncate text-body-xs font-bold text-foreground md:max-w-xs">
                      {q.submittedFileName}
                    </p>
                    <p className="text-body-2xs text-muted-foreground">
                      {q.submittedFileSize || "Lampiran berkas"}
                    </p>
                  </div>
                </div>
                {q.submittedFileKey ? (
                  <Button
                    variant="outline"
                    size="xs"
                    asChild
                    className="gap-1 rounded-md border-border/80 text-muted-foreground hover:text-foreground"
                  >
                    <a
                      href={`/api/storage/file/${q.submittedFileKey
                        .split("/")
                        .map(encodeURIComponent)
                        .join("/")}?download=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="size-3.5" aria-hidden />
                      Unduh Lampiran
                    </a>
                  </Button>
                ) : null}
              </div>
            )}

            {q.isEssayPending ? (
              <div className="flex items-center gap-2 rounded-lg border border-brand-secondary/30 bg-brand-secondary/5 p-3 text-body-xs text-brand-secondary">
                <Clock className="size-4 shrink-0" aria-hidden />
                <span>Menunggu penilaian pengajar.</span>
              </div>
            ) : null}
          </div>
        ) : options.length > 0 ? (
          <ul className="mt-4 space-y-2 sm:pl-9">
            {options.map((opt, i) => {
              const isStudentChoice = !isUnseen && studentSelected.includes(i);
              const isCorrectChoice = correctIndices.includes(i);

              return (
                <li
                  key={i}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-body-sm font-medium leading-normal",
                    isUnseen
                      ? isCorrectChoice
                        ? "border-status-success/30 bg-status-success/10 text-foreground"
                        : "border-border/40 bg-muted/20 text-muted-foreground"
                      : isStudentChoice && isCorrectChoice
                        ? "border-status-success bg-status-success/10 text-status-success"
                        : isStudentChoice && !isCorrectChoice
                          ? "border-status-error bg-status-error/10 text-status-error"
                          : !isStudentChoice && isCorrectChoice
                            ? "border-dashed border-status-success/50 bg-status-success/5 text-foreground"
                            : "border-border bg-background/50 text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full font-sans text-body-xs font-bold",
                      isUnseen
                        ? isCorrectChoice
                          ? "bg-status-success text-white"
                          : "border border-border/60 bg-muted text-muted-foreground"
                        : isStudentChoice && isCorrectChoice
                          ? "bg-status-success text-white"
                          : isStudentChoice && !isCorrectChoice
                            ? "bg-status-error text-white"
                            : isCorrectChoice
                              ? "border border-status-success text-status-success"
                              : "bg-muted text-muted-foreground",
                    )}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <InteractiveDocumentAttempt
                      value={
                        q.attemptContext
                          ? {
                              courseId: q.attemptContext.courseId,
                              attemptId: q.attemptContext.attemptId,
                              questionId: q.attemptContext.questionId,
                              field: "option",
                              option: i,
                            }
                          : null
                      }
                    >
                      <MarkdownRenderer content={opt} />
                    </InteractiveDocumentAttempt>
                  </div>
                  {isUnseen && isCorrectChoice && (
                    <div className="ml-auto flex items-center gap-1 text-body-xs font-bold uppercase tracking-wider text-status-success">
                      <CheckCircle2 className="size-4" aria-hidden />
                      Kunci
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          /* Fallback summary when option list is not present (e.g. legacy tryout fixture) */
          <div className="mt-4 space-y-1.5 border-l-2 border-border/60 pl-3 text-body-sm sm:ml-9">
            {!isUnseen && (
              <p>
                <span className="font-semibold text-muted-foreground">Jawaban Anda: </span>
                <MathText as="span" className="font-medium text-foreground">
                  {q.userAnswerLabel || "-"}
                </MathText>
              </p>
            )}
            {q.correctAnswerLabel && (
              <p>
                <span className="font-semibold text-muted-foreground">Kunci Jawaban: </span>
                <MathText as="span" className="font-semibold text-status-success">
                  {q.correctAnswerLabel}
                </MathText>
              </p>
            )}
          </div>
        )}

        {/* Teacher note if present */}
        {q.teacherNote && (
          <div className="mt-3 border-l-2 border-border pl-3 text-body-xs leading-relaxed text-foreground sm:ml-9">
            <span className="font-bold text-brand-secondary">Catatan Pengajar: </span>
            <MathText as="span">{q.teacherNote}</MathText>
          </div>
        )}

        {/* Explanation section */}
        {hasExplanation && (
          <div className="mt-6 space-y-3 border-t border-border/80 pt-4 sm:ml-9">
            <h4 className="font-heading text-body-xs font-bold uppercase tracking-wider text-foreground">
              Pembahasan
            </h4>
            {renderExplanationHost ? (
              renderExplanationHost({
                question: q,
                children: (renderBlockAfter) => explanationContent(renderBlockAfter),
              })
            ) : (
              <ZyraInlineExplanationHost
                courseId={courseId}
                assessmentKind={assessmentKind}
                assessmentId={assessmentId}
                questionId={q.id}
                questionPrompt={q.prompt}
                studentAnswer={
                  q.userAnswerLabel ??
                  q.submittedText ??
                  (studentSelected.length > 0
                    ? studentSelected
                        .map((i) => options[i])
                        .filter(Boolean)
                        .join("; ")
                    : undefined)
                }
                correctAnswer={
                  q.correctAnswerLabel ??
                  (correctIndices.length > 0
                    ? correctIndices
                        .map((i) => options[i])
                        .filter(Boolean)
                        .join("; ")
                    : q.acceptableAnswers?.join(" / "))
                }
                explanationSpec={(q.explanationUi as AssessmentUiSpec | null) ?? null}
                explanationMarkdown={q.explanationMarkdown ?? null}
                renderUiSpec={(spec) => (
                  <AssessmentUiRenderer spec={spec} courseId={courseId} />
                )}
              >
                {(renderBlockAfter) => explanationContent(renderBlockAfter)}
              </ZyraInlineExplanationHost>
            )}
          </div>
        )}

        {/* Mistake feedback action */}
        {q.mistakeAction && <div className="mt-3 sm:ml-9">{q.mistakeAction}</div>}

        <QuestionSourceCitation origin={q.origin} sourceEventName={q.sourceEventName} />
      </article>
    );
  };

  const answeredQuestions = questions.filter((q) => q.section !== "unseen");
  const unseenQuestions = questions.filter((q) => q.section === "unseen");

  return (
    <div className="space-y-4 font-sans">
      {/* Top compact bar: stats + direct-study badge */}
      {(statsSlot || isDirectPreview) && (
        <div className="space-y-3">
          {statsSlot}
          {isDirectPreview && (
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <span className="inline-flex items-center gap-1.5 text-body-xs font-semibold text-foreground">
                <BookOpen className="size-3.5 text-brand-primary" aria-hidden />
                Mode Belajar Langsung
              </span>
              {startActionHref && (
                <Button asChild size="sm" variant="outline">
                  <Link href={startActionHref}>
                    {startActionLabel || "Kerjakan Sekarang"}
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Leaderboard eligibility notice */}
      {showLeaderboardNotice && (
        <div
          role="status"
          className="flex items-start gap-2 border-l-2 border-status-warning pl-3 py-0.5 text-body-xs text-muted-foreground"
        >
          <Info className="mt-0.5 size-3.5 shrink-0 text-status-warning" aria-hidden />
          <p className="leading-relaxed">{LEADERBOARD_NOTICE_TEXT}</p>
        </div>
      )}

      {noticeSlot}

      {/* Per-question navigation pill strip + Focused/All toggle */}
      {questions.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border/60 py-2.5">
          <nav
            aria-label="Navigasi nomor soal"
            className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
          >
            {questions.map((q, idx) => {
              const isActive = viewMode === "focused" && idx === clampedActiveIndex;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => selectQuestion(idx, true)}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Soal ${q.order ?? idx + 1}, ${defaultStatusLabel(q)}`}
                  className={cn(
                    "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-md border px-2 text-body-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "border-brand-primary bg-brand-primary text-primary-foreground shadow-2xs"
                      : "border-border/70 bg-background text-foreground hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      isActive ? "bg-primary-foreground" : statusDotClass(q.status),
                    )}
                    aria-hidden
                  />
                  <span>{q.order ?? idx + 1}</span>
                </button>
              );
            })}
          </nav>

          {questions.length > 1 && (
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-border/70 bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("focused")}
                aria-pressed={viewMode === "focused"}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-1 text-body-xs font-medium transition-colors",
                  viewMode === "focused"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Square className="size-3.5" aria-hidden />
                Per Soal
              </button>
              <button
                type="button"
                onClick={() => setViewMode("all")}
                aria-pressed={viewMode === "all"}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-1 text-body-xs font-medium transition-colors",
                  viewMode === "all"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutList className="size-3.5" aria-hidden />
                Semua
              </button>
            </div>
          )}
        </div>
      )}

      {/* Collapsible quick question overview in focused mode */}
      {viewMode === "focused" && questions.length > 1 && (
        <Collapsible className="border-b border-border/60">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 py-2 text-left text-body-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
            <span>Daftar soal ({questions.length})</span>
            <ChevronDown className="size-3.5 shrink-0 transition-transform group-aria-expanded:rotate-180" aria-hidden />
          </CollapsibleTrigger>
          <CollapsiblePanel className="pb-2">
            <ul className="divide-y divide-border/50">
              {questions.map((q, idx) => {
                const isActive = idx === clampedActiveIndex;
                const preview = q.prompt.replace(/\s+/g, " ").trim();
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => selectQuestion(idx, true)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 py-2 text-left text-body-xs transition-colors hover:text-foreground",
                        isActive ? "font-semibold text-brand-primary" : "text-muted-foreground",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn("size-2 shrink-0 rounded-full", statusDotClass(q.status))}
                          aria-hidden
                        />
                        <span className="shrink-0 tabular-nums">
                          #{q.order ?? idx + 1}
                        </span>
                        <span className="truncate text-foreground">{preview}</span>
                      </span>
                      <span className="shrink-0 text-body-2xs text-muted-foreground">
                        {defaultStatusLabel(q)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CollapsiblePanel>
        </Collapsible>
      )}

      {/* Main Question Area */}
      {questions.length === 0 ? null : viewMode === "focused" ? (
        <div className="space-y-4">
          {renderQuestionArticle(questions[clampedActiveIndex], clampedActiveIndex)}

          {/* Bottom Prev / Next bar */}
          {questions.length > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={clampedActiveIndex <= 0}
                onClick={() => selectQuestion(clampedActiveIndex - 1)}
                className="gap-1.5"
              >
                <ChevronLeft className="size-4" aria-hidden />
                Sebelumnya
              </Button>
              <span className="text-body-xs font-medium tabular-nums text-muted-foreground">
                Soal {clampedActiveIndex + 1} dari {questions.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={clampedActiveIndex >= questions.length - 1}
                onClick={() => selectQuestion(clampedActiveIndex + 1)}
                className="gap-1.5"
              >
                Selanjutnya
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {answeredQuestions.length > 0 && (
            <div className="divide-y divide-border/70">
              {answeredSectionTitle && (
                <h2 className="pb-2 font-heading text-body-base font-bold text-foreground">
                  {answeredSectionTitle}
                </h2>
              )}
              {answeredQuestions.map((q, idx) => renderQuestionArticle(q, idx))}
            </div>
          )}

          {unseenQuestions.length > 0 && (
            <div className="divide-y divide-border/70">
              {unseenSectionTitle && (
                <h2 className="pb-2 font-heading text-body-base font-bold text-foreground">
                  {unseenSectionTitle}
                </h2>
              )}
              {unseenQuestions.map((q, idx) =>
                renderQuestionArticle(q, answeredQuestions.length + idx),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
