"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Clock, Award, BookOpen, Loader2, Calendar, Eye, Check, Edit } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { CourseBadge, DifficultyBadge } from "@/components/admin/status-badges";
import { AdminOptionLetter } from "@/components/admin/option-letter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getQuizTemplatePreviewAction } from "@/app/actions/tutor-management";
import { MathText } from "@/components/course/math-text";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type TemplateType = {
  id: string;
  courseId: string;
  title: string;
  category: "daily" | "weekly" | "chapter" | "premium" | "simulation";
  visibility: "free" | "paid";
  status: "draft" | "published";
  manualStatus: "open" | "closed" | "scheduled";
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  openAt?: Date | null;
  closeAt?: Date | null;
  showDiscussion?: boolean;
  selectionRules: unknown;
  createdAt: Date;
  updatedAt?: Date;
};

interface Course {
  id: string;
  title: string;
}

interface Props {
  initialTemplates: TemplateType[];
  courses?: Course[];
  courseMap: Record<string, string>;
  prefillCourseId?: string;
  prefillTags?: string;
}

export function QuizzesCurationClient({ initialTemplates, courseMap, prefillCourseId, prefillTags }: Props) {
  const tx = useTranslations("adminEval.quizzes");
  const locale = useLocale();
  const [templates, setTemplates] = useState<TemplateType[]>(initialTemplates);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<TemplateType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Preview Dialog State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTpl, setPreviewTpl] = useState<TemplateType | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function handleOpenPreviewTpl(t: TemplateType) {
    setPreviewTpl(t);
    setIsPreviewOpen(true);
    setLoadingPreview(true);
    setPreviewQuestions([]);
    try {
      const res = await getQuizTemplatePreviewAction(t.courseId, t.id);
      if (res.success) {
        setPreviewQuestions(res.questions);
      } else {
        toast.error(tx("previewFailed"));
      }
    } catch {
      toast.error(tx("previewFailed"));
    } finally {
      setLoadingPreview(false);
    }
  }

  const handleUpdateManualStatus = async (templateId: string, newManualStatus: TemplateType["manualStatus"]) => {
    try {
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, manualStatus: newManualStatus } : t))
      );

      const res = await fetch(`/api/quiz/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualStatus: newManualStatus }),
      });

      if (!res.ok) throw new Error("Failed to update status");

      toast.success(
        tx("accessStatusUpdated", { status: tx(`access.${newManualStatus}`) })
      );
    } catch {
      toast.error(tx("accessUpdateFailed"));
    }
  };

  const handleUpdateShowDiscussion = async (templateId: string, showDiscussion: boolean) => {
    try {
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, showDiscussion } : t))
      );

      const res = await fetch(`/api/quiz/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showDiscussion }),
      });

      if (!res.ok) {
        throw new Error("Failed to update discussion status");
      }

      toast.success(showDiscussion ? tx("discussionOpened") : tx("discussionClosed"));
    } catch {
      toast.error(tx("discussionUpdateFailed"));
    }
  };

  const handleUpdateStatus = async (templateId: string, newStatus: TemplateType["status"]) => {
    try {
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, status: newStatus } : t))
      );

      const res = await fetch(`/api/quiz/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error("Failed to update publish status");
      }

      toast.success(newStatus === "published" ? tx("publishedToast") : tx("draftSavedToast"));
    } catch {
      toast.error(tx("publishUpdateFailed"));
    }
  };

  const handleDeleteStart = (template: TemplateType) => {
    setDeletingTemplate(template);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTemplate) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/quiz/templates/${deletingTemplate.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(tx("deleteSucceeded"));
        setTemplates((prev) => prev.filter((t) => t.id !== deletingTemplate.id));
        setDeleteOpen(false);
      } else {
        toast.error(tx("deleteFailed"));
      }
    } catch {
      toast.error(tx("deleteError"));
    } finally {
      setIsDeleting(false);
    }
  };

  const newQuizUrl = prefillCourseId
    ? `/admin/quizzes/new?courseId=${encodeURIComponent(prefillCourseId)}${prefillTags ? `&tags=${encodeURIComponent(prefillTags)}` : ""}`
    : "/admin/quizzes/new";

  return (
    <div className="space-y-6 font-sans">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <span className="text-body-sm font-medium text-muted-foreground">
          {tx("registeredCount", { count: templates.length })}
        </span>
        <Button asChild className="rounded-lg bg-brand-primary text-white hover:bg-brand-primary/95 font-bold shadow-xs">
          <Link href={newQuizUrl} className="flex items-center gap-2">
            <Plus className="size-4" /> {tx("createQuiz")}
          </Link>
        </Button>
      </div>

      {/* Grid List */}
      {templates.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-8 px-4 text-center shadow-xs flex flex-col items-center justify-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary mb-5 border border-brand-primary/20">
            <BookOpen className="size-6" />
          </div>
          <h3 className="font-heading text-body-base font-bold text-foreground">{tx("emptyTitle")}</h3>
          <p className="text-body-sm text-muted-foreground max-w-sm mx-auto mt-2 leading-relaxed">
            {tx("emptyDescription")}
          </p>
          <Button asChild className="mt-6 rounded-lg bg-brand-primary text-white hover:bg-brand-primary/95 font-bold shadow-md">
            <Link href={newQuizUrl} className="flex items-center gap-2">
              <Plus className="size-4" /> {tx("createQuiz")} Baru
            </Link>
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-left">
          {templates.map((template) => {
            const rules = template.selectionRules as Record<string, any>;
            const qCount = rules?.count ?? 0;
            const props = rules?.difficulty_proportions ?? { easy: 0, medium: 0, hard: 0 };
            const tags = rules?.tags ?? [];
            const isSpecific = rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0;
            const perQuestionTimer = rules?.perQuestionTimerEnabled;

            return (
              <div
                key={template.id}
                className="group relative flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-muted/20"
              >


                <div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CourseBadge>{courseMap[template.courseId] ?? template.courseId}</CourseBadge>
                    <div className="flex gap-1.5 flex-wrap items-center">
                      <span className="inline-flex rounded-md bg-muted/80 border border-border/40 px-2 py-0.5 text-body-xs font-semibold text-muted-foreground capitalize">
                        {template.category === "weekly"
                          ? tx("category.weekly")
                          : template.category === "chapter"
                          ? tx("category.chapter")
                          : template.category === "premium"
                          ? tx("category.premium")
                          : template.category === "simulation"
                          ? tx("category.simulation")
                          : tx("category.daily")}{" "}
                        · {template.visibility === "free" ? tx("free") : tx("restricted")}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateStatus(template.id, template.status === "published" ? "draft" : "published")
                        }
                        className={cn(
                          "inline-flex rounded-md border px-2 py-0.5 text-body-xs font-semibold capitalize cursor-pointer transition-colors hover:bg-muted/80",
                          template.status === "published"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                        )}
                        title={tx("togglePublishTitle")}
                      >
                        {template.status === "published" ? tx("published") : tx("draft")}
                      </button>
                    </div>
                  </div>

                  <h3 className="mt-2 font-heading text-body-base font-bold text-foreground leading-snug group-hover:text-brand-primary transition-colors">
                    {template.title}
                  </h3>

                  <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-body-xs text-muted-foreground">
                    <div className="flex items-center gap-2.5">
                      <BookOpen className="size-4 text-brand-primary/85 shrink-0" />
                      <span>
                        <strong>{tx("questionCount", { count: qCount })}</strong>{" "}
                        {isSpecific ? (
                          <span className="text-brand-primary text-body-xs font-semibold">({tx("specificSelection")})</span>
                        ) : (
                          <span className="text-muted-foreground/80 text-body-xs">
                            ({props.easy} {tx("difficulty.easy")} · {props.medium} {tx("difficulty.medium")} · {props.hard} {tx("difficulty.hard")})
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Clock className="size-4 text-emerald-500/85 shrink-0" />
                      <span>
                        {tx("timeLimit")}:{" "}
                        {template.timeLimitSeconds
                          ? tx("minutes", { count: Math.round(template.timeLimitSeconds / 60) })
                          : tx("unlimited")}
                      </span>
                      {perQuestionTimer && (
                        <Badge variant="outline" className="rounded-md border-brand-primary/30 text-brand-primary text-[10px] h-4 px-1">
                          {tx("perQuestionTimer")}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Award className="size-4 text-brand-secondary/85 shrink-0" />
                      <span>
                        {tx("attemptLimit")}: {template.maxAttempts ? `${template.maxAttempts}x` : tx("unlimited")}
                      </span>
                    </div>
                  </div>

                  {tags.length > 0 && (
                    <div className="mt-3 flex gap-1.5 flex-wrap">
                      {tags.map((t: string) => (
                        <span
                          key={t}
                          className="rounded-md bg-muted/65 border border-border/20 px-2 py-0.5 text-body-xs text-muted-foreground/90 font-medium"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Schedule & Manual Status Section */}
                  <div className="mt-3 pt-3 border-t border-border/40 space-y-2 text-body-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-body-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {tx("quizAccess")}:
                      </span>
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          template.manualStatus === "open"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                            : template.manualStatus === "closed"
                            ? "bg-destructive/10 text-destructive border-destructive/20"
                            : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
                        )}
                      >
                        {template.manualStatus === "open"
                          ? tx("access.open")
                          : template.manualStatus === "closed"
                          ? tx("access.closed")
                          : tx("access.scheduled")}
                      </span>
                    </div>

                    {template.manualStatus === "scheduled" && (template.openAt || template.closeAt) && (
                      <div className="text-body-xs text-muted-foreground bg-muted/30 p-2 rounded-md border border-border/40 space-y-1">
                        {template.openAt && (
                          <div className="flex justify-between">
                            <span>{tx("opensAt")}</span>
                            <span className="font-semibold text-foreground">
                              {new Date(template.openAt).toLocaleString(locale, {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                        )}
                        {template.closeAt && (
                          <div className="flex justify-between">
                            <span>{tx("closesAt")}</span>
                            <span className="font-semibold text-foreground">
                              {new Date(template.closeAt).toLocaleString(locale, {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-1 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "text-[10px] h-7 px-1 rounded-md cursor-pointer",
                          template.manualStatus === "open"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border-emerald-500/30"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => handleUpdateManualStatus(template.id, "open")}
                      >
                        {tx("open")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "text-[10px] h-7 px-1 rounded-md cursor-pointer",
                          template.manualStatus === "closed"
                            ? "bg-destructive/15 text-destructive font-bold border-destructive/30"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => handleUpdateManualStatus(template.id, "closed")}
                      >
                        {tx("close")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "text-[10px] h-7 px-1 rounded-md cursor-pointer",
                          template.manualStatus === "scheduled"
                            ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold border-blue-500/30"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => handleUpdateManualStatus(template.id, "scheduled")}
                      >
                        {tx("schedule")}
                      </Button>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border/40">
                      <Label
                        htmlFor={`quiz-discussion-${template.id}`}
                        className="text-body-xs font-bold text-muted-foreground uppercase tracking-wider cursor-pointer"
                      >
                        {tx("discussion")}
                      </Label>
                      <div className="flex items-center gap-2">
                        <span className="text-body-xs font-medium text-foreground">
                          {template.showDiscussion ? tx("open") : tx("locked")}
                        </span>
                        <Switch
                          id={`quiz-discussion-${template.id}`}
                          checked={Boolean(template.showDiscussion)}
                          onCheckedChange={(checked) => handleUpdateShowDiscussion(template.id, checked)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3.5">
                  <span className="text-body-xs text-muted-foreground/80 flex items-center gap-1.5 font-medium">
                    <Calendar className="size-3.5" />
                    {new Date(template.createdAt).toLocaleDateString(locale, { dateStyle: "medium" })}
                  </span>

                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg shrink-0 cursor-pointer shadow-xs gap-1 font-semibold text-body-sm h-8 px-2 text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary border-border/80"
                      onClick={() => handleOpenPreviewTpl(template)}
                    >
                      <Eye className="size-3.5" />
                      {tx("preview")}
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="rounded-lg shrink-0 cursor-pointer shadow-xs gap-1 font-semibold text-body-sm h-8 px-2.5 border-border/80 text-foreground hover:bg-muted"
                    >
                      <Link href={`/admin/quizzes/${template.id}/edit`}>
                        <Edit className="size-3.5" />
                        {tx("edit")}
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-sm"
                      className="rounded-lg shrink-0 cursor-pointer shadow-xs transition-colors h-8 w-8 p-0"
                      onClick={() => handleDeleteStart(template)}
                      title={tx("deleteQuiz")}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DELETE CONFIRM DIALOG */}
      <AdminConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeletingTemplate(null);
        }}
        title={tx("deleteQuiz")}
        description={tx("deleteDescription", { title: deletingTemplate?.title ?? "" })}
        confirmLabel={tx("confirmDelete")}
        loading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />

      {/* PREVIEW QUIZ DIALOG */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {tx("previewTitle", { title: previewTpl?.title ?? "" })}
            </DialogTitle>
            <DialogDescription className="text-left text-body-xs text-muted-foreground flex gap-3 flex-wrap items-center mt-1">
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">
                {tx("categoryLabel")}: {previewTpl?.category ? tx(`category.${previewTpl.category}`) : ""}
              </span>
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">
                {tx("timeLimit")}: {previewTpl?.timeLimitSeconds ? tx("minutes", { count: previewTpl.timeLimitSeconds / 60 }) : tx("unlimited")}
              </span>
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">
                {tx("attemptLimit")}: {previewTpl?.maxAttempts ? `${previewTpl.maxAttempts}x` : tx("unlimited")}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
            {loadingPreview ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="size-8 animate-spin text-brand-primary" />
                <p className="text-body-sm text-muted-foreground">{tx("resolvingQuestions")}</p>
              </div>
            ) : previewQuestions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-body-sm">
                {tx("noPreviewQuestions")}
              </div>
            ) : (
              <div className="space-y-6">
                {previewQuestions.map((q, idx) => (
                  <div key={q.id} className="p-5 rounded-xl border border-border bg-card space-y-4">
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                      <span className="text-body-sm font-bold text-foreground">{tx("questionNumber", { number: idx + 1 })}</span>
                      <div className="flex items-center gap-2">
                        <DifficultyBadge difficulty={q.difficulty} />
                        <span className="capitalize text-[10px] bg-muted/80 text-muted-foreground px-2 py-0.5 rounded border border-border font-medium">
                          {q.questionType === "multiple_choice" ? tx("singleChoice") : tx("multipleChoice")}
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
            <Button onClick={() => setIsPreviewOpen(false)} className="rounded-md bg-brand-primary text-white hover:bg-brand-primary/90">
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
