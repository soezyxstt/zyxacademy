"use client";

import { AdminEmptyState } from "@/components/admin/state-panels";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { Plus, Edit2, Trash2, Trophy, Clock, Layers, ArrowLeft, Check, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
    const importedBankIds = new Set(activeQuestions.flatMap((question) => {
      const content = typeof question.content === "string" ? JSON.parse(question.content) : question.content;
      return typeof content?.bankQuestionId === "string" ? [content.bankQuestionId] : [];
    }));
    return (
      <div className="space-y-4">
        {/* Sub-view Header */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setActiveExam(null)} className="rounded-md border-border/80">
            <ArrowLeft className="mr-1.5 size-4" />
            {tr("back")}
          </Button>
          <div>
            <h2 className="font-heading text-body-base font-bold text-foreground">{tr("manageQuestions", { title: activeExam.title })}</h2>
            <p className="text-body-xs text-muted-foreground">{tr("totalQuestions", { count: activeQuestions.length })}</p>
          </div>
        </div>

        {/* Action Row */}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => { setSelectedBankIds(new Set()); setBankPage(0); setBankOpen(true); }} className="rounded-md border-border font-semibold gap-2">
            <Library className="size-4" />
            {tr("importFromBank")}
          </Button>
          <Button onClick={handleOpenAddQ} className="bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 rounded-md font-semibold gap-2">
            <Plus className="size-4" />
            {tr("addQuestion")}
          </Button>
        </div>

        {/* Questions List */}
        {activeQuestions.length === 0 ? (
          <AdminEmptyState icon={Trophy} title={tr("examEmpty")} />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {activeQuestions.map((q) => {
              const content = typeof q.content === "string" ? JSON.parse(q.content) : q.content;
              return (
                <Card key={q.id} className="relative rounded-none border-0 bg-transparent p-4 shadow-none">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-body-xs font-bold font-mono">
                          {q.order}
                        </span>
                        <Badge variant="outline" className="text-[10px] rounded-md text-muted-foreground capitalize">
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

                    <TooltipProvider>
                      <div className="flex gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="xs"
                              aria-label={tr("editQuestion", { number: q.order })}
                              onClick={() => handleOpenEditQ(q)}
                              className="rounded-md text-muted-foreground hover:text-foreground"
                            >
                              <Edit2 className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{tr("editQuestion", { number: q.order })}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="xs"
                              aria-label={tr("deleteQuestion", { number: q.order })}
                              onClick={() => setDeleteQId(q.id)}
                              className="rounded-md text-status-error hover:bg-status-error/10 hover:text-status-error"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{tr("deleteQuestion", { number: q.order })}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
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
                            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
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
                </Card>
              );
            })}
          </div>
        )}

        {/* Delete Question Dialog */}
        <Dialog open={bankOpen} onOpenChange={setBankOpen}>
          <DialogContent className="max-w-2xl rounded-2xl border-border bg-card">
            <DialogHeader>
              <DialogTitle className="font-heading text-body-base font-bold text-foreground">{tr("bankTitle")}</DialogTitle>
              <DialogDescription>{tr("bankDescription")}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[55vh] divide-y divide-border overflow-y-auto border-y border-border">
              {questionBank.length === 0 ? (
                <p className="py-8 text-center text-body-sm text-muted-foreground">{tr("noPublishedQuestions")}</p>
              ) : questionBank.slice(currentBankPage * 20, (currentBankPage + 1) * 20).map((question) => {
                const alreadyImported = importedBankIds.has(question.id);
                const checked = selectedBankIds.has(question.id) || alreadyImported;
                return (
                  <div key={question.id} className="flex items-start gap-3 py-3">
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
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3 select-none">
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
    <div className="space-y-4">
      {/* Header action */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="font-heading text-body-base font-semibold text-foreground">{tr("tryoutCount", { count: initialTryouts.length })}</h2>
        <Button onClick={handleOpenAddT} className="bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 rounded-md font-semibold gap-2">
          <Plus className="size-4" />
          {tr("addTryout")}
        </Button>
      </div>

      {initialTryouts.length === 0 ? (
        <AdminEmptyState icon={Trophy} title={tr("noTryouts")} />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {initialTryouts.map((t) => {
            const settings = typeof t.settings === "string" ? JSON.parse(t.settings) : t.settings;
            const qCount = initialQuestions.filter((q) => q.examId === t.id).length;
            
            return (
              <Card key={t.id} className="rounded-none border-0 bg-transparent py-0 shadow-none gap-0 flex flex-col sm:flex-row sm:items-center">
                <CardHeader className="min-w-0 flex-1 p-4">
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="font-heading text-body-base font-bold text-foreground break-words">{t.title}</CardTitle>
                    <Badge variant="secondary" className="shrink-0">
                      {tr(t.status)}
                    </Badge>
                  </div>
                  <p className="text-body-xs text-muted-foreground mt-0.5 flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {tr("minutes", { count: settings?.timeLimitMinutes || 90 })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers className="size-3" />
                      {tr("questionCount", { count: qCount })}
                    </span>
                  </p>
                </CardHeader>

                <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:py-3">
                  <Button variant="outline" size="sm" onClick={() => setActiveExam(t)} className="rounded-md border-border/80 text-brand-primary hover:bg-brand-primary/5 hover:text-brand-primary">
                    {tr("manageQuestionButton")}
                  </Button>
                  
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenEditT(t)} className="rounded-md border-border/80 text-muted-foreground hover:text-foreground">
                      {tr("edit")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteTId(t.id)} className="rounded-md border-border/80 text-status-error hover:bg-status-error/10 hover:text-status-error">
                      {tr("delete")}
                    </Button>
                  </div>
                </div>
              </Card>
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
