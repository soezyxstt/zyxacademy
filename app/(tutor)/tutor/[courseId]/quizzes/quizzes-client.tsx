"use client";

import { AdminEmptyState } from "@/components/admin/state-panels";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Plus, Edit2, Trash2, ClipboardList, HelpCircle, Loader2, Tag, Layers, Check, CheckSquare, Eye, Clock, FileSpreadsheet, UserCheck, MoreHorizontal, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MathText } from "@/components/course/math-text";
import { TutorQuestionOptionPreview } from "@/components/tutor/question-option-preview";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { toast } from "@/components/ui/toast";
import {
  deleteQuizTemplateAction,
  toggleQuizTemplateStatusAction,
  saveQuestionBankAction,
  deleteQuestionBankAction,
  getQuizTemplatePreviewAction,
} from "@/app/actions/tutor-management";

interface QuizTemplate {
  id: string;
  courseId: string;
  title: string;
  category: "daily" | "weekly" | "chapter" | "premium" | "simulation";
  visibility: "free" | "paid";
  status: "draft" | "published";
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  selectionRules: any; // { count: number, tags: string[], difficulty_proportions: { easy: number, medium: number, hard: number } }
  openAt?: Date | string | null;
  closeAt?: Date | string | null;
  manualStatus?: "open" | "closed" | "scheduled";
  showDiscussion?: boolean;
  // Canonical creator attribution
  creatorId?: string | null;
  creatorName?: string | null;
  creatorEmail?: string | null;
  creatorRole?: string | null;
}

interface QuestionBankItem {
  id: string;
  courseId: string;
  origin: "zyx_original" | "historical_reference" | "itb_example";
  prompt: string;
  options: any; // string[]
  correctIndices: any; // number[]
  acceptableAnswers?: any; // string[]
  difficulty: "easy" | "medium" | "hard";
  questionType: "multiple_choice" | "multiple_choices" | "short_answer" | "essay";
  explanation: string;
  tags: any; // string[]
}

interface Props {
  courseId: string;
  initialTemplates: QuizTemplate[];
  initialQuestionBank: QuestionBankItem[];
}

const QUESTION_PAGE_SIZE = 20;

function quizCategoryLabelKey(category: QuizTemplate["category"]) {
  switch (category) {
    case "daily": return "categoryDaily";
    case "weekly": return "categoryWeekly";
    case "chapter": return "categoryChapter";
    case "premium": return "categoryPremium";
    case "simulation": return "categorySimulation";
  }
}

export function QuizzesClient({ courseId, initialTemplates, initialQuestionBank }: Props) {
  const router = useRouter();
  const tr = useTranslations("tutor.quizList");
  const { locale } = useAppLocale();
  const dateLocale = locale === "id" ? "id-ID" : "en-US";
  const [isPending, startTransition] = useTransition();
  const [questionPage, setQuestionPage] = useState(0);
  const questionPageCount = Math.max(1, Math.ceil(initialQuestionBank.length / QUESTION_PAGE_SIZE));
  const currentQuestionPage = Math.min(questionPage, questionPageCount - 1);
  const questionOffset = currentQuestionPage * QUESTION_PAGE_SIZE;

  const [deleteTplId, setDeleteTplId] = useState<string | null>(null);

  // Preview Dialog State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTpl, setPreviewTpl] = useState<QuizTemplate | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function handleOpenPreviewTpl(t: QuizTemplate) {
    setPreviewTpl(t);
    setIsPreviewOpen(true);
    setLoadingPreview(true);
    setPreviewQuestions([]);
    try {
      const res = await getQuizTemplatePreviewAction(courseId, t.id);
      if (res.success) {
        setPreviewQuestions(res.questions);
      } else {
        toast.error(tr("failedPreview"));
      }
    } catch {
      const message = tr("failedPreview");
      toast.error(message);
    } finally {
      setLoadingPreview(false);
    }
  }

  // Question Dialog State
  const [isQOpen, setIsQOpen] = useState(false);
  const [editingQ, setEditingQ] = useState<QuestionBankItem | null>(null);
  const [qPrompt, setQPrompt] = useState("");
  const [qType, setQType] = useState<"multiple_choice" | "multiple_choices" | "short_answer" | "essay">("multiple_choice");
  const [qDifficulty, setQDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [qOptions, setQOptions] = useState<string[]>(["", "", "", ""]);
  const [qCorrectIndices, setQCorrectIndices] = useState<number[]>([]);
  const [qAcceptableAnswers, setQAcceptableAnswers] = useState("");
  const [qExplanation, setQExplanation] = useState("");
  const [qTags, setQTags] = useState("");
  const [deleteQId, setDeleteQId] = useState<string | null>(null);

  const quizToDelete = initialTemplates.find((quiz) => quiz.id === deleteTplId);
  const questionToDelete = initialQuestionBank.find((question) => question.id === deleteQId);

  async function handleDeleteTpl() {
    if (!deleteTplId) return;
    startTransition(async () => {
      try {
        const res = await deleteQuizTemplateAction(courseId, deleteTplId);
        if (res.success) {
          toast.success(tr("quizDeleted"));
          setDeleteTplId(null);
          router.refresh();
        } else {
          toast.error(tr("failedDeleteQuiz"));
        }
      } catch {
        const message = tr("failedDeleteQuiz");
        toast.error(message);
      }
    });
  }

  async function handleTogglePublishStatus(templateId: string, currentStatus: "draft" | "published") {
    const newStatus = currentStatus === "published" ? "draft" : "published";
    startTransition(async () => {
      try {
        const res = await toggleQuizTemplateStatusAction(courseId, templateId, newStatus);
        if (res.success) {
          toast.success(tr("quizStatusChanged", { status: newStatus === "published" ? tr("published") : tr("draft") }));
          router.refresh();
        } else {
          toast.error(tr("failedToggleStatus"));
        }
      } catch {
        const message = tr("failedToggleStatus");
        toast.error(message);
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // QUESTION BANK HANDLERS
  // ───────────────────────────────────────────────────────────────────────────
  function handleOpenAddQ() {
    setEditingQ(null);
    setQPrompt("");
    setQType("multiple_choice");
    setQDifficulty("medium");
    setQOptions(["", "", "", ""]);
    setQCorrectIndices([]);
    setQAcceptableAnswers("");
    setQExplanation("");
    setQTags("");
    setIsQOpen(true);
  }

  function handleOpenEditQ(q: QuestionBankItem) {
    setEditingQ(q);
    setQPrompt(q.prompt);
    setQType(q.questionType);
    setQDifficulty(q.difficulty);
    
    const opts = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
    setQOptions(Array.isArray(opts) ? opts : ["", "", "", ""]);
    
    const correct = typeof q.correctIndices === "string" ? JSON.parse(q.correctIndices) : q.correctIndices;
    setQCorrectIndices(Array.isArray(correct) ? correct : []);
    
    const accAnswers = typeof q.acceptableAnswers === "string" ? JSON.parse(q.acceptableAnswers) : q.acceptableAnswers;
    setQAcceptableAnswers(Array.isArray(accAnswers) ? accAnswers.join(", ") : "");

    setQExplanation(q.explanation || "");
    
    const tagsArr = typeof q.tags === "string" ? JSON.parse(q.tags) : q.tags;
    setQTags(Array.isArray(tagsArr) ? tagsArr.join(", ") : "");
    setIsQOpen(true);
  }

  function toggleCorrectIndex(idx: number) {
    if (qType === "multiple_choice") {
      setQCorrectIndices([idx]);
    } else {
      setQCorrectIndices((prev) =>
        prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].sort()
      );
    }
  }

  async function handleSaveQ() {
    if (!qPrompt.trim()) {
      toast.error(tr("questionRequired"));
      return;
    }

    if (qType === "multiple_choice" || qType === "multiple_choices") {
      if (qCorrectIndices.length === 0) {
        toast.error(tr("correctRequired"));
        return;
      }
      if (qOptions.some((o) => !o.trim())) {
        toast.error(tr("optionsRequired"));
        return;
      }
    } else if (qType === "short_answer") {
      if (!qAcceptableAnswers.trim()) {
        toast.error(tr("acceptedAnswerRequired"));
        return;
      }
    }

    const acceptableAnswers = qAcceptableAnswers.split(",").map((t) => t.trim()).filter(Boolean);

    startTransition(async () => {
      try {
        const res = await saveQuestionBankAction(courseId, editingQ?.id || null, {
          prompt: qPrompt,
          options: qType === "short_answer" || qType === "essay" ? [] : qOptions,
          correctIndices: qType === "short_answer" || qType === "essay" ? [] : qCorrectIndices,
          acceptableAnswers,
          difficulty: qDifficulty,
          questionType: qType,
          explanation: qExplanation,
          tags: qTags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
        });
        if (res.success) {
          toast.success(editingQ ? tr("questionUpdated") : tr("questionAdded"));
          setIsQOpen(false);
          router.refresh();
        } else {
          toast.error(tr("failedSaveQuestion"));
        }
      } catch {
        toast.error(tr("failedSaveQuestion"));
      }
    });
  }

  async function handleDeleteQ() {
    if (!deleteQId) return;
    startTransition(async () => {
      try {
        const res = await deleteQuestionBankAction(courseId, deleteQId);
        if (res.success) {
          toast.success(tr("questionDeletedToast"));
          setDeleteQId(null);
          router.refresh();
        } else {
          toast.error(tr("failedDeleteQuestion"));
        }
      } catch {
        toast.error(tr("failedDeleteQuestion"));
      }
    });
  }

  return (
    <div className="space-y-(--section-gap)">
      <Tabs defaultValue="templates" className="w-full">
        <TabsList>
          <TabsTrigger value="templates">
            <ClipboardList className="size-4 mr-2" />
            {tr("quizzes")}
          </TabsTrigger>
          <TabsTrigger value="questionbank">
            <HelpCircle className="size-4 mr-2" />
            {tr("questionBank")}
          </TabsTrigger>
        </TabsList>

        {/* =====================================================================
            TAB 1: QUIZ
            ===================================================================== */}
        <TabsContent value="templates" className="space-y-(--related-gap)">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
            <span className="inline-flex items-center gap-2 text-body-sm font-medium text-muted-foreground">
              <ClipboardList className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>{tr("quizCount", { count: initialTemplates.length })}</span>
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild size="icon-lg">
                    <Link href={`/tutor/${courseId}/quizzes/new`} aria-label={tr("createQuiz")}><Plus aria-hidden /></Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{tr("createQuiz")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {initialTemplates.length === 0 ? (
            <AdminEmptyState compact icon={ClipboardList} title={tr("noQuizzes")} />
          ) : (
            <div className="divide-y divide-border/55">
              {initialTemplates.map((t) => {
                const rules = typeof t.selectionRules === "string" ? JSON.parse(t.selectionRules) : t.selectionRules;
                const isSimulation = t.category === "simulation";

                return (
                  <div key={t.id} className="space-y-(--compact-gap) py-(--row-padding)">
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <h3 className="break-words font-heading text-body-base font-bold text-foreground">{t.title}</h3>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="text-body-2xs rounded-md px-2 py-0.5">
                              {tr(quizCategoryLabelKey(t.category))}
                            </Badge>
                            <Badge variant={t.status === "published" ? "default" : "outline"}>
                              {t.status === "published" ? tr("published") : tr("draft")}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button asChild variant="ghost" size="sm" className="min-h-9">
                            <Link href={`/tutor/${courseId}/quizzes/${t.id}/attempts`}>
                              <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
                              {tr("results")}
                            </Link>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={t.title} className="-me-1.5 size-9 sm:size-8">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-44">
                              <DropdownMenuItem onSelect={() => handleOpenPreviewTpl(t)}>
                                <Eye className="size-4 text-muted-foreground" />
                                <span>{tr("preview")}</span>
                              </DropdownMenuItem>
                              {isSimulation ? (
                                <DropdownMenuItem disabled>
                                  <Edit2 className="size-4" />
                                  <span>{tr("editAdmin")}</span>
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem asChild>
                                  <Link href={`/tutor/${courseId}/quizzes/${t.id}/edit`}>
                                    <Edit2 className="size-4 text-muted-foreground" />
                                    <span>{tr("edit")}</span>
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem disabled={isPending} onSelect={() => handleTogglePublishStatus(t.id, t.status)}>
                                {t.status === "published" ? tr("moveToDraft") : tr("publishQuiz")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={isSimulation}
                                onSelect={() => setDeleteTplId(t.id)}
                                className="text-status-error focus:text-status-error"
                              >
                                <Trash2 className="size-4" />
                                <span>{tr("delete")}</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Creator attribution line */}
                      <div className="flex flex-wrap items-center gap-1.5 text-body-xs text-muted-foreground">
                        <UserCheck className="size-3 shrink-0" />
                        <span>{tr("creator")}</span>
                        <span className="min-w-0 break-words font-semibold text-foreground">{t.creatorName || tr("system")}</span>
                        {t.creatorRole && (
                          <Badge variant="outline" className="capitalize text-body-2xs rounded-md px-1.5 py-0">
                            {t.creatorRole}
                          </Badge>
                        )}
                      </div>

                      <p className="text-body-xs text-muted-foreground">
                        {tr("attemptLimit", { attempts: t.maxAttempts ? `${t.maxAttempts}x` : tr("unlimited"), duration: t.timeLimitSeconds ? `${t.timeLimitSeconds / 60} ${locale === "id" ? "menit" : "minutes"}` : tr("free") })}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        <span className="text-body-xs font-semibold text-muted-foreground mr-1.5 flex items-center gap-1">
                          <Layers className="size-3" />
                          {tr("questionsCount", { count: rules?.count || 5 })} {rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0 && tr("specificQuestions")}
                        </span>
                        {rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0 ? (
                          <Badge variant="outline" className="text-body-2xs text-brand-primary border-brand-primary/30 rounded-md">
                            {tr("fixed")}
                          </Badge>
                        ) : (
                          rules?.tags?.map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-body-2xs text-muted-foreground rounded-md flex items-center gap-1">
                              <Tag className="size-2.5" />
                              {tag}
                            </Badge>
                          ))
                        )}
                      </div>

                      {/* Schedule & Manual Status Section */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-xs text-muted-foreground">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-muted-foreground flex items-center gap-1">
                            <Clock className="size-3" />
                            {tr("access")}
                          </span>
                          <span className={cn(
                            "inline-flex rounded-md border px-2 py-0.5 text-body-2xs font-semibold",
                            t.manualStatus === "open"
                              ? "bg-status-success/10 text-status-success border-status-success/20"
                              : t.manualStatus === "closed"
                              ? "bg-status-error/10 text-status-error border-status-error/20"
                              : "bg-status-info/10 text-status-info border-status-info/20"
                          )}>
                            {t.manualStatus === "open" ? tr("manualOpen") : t.manualStatus === "closed" ? tr("manualClosed") : tr("followSchedule")}
                          </span>
                        </div>

                        {t.manualStatus === "scheduled" && (t.openAt || t.closeAt) && (
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-body-xs">
                            {t.openAt && (
                              <div className="flex flex-wrap gap-x-1.5">
                                <span>{tr("opens")}</span>
                                <span className="font-semibold">{new Date(t.openAt).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" })}</span>
                              </div>
                            )}
                            {t.closeAt && (
                              <div className="flex flex-wrap gap-x-1.5">
                                <span>{tr("closes")}</span>
                                <span className="font-semibold">{new Date(t.closeAt).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" })}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0 && (
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="group">
                              <ChevronDown aria-hidden className="group-aria-expanded:rotate-180" />
                              {tr("selectedQuestions", { count: rules.fixedQuestionIds.length })}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <ol className="list-decimal pl-4 space-y-1 text-body-xs text-foreground/80 leading-normal max-h-40 overflow-y-auto pr-1">
                              {rules.fixedQuestionIds.map((qId: string) => {
                                const question = initialQuestionBank.find((q) => q.id === qId);
                                return (
                                  <li key={qId} className="break-words">
                                    {question?.prompt || <span className="italic text-muted-foreground">{tr("questionDeleted")}</span>}
                                  </li>
                                );
                              })}
                            </ol>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* =====================================================================
            TAB 2: QUESTION BANK
            ===================================================================== */}
        <TabsContent value="questionbank" className="space-y-(--related-gap)">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
            <span className="inline-flex items-center gap-2 text-body-sm font-medium text-muted-foreground">
              <HelpCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>{tr("questionBankTitle", { count: initialQuestionBank.length })}</span>
            </span>
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

          {initialQuestionBank.length === 0 ? (
            <AdminEmptyState compact icon={HelpCircle} title={tr("emptyBank")} />
          ) : (
            <>
            <div className="divide-y divide-border/55">
              {initialQuestionBank.slice(questionOffset, questionOffset + QUESTION_PAGE_SIZE).map((q, idx) => {
                const isImmutableReference = q.origin !== "zyx_original";
                const tagsArr = typeof q.tags === "string" ? JSON.parse(q.tags) : q.tags;
                const opts = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
                const correct = typeof q.correctIndices === "string" ? JSON.parse(q.correctIndices) : q.correctIndices;

                return (
                  <div key={q.id} className="py-(--row-padding)">
                    <div className="flex items-start justify-between gap-(--related-gap)">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-body-xs font-bold text-muted-foreground">{tr("questionNumber", { number: initialQuestionBank.length - questionOffset - idx })}</span>
                          <Badge className={`text-body-2xs rounded-md px-1.5 py-0.5 border ${
                            q.difficulty === "easy" ? "bg-status-success/10 text-status-success border-status-success/20" :
                            q.difficulty === "medium" ? "bg-status-warning/10 text-status-warning border-status-warning/20" :
                            "bg-status-error/10 text-status-error border-status-error/20"
                          }`}>
                            {tr(q.difficulty)}
                          </Badge>
                          <Badge variant="outline" className="text-body-2xs rounded-md text-muted-foreground">
                            {q.questionType === "short_answer" ? tr("shortAnswer") :
                             q.questionType === "essay" ? tr("essay") :
                             q.questionType === "multiple_choices" ? tr("multiSelect") : tr("singleChoice")}
                          </Badge>
                        </div>
                        <MathText className="text-body-base font-medium text-foreground pt-1" as="p">{q.prompt}</MathText>
                      </div>
                      
                      {isImmutableReference ? (
                        <Badge variant="outline" className="rounded-md text-body-2xs text-muted-foreground">
                          {tr("referenceOnly")}
                        </Badge>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" className="h-8 w-8 shrink-0 rounded-lg" aria-label={tr("editQuestion")}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onSelect={() => handleOpenEditQ(q)}>
                              <Edit2 className="size-4 text-muted-foreground" />
                              <span>{tr("editQuestion")}</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setDeleteQId(q.id)} className="text-status-error focus:text-status-error">
                              <Trash2 className="size-4" />
                              <span>{tr("deleteQuestion")}</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    {/* Options list / Acceptable answers preview */}
                    {Array.isArray(opts) && opts.length > 0 &&
                      (q.questionType === "multiple_choice" || q.questionType === "multiple_choices" || !q.questionType) && (
                        <TutorQuestionOptionPreview options={opts} correctIndices={Array.isArray(correct) ? correct : []} />
                      )}

                    {q.questionType === "short_answer" && (
                      <div className="mt-3 pl-2">
                        <span className="text-body-xs font-semibold text-muted-foreground block mb-1">{tr("acceptedAnswers")}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {(Array.isArray(q.acceptableAnswers)
                            ? q.acceptableAnswers
                            : typeof q.acceptableAnswers === "string"
                            ? JSON.parse(q.acceptableAnswers)
                            : []).map((ans: string, i: number) => (
                            <span key={i} className="text-body-xs font-mono font-semibold bg-status-success/10 text-status-success border border-status-success/20 px-2 py-0.5 rounded-md">
                              {ans}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tags */}
                    {Array.isArray(tagsArr) && tagsArr.length > 0 && (
                      <div className="mt-(--compact-gap) flex flex-wrap gap-1">
                        {tagsArr.map((t: string) => (
                          <Badge key={t} variant="outline" className="text-body-2xs text-muted-foreground rounded-md">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {questionPageCount > 1 && (
              <nav aria-label={locale === "id" ? "Halaman bank soal" : "Question bank pages"} className="flex flex-wrap items-center justify-end gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" size="icon-lg" variant="ghost" aria-label={locale === "id" ? "Sebelumnya" : "Previous"} disabled={currentQuestionPage === 0} onClick={() => setQuestionPage(currentQuestionPage - 1)}>
                        <ChevronLeft aria-hidden />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{locale === "id" ? "Sebelumnya" : "Previous"}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className="text-body-sm text-muted-foreground" aria-live="polite">{currentQuestionPage + 1} / {questionPageCount}</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" size="icon-lg" variant="ghost" aria-label={locale === "id" ? "Berikutnya" : "Next"} disabled={currentQuestionPage === questionPageCount - 1} onClick={() => setQuestionPage(currentQuestionPage + 1)}>
                        <ChevronRight aria-hidden />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{locale === "id" ? "Berikutnya" : "Next"}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </nav>
            )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* QUESTION DIALOG */}
      <Dialog open={isQOpen} onOpenChange={setIsQOpen}>
        <DialogContent className="max-w-2xl rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {editingQ ? tr("editBankQuestion") : tr("addToBank")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-(--related-gap) my-2 font-sans overflow-y-auto max-h-[70vh] pr-1">
            <div className="grid gap-2">
              <Label htmlFor="q-prompt" className="text-body-sm font-semibold">{tr("question")}</Label>
              <Textarea
                id="q-prompt"
                value={qPrompt}
                onChange={(e) => setQPrompt(e.target.value)}
                rows={4}
                placeholder={tr("questionPlaceholder")}
                className="rounded-lg border-input bg-background"
              />
            </div>

            <div className="grid grid-cols-1 gap-(--related-gap) sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="q-type" className="text-body-sm font-semibold">{tr("questionType")}</Label>
                <Select value={qType} onValueChange={(val: any) => {
                  setQType(val);
                  setQCorrectIndices([]);
                }}>
                  <SelectTrigger id="q-type">
                    <SelectValue placeholder={tr("chooseType")} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="multiple_choice">{tr("singleChoiceType")}</SelectItem>
                    <SelectItem value="multiple_choices">{tr("multipleChoiceType")}</SelectItem>
                    <SelectItem value="short_answer">{tr("shortAnswerType")}</SelectItem>
                    <SelectItem value="essay">{tr("essayType")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="q-diff" className="text-body-sm font-semibold">{tr("difficulty")}</Label>
                <Select value={qDifficulty} onValueChange={(val: any) => setQDifficulty(val)}>
                  <SelectTrigger id="q-diff">
                    <SelectValue placeholder={tr("chooseDifficulty")} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="easy">{tr("easy")}</SelectItem>
                    <SelectItem value="medium">{tr("medium")}</SelectItem>
                    <SelectItem value="hard">{tr("hard")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Options Input Block for Multiple Choice */}
            {(qType === "multiple_choice" || qType === "multiple_choices") && (
              <div className="space-y-(--compact-gap)">
                <Label className="text-body-sm font-semibold block">{tr("answerOptions")}</Label>
                <span className="text-body-xs text-muted-foreground block -mt-2">
                  {tr("selectCorrect")}
                </span>
                
                {qOptions.map((opt, i) => {
                  const checked = qCorrectIndices.includes(i);
                  return (
                    <div key={i} className="flex items-center gap-(--compact-gap)">
                      <button
                        type="button"
                        aria-label={tr("markCorrect", { letter: String.fromCharCode(65 + i) })}
                        aria-pressed={checked}
                        onClick={() => toggleCorrectIndex(i)}
                        className={`flex size-6 shrink-0 items-center justify-center border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                          checked ? "bg-primary border-primary text-primary-foreground rounded-lg" : "border-border text-muted-foreground hover:border-primary rounded-lg"
                        }`}
                      >
                        {qType === "multiple_choice" ? (
                          checked ? <Check className="size-3.5" /> : <span>{String.fromCharCode(65 + i)}</span>
                        ) : (
                          checked ? <CheckSquare className="size-3.5" /> : <span>{String.fromCharCode(65 + i)}</span>
                        )}
                      </button>
                      <Input
                        aria-label={tr("option", { letter: String.fromCharCode(65 + i) })}
                        value={opt}
                        onChange={(e) => {
                          const copy = [...qOptions];
                          copy[i] = e.target.value;
                          setQOptions(copy);
                        }}
                        placeholder={tr("option", { letter: String.fromCharCode(65 + i) })}
                        className="rounded-lg border-input bg-background flex-1"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Input Block for Short Answer */}
            {qType === "short_answer" && (
              <div className="space-y-2 border-t border-border pt-3">
                <Label htmlFor="q-short-ans" className="text-body-sm font-semibold">{tr("acceptedAnswerInput")}</Label>
                <Input
                  id="q-short-ans"
                  value={qAcceptableAnswers}
                  onChange={(e) => setQAcceptableAnswers(e.target.value)}
                  placeholder={tr("acceptedAnswerExample")}
                  className="rounded-lg border-input bg-background"
                />
                <p className="text-body-xs text-muted-foreground">{tr("matchingAnswerHint")}</p>
              </div>
            )}

            {/* Input Block for Essay */}
            {qType === "essay" && (
              <div className="space-y-1 border-t border-border pt-3 text-body-xs text-muted-foreground">
                <p className="font-semibold text-foreground">{tr("essayTitle")}</p>
                <p>{tr("essayHint")}</p>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="q-explanation" className="text-body-sm font-semibold">{tr("explanationOptional")}</Label>
              <Textarea
                id="q-explanation"
                value={qExplanation}
                onChange={(e) => setQExplanation(e.target.value)}
                rows={3}
                placeholder={tr("explanationPlaceholder")}
                className="rounded-lg border-input bg-background text-body-sm"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="q-tags" className="text-body-sm font-semibold">{tr("tags")}</Label>
              <Input
                id="q-tags"
                value={qTags}
                onChange={(e) => setQTags(e.target.value)}
                placeholder={tr("tagsPlaceholder")}
                className="rounded-lg border-input bg-background"
              />
            </div>
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

      {/* DELETE CONFIRMATIONS */}
      <Dialog open={deleteTplId !== null} onOpenChange={(open) => !open && setDeleteTplId(null)}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">{tr("deleteQuizTitle", { title: quizToDelete?.title ?? "" })}</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {tr("deleteQuizDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTplId(null)} disabled={isPending} className="rounded-md border-border/80">
              {tr("cancel")}
            </Button>
            <Button onClick={handleDeleteTpl} isLoading={isPending} className="bg-status-error hover:bg-status-error/90 text-white rounded-md font-semibold gap-1.5">
              {tr("confirmDeleteQuiz")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteQId !== null} onOpenChange={(open) => !open && setDeleteQId(null)}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">{tr("deleteQuestionTitle", { question: questionToDelete?.prompt.slice(0, 80) ?? "" })}</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {tr("deleteQuestionDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteQId(null)} disabled={isPending} className="rounded-md border-border/80">
              {tr("cancel")}
            </Button>
            <Button onClick={handleDeleteQ} isLoading={isPending} className="bg-status-error hover:bg-status-error/90 text-white rounded-md font-semibold gap-1.5">
              {tr("confirmDeleteQuestion")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PREVIEW QUIZ DIALOG */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="flex max-h-[85dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border/55 px-4 py-3 sm:px-6">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {tr("previewTitle", { title: previewTpl?.title ?? "" })}
            </DialogTitle>
            <DialogDescription className="text-left text-body-xs text-muted-foreground flex gap-(--compact-gap) flex-wrap items-center mt-1">
              <span className="text-muted-foreground">{tr("categoryLabel", { category: previewTpl ? tr(quizCategoryLabelKey(previewTpl.category)) : "" })}</span>
              <span className="text-muted-foreground">{tr("timeLimit", { duration: previewTpl?.timeLimitSeconds ? `${previewTpl.timeLimitSeconds / 60} min` : tr("free") })}</span>
              <span className="text-muted-foreground">{tr("attempts", { count: previewTpl?.maxAttempts ? `${previewTpl.maxAttempts}x` : tr("free") })}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 text-left sm:px-6">
            {loadingPreview ? (
              <div className="py-12 flex flex-col items-center justify-center gap-(--compact-gap)">
                <Loader2 className="size-8 animate-spin text-brand-primary" />
                <p className="text-body-sm text-muted-foreground">{tr("loadingQuestion")}</p>
              </div>
            ) : previewQuestions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-body-sm">
                {tr("noPreviewQuestions")}
              </div>
            ) : (
              <ol className="divide-y divide-border/55">
                {previewQuestions.map((q, idx) => (
                  <li key={q.id} className="space-y-(--compact-gap) py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-body-sm font-bold text-foreground">{tr("questionNumberPreview", { number: idx + 1 })}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-body-xs text-muted-foreground">
                          {tr(q.difficulty)}
                        </span>
                        <span className="text-body-xs text-muted-foreground">
                          {q.questionType === "multiple_choice"
                            ? tr("singleChoice")
                            : q.questionType === "multiple_choices"
                              ? tr("multipleChoicePreview")
                              : q.questionType === "short_answer"
                                ? tr("shortAnswer")
                                : tr("essay")}
                        </span>
                      </div>
                    </div>

                    <MarkdownRenderer content={q.prompt} className="font-semibold text-foreground" />

                    {q.options.length > 0 && (
                      <TutorQuestionOptionPreview options={q.options} correctIndices={q.correctIndices} format="markdown" />
                    )}

                    {q.explanation && (
                      <div className="space-y-1 border-l-2 border-border pl-3 text-body-xs text-muted-foreground">
                        <span className="font-semibold text-foreground block">{tr("explanation")}</span>
                        <MarkdownRenderer content={q.explanation} density="compact" />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

        </DialogContent>
      </Dialog>
    </div>
  );
}
