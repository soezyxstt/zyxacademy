"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
 ChevronDown,
 Loader2,
 TrendingDown,
 TriangleAlert,
 ArrowRight,
 Layers,
 ListChecks,
 BookOpen,
 Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";
import { MistakeFeedbackButton } from "@/components/pka/mistake-feedback-button";

interface QuestionSnapshot {
 id: string;
 prompt: string;
 options: string[];
 correct_indices: number[];
 type?: string;
}

interface AttemptData {
 id: string;
 templateId: string;
 score: number;
 durationSeconds: number | null;
 status: string;
 questionsSnapshot: QuestionSnapshot[];
 answersSnapshot: Record<string, number[]>;
 submittedAt: string;
 strongAreas: string[] | null;
 weakAreas: string[] | null;
 recommendedNextSteps: Array<{
 id: string;
 kind: "flashcards" | "quiz" | "module";
 title: string;
 count?: number;
 href: string;
 }> | null;
 feedback: Array<{
 questionIndex: number;
 payload: {
 whyWrong: string;
 misconceptionName?: string | null;
 correctApproach: string[];
 reviewHref: string;
 };
 }>;
 remediation?: {
 concepts: Array<{ conceptName: string; before: number; after: number; delta: number }>;
 rootCauses: Array<{
 conceptName: string;
 mastery: number;
 blockedBy: Array<{ conceptName: string; mastery: number }>;
 }>;
 misconceptions: Array<{ misconceptionName: string; whyWrong: string; reviewHref: string }>;
 estimatedMinutes: number;
 } | null;
}

const KIND_ICON = {
 flashcards: Layers,
 quiz: ListChecks,
 module: BookOpen,
};

export function AttemptReview({ attemptId }: { attemptId: string }) {
 const [pollCount, setPollCount] = useState(0);
 const [openFeedback, setOpenFeedback] = useState<Record<number, boolean>>({});

 const { data: attempt, error, refetch, isFetching } = useQuery<AttemptData>({
 queryKey: ["quiz-attempt", attemptId],
 queryFn: async () => {
 const res = await fetch(`/api/quiz/attempts/${attemptId}`);
 if (!res.ok) throw new Error("Gagal memuat data pembahasan");
 return res.json();
 },
 refetchInterval: (query) => {
 const data = query.state.data;
 if (!data) return 3000;

 // Count incorrect questions
 let incorrectCount = 0;
 data.questionsSnapshot.forEach((q) => {
 const submitted = data.answersSnapshot[q.id] ?? [];
 const isCorrect =
 submitted.length === q.correct_indices.length &&
 submitted.every((i) => q.correct_indices.includes(i));
 if (!isCorrect) incorrectCount++;
 });

 // Stop if all wrong answers have feedback
 if (data.feedback && data.feedback.length >= incorrectCount) {
 return false;
 }

 // Max 30 seconds (10 poll attempts of 3s)
 if (pollCount >= 10) {
 return false;
 }

 return 3000;
 },
 });

 // Track the poll count increment
 useEffect(() => {
 if (isFetching && attempt) {
 let incorrectCount = 0;
 attempt.questionsSnapshot.forEach((q) => {
 const submitted = attempt.answersSnapshot[q.id] ?? [];
 const isCorrect =
 submitted.length === q.correct_indices.length &&
 submitted.every((i) => q.correct_indices.includes(i));
 if (!isCorrect) incorrectCount++;
 });

 const feedbackCount = attempt.feedback?.length ?? 0;
 if (feedbackCount < incorrectCount && pollCount < 10) {
 const timer = setTimeout(() => {
 setPollCount((c) => c + 1);
 }, 3000);
 return () => clearTimeout(timer);
 }
 }
 }, [isFetching, attempt, pollCount]);

 if (error) {
 return (
 <div className="flex items-center gap-2 py-4 text-status-error text-body-sm">
 <TriangleAlert className="size-4" />
 <span>Gagal memuat pembahasan.</span>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => {
 setPollCount(0);
 refetch();
 }}
 >
 Coba Lagi
 </Button>
 </div>
 );
 }

 if (!attempt) {
 return (
 <div className="space-y-4">
 <div className="h-16 bg-muted rounded-md animate-pulse" />
 <div className="h-40 bg-muted rounded-md animate-pulse" />
 </div>
 );
 }

 const { questionsSnapshot, answersSnapshot, score, feedback, strongAreas, weakAreas, recommendedNextSteps } = attempt;

 // Grade stats
 let correctCount = 0;
 questionsSnapshot.forEach((q) => {
 const submitted = answersSnapshot[q.id] ?? [];
 const isCorrect =
 submitted.length === q.correct_indices.length &&
 submitted.every((i) => q.correct_indices.includes(i));
 if (isCorrect) correctCount++;
 });
 const totalCount = questionsSnapshot.length;

 // Compute if feedback is still pending
 const incorrectCount = totalCount - correctCount;
 const isFeedbackPending = (feedback?.length ?? 0) < incorrectCount && pollCount < 10;
 const isFeedbackTimeout = (feedback?.length ?? 0) < incorrectCount && pollCount >= 10;

 const toggleFeedback = (idx: number) => {
 setOpenFeedback((prev) => ({ ...prev, [idx]: !prev[idx] }));
 };

 return (
 <div className="space-y-8 font-sans">
 {/* Header */}
 <div>
 <h2 className="font-heading text-h3 font-bold text-foreground">
 {score}
 <span className="text-body-sm font-normal text-muted-foreground ml-1">/100</span>
 </h2>
 <p className="text-body-sm text-muted-foreground mt-1">
 {correctCount} dari {totalCount} benar
 </p>
 </div>

 {/* Strong / Weak Areas */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
 <div>
 <span className="text-body-sm font-semibold uppercase tracking-wide text-muted-foreground">
 Kekuatan Anda
 </span>
 <ul className="mt-2 space-y-1 text-body-base">
 {strongAreas && strongAreas.length > 0 ? (
 strongAreas.map((area, idx) => <li key={idx}>{area}</li>)
 ) : (
 <li className="text-muted-foreground text-body-sm">Belum ada konsep yang dikuasai sepenuhnya.</li>
 )}
 </ul>
 </div>
 <div>
 <span className="text-body-sm font-semibold uppercase tracking-wide text-muted-foreground">
 Perlu Latihan
 </span>
 <ul className="mt-2 space-y-1 text-body-base">
 {weakAreas && weakAreas.length > 0 ? (
 weakAreas.map((area, idx) => (
 <li key={idx} className="flex items-center gap-1.5">
 <TrendingDown className="size-3.5 text-status-error" />
 <span>{area}</span>
 </li>
 ))
 ) : (
 <li className="text-muted-foreground text-body-sm">Kerja bagus! Tidak ada konsep yang lemah.</li>
 )}
 </ul>
 </div>
 </div>

 {/* E2: Embedded remediation ; mastery delta + root cause */}
 {attempt.remediation && attempt.remediation.concepts.length > 0 && (
 <div className="border-t border-border pt-8 space-y-6">
 <div>
 <h3 className="font-heading text-h6 font-bold text-foreground">Perubahan Penguasaan</h3>
 <ul className="mt-3 space-y-3">
 {attempt.remediation.concepts.map((c) => (
 <li key={c.conceptName} className="space-y-1">
 <div className="flex items-center justify-between gap-3 text-body-sm">
 <span className="font-medium text-foreground">{c.conceptName}</span>
 <span className="tabular-nums text-muted-foreground">
 {c.before}
 <ArrowRight className="inline size-3 mx-1" />
 {c.after}
 <span
 className={cn(
 "ml-2 font-semibold",
 c.delta >= 0 ? "text-status-success" : "text-status-error",
 )}
 >
 {c.delta >= 0 ? "+" : ""}
 {c.delta}
 </span>
 </span>
 </div>
 <div className="h-1.5 rounded-md bg-muted">
 <div
 className="h-full rounded-md bg-primary transition-[width] duration-500 ease-out"
 style={{ width: `${Math.max(0, Math.min(100, c.after))}%` }}
 />
 </div>
 </li>
 ))}
 </ul>
 </div>

 {attempt.remediation.rootCauses.length > 0 && (
 <div>
 <h3 className="font-heading text-h6 font-bold text-foreground">Kemungkinan Akar Masalah</h3>
 <ul className="mt-3 space-y-2 text-body-sm">
 {attempt.remediation.rootCauses.map((rc) => (
 <li key={rc.conceptName}>
 <span className="font-medium text-foreground">
 {rc.conceptName} ({rc.mastery})
 </span>
 <span className="text-muted-foreground"> bergantung pada: </span>
 <span className="text-status-error">
 {rc.blockedBy.map((b) => `${b.conceptName} (${b.mastery})`).join(", ")}
 </span>
 </li>
 ))}
 </ul>
 <p className="mt-3 text-body-sm text-muted-foreground">
 Estimasi tinjauan: sekitar {attempt.remediation.estimatedMinutes} menit.
 </p>
 </div>
 )}
 </div>
 )}

 {/* Questions List */}
 <div className="divide-y divide-border mt-8">
 {questionsSnapshot.map((q, idx) => {
 const submitted = answersSnapshot[q.id] ?? [];
 const isCorrect =
 submitted.length === q.correct_indices.length &&
 submitted.every((i) => q.correct_indices.includes(i));

 const fbItem = feedback?.find((f) => f.questionIndex === idx);
 const hasFb = !!fbItem;

 // Resolve choice option labels
 const submittedLabel = submitted.map((i) => q.options[i] ?? `Opsi ${i}`).join(", ");
 const correctLabel = q.correct_indices.map((i) => q.options[i] ?? `Opsi ${i}`).join(", ");

 return (
 <div key={q.id} className="py-6 first:pt-0">
 <div className="flex items-start justify-between gap-4">
 <div>
 <span className="text-body-sm font-semibold text-muted-foreground">Soal {idx + 1}</span>
 <div className="mt-2 text-body-base font-medium text-foreground">
 <MathText>{q.prompt}</MathText>
 </div>
 </div>
 <span
 className={cn(
 "text-xs font-semibold px-2 py-0.5 rounded-md border",
 isCorrect
 ? "bg-status-success/10 text-status-success border-status-success/20"
 : "bg-status-error/10 text-status-error border-status-error/20"
 )}
 >
 {isCorrect ? "Benar" : "Salah"}
 </span>
 </div>

 {/* Answers */}
 <div className="mt-4 space-y-1 pl-4 border-l-2 border-muted text-body-sm">
 <p>
 <span className="text-muted-foreground">Jawaban Anda: </span>
 <span className="font-medium">{submittedLabel || "-"}</span>
 </p>
 <p>
 <span className="text-muted-foreground">Jawaban Benar: </span>
 <span className="text-status-success font-semibold">{correctLabel}</span>
 </p>
 </div>

 {/* Mistake feedback */}
 {!isCorrect && (
 <div className="mt-5 border-t border-border/80 pt-5">
 {hasFb ? (
 <div className="space-y-4">
 <Button
 variant="ghost"
 size="sm"
 onClick={() => toggleFeedback(idx)}
 className="text-body-sm font-medium flex items-center gap-2 text-brand-primary hover:bg-transparent hover:text-brand-primary/80 p-0 h-auto"
 >
 <Sparkles className="size-4 animate-pulse" />
 <span className="font-heading font-bold uppercase tracking-wider text-body-xs">Analisis Kesalahan oleh Zyra</span>
 <ChevronDown
 className={cn(
 "size-4 transition-transform duration-200 text-muted-foreground",
 openFeedback[idx] && "rotate-180"
 )}
 />
 </Button>

 {openFeedback[idx] && (
 <div className="animate-in fade-in duration-200 pl-4 border-l-2 border-brand-primary/30 space-y-3">
 {fbItem.payload.misconceptionName && (
 <h6 className="text-body-sm font-semibold text-foreground">
 Miskonsep: {fbItem.payload.misconceptionName}
 </h6>
 )}
 <p className="text-body-base text-muted-foreground">
 {fbItem.payload.whyWrong}
 </p>
 {fbItem.payload.correctApproach && fbItem.payload.correctApproach.length > 0 && (
 <div className="space-y-1">
 <span className="text-body-sm font-semibold text-foreground">Langkah Penyelesaian:</span>
 <ol className="list-decimal pl-4 space-y-1 text-body-sm text-muted-foreground">
 {fbItem.payload.correctApproach.map((stepMsg, sIdx) => (
 <li key={sIdx}>{stepMsg}</li>
 ))}
 </ol>
 </div>
 )}
 <div className="flex flex-wrap items-center gap-3 pt-2">
 <MistakeFeedbackButton
 questionId={q.id}
 selectedAnswer={submittedLabel || "(tidak menjawab)"}
 />
 <Link
 href={fbItem.payload.reviewHref}
 className="inline-flex items-center text-primary text-body-sm hover:underline"
 >
 Tinjau Konsep Ini
 </Link>
 </div>
 </div>
 )}
 </div>
 ) : isFeedbackPending ? (
 <div className="flex items-center gap-2 text-body-sm text-brand-primary mt-2 font-medium">
 <Loader2 className="animate-spin size-3.5" />
 <Sparkles className="size-3.5 animate-pulse" />
 <span>Zyra sedang menganalisis kesalahan...</span>
 </div>
 ) : isFeedbackTimeout ? (
 <div className="flex items-center gap-2 py-2 text-status-error text-body-sm">
 <TriangleAlert className="size-4" />
 <span>Gagal memuat penjelasan otomatis.</span>
 <Button
 variant="ghost"
 size="sm"
 className="h-auto p-0"
 onClick={() => {
 setPollCount(0);
 refetch();
 }}
 >
 Coba Lagi
 </Button>
 </div>
 ) : null}
 </div>
 )}
 </div>
 );
 })}
 </div>

 {/* Recommended Next Steps */}
 {recommendedNextSteps && recommendedNextSteps.length > 0 && (
 <div className="border-t border-border pt-8">
 <h3 className="font-heading text-h6 font-bold text-foreground">Rekomendasi Langkah Selanjutnya</h3>
 <ul className="divide-y divide-border mt-3">
 {recommendedNextSteps.map((item, index) => {
 const Icon = KIND_ICON[item.kind] || BookOpen;
 return (
 <li
 key={item.id}
 className="py-3 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300"
 style={{ animationDelay: `${index * 50}ms` }}
 >
 <div className="size-5 rounded-full border border-border flex items-center justify-center shrink-0">
 <span className="text-body-xs font-bold">{index + 1}</span>
 </div>
 <Icon className="size-4 text-muted-foreground shrink-0" />
 <span className="text-body-base font-medium flex-1 min-w-0 truncate">
 {item.title}
 </span>
 <Button variant="ghost" size="sm" asChild>
 <Link href={item.href} aria-label={`Buka ${item.title}`}>
 <ArrowRight className="size-4" />
 </Link>
 </Button>
 </li>
 );
 })}
 </ul>
 </div>
 )}
 </div>
 );
}
