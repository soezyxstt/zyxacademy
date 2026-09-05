"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  deleteQuizTemplateAction,
  getQuizTemplatePreviewAction,
} from "@/app/actions/tutor-management";
import {
  NotebookPen,
  Plus,
  Clock,
  Award,
  Trash2,
  Edit2,
  Eye,
  BarChart3,
  Loader2,
  Check,
} from "lucide-react";
import { FormattedDate } from "@/components/ui/formatted-date";
import { MathText } from "@/components/course/math-text";
import { AdminOptionLetter } from "@/components/admin/option-letter";
import { DifficultyBadge } from "@/components/admin/status-badges";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Chapter = {
  id: string;
  courseId: string;
  title: string;
  description?: string | null;
  orderIndex: number;
};

export type CourseQuiz = {
  id: string;
  courseId: string;
  title: string;
  category: "daily" | "weekly" | "chapter" | "premium" | "simulation";
  visibility: "free" | "paid";
  status: "draft" | "published";
  manualStatus?: "open" | "closed" | "scheduled";
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  openAt?: Date | null;
  closeAt?: Date | null;
  selectionRules?: unknown;
  showDiscussion?: boolean;
  createdAt: Date | string;
  totalAttempts?: number;
  avgScore?: number;
  passRate?: number;
  lastAiInsight?: { id: string; createdAt: Date } | null;
};

type Props = {
  courseId: string;
  courseSlug?: string;
  courseTitle?: string;
  chapters: Chapter[];
  initialQuizzes: CourseQuiz[];
};

export function QuizzesTab({
  courseId,
  courseSlug,
  initialQuizzes,
}: Props) {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<CourseQuiz[]>(initialQuizzes);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Preview Dialog State
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewQuiz, setPreviewQuiz] = useState<CourseQuiz | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Delete Dialog State
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingQuiz, setDeletingQuiz] = useState<CourseQuiz | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handlePreviewQuiz = async (quiz: CourseQuiz) => {
    setPreviewQuiz(quiz);
    setPreviewLoading(true);
    setPreviewQuestions([]);
    setPreviewOpen(true);
    try {
      const res = await getQuizTemplatePreviewAction(courseId, quiz.id);
      if (res.success) {
        setPreviewQuestions(res.questions);
      } else {
        toast.error("Gagal memuat pratinjau soal kuis.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal memuat pratinjau soal kuis.";
      toast.error(message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDeleteStart = (quiz: CourseQuiz) => {
    setDeletingQuiz(quiz);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingQuiz) return;
    setIsDeleting(true);
    try {
      const res = await deleteQuizTemplateAction(courseId, deletingQuiz.id);
      if (res.success) {
        toast.success("Kuis berhasil dihapus.");
        setQuizzes((prev) => prev.filter((q) => q.id !== deletingQuiz.id));
        setDeleteOpen(false);
        router.refresh();
      } else {
        toast.error("Gagal menghapus kuis.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal menghapus kuis.";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredQuizzes = quizzes.filter((q) => {
    if (categoryFilter === "all") return true;
    return q.category === categoryFilter;
  });

  const createQuizHref = courseSlug
    ? `/admin/courses/${courseSlug}/quizzes/new`
    : `/admin/quizzes/new?courseId=${encodeURIComponent(courseId)}`;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header Controls & Create Button */}
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[170px] h-9 rounded-lg">
                <SelectValue placeholder="Semua Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                <SelectItem value="daily">Latihan Harian</SelectItem>
                <SelectItem value="weekly">Kuis Mingguan</SelectItem>
                <SelectItem value="chapter">Kuis Per Bab</SelectItem>
                <SelectItem value="simulation">Simulasi Ujian</SelectItem>
                <SelectItem value="premium">Kuis Premium</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-body-xs text-muted-foreground">
              {filteredQuizzes.length} dari {quizzes.length} kuis
            </span>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild size="icon" className="size-9 rounded-lg bg-brand-primary text-white hover:bg-brand-primary/95 font-semibold shadow-2xs">
                <Link href={createQuizHref} aria-label="Buat Kuis Baru">
                  <Plus className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Buat Kuis Baru</TooltipContent>
          </Tooltip>
        </div>

        {/* Quizzes List */}
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          {filteredQuizzes.length === 0 ? (
            <div className="text-center py-8 px-4">
              <NotebookPen className="size-6 text-muted-foreground/40 mx-auto mb-1.5" />
              <p className="text-body-xs font-medium text-foreground">Belum ada kuis yang dibuat untuk kelas ini</p>
              <p className="text-body-xs text-muted-foreground mt-0.5">
                Klik tombol tambah untuk menyusun kuis mandiri atau simulasi pada kelas ini.
              </p>
              <Button asChild size="sm" className="mt-3 gap-1.5 rounded-lg bg-brand-primary text-white hover:bg-brand-primary/95 font-semibold h-8 text-body-xs">
                <Link href={createQuizHref}>
                  <Plus className="size-3.5" />
                  Buat Kuis Sekarang
                </Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredQuizzes.map((quiz) => {
                const editQuizHref = courseSlug
                  ? `/admin/courses/${courseSlug}/quizzes/${quiz.id}/edit?returnUrl=${encodeURIComponent(`/admin/courses/${courseSlug}?tab=quizzes`)}&courseSlug=${encodeURIComponent(courseSlug)}`
                  : `/admin/quizzes/${quiz.id}/edit`;

                return (
                  <div
                    key={quiz.id}
                    className="p-3 sm:px-4 sm:py-3 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-heading text-body-sm font-semibold text-foreground">
                          {quiz.title}
                        </p>
                        <Badge
                          variant="outline"
                          className="rounded-md text-[10px] px-1.5 py-0 font-normal capitalize text-muted-foreground border-border/60 bg-muted/20"
                        >
                          {quiz.category}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-md text-[10px] px-1.5 py-0 font-normal",
                            quiz.status === "published"
                              ? "text-emerald-500/90 border-emerald-500/25 bg-emerald-500/5"
                              : "text-muted-foreground/80 border-dashed border-border/60 bg-muted/10"
                          )}
                        >
                          {quiz.status === "published" ? "Published" : "Draft"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-md text-[10px] px-1.5 py-0 font-normal",
                            quiz.visibility === "paid"
                              ? "text-amber-500/90 border-amber-500/25 bg-amber-500/5"
                              : "text-muted-foreground/70 border-border/40 bg-muted/10"
                          )}
                        >
                          {quiz.visibility === "paid" ? "Premium" : "Gratis"}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-body-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3 shrink-0" />
                          {quiz.timeLimitSeconds ? `${Math.round(quiz.timeLimitSeconds / 60)} Menit` : "Tanpa batas"}
                        </span>
                        <span className="text-border/60">·</span>
                        <span className="flex items-center gap-1">
                          <Award className="size-3 shrink-0" />
                          Maks. {quiz.maxAttempts || "Bebas"} percobaan
                        </span>
                        <span className="text-border/60">·</span>
                        <span>
                          Dibuat pada <FormattedDate date={new Date(quiz.createdAt)} options={{ day: "numeric", month: "short", year: "numeric" }} />
                        </span>
                        <span className="text-border/60">·</span>
                        <span className="font-medium text-foreground">
                          {quiz.totalAttempts || 0} pengerjaan siswa
                        </span>
                        {(quiz.totalAttempts || 0) > 0 && (
                          <>
                            <span className="text-border/60">·</span>
                            <span>
                              Rata-rata: <strong className="text-foreground">{quiz.avgScore}/100</strong>
                            </span>
                            <span className="text-border/60">·</span>
                            <span>
                              Kelulusan: <strong className="text-foreground">{quiz.passRate}%</strong>
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-7 sm:size-8 rounded-lg border-border text-foreground hover:bg-muted"
                            onClick={() => handlePreviewQuiz(quiz)}
                            aria-label="Pratinjau Kuis"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Pratinjau Kuis</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            asChild
                            size="icon"
                            variant="outline"
                            className="size-7 sm:size-8 rounded-lg border-border text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary"
                          >
                            <Link href={`/admin/quiz-insights/${quiz.id}`} aria-label="Analisis Kuis">
                              <BarChart3 className="size-3.5" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Analisis Kuis</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            asChild
                            size="icon"
                            variant="outline"
                            className="size-7 sm:size-8 rounded-lg border-border text-foreground hover:bg-muted"
                          >
                            <Link href={editQuizHref} aria-label="Edit Kuis">
                              <Edit2 className="size-3.5" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit Kuis</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 sm:size-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteStart(quiz)}
                            aria-label="Hapus Kuis"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Hapus Kuis</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      {/* Delete Quiz Confirmation Dialog */}
      <AdminConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeletingQuiz(null);
        }}
        title="Hapus Kuis"
        description={`Tindakan ini akan menghapus kuis "${deletingQuiz?.title}" secara permanen dari kelas ini. Data hasil pengerjaan terkait kuis ini mungkin ikut terpengaruh.`}
        confirmLabel="Ya, Hapus Permanen"
        loading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />

      {/* Preview Quiz Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              Pratinjau Kuis: {previewQuiz?.title}
            </DialogTitle>
            <DialogDescription className="text-left text-body-xs text-muted-foreground flex gap-3 flex-wrap items-center mt-1">
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">
                Kategori: {previewQuiz?.category}
              </span>
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">
                Batas Waktu: {previewQuiz?.timeLimitSeconds ? `${previewQuiz.timeLimitSeconds / 60} menit` : "Bebas"}
              </span>
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">
                Percobaan: {previewQuiz?.maxAttempts ? `${previewQuiz.maxAttempts}x` : "Bebas"}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
            {previewLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="size-8 animate-spin text-brand-primary" />
                <p className="text-body-sm text-muted-foreground">Memilih dan meresolusi butir soal...</p>
              </div>
            ) : previewQuestions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-body-sm">
                Tidak ada butir soal yang tersedia untuk kuis ini.
              </div>
            ) : (
              <div className="space-y-6">
                {previewQuestions.map((q, idx) => (
                  <div key={q.id} className="p-5 rounded-xl border border-border bg-card space-y-4">
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                      <span className="text-body-sm font-bold text-foreground">Soal {idx + 1}</span>
                      <div className="flex items-center gap-2">
                        <DifficultyBadge difficulty={q.difficulty} />
                        <span className="capitalize text-[10px] bg-muted/80 text-muted-foreground px-2 py-0.5 rounded border border-border font-medium">
                          {q.questionType === "multiple_choice" ? "Single Choice" : "Multi Choice"}
                        </span>
                      </div>
                    </div>

                    <MathText className="text-body-sm font-semibold text-foreground whitespace-pre-wrap leading-relaxed" as="p">
                      {q.prompt}
                    </MathText>

                    <div className="grid gap-2">
                      {q.options.map((opt: string, optIdx: number) => {
                        const isCorrect = q.correctIndices.includes(optIdx);
                        return (
                          <div
                            key={optIdx}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-lg border text-body-sm transition-colors",
                              isCorrect
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300 font-medium"
                                : "bg-background/50 border-border text-foreground/80"
                            )}
                          >
                            <AdminOptionLetter index={optIdx} isCorrect={isCorrect} />
                            <MathText className="leading-normal" as="span">{opt}</MathText>
                            {isCorrect && <Check className="size-4 text-emerald-600 dark:text-emerald-400 ml-auto shrink-0" />}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-lg p-3.5 space-y-1.5 text-body-sm">
                        <span className="font-bold text-brand-primary block text-body-xs uppercase tracking-wider">
                          Pembahasan Jawaban:
                        </span>
                        <MathText className="text-muted-foreground leading-relaxed whitespace-pre-wrap" as="p">
                          {q.explanation}
                        </MathText>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="p-4 border-t border-border bg-muted/10 shrink-0">
            <Button onClick={() => setPreviewOpen(false)} className="rounded-md bg-brand-primary text-white hover:bg-brand-primary/90">
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </TooltipProvider>
  );
}
