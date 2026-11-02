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
import { useTranslations } from "@/lib/i18n/client";

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
  const t = useTranslations("adminAcademic");
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
        toast.error(t("courseDetail.quizzes.errors.preview"));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("courseDetail.quizzes.errors.preview");
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
        toast.success(t("courseDetail.quizzes.success.delete"));
        setQuizzes((prev) => prev.filter((q) => q.id !== deletingQuiz.id));
        setDeleteOpen(false);
        router.refresh();
      } else {
        toast.error(t("courseDetail.quizzes.errors.delete"));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("courseDetail.quizzes.errors.delete");
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
    ? `/admin/courses/${encodeURIComponent(courseSlug)}/quizzes/new`
    : `/admin/quizzes/new?courseId=${encodeURIComponent(courseId)}`;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header Controls & Create Button */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[170px] h-9 rounded-lg">
                <SelectValue placeholder={t("courseDetail.quizzes.allCategories")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("courseDetail.quizzes.allCategories")}</SelectItem>
                <SelectItem value="daily">{t("courseDetail.quizzes.categories.daily")}</SelectItem>
                <SelectItem value="weekly">{t("courseDetail.quizzes.categories.weekly")}</SelectItem>
                <SelectItem value="chapter">{t("courseDetail.quizzes.categories.chapter")}</SelectItem>
                <SelectItem value="simulation">{t("courseDetail.quizzes.categories.simulation")}</SelectItem>
                <SelectItem value="premium">{t("courseDetail.quizzes.categories.premium")}</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-body-xs text-muted-foreground">
              {t("courseDetail.quizzes.count", { filtered: filteredQuizzes.length, total: quizzes.length })}
            </span>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild size="icon" className="size-9 rounded-lg bg-brand-primary text-primary-foreground hover:bg-brand-primary/95 font-semibold shadow-2xs">
                <Link href={createQuizHref} aria-label={t("courseDetail.quizzes.create")}>
                  <Plus className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("courseDetail.quizzes.create")}</TooltipContent>
          </Tooltip>
        </div>

        {/* Quizzes List */}
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          {filteredQuizzes.length === 0 ? (
            <div className="text-center py-8 px-4">
              <NotebookPen className="size-6 text-muted-foreground/40 mx-auto mb-1.5" />
              <p className="text-body-xs font-medium text-foreground">{t("courseDetail.quizzes.emptyTitle")}</p>
              <p className="text-body-xs text-muted-foreground mt-0.5">
                {t("courseDetail.quizzes.emptyDescription")}
              </p>
              <Button asChild size="sm" className="mt-3 gap-1.5 rounded-lg bg-brand-primary text-primary-foreground hover:bg-brand-primary/95 font-semibold h-8 text-body-xs">
                <Link href={createQuizHref}>
                  <Plus className="size-3.5" />
                  {t("courseDetail.quizzes.createNow")}
                </Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredQuizzes.map((quiz) => {
                const editQuizHref = courseSlug
                  ? `/admin/courses/${encodeURIComponent(courseSlug)}/quizzes/${encodeURIComponent(quiz.id)}/edit`
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
                          {t(`courseDetail.quizzes.categories.${quiz.category}`)}
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
                          {quiz.status === "published" ? t("courseDetail.quizzes.status.published") : t("courseDetail.quizzes.status.draft")}
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
                          {quiz.visibility === "paid" ? t("courseDetail.quizzes.premium") : t("courseDetail.quizzes.free")}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-body-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3 shrink-0" />
                          {quiz.timeLimitSeconds ? t("courseDetail.quizzes.minutes", { count: Math.round(quiz.timeLimitSeconds / 60) }) : t("courseDetail.quizzes.noLimit")}
                        </span>
                        <span className="text-border/60">·</span>
                        <span className="flex items-center gap-1">
                          <Award className="size-3 shrink-0" />
                          {t("courseDetail.quizzes.maxAttempts", { count: quiz.maxAttempts || t("courseDetail.quizzes.unlimited") })}
                        </span>
                        <span className="text-border/60">·</span>
                        <span>
                              {t("courseDetail.quizzes.createdAt")} <FormattedDate date={new Date(quiz.createdAt)} options={{ day: "numeric", month: "short", year: "numeric" }} />
                        </span>
                        <span className="text-border/60">·</span>
                        <span className="font-medium text-foreground">
                          {t("courseDetail.quizzes.attempts", { count: quiz.totalAttempts || 0 })}
                        </span>
                        {(quiz.totalAttempts || 0) > 0 && (
                          <>
                            <span className="text-border/60">·</span>
                            <span>
                              {t("courseDetail.quizzes.average")}: <strong className="text-foreground">{quiz.avgScore}/100</strong>
                            </span>
                            <span className="text-border/60">·</span>
                            <span>
                              {t("courseDetail.quizzes.passRate")}: <strong className="text-foreground">{quiz.passRate}%</strong>
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
                            aria-label={t("courseDetail.quizzes.preview")}
                          >
                            <Eye className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("courseDetail.quizzes.preview")}</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            asChild
                            size="icon"
                            variant="outline"
                            className="size-7 sm:size-8 rounded-lg border-border text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary"
                          >
                            <Link
                              href={courseSlug
                                ? `/admin/courses/${encodeURIComponent(courseSlug)}/analytics/${encodeURIComponent(quiz.id)}`
                                : `/admin/quiz-insights/${encodeURIComponent(quiz.id)}`}
                              aria-label={t("courseDetail.quizzes.analyze")}
                            >
                              <BarChart3 className="size-3.5" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("courseDetail.quizzes.analyze")}</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            asChild
                            size="icon"
                            variant="outline"
                            className="size-7 sm:size-8 rounded-lg border-border text-foreground hover:bg-muted"
                          >
                            <Link href={editQuizHref} aria-label={t("courseDetail.quizzes.edit")}>
                              <Edit2 className="size-3.5" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("courseDetail.quizzes.edit")}</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 sm:size-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteStart(quiz)}
                            aria-label={t("courseDetail.quizzes.delete")}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("courseDetail.quizzes.delete")}</TooltipContent>
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
        title={t("courseDetail.quizzes.delete")}
        description={t("courseDetail.quizzes.deleteDescription", { title: deletingQuiz?.title ?? "" })}
        confirmLabel={t("courseDetail.quizzes.confirmDelete")}
        loading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />

      {/* Preview Quiz Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {t("courseDetail.quizzes.previewTitle", { title: previewQuiz?.title ?? "" })}
            </DialogTitle>
            <DialogDescription className="text-left text-body-xs text-muted-foreground flex gap-3 flex-wrap items-center mt-1">
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">
                {t("courseDetail.quizzes.categoryLabel")}: {previewQuiz ? t(`courseDetail.quizzes.categories.${previewQuiz.category}`) : ""}
              </span>
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">
                {t("courseDetail.quizzes.timeLimit")}: {previewQuiz?.timeLimitSeconds ? t("courseDetail.quizzes.minutes", { count: previewQuiz.timeLimitSeconds / 60 }) : t("courseDetail.quizzes.unlimited")}
              </span>
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">
                {t("courseDetail.quizzes.attemptsLabel")}: {previewQuiz?.maxAttempts ?? t("courseDetail.quizzes.unlimited")}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
            {previewLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="size-8 animate-spin text-brand-primary" />
                <p className="text-body-sm text-muted-foreground">{t("courseDetail.quizzes.loadingPreview")}</p>
              </div>
            ) : previewQuestions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-body-sm">
                {t("courseDetail.quizzes.noQuestions")}
              </div>
            ) : (
              <div className="space-y-6">
                {previewQuestions.map((q, idx) => (
                  <div key={q.id} className="py-4 border-b border-border last:border-0 space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                      <span className="text-body-sm font-bold text-foreground">{t("courseDetail.quizzes.questionNumber", { number: idx + 1 })}</span>
                      <div className="flex items-center gap-2">
                        <DifficultyBadge difficulty={q.difficulty} />
                        <span className="capitalize text-[10px] bg-muted/80 text-muted-foreground px-2 py-0.5 rounded border border-border font-medium">
                          {q.questionType === "multiple_choice" ? t("courseDetail.quizzes.singleChoice") : t("courseDetail.quizzes.multipleChoice")}
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
                          {t("courseDetail.quizzes.answerExplanation")}
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
            <Button onClick={() => setPreviewOpen(false)} className="rounded-md bg-brand-primary text-primary-foreground hover:bg-brand-primary/90">
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </TooltipProvider>
  );
}
