"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  User,
  Search,
  CheckSquare,
  Clock,
  Loader2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { MathText } from "@/components/course/math-text";
import { FormattedDate } from "@/components/ui/formatted-date";
import { toast } from "@/components/ui/toast";
import {
  gradeQuizAttemptAction,
  getQuizAttemptDetailsAction,
} from "@/app/actions/tutor-quiz-grading";

interface PendingAttemptItem {
  id: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  templateId: string;
  quizTitle: string;
  submittedAt: Date;
  totalQuestions: number;
  essayCount: number;
  remainingEssayCount: number;
}

interface QuestionDetail {
  index: number;
  id: string;
  prompt: string;
  questionType: string;
  options?: unknown;
  acceptableAnswers?: string[];
  submittedAnswer: unknown;
  submittedText: string;
  fileName?: string | null;
  fileKey?: string | null;
  fileSize?: string | null;
  isDeterministicCorrect: boolean;
  currentScore: number | null;
  currentStatus: string;
  reviewNotes: string;
  reviewRevision: number;
  reviewerId: string | null;
  isFreeResponse: boolean;
  isEssay: boolean;
  isShortAnswer: boolean;
}

interface AttemptDetails {
  attemptId: string;
  templateId: string;
  quizTitle: string;
  studentName: string | null;
  studentEmail: string | null;
  submittedAt: Date;
  gradingStatus: string;
  score: number | null;
  questions: QuestionDetail[];
}

interface Props {
  courseId: string;
  pendingAttempts: PendingAttemptItem[];
}

export function TutorQuizGradingClient({ courseId, pendingAttempts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeAttempt, setActiveAttempt] = useState<AttemptDetails | null>(null);
  const [loadingAttemptId, setLoadingAttemptId] = useState<string | null>(null);

  // Form state for active attempt reviews: questionId -> { score: string, notes: string, expectedRevision: number }
  const [gradeInputs, setGradeInputs] = useState<
    Record<string, { score: string; notes: string; expectedRevision: number }>
  >({});

  const filteredAttempts = pendingAttempts.filter((a) => {
    const q = searchQuery.toLowerCase();
    const titleMatch = a.quizTitle.toLowerCase().includes(q);
    const nameMatch = a.studentName?.toLowerCase().includes(q) ?? false;
    const emailMatch = a.studentEmail?.toLowerCase().includes(q) ?? false;
    return titleMatch || nameMatch || emailMatch;
  });

  async function handleSelectAttempt(attemptId: string) {
    setLoadingAttemptId(attemptId);
    try {
      const details = await getQuizAttemptDetailsAction(courseId, attemptId);
      if (!details) {
        toast.error("Gagal memuat detail pengerjaan kuis.");
        return;
      }
      setActiveAttempt(details);

      const initialInputs: Record<string, { score: string; notes: string; expectedRevision: number }> = {};
      for (const q of details.questions) {
        if (q.isFreeResponse) {
          initialInputs[q.id] = {
            score: q.currentScore !== null ? String(q.currentScore) : "",
            notes: q.reviewNotes || "",
            expectedRevision: q.reviewRevision,
          };
        }
      }
      setGradeInputs(initialInputs);
    } catch (err: any) {
      toast.error(err?.message || "Terjadi kesalahan saat memuat attempt.");
    } finally {
      setLoadingAttemptId(null);
    }
  }

  function handleScoreChange(questionId: string, val: string) {
    setGradeInputs((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        score: val,
      },
    }));
  }

  function handleNotesChange(questionId: string, val: string) {
    setGradeInputs((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        notes: val,
      },
    }));
  }

  async function handleSave(finalize: boolean) {
    if (!activeAttempt) return;

    const freeResponseQuestions = activeAttempt.questions.filter((q) => q.isFreeResponse);
    const essayQuestions = activeAttempt.questions.filter((q) => q.isEssay);

    if (finalize) {
      // Check that all essay questions have a valid score
      for (const eq of essayQuestions) {
        const input = gradeInputs[eq.id];
        const num = input ? parseInt(input.score, 10) : NaN;
        if (isNaN(num) || num < 0 || num > 100) {
          toast.error(`Nilai untuk soal esai nomor ${eq.index} wajib diisi antara 0 dan 100.`);
          return;
        }
      }
    }

    // Collect items that have been modified or filled
    const itemsToSubmit: Array<{
      questionId: string;
      score: number;
      reviewNotes?: string | null;
      expectedRevision: number;
    }> = [];

    for (const q of freeResponseQuestions) {
      const input = gradeInputs[q.id];
      if (!input) continue;
      const num = parseInt(input.score, 10);
      if (!isNaN(num) && num >= 0 && num <= 100) {
        itemsToSubmit.push({
          questionId: q.id,
          score: num,
          reviewNotes: input.notes.trim() || null,
          expectedRevision: input.expectedRevision,
        });
      }
    }

    if (itemsToSubmit.length === 0) {
      toast.error("Belum ada nilai yang diisi.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await gradeQuizAttemptAction({
          courseId,
          attemptId: activeAttempt.attemptId,
          items: itemsToSubmit,
        });

        if (res.success) {
          if (res.gradingStatus === "graded") {
            toast.success("Penilaian berhasil diselesaikan dan nilai akhir telah disimpan.");
          } else {
            toast.success("Draf penilaian berhasil disimpan sebagian.");
          }
          setActiveAttempt(null);
          router.refresh();
        }
      } catch (err: any) {
        toast.error(err?.message || "Gagal menyimpan penilaian.");
      }
    });
  }

  // Active Review Workspace
  if (activeAttempt) {
    return (
      <div className="space-y-6 font-sans">
        <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveAttempt(null)}
              className="rounded-md border-border/80 text-body-sm"
            >
              <ArrowLeft className="mr-1.5 size-4" />
              Kembali ke antrean
            </Button>
            <div className="min-w-0">
              <h2 className="font-heading text-body-base font-bold text-foreground">
                Koreksi: {activeAttempt.quizTitle}
              </h2>
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-xs text-muted-foreground">
                <User className="size-3" />
                <span>{activeAttempt.studentName} ({activeAttempt.studentEmail})</span>
                <Clock className="size-3" />
                <span>
                  Dikumpulkan: <FormattedDate date={activeAttempt.submittedAt} options={{ dateStyle: "medium", timeStyle: "short" }} />
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:shrink-0">
            <Button
              variant="default"
              size="sm"
              disabled={isPending}
              onClick={() => handleSave(true)}
              className="rounded-md text-body-sm font-semibold"
            >
              {isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 size-4" />
              )}
              Selesaikan penilaian
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {activeAttempt.questions.map((q) => {
            const input = gradeInputs[q.id];
            const typeLabel =
              q.questionType === "essay"
                ? "Esai"
                : q.questionType === "short_answer"
                ? "Isian Singkat"
                : "Pilihan Ganda";

            return (
              <div
                key={q.id}
                className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-body-sm font-bold text-foreground">
                      Soal #{q.index}
                    </span>
                    <Badge variant="outline" className="rounded-md text-body-xs font-medium">
                      {typeLabel}
                    </Badge>
                  </div>

                  {!q.isFreeResponse ? (
                    <Badge
                      variant={q.isDeterministicCorrect ? "default" : "outline"}
                      className={q.isDeterministicCorrect
                        ? "rounded-md text-body-xs"
                        : "rounded-md border-destructive/50 text-body-xs text-destructive"}
                    >
                      {q.isDeterministicCorrect ? "Benar (Otomatis)" : "Salah (Otomatis)"}
                    </Badge>
                  ) : q.isShortAnswer ? (
                    <Badge
                      variant="outline"
                      className="rounded-md text-body-xs text-muted-foreground border-border"
                    >
                      {q.isDeterministicCorrect
                        ? "Kunci Cocok (Dapat disesuaikan)"
                        : "Kunci Tidak Cocok (Dapat disesuaikan)"}
                    </Badge>
                  ) : (
                    <Badge
                      variant={q.currentScore !== null ? "default" : "secondary"}
                      className="rounded-md text-body-xs"
                    >
                      {q.currentScore !== null ? `Dinilai: ${q.currentScore}/100` : "Wajib Dinilai"}
                    </Badge>
                  )}
                </div>

                <div className="text-body-sm text-foreground bg-muted/40 p-3 rounded-lg border border-border/40">
                  <MathText>{q.prompt}</MathText>
                </div>

                {q.acceptableAnswers && q.acceptableAnswers.length > 0 && (
                  <div className="text-body-xs text-muted-foreground bg-muted/20 p-2.5 rounded-md border border-border/30">
                    <span className="font-semibold text-foreground">Kunci jawaban referensi: </span>
                    {q.acceptableAnswers.join(", ")}
                  </div>
                )}

                <div className="space-y-1.5">
                  <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Jawaban Siswa:
                  </span>
                  <div className="text-body-sm text-foreground bg-background p-3 rounded-md border border-border min-h-[48px] whitespace-pre-wrap">
                    {q.submittedText ? (
                      <MathText>{q.submittedText}</MathText>
                    ) : (
                      <span className="italic text-muted-foreground">Tidak menjawab</span>
                    )}
                  </div>
                </div>

                {/* R2 uploaded attachment if present */}
                {q.fileName && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-card p-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-status-success/10 text-status-success">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="max-w-[200px] truncate text-body-xs font-bold text-foreground md:max-w-xs">{q.fileName}</p>
                        <p className="text-body-2xs text-muted-foreground">{q.fileSize || "PDF / Gambar"} • Cloudflare R2</p>
                      </div>
                    </div>
                    {q.fileKey ? (
                      <Button
                        variant="outline"
                        size="xs"
                        asChild
                        className="gap-1 rounded-md border-border/80 text-muted-foreground hover:text-foreground"
                      >
                        <a
                          href={`/api/storage/file/${q.fileKey.split("/").map(encodeURIComponent).join("/")}?download=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="size-3.5" />
                          Unduh Berkas
                        </a>
                      </Button>
                    ) : (
                      <span className="shrink-0 text-body-xs italic text-muted-foreground">
                        Berkas tidak tersedia
                      </span>
                    )}
                  </div>
                )}

                {q.isFreeResponse && input && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-border/60">
                    <div className="space-y-1.5">
                      <label className="text-body-sm font-semibold text-foreground">
                        Nilai (0-100) {q.isEssay ? <span className="text-destructive">*</span> : null}
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={input.score}
                        onChange={(e) => handleScoreChange(q.id, e.target.value)}
                        placeholder="0 - 100"
                        className="rounded-md text-body-sm"
                      />
                    </div>
                    <div className="md:col-span-3 space-y-1.5">
                      <label className="text-body-sm font-semibold text-foreground">
                        Catatan Koreksi (Opsional)
                      </label>
                      <Textarea
                        rows={2}
                        value={input.notes}
                        onChange={(e) => handleNotesChange(q.id, e.target.value)}
                        placeholder="Tuliskan umpan balik atau alasan penilaian..."
                        className="rounded-md text-body-sm resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Queue View
  return (
    <div className="space-y-6 font-sans">
      {/* Search and filters toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md min-w-[140px]">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Cari nama siswa atau judul kuis..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-body-sm rounded-md h-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-body-xs text-muted-foreground">
          <span>Menampilkan {filteredAttempts.length} antrean</span>
        </div>
      </div>

      {filteredAttempts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card">
          <AdminEmptyState
            icon={CheckSquare}
            title="Tidak ada kuis yang menunggu penilaian"
            description="Semua jawaban esai sudah dikoreksi atau belum ada pengumpulan baru."
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card shadow-xs">
          <div className="divide-y divide-border">
            {filteredAttempts.map((item) => {
              const isLoadingThis = loadingAttemptId === item.id;
              return (
                <div
                  key={item.id}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-heading text-body-sm font-bold text-foreground">
                        {item.quizTitle}
                      </h4>
                      <Badge variant="secondary" className="rounded-md text-body-xs font-semibold">
                        {item.remainingEssayCount} esai tersisa
                      </Badge>
                    </div>
                    <div className="text-body-xs text-muted-foreground flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1">
                        <User className="size-3" />
                        {item.studentName ?? "Siswa"} ({item.studentEmail})
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        Dikumpulkan: <FormattedDate date={item.submittedAt} options={{ dateStyle: "medium", timeStyle: "short" }} />
                      </span>
                      <span>Total {item.totalQuestions} soal ({item.essayCount} esai)</span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <Button
                      variant="default"
                      size="sm"
                      disabled={isLoadingThis}
                      onClick={() => handleSelectAttempt(item.id)}
                      className="rounded-md text-body-sm font-semibold"
                    >
                      {isLoadingThis ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <FileText className="mr-1.5 size-4" />
                      )}
                      Nilai jawaban
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
