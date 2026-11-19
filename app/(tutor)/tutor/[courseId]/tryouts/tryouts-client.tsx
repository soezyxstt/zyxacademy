"use client";

import { AdminEmptyState } from "@/components/admin/state-panels";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { Plus, Edit2, Trash2, Trophy, Clock, Layers, ArrowLeft, Check, Library, MoreHorizontal, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { toast } from "@/components/ui/toast";
import {
  saveTryoutAction,
  deleteTryoutAction,
  saveTryoutQuestionAction,
  deleteTryoutQuestionAction,
  importQuestionBankToTryoutAction,
} from "@/app/actions/tutor-management";
import { formatDatetimeLocal } from "@/lib/date-utils";

interface TryoutExam {
  id: string;
  courseId: string;
  title: string;
  type: "quiz" | "tryout";
  status: "draft" | "published" | "ended";
  settings: any; // { timeLimitMinutes?: number, maxAttempts?: number }
  openAt?: Date | string | null;
  closeAt?: Date | string | null;
}

interface TryoutQuestion {
  id: string;
  examId: string;
  type: string; // 'multiple_choice' | 'multiple_choices' | 'short_answer' | 'essay'
  content: any; // { prompt, options, correctIndex, correctIndices, acceptsImage, acceptsFile, acceptableAnswers }
  order: number;
}

interface Props {
  courseId: string;
  initialTryouts: TryoutExam[];
  initialQuestions: TryoutQuestion[];
  questionBank: Array<{
    id: string;
    prompt: string;
    questionType: string;
    difficulty: string;
    origin: "zyx_original" | "itb_example";
    sourceEventName: string | null;
  }>;
}

const provenanceEnabled = true;
const QUESTION_PAGE_SIZE = 20;

export function TryoutsClient({ courseId, initialTryouts, initialQuestions, questionBank }: Props) {
  const router = useRouter();
  const tr = useTranslations("tutor.tryouts");
  const quizTr = useTranslations("tutor.quizList");
  const { locale } = useAppLocale();
  const [isPending, startTransition] = useTransition();

  // Tryout Dialog State
  const [isTOpen, setIsTOpen] = useState(false);
  const [editingT, setEditingT] = useState<TryoutExam | null>(null);
  const [tTitle, setTTitle] = useState("");
  const [tStatus, setTStatus] = useState<"draft" | "published" | "ended">("draft");
  const [tTimeLimit, setTTimeLimit] = useState("90");
  const [tMaxAttempts, setTMaxAttempts] = useState("2");
  const [tOpenAt, setTOpenAt] = useState("");
  const [tCloseAt, setTCloseAt] = useState("");
  const [deleteTId, setDeleteTId] = useState<string | null>(null);

  // Active View (list or questions)
  const [activeExam, setActiveExam] = useState<TryoutExam | null>(null);
  const [questionPage, setQuestionPage] = useState(0);

  // Question Dialog State
  const [isQOpen, setIsQOpen] = useState(false);
  const [editingQ, setEditingQ] = useState<TryoutQuestion | null>(null);
  const [qPrompt, setQPrompt] = useState("");
  const [qType, setQType] = useState<"multiple_choice" | "multiple_choices" | "short_answer" | "essay">("multiple_choice");
  const [qOrder, setQOrder] = useState("1");
  const [qOptions, setQOptions] = useState<string[]>(["", "", "", ""]);
  const [qCorrectIndex, setQCorrectIndex] = useState<number | undefined>(undefined);
  const [qCorrectIndices, setQCorrectIndices] = useState<number[]>([]);
  const [qAcceptsFile, setQAcceptsFile] = useState(false);
  const [qAcceptableAnswers, setQAcceptableAnswers] = useState("");
  const [deleteQId, setDeleteQId] = useState<string | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const bankTriggerRef = useRef<HTMLButtonElement>(null);
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());
  const [bankPage, setBankPage] = useState(0);
  const bankPageCount = Math.max(1, Math.ceil(questionBank.length / 20));
  const currentBankPage = Math.min(bankPage, bankPageCount - 1);

  const activeQuestions = activeExam
    ? initialQuestions.filter((q) => q.examId === activeExam.id).sort((a, b) => a.order - b.order)
    : [];

  // ───────────────────────────────────────────────────────────────────────────
  // TRYOUT EXAM HANDLERS
  // ───────────────────────────────────────────────────────────────────────────
  function handleOpenAddT() {
    setEditingT(null);
    setTTitle("");
    setTStatus("draft");
    setTTimeLimit("90");
    setTMaxAttempts("2");
    setTOpenAt("");
    setTCloseAt("");
    setIsTOpen(true);
  }

  function handleOpenEditT(t: TryoutExam) {
    setEditingT(t);
    setTTitle(t.title);
    setTStatus(t.status);
    const settings = typeof t.settings === "string" ? JSON.parse(t.settings) : t.settings;
    setTTimeLimit((settings?.timeLimitMinutes || 90).toString());
    setTMaxAttempts((settings?.maxAttempts || 2).toString());
    setTOpenAt(formatDatetimeLocal(t.openAt));
    setTCloseAt(formatDatetimeLocal(t.closeAt));
    setIsTOpen(true);
  }

  async function handleSaveT() {
    if (!tTitle.trim()) {
      toast.error(tr("titleRequired"));
      return;
    }

    startTransition(async () => {
      try {
        const res = await saveTryoutAction(courseId, editingT?.id || null, {
          title: tTitle,
          status: tStatus,
          timeLimitMinutes: parseInt(tTimeLimit, 10) || 90,
          maxAttempts: parseInt(tMaxAttempts, 10) || 2,
          openAt: tOpenAt ? new Date(tOpenAt).toISOString() : null,
          closeAt: tCloseAt ? new Date(tCloseAt).toISOString() : null,
        });
        if (res.success) {
          toast.success(editingT ? tr("updated") : tr("created"));
          setIsTOpen(false);
          router.refresh();
        } else {
          toast.error(tr("saveFailed"));
        }
      } catch {
        toast.error(tr("saveFailed"));
      }
    });
  }

  const tryoutToDelete = initialTryouts.find((tryout) => tryout.id === deleteTId);
  const questionToDelete = activeQuestions.find((question) => question.id === deleteQId);

  async function handleDeleteT() {
    if (!deleteTId) return;
    startTransition(async () => {
      try {
        const res = await deleteTryoutAction(courseId, deleteTId);
        if (res.success) {
          toast.success(tr("deleted"));
          setDeleteTId(null);
          router.refresh();
        } else {
          toast.error(tr("deleteFailed"));
        }
      } catch {
        toast.error(tr("deleteFailed"));
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TRYOUT QUESTION HANDLERS
  // ───────────────────────────────────────────────────────────────────────────
  function handleOpenAddQ() {
    if (!activeExam) return;
    setEditingQ(null);
    setQPrompt("");
    setQType("multiple_choice");
    setQOrder((activeQuestions.length + 1).toString());
    setQOptions(["", "", "", ""]);
    setQCorrectIndex(undefined);
    setQCorrectIndices([]);
    setQAcceptsFile(false);
    setQAcceptableAnswers("");
    setIsQOpen(true);
  }

  function handleOpenEditQ(q: TryoutQuestion) {
    setEditingQ(q);
    const content = typeof q.content === "string" ? JSON.parse(q.content) : q.content;
    setQPrompt(content.prompt || "");
    setQType(q.type as any);
    setQOrder(q.order.toString());
    setQOptions(Array.isArray(content.options) && content.options.length > 0 ? content.options : ["", "", "", ""]);
    setQCorrectIndex(content.correctIndex);
    setQCorrectIndices(content.correctIndices || []);
    setQAcceptsFile(content.acceptsFile || false);
    setQAcceptableAnswers((content.acceptableAnswers || []).join(", "));
    setIsQOpen(true);
  }

  async function handleSaveQ() {
    if (!activeExam) return;
    if (!qPrompt.trim()) {
      toast.error(tr("questionRequired"));
      return;
    }

    if (qType === "multiple_choice" && qCorrectIndex === undefined) {
      toast.error(tr("singleCorrectRequired"));
      return;
    }

    if (qType === "multiple_choices" && qCorrectIndices.length === 0) {
      toast.error(tr("multiCorrectRequired"));
      return;
    }

    startTransition(async () => {
      try {
        const res = await saveTryoutQuestionAction(courseId, activeExam.id, editingQ?.id || null, {
          type: qType,
          order: parseInt(qOrder, 10) || 1,
          prompt: qPrompt,
          options: qOptions,
          correctIndex: qCorrectIndex,
          correctIndices: qCorrectIndices,
          acceptsFile: qAcceptsFile,
          acceptableAnswers: qAcceptableAnswers.split(",").map((a) => a.trim()).filter(Boolean),
        });
        if (res.success) {
          toast.success(tr("questionSaved"));
          setIsQOpen(false);
          router.refresh();
        } else {
          toast.error(tr("questionSaveFailed"));
        }
      } catch {
        toast.error(tr("questionSaveFailed"));
      }
    });
  }

  async function handleDeleteQ() {
    if (!deleteQId) return;
    startTransition(async () => {
      try {
        const res = await deleteTryoutQuestionAction(courseId, deleteQId);
        if (res.success) {
          toast.success(tr("questionDeleted"));
          setDeleteQId(null);
          router.refresh();
        } else {
          toast.error(tr("questionDeleteFailed"));
        }
      } catch {
        toast.error(tr("questionDeleteFailed"));
      }
    });
  }

  async function handleImportFromBank() {
    if (!activeExam || selectedBankIds.size === 0) return;
    startTransition(async () => {
      try {
        const result = await importQuestionBankToTryoutAction(courseId, activeExam.id, [...selectedBankIds]);
        toast.success(tr("importSuccess", { imported: result.imported, skipped: result.skipped }));
        setBankOpen(false);
        setSelectedBankIds(new Set());
        router.refresh();
      } catch {
        toast.error(tr("bankImportFailed"));
      }
    });
  }

  // Toggle correct index for single choice MC
  function selectSingleCorrect(idx: number) {
    setQCorrectIndex(idx);
    setQCorrectIndices([idx]);
  }

  // Toggle correct index for multiple choice MC
  function toggleMultiCorrect(idx: number) {
    setQCorrectIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].sort()
    );
  }

  // Render listing or nested questions view
  if (activeExam) {
    const pageCount = Math.max(1, Math.ceil(activeQuestions.length / QUESTION_PAGE_SIZE));
    const currentPage = Math.min(questionPage, pageCount - 1);
    const pageOffset = currentPage * QUESTION_PAGE_SIZE;
    const pageQuestions = activeQuestions.slice(pageOffset, pageOffset + QUESTION_PAGE_SIZE);
    const importedBankIds = new Set(activeQuestions.flatMap((question) => {
      const content = typeof question.content === "string" ? JSON.parse(question.content) : question.content;
      return typeof content?.bankQuestionId === "string" ? [content.bankQuestionId] : [];
    }));
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" size="icon-lg" variant="ghost" className="shrink-0" aria-label={tr("back")} onClick={() => setActiveExam(null)}>
                    <ArrowLeft aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{tr("back")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="min-w-0">
              <p className="break-words font-heading text-body-sm font-bold text-foreground">{activeExam.title}</p>
              <p className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{tr("totalQuestions", { count: activeQuestions.length })}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button ref={bankTriggerRef} type="button" variant="outline" size="icon-lg" aria-label={tr("importFromBank")} aria-haspopup="dialog" onClick={() => { setSelectedBankIds(new Set()); setBankPage(0); setBankOpen(true); }}>
                    <Library aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{tr("importFromBank")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" size="icon-lg" aria-label={tr("addQuestion")} onClick={handleOpenAddQ}>
                    <Plus aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{tr("addQuestion")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Questions List */}
        {activeQuestions.length === 0 ? (
          <AdminEmptyState icon={Trophy} title={tr("examEmpty")} />
        ) : (
          <div className="divide-y divide-border/30">
            {pageQuestions.map((q) => {
              const content = typeof q.content === "string" ? JSON.parse(q.content) : q.content;
              return (
                <div key={q.id} className="relative -mx-2 rounded-lg px-2 py-3 transition-colors hover:bg-muted/35">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-body-xs font-bold font-mono">
                          {q.order}
                        </span>
                        <Badge variant="outline" className="text-body-2xs rounded-md text-muted-foreground capitalize">
                          {tr(q.type)}
                        </Badge>
                      </div>
                      <MarkdownRenderer content={content.prompt} className="pt-1 text-body-sm" />
                      {provenanceEnabled && content.origin === "itb_example" && content.sourceEventName ? (
                        <p className="mt-2 text-body-xs font-medium text-muted-foreground">{tr("source")} {content.sourceEventName}</p>
                      ) : provenanceEnabled ? (
                        <p className="mt-2 text-body-xs font-medium text-muted-foreground">{tr("originalZyx")}</p>
                      ) : null}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={tr("editQuestion", { number: q.order })} className="h-8 w-8 shrink-0 rounded-lg">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onSelect={() => handleOpenEditQ(q)}>
                          <Edit2 className="size-4 text-muted-foreground" />
                          <span>{tr("editQuestion", { number: q.order })}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setDeleteQId(q.id)} className="text-status-error focus:text-status-error">
                          <Trash2 className="size-4" />
                          <span>{tr("deleteQuestion", { number: q.order })}</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Options Preview for MC */}
                  {(q.type === "multiple_choice" || q.type === "multiple_choices") && content.options && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 sm:pl-8">
                      {content.options.map((opt: string, i: number) => {
                        const isCorrect = q.type === "multiple_choice"
                          ? content.correctIndex === i
                          : content.correctIndices?.includes(i);
                        return (
                          <div key={i} className={`flex items-center gap-2 text-body-xs px-3 py-1.5 rounded-lg border ${
                            isCorrect ? "bg-status-success/10 border-status-success/30 text-foreground font-medium" : "bg-muted/10 border-border/50 text-muted-foreground"
                          }`}>
                            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-body-2xs font-bold ${
                              isCorrect ? "bg-status-success/15 text-foreground" : "bg-muted text-muted-foreground"
                            }`}>
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span>
                              <MathText className="leading-normal" as="span">{opt}</MathText>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Short Answer Key */}
                  {q.type === "short_answer" && content.acceptableAnswers && (
                    <p className="text-body-xs text-muted-foreground mt-3 pl-8">
                      {tr("answerKey")} <span className="font-semibold text-foreground">{(content.acceptableAnswers).join(" / ")}</span>
                    </p>
                  )}

                  {/* Essay attachments */}
                  {q.type === "essay" && (
                    <p className="text-body-xs text-muted-foreground mt-3 pl-8">
                      {tr("feature")} <span className="font-semibold text-foreground">{content.acceptsFile ? tr("fileEssay") : tr("textEssay")}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {pageCount > 1 && (
          <nav aria-label={locale === "id" ? "Halaman soal tryout" : "Tryout question pages"} className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setQuestionPage(currentPage - 1)}>{locale === "id" ? "Sebelumnya" : "Previous"}</Button>
            <span className="text-body-sm text-muted-foreground" aria-live="polite">{currentPage + 1} / {pageCount}</span>
            <Button variant="outline" size="sm" disabled={currentPage === pageCount - 1} onClick={() => setQuestionPage(currentPage + 1)}>{locale === "id" ? "Berikutnya" : "Next"}</Button>
          </nav>
        )}

        {/* Delete Question Dialog */}
        <Dialog open={bankOpen} onOpenChange={setBankOpen}>
          <DialogContent className="max-w-2xl rounded-2xl border-border bg-card" onCloseAutoFocus={(event) => {
            event.preventDefault();
            bankTriggerRef.current?.focus();
          }}>
            <DialogHeader>
              <DialogTitle className="font-heading text-body-base font-bold text-foreground">{tr("bankTitle")}</DialogTitle>
              <DialogDescription>{tr("bankDescription")}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[55vh] divide-y divide-border/30 overflow-y-auto border-y border-border/40">
              {questionBank.length === 0 ? (
                <p className="py-8 text-center text-body-sm text-muted-foreground">{tr("noPublishedQuestions")}</p>
              ) : questionBank.slice(currentBankPage * 20, (currentBankPage + 1) * 20).map((question) => {
                const alreadyImported = importedBankIds.has(question.id);
                const checked = selectedBankIds.has(question.id) || alreadyImported;
                return (
                  <div key={question.id} className="flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/35">
                    <Checkbox
                      id={`bank-question-${question.id}`}
                      checked={checked}
                      disabled={alreadyImported}
                      onCheckedChange={(next) => setSelectedBankIds((current) => {
                        const updated = new Set(current);
                        if (next === true) updated.add(question.id);
                        else updated.delete(question.id);
                        return updated;
                      })}
                    />
                    <label htmlFor={`bank-question-${question.id}`} className="min-w-0 flex-1 cursor-pointer">
                      <div className="flex flex-wrap items-center gap-2">
                        {provenanceEnabled ? <Badge variant="outline">{question.origin === "itb_example" ? tr("itbExample") : tr("originalZyx")}</Badge> : null}
                        <span className="text-body-xs text-muted-foreground">{tr(question.difficulty)}</span>
                        {alreadyImported ? <span className="text-body-xs font-medium text-status-success">{tr("alreadyAdded")}</span> : null}
                      </div>
                      <MarkdownRenderer content={question.prompt} className="mt-1 text-body-sm" />
                      {provenanceEnabled && question.origin === "itb_example" && question.sourceEventName ? <p className="mt-1 text-body-xs text-muted-foreground">{tr("source")} {question.sourceEventName}</p> : null}
                    </label>
                  </div>
                );
              })}
            </div>
            {bankPageCount > 1 && (
              <nav aria-label={locale === "id" ? "Halaman bank soal" : "Question bank pages"} className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" size="sm" disabled={currentBankPage === 0} onClick={() => setBankPage(currentBankPage - 1)}>{locale === "id" ? "Sebelumnya" : "Previous"}</Button>
                <span className="text-body-sm text-muted-foreground" aria-live="polite">{currentBankPage + 1} / {bankPageCount}</span>
                <Button variant="outline" size="sm" disabled={currentBankPage === bankPageCount - 1} onClick={() => setBankPage(currentBankPage + 1)}>{locale === "id" ? "Berikutnya" : "Next"}</Button>
              </nav>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setBankOpen(false)} disabled={isPending}>{tr("cancel")}</Button>
              <Button onClick={handleImportFromBank} disabled={isPending || selectedBankIds.size === 0}>{tr("addSelected", { count: selectedBankIds.size })}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteQId !== null} onOpenChange={(open) => !open && setDeleteQId(null)}>
          <DialogContent className="max-w-md rounded-2xl border-border bg-card">
            <DialogHeader>
              <DialogTitle className="font-heading text-body-base font-bold text-foreground">{tr("deleteQuestionTitle", { number: questionToDelete?.order ?? "" })}</DialogTitle>
              <DialogDescription className="text-body-xs text-muted-foreground">
                {tr("deleteQuestionDescription")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 mt-4">
              <Button variant="outline" onClick={() => setDeleteQId(null)} disabled={isPending} className="rounded-md border-border/80">
                {tr("cancel")}
              </Button>
              <Button variant="destructive" onClick={handleDeleteQ} isLoading={isPending}>
                {tr("confirmDeleteQuestion")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Question editor dialog */}
        <Dialog open={isQOpen} onOpenChange={setIsQOpen}>
          <DialogContent className="max-w-xl rounded-2xl border-border bg-card">
            <DialogHeader>
              <DialogTitle className="font-heading text-body-base font-bold text-foreground">
                {editingQ ? tr("editQuestionTitle") : tr("addQuestionTitle")}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 my-2 font-sans overflow-y-auto max-h-[65vh] pr-1">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="que-type" className="text-body-sm font-semibold">{tr("questionType")}</Label>
                  <Select value={qType} onValueChange={(val: any) => {
                    setQType(val);
                    setQCorrectIndex(undefined);
                    setQCorrectIndices([]);
                  }}>
                    <SelectTrigger id="que-type" className="rounded-lg border-input bg-background">
                      <SelectValue placeholder={tr("chooseType")} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="multiple_choice">{tr("singleChoice")}</SelectItem>
                      <SelectItem value="multiple_choices">{tr("multiChoice")}</SelectItem>
                      <SelectItem value="short_answer">{tr("shortAnswer")}</SelectItem>
                      <SelectItem value="essay">{tr("essay")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="que-order" className="text-body-sm font-semibold">{tr("questionOrder")}</Label>
                  <Input
                    id="que-order"
                    type="number"
                    value={qOrder}
                    onChange={(e) => setQOrder(e.target.value)}
                    className="rounded-lg border-input bg-background"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="que-prompt" className="text-body-sm font-semibold">{tr("question")}</Label>
                <Textarea
                  id="que-prompt"
                  value={qPrompt}
                  onChange={(e) => setQPrompt(e.target.value)}
                  rows={8}
                  placeholder={tr("questionPlaceholder")}
                  className="rounded-lg border-input bg-background"
                />
              </div>

              {/* RENDER EDIT MC OPTIONS */}
              {(qType === "multiple_choice" || qType === "multiple_choices") && (
                <div className="space-y-3">
                  <Label className="text-body-sm font-semibold block">{tr("answerOptions")}</Label>
                  {qOptions.map((opt, i) => {
                    const checked = qType === "multiple_choice"
                      ? qCorrectIndex === i
                      : qCorrectIndices.includes(i);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <button
                          type="button"
                          aria-label={quizTr("markCorrect", { letter: String.fromCharCode(65 + i) })}
                          aria-pressed={checked}
                          onClick={() => qType === "multiple_choice" ? selectSingleCorrect(i) : toggleMultiCorrect(i)}
                          className={`flex size-6 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                            checked ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary"
                          }`}
                        >
                          {checked ? <Check className="size-3.5" /> : <span>{String.fromCharCode(65 + i)}</span>}
                        </button>
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const copy = [...qOptions];
                            copy[i] = e.target.value;
                            setQOptions(copy);
                          }}
                          placeholder={`${tr("question")} ${String.fromCharCode(65 + i)}`}
                          className="rounded-lg border-input bg-background flex-1"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* RENDER SHORT ANSWER OPTIONS */}
              {qType === "short_answer" && (
                <div className="grid gap-2">
                  <Label htmlFor="que-short" className="text-body-sm font-semibold">{tr("acceptedAnswers")}</Label>
                  <Input
                    id="que-short"
                    value={qAcceptableAnswers}
                    onChange={(e) => setQAcceptableAnswers(e.target.value)}
                    placeholder={tr("acceptedAnswerExample")}
                    className="rounded-lg border-input bg-background"
                  />
                </div>
              )}

              {/* RENDER ESSAY OPTIONS */}
              {qType === "essay" && (
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3 select-none">
                  <Label htmlFor="que-file" className="text-body-sm font-semibold cursor-pointer">
                    {tr("allowFiles")}
                  </Label>
                  <Switch
                    id="que-file"
                    checked={qAcceptsFile}
                    onCheckedChange={setQAcceptsFile}
                  />
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsQOpen(false)} disabled={isPending} className="rounded-md border-border/80">
                {tr("cancel")}
              </Button>
              <Button onClick={handleSaveQ} isLoading={isPending} className="bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 rounded-md font-semibold gap-1.5">
                {tr("saveQuestion")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Default Listing view
  return (
    <div className="space-y-8">
      {/* Header action */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
        <span className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{tr("tryoutCount", { count: initialTryouts.length })}</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon-lg" aria-label={tr("addTryout")} onClick={handleOpenAddT}>
                <Plus aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tr("addTryout")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {initialTryouts.length === 0 ? (
        <AdminEmptyState icon={Trophy} title={tr("noTryouts")} />
      ) : (
        <div className="divide-y divide-border/30">
          {initialTryouts.map((t) => {
            const settings = typeof t.settings === "string" ? JSON.parse(t.settings) : t.settings;
            const qCount = initialQuestions.filter((q) => q.examId === t.id).length;
            
            return (
              <article key={t.id} className="-mx-2 flex items-start justify-between gap-2 rounded-lg px-2 py-3 transition-colors hover:bg-muted/35">
                <header className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 break-words font-heading text-body-base font-bold text-foreground">{t.title}</h2>
                    <Badge variant="secondary" className="shrink-0">
                      {tr(t.status)}
                    </Badge>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {tr("minutes", { count: settings?.timeLimitMinutes || 90 })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers className="size-3" />
                      {tr("questionCount", { count: qCount })}
                    </span>
                  </p>
                </header>

                <div className="flex shrink-0 items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="outline" size="icon-lg" aria-label={tr("manageQuestionButton")} aria-description={t.title} onClick={() => { setQuestionPage(0); setActiveExam(t); }}>
                          <NotebookPen aria-hidden />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{tr("manageQuestionButton")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`${tr("edit")} / ${tr("delete")}: ${t.title}`}>
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => handleOpenEditT(t)}>
                        <Edit2 className="size-4" aria-hidden="true" />
                        {tr("edit")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setDeleteTId(t.id)} className="text-status-error focus:text-status-error">
                        <Trash2 className="size-4" aria-hidden="true" />
                        {tr("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Tryout dialog */}
      <Dialog open={isTOpen} onOpenChange={setIsTOpen}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {editingT ? tr("editTryout") : tr("createTryout")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-2 font-sans">
            <div className="grid gap-2">
              <Label htmlFor="t-title" className="text-body-sm font-semibold">{tr("tryoutTitle")}</Label>
              <Input
                id="t-title"
                value={tTitle}
                onChange={(e) => setTTitle(e.target.value)}
                placeholder={tr("titlePlaceholder")}
                className="rounded-lg border-input bg-background"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="t-time" className="text-body-sm font-semibold">{tr("timeMinutes")}</Label>
                <Input
                  id="t-time"
                  type="number"
                  value={tTimeLimit}
                  onChange={(e) => setTTimeLimit(e.target.value)}
                  placeholder="90"
                  className="rounded-lg border-input bg-background"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="t-attempts" className="text-body-sm font-semibold">{tr("attemptLimit")}</Label>
                <Input
                  id="t-attempts"
                  type="number"
                  value={tMaxAttempts}
                  onChange={(e) => setTMaxAttempts(e.target.value)}
                  placeholder="2"
                  className="rounded-lg border-input bg-background"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="t-status" className="text-body-sm font-semibold">{tr("publicationStatus")}</Label>
              <Select value={tStatus} onValueChange={(val: any) => setTStatus(val)}>
                <SelectTrigger id="t-status" className="rounded-lg border-input bg-background">
                  <SelectValue placeholder={tr("chooseStatus")} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="draft">{tr("draft")}</SelectItem>
                  <SelectItem value="published">{tr("published")}</SelectItem>
                  <SelectItem value="ended">{tr("ended")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="t-open" className="text-body-sm font-semibold">{tr("opensAt")}</Label>
                <Input
                  id="t-open"
                  type="datetime-local"
                  value={tOpenAt}
                  onChange={(e) => setTOpenAt(e.target.value)}
                  className="min-w-0 rounded-lg border-input bg-background"
                />
              </div>

              <div className="grid min-w-0 gap-2">
                <Label htmlFor="t-close" className="text-body-sm font-semibold">{tr("closesAt")}</Label>
                <Input
                  id="t-close"
                  type="datetime-local"
                  value={tCloseAt}
                  onChange={(e) => setTCloseAt(e.target.value)}
                  className="min-w-0 rounded-lg border-input bg-background"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsTOpen(false)} disabled={isPending} className="rounded-md border-border/80">
              {tr("cancel")}
            </Button>
            <Button onClick={handleSaveT} isLoading={isPending} className="bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 rounded-md font-semibold gap-1.5">
              {tr("saveTryout")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete tryout exam dialog */}
      <Dialog open={deleteTId !== null} onOpenChange={(open) => !open && setDeleteTId(null)}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">{tr("deleteTryoutTitle", { title: tryoutToDelete?.title ?? "" })}</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {tr("deleteTryoutDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteTId(null)} disabled={isPending} className="rounded-md border-border/80">
              {tr("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDeleteT} isLoading={isPending}>
              {tr("deleteTryoutConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
