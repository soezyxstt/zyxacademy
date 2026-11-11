"use client";

import { AdminEmptyState } from "@/components/admin/state-panels";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Plus, Edit2, Trash2, ClipboardList, HelpCircle, Loader2, Tag, Layers, Check, CheckSquare, Eye, Clock, FileSpreadsheet, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MathText } from "@/components/course/math-text";
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
    <div className="space-y-4">
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
        <TabsContent value="templates" className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="font-heading text-body-base font-semibold text-foreground">{tr("quizCount", { count: initialTemplates.length })}</h2>
            <Button asChild className="bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 rounded-md font-semibold gap-2">
              <Link href={`/tutor/${courseId}/quizzes/new`}>
                <Plus className="size-4" />
                {tr("createQuiz")}
              </Link>
            </Button>
          </div>

          {initialTemplates.length === 0 ? (
            <AdminEmptyState icon={ClipboardList} title={tr("noQuizzes")} />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {initialTemplates.map((t) => {
                const rules = typeof t.selectionRules === "string" ? JSON.parse(t.selectionRules) : t.selectionRules;
                const isSimulation = t.category === "simulation";

                return (
                  <Card key={t.id} className="rounded-none border-0 bg-transparent py-0 shadow-none gap-0">
                    <CardHeader className="px-4 pt-3 pb-2">
                      <div className="flex justify-between items-start gap-2">
                        <CardTitle className="font-heading text-body-base font-bold text-foreground break-words">{t.title}</CardTitle>
                        <div className="flex gap-1.5 flex-wrap items-center">
                          <Badge variant="secondary" className="text-[10px] rounded-md px-2 py-0.5">
                            {tr(quizCategoryLabelKey(t.category))}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => handleTogglePublishStatus(t.id, t.status)}
                            aria-pressed={t.status === "published"}
                            className={cn(
                              "capitalize text-body-sm rounded-md px-2 py-1 font-semibold border cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                              t.status === "published"
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                            )}
                          >
                            {t.status === "published" ? tr("published") : tr("draft")}
                          </button>
                        </div>
                      </div>

                      {/* Creator attribution line */}
                      <div className="flex items-center gap-1.5 text-body-xs text-muted-foreground mt-1">
                        <UserCheck className="size-3 text-brand-primary shrink-0" />
                        <span>{tr("creator")}</span>
                        <span className="font-semibold text-foreground truncate">{t.creatorName || tr("system")}</span>
                        {t.creatorRole && (
                          <Badge variant="outline" className="capitalize text-[10px] rounded-md px-1.5 py-0">
                            {t.creatorRole}
                          </Badge>
                        )}
                      </div>

                      <p className="text-body-xs text-muted-foreground mt-0.5">
                        {tr("attemptLimit", { attempts: t.maxAttempts ? `${t.maxAttempts}x` : tr("unlimited"), duration: t.timeLimitSeconds ? `${t.timeLimitSeconds / 60} ${locale === "id" ? "menit" : "minutes"}` : tr("free") })}
                      </p>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 space-y-2">
                      <div className="flex flex-wrap gap-1">
                        <span className="text-body-xs font-semibold text-muted-foreground mr-1.5 flex items-center gap-1">
                          <Layers className="size-3" />
                          {tr("questionsCount", { count: rules?.count || 5 })} {rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0 && tr("specificQuestions")}
                        </span>
                        {rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0 ? (
                          <Badge variant="outline" className="text-[10px] text-brand-primary border-brand-primary/30 rounded-md">
                            {tr("fixed")}
                          </Badge>
                        ) : (
                          rules?.tags?.map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-[10px] text-muted-foreground rounded-md flex items-center gap-1">
                              <Tag className="size-2.5" />
                              {tag}
                            </Badge>
                          ))
                        )}
                      </div>

                      {/* Schedule & Manual Status Section */}
                      <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5 text-body-xs text-muted-foreground">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-muted-foreground flex items-center gap-1">
                            <Clock className="size-3" />
                            {tr("access")}
                          </span>
                          <span className={cn(
                            "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                            t.manualStatus === "open"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                              : t.manualStatus === "closed"
                              ? "bg-destructive/10 text-destructive border-destructive/20"
                              : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
                          )}>
                            {t.manualStatus === "open" ? tr("manualOpen") : t.manualStatus === "closed" ? tr("manualClosed") : tr("followSchedule")}
                          </span>
                        </div>

                        {t.manualStatus === "scheduled" && (t.openAt || t.closeAt) && (
                          <div className="text-body-xs space-y-1 mt-1 text-foreground/80">
                            {t.openAt && (
                              <div className="flex justify-between">
                                <span>{tr("opens")}</span>
                                <span className="font-semibold">{new Date(t.openAt).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" })}</span>
                              </div>
                            )}
                            {t.closeAt && (
                              <div className="flex justify-between">
                                <span>{tr("closes")}</span>
                                <span className="font-semibold">{new Date(t.closeAt).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" })}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0 && (
                        <div className="mt-2.5 text-left border-t border-border/40 pt-2.5">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                            {tr("selectedQuestions")}
                          </span>
                          <ol className="list-decimal pl-4 space-y-1 text-body-xs text-foreground/80 leading-normal max-h-24 overflow-y-auto pr-1">
                            {rules.fixedQuestionIds.map((qId: string) => {
                              const question = initialQuestionBank.find((q) => q.id === qId);
                              return (
                                <li key={qId} className="truncate" title={question?.prompt || tr("questionMissing")}>
                                  {question?.prompt || <span className="italic text-muted-foreground">{tr("questionDeleted")}</span>}
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      )}
                    </CardContent>
                    <div className="flex flex-wrap gap-2 px-4 pb-3">
                      <Button asChild variant="outline" size="sm" className="gap-1">
                        <Link href={`/tutor/${courseId}/quizzes/${t.id}/attempts`}>
                          <FileSpreadsheet className="size-3.5" />
                          {tr("results")}
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleOpenPreviewTpl(t)} className="rounded-md border-border/80 text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary gap-1 text-body-sm">
                        <Eye className="size-3.5" />
                        {tr("preview")}
                      </Button>
                      {isSimulation ? (
                        <Button variant="outline" size="sm" disabled className="rounded-md border-border/80 text-muted-foreground gap-1 opacity-50 cursor-not-allowed text-body-sm">
                          <Edit2 className="size-3.5" />
                          {tr("editAdmin")}
                        </Button>
                      ) : (
                        <Button asChild variant="outline" size="sm" className="rounded-md border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted gap-1 text-body-sm">
                          <Link href={`/tutor/${courseId}/quizzes/${t.id}/edit`}>
                            <Edit2 className="size-3.5" />
                            {tr("edit")}
                          </Link>
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isSimulation}
                        onClick={() => setDeleteTplId(t.id)}
                        className="gap-1"
                      >
                        <Trash2 className="size-3.5" />
                        {tr("delete")}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* =====================================================================
            TAB 2: QUESTION BANK
            ===================================================================== */}
        <TabsContent value="questionbank" className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="font-heading text-body-base font-semibold text-foreground">{tr("questionBankTitle", { count: initialQuestionBank.length })}</h2>
            <Button onClick={handleOpenAddQ} className="bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 rounded-md font-semibold gap-2">
              <Plus className="size-4" />
              {tr("addQuestion")}
            </Button>
          </div>

          {initialQuestionBank.length === 0 ? (
            <AdminEmptyState icon={HelpCircle} title={tr("emptyBank")} />
          ) : (
            <>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {initialQuestionBank.slice(questionOffset, questionOffset + QUESTION_PAGE_SIZE).map((q, idx) => {
                const isImmutableReference = q.origin !== "zyx_original";
                const tagsArr = typeof q.tags === "string" ? JSON.parse(q.tags) : q.tags;
                const opts = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
                const correct = typeof q.correctIndices === "string" ? JSON.parse(q.correctIndices) : q.correctIndices;

                return (
                  <Card key={q.id} className="relative rounded-none border-0 bg-transparent p-4 shadow-none">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-body-xs font-bold text-muted-foreground">{tr("questionNumber", { number: initialQuestionBank.length - questionOffset - idx })}</span>
                          <Badge className={`text-[10px] rounded-md px-1.5 py-0.5 border ${
                            q.difficulty === "easy" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" :
                            q.difficulty === "medium" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" :
                            "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"
                          }`}>
                            {tr(q.difficulty)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] rounded-md text-muted-foreground">
                            {q.questionType === "short_answer" ? tr("shortAnswer") :
                             q.questionType === "essay" ? tr("essay") :
                             q.questionType === "multiple_choices" ? tr("multiSelect") : tr("singleChoice")}
                          </Badge>
                        </div>
                        <MathText className="text-body-base font-medium text-foreground leading-relaxed pt-1" as="p">{q.prompt}</MathText>
                      </div>
                      
                      {isImmutableReference ? (
                        <Badge variant="outline" className="rounded-md text-body-2xs text-muted-foreground">
                          {tr("referenceOnly")}
                        </Badge>
                      ) : (
                        <div className="flex gap-1.5">
                          <Button variant="ghost" size="xs" onClick={() => handleOpenEditQ(q)} className="rounded-md text-muted-foreground hover:text-foreground" aria-label={tr("editQuestion")}>
                            <Edit2 className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="xs" onClick={() => setDeleteQId(q.id)} className="rounded-md text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={tr("deleteQuestion")}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Options list / Acceptable answers preview */}
                    {(q.questionType === "multiple_choice" || q.questionType === "multiple_choices" || (!q.questionType && Array.isArray(opts) && opts.length > 0)) && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 pl-2">
                        {Array.isArray(opts) && opts.map((opt, i) => {
                          const isCorrect = Array.isArray(correct) && correct.includes(i);
                          return (
                            <div key={i} className={`flex items-center gap-2 text-body-xs px-3 py-1.5 rounded-lg border ${
                              isCorrect ? "bg-status-success/5 border-status-success/25 text-foreground" : "bg-muted/10 border-border/50 text-muted-foreground"
                            }`}>
                              <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                isCorrect ? "bg-status-success/15 text-foreground" : "bg-muted text-muted-foreground"
                              }`}>
                                {String.fromCharCode(65 + i)}
                              </span>
                              <span className="min-w-0 break-words">
                                <MathText className="leading-normal" as="span">{opt}</MathText>
                              </span>
                            </div>
                          );
                        })}
                      </div>
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
                            <span key={i} className="text-body-xs font-mono font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                              {ans}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tags */}
                    {Array.isArray(tagsArr) && tagsArr.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border/40 flex flex-wrap gap-1">
                        {tagsArr.map((t: string) => (
                          <Badge key={t} variant="outline" className="text-[10px] text-muted-foreground rounded-md">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
            {questionPageCount > 1 && (
              <nav aria-label={locale === "id" ? "Halaman bank soal" : "Question bank pages"} className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" size="sm" disabled={currentQuestionPage === 0} onClick={() => setQuestionPage(currentQuestionPage - 1)}>
                  {locale === "id" ? "Sebelumnya" : "Previous"}
                </Button>
                <span className="text-body-sm text-muted-foreground" aria-live="polite">{currentQuestionPage + 1} / {questionPageCount}</span>
                <Button variant="outline" size="sm" disabled={currentQuestionPage === questionPageCount - 1} onClick={() => setQuestionPage(currentQuestionPage + 1)}>
                  {locale === "id" ? "Berikutnya" : "Next"}
                </Button>
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

          <div className="space-y-4 my-2 font-sans overflow-y-auto max-h-[70vh] pr-1">
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="q-type" className="text-body-sm font-semibold">{tr("questionType")}</Label>
                <Select value={qType} onValueChange={(val: any) => {
                  setQType(val);
                  setQCorrectIndices([]);
                }}>
                  <SelectTrigger id="q-type" className="rounded-lg border-input bg-background">
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
                  <SelectTrigger id="q-diff" className="rounded-lg border-input bg-background">
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
              <div className="space-y-3">
                <Label className="text-body-sm font-semibold block">{tr("answerOptions")}</Label>
                <span className="text-body-xs text-muted-foreground block -mt-2">
                  {tr("selectCorrect")}
                </span>
                
                {qOptions.map((opt, i) => {
                  const checked = qCorrectIndices.includes(i);
                  return (
                    <div key={i} className="flex items-center gap-3">
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
              <div className="space-y-2 rounded-xl border border-border bg-muted/5 p-4">
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
              <div className="p-4 rounded-xl border border-border bg-muted/5 text-body-xs text-muted-foreground space-y-1">
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
          <DialogFooter className="gap-2 mt-4">
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
          <DialogFooter className="gap-2 mt-4">
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
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {tr("previewTitle", { title: previewTpl?.title ?? "" })}
            </DialogTitle>
            <DialogDescription className="text-left text-body-xs text-muted-foreground flex gap-3 flex-wrap items-center mt-1">
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">{tr("categoryLabel", { category: previewTpl ? tr(quizCategoryLabelKey(previewTpl.category)) : "" })}</span>
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">{tr("timeLimit", { duration: previewTpl?.timeLimitSeconds ? `${previewTpl.timeLimitSeconds / 60} min` : tr("free") })}</span>
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">{tr("attempts", { count: previewTpl?.maxAttempts ? `${previewTpl.maxAttempts}x` : tr("free") })}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 text-left">
            {loadingPreview ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="size-8 animate-spin text-brand-primary" />
                <p className="text-body-sm text-muted-foreground">{tr("loadingQuestion")}</p>
              </div>
            ) : previewQuestions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-body-sm">
                {tr("noPreviewQuestions")}
              </div>
            ) : (
              <div className="space-y-4">
                {previewQuestions.map((q, idx) => (
                  <div key={q.id} className="p-5 rounded-xl border border-border bg-card space-y-4">
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                      <span className="text-body-sm font-bold text-foreground">{tr("questionNumberPreview", { number: idx + 1 })}</span>
                      <div className="flex items-center gap-2">
                        <span className="capitalize text-[10px] bg-muted/80 text-muted-foreground px-2 py-0.5 rounded border border-border font-medium">
                          {tr(q.difficulty)}
                        </span>
                        <span className="capitalize text-[10px] bg-muted/80 text-muted-foreground px-2 py-0.5 rounded border border-border font-medium">
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

                    <MarkdownRenderer content={q.prompt} className="text-body-sm font-semibold text-foreground leading-relaxed" />

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
                            <span
                              className={cn(
                                "flex size-6 items-center justify-center rounded border text-body-xs font-bold shrink-0",
                                isCorrect
                                  ? "bg-emerald-500 border-emerald-600 text-white shadow-xs"
                                  : "bg-muted border-border text-muted-foreground"
                              )}
                            >
                              {String.fromCharCode(65 + optIdx)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <MarkdownRenderer content={opt} density="compact" />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="mt-2 text-body-xs bg-muted/50 p-3 rounded-lg border border-border/50 text-muted-foreground space-y-1">
                        <span className="font-semibold text-foreground block">{tr("explanation")}</span>
                        <MarkdownRenderer content={q.explanation} density="compact" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-border flex justify-end bg-card shrink-0">
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)} className="rounded-md border-border">
              {tr("closePreview")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
