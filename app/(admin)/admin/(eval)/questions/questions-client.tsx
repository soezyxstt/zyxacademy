"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CheckSquare, Square, ChevronDown, ChevronUp, Plus, Edit2, Trash2, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { DifficultyBadge, StatusBadge } from "@/components/admin/status-badges";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchBar } from "@/components/ui/search-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminTable } from "@/components/admin/table";
import { QuestionFilterField, QuestionFilterPopover } from "./question-filter-popover";

type ReviewStatus = "generated" | "reviewed" | "published" | "flagged" | "retired";
type Difficulty = "easy" | "medium" | "hard";
type QuestionOrigin = "zyx_original" | "historical_reference" | "itb_example";
type QuestionType = "multiple_choice" | "multiple_choices" | "short_answer" | "essay";
type CognitiveLevel = "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
type IdeaRole = "primary" | "supporting" | "required";

interface IdeaLink {
  ideaId: string;
  weight: number;
  role: IdeaRole;
}

interface Question {
  id: string;
  courseId: string;
  origin: QuestionOrigin;
  sourceEventName: string | null;
  sourceReferenceId: string | null;
  difficulty: Difficulty;
  questionType: QuestionType;
  tags: unknown;
  prompt: string;
  options: unknown;
  correctIndices: unknown;
  acceptableAnswers?: unknown;
  explanation: string;
  reviewStatus: ReviewStatus;
  useCount: number;
  createdAt: Date;
  chapterId?: string | null;
  canonicalStatus?: "draft" | "in_review" | "published" | "retired" | null;
  cognitiveLevel?: CognitiveLevel | null;
  reasoningPattern?: string | null;
  ideaLinks?: IdeaLink[];
}

interface Course {
  id: string;
  title: string;
}

interface AuthoringCourse {
  id: string;
  legacyCourseId: string | null;
  code: string;
  title: string;
}

interface AuthoringChapter {
  id: string;
  mataKuliahId: string;
  code: string;
  title: string;
  orderIndex: number;
}

interface AuthoringIdea {
  id: string;
  mataKuliahId: string;
  babId: string;
  code: string;
  statement: string;
}

interface Props {
  questions: Question[];
  courses: Course[];
  courseMap: Record<string, string>;
  canonicalCourseMap?: Record<string, string>;
  authoringCourses: AuthoringCourse[];
  authoringChapters: AuthoringChapter[];
  authoringIdeas: AuthoringIdea[];
}

const statusTone: Record<ReviewStatus, "muted" | "info" | "success" | "warning" | "error"> = {
  generated: "muted",
  reviewed: "info",
  published: "success",
  flagged: "warning",
  retired: "error",
};

/**
 * Determines the target review status from the form submit button.
 *
 * @param event - The form submission event containing the submitter button.
 * @returns 'published' if the submit button value is published, otherwise 'generated'.
 */
function reviewStatusFromSubmit(event: React.FormEvent<HTMLFormElement>): ReviewStatus {
  const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  return submitter?.value === "published" ? "published" : "generated";
}

/**
 * Recomputes equal distribution weights across selected Idea links when an Idea is toggled.
 *
 * @param current - Currently linked Ideas.
 * @param ideaId - The identifier of the Idea being added or removed.
 * @param checked - Whether the Idea should be selected.
 * @returns Updated array of IdeaLink items with normalized weights.
 */
function rebalanceIdeaLinks(current: IdeaLink[], ideaId: string, checked: boolean): IdeaLink[] {
  const existing = new Map(current.map((link) => [link.ideaId, link]));
  if (checked) existing.set(ideaId, { ideaId, weight: 1, role: current.length === 0 ? "primary" : "supporting" });
  else existing.delete(ideaId);
  const ids = [...existing.keys()];
  if (ids.length === 0) return [];
  const weight = 1 / ids.length;
  return ids.map((id, index) => ({
    ideaId: id,
    weight,
    role: existing.get(id)?.role ?? (index === 0 ? "primary" : "supporting"),
  }));
}

/**
 * Validates that the sum of Idea link weights equals 1.0 (100%) within a small epsilon.
 *
 * @param links - Array of Idea links to validate.
 * @returns True if links are empty or their weights sum to 1.0.
 */
function hasValidIdeaWeights(links: IdeaLink[]): boolean {
  return links.length === 0 || Math.abs(links.reduce((sum, link) => sum + link.weight, 0) - 1) <= 0.000001;
}

/**
 * Interactive client studio component for universal question bank operations.
 *
 * Supports single creation, bulk markdown import, faceted filtering, KaTeX preview,
 * multi-question selection, status updates, and deletion.
 *
 * @param props - Component properties containing questions list, courses, chapters, and ideas.
 */
export function QuestionBankClient({ questions, courses, courseMap, canonicalCourseMap, authoringCourses, authoringChapters, authoringIdeas }: Props) {
  const router = useRouter();
  const t = useTranslations("adminEval.questionBank");

  const chaptersForCourse = (courseId: string) => authoringChapters.filter((chapter) => chapter.mataKuliahId === courseId);
  const ideasForSelection = (courseId: string, chapterId: string) => authoringIdeas.filter((idea) => idea.mataKuliahId === courseId && (!chapterId || idea.babId === chapterId));
  const canonicalCourseForLegacy = (legacyCourseId: string) => authoringCourses.find((course) => course.legacyCourseId === legacyCourseId)?.id ?? legacyCourseId;

  // Bulk Upload State
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCourseId, setBulkCourseId] = useState(authoringCourses[0]?.id || "");
  const [bulkChapterId, setBulkChapterId] = useState("");
  const [bulkIdeaLinks, setBulkIdeaLinks] = useState<IdeaLink[]>([]);
  const [bulkMarkdown, setBulkMarkdown] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<ReviewStatus | "all">("all");
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterOrigin, setFilterOrigin] = useState<QuestionOrigin | "all">("all");
  const [filterQuestionType, setFilterQuestionType] = useState<QuestionType | "all">("all");
  const [filterDifficulty, setFilterDifficulty] = useState<Difficulty | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);
  const [localQuestions, setLocalQuestions] = useState(() => questions.filter((question) => question.origin !== "historical_reference"));

  // Dialog & Form state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<Question | null>(null);

  // Create Form State
  const [createCourseId, setCreateCourseId] = useState(authoringCourses[0]?.id || "");
  const [createChapterId, setCreateChapterId] = useState("");
  const [createIdeaLinks, setCreateIdeaLinks] = useState<IdeaLink[]>([]);
  const [createPrompt, setCreatePrompt] = useState("");
  const [createQuestionType, setCreateQuestionType] = useState<QuestionType>("multiple_choice");
  const [createOptions, setCreateOptions] = useState<string[]>(["", "", "", ""]);
  const [createCorrectIndices, setCreateCorrectIndices] = useState<number[]>([0]);
  const [createAcceptableAnswers, setCreateAcceptableAnswers] = useState("");
  const [createExplanation, setCreateExplanation] = useState("");
  const [createDifficulty, setCreateDifficulty] = useState<Difficulty>("medium");
  const [createCognitiveLevel, setCreateCognitiveLevel] = useState<CognitiveLevel>("understand");
  const [createReasoningPattern, setCreateReasoningPattern] = useState("manual_authoring");
  const [createTagsStr, setCreateTagsStr] = useState("");
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Edit Form State
  const [editPrompt, setEditPrompt] = useState("");
  const [editQuestionType, setEditQuestionType] = useState<QuestionType>("multiple_choice");
  const [editOptions, setEditOptions] = useState<string[]>(["", "", "", ""]);
  const [editCorrectIndices, setEditCorrectIndices] = useState<number[]>([0]);
  const [editAcceptableAnswers, setEditAcceptableAnswers] = useState("");
  const [editExplanation, setEditExplanation] = useState("");
  const [editDifficulty, setEditDifficulty] = useState<Difficulty>("medium");
  const [editCourseId, setEditCourseId] = useState(authoringCourses[0]?.id || "");
  const [editChapterId, setEditChapterId] = useState("");
  const [editIdeaLinks, setEditIdeaLinks] = useState<IdeaLink[]>([]);
  const [editCognitiveLevel, setEditCognitiveLevel] = useState<CognitiveLevel>("understand");
  const [editReasoningPattern, setEditReasoningPattern] = useState("manual_authoring");
  const [editTagsStr, setEditTagsStr] = useState("");
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const filtered = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return localQuestions.filter((q) => {
      const tagsList = Array.isArray(q.tags) ? (q.tags as string[]) : [];
      if (normalizedSearch) {
        const searchableText = [
          q.prompt,
          q.sourceEventName,
          q.sourceReferenceId,
          courseMap[q.courseId],
          ...tagsList,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchableText.includes(normalizedSearch)) return false;
      }
      if (filterStatus !== "all" && q.reviewStatus !== filterStatus) return false;
      if (filterCourse !== "all") {
        const resolveCourseId = (id: string | null | undefined) => {
          if (!id) return "";
          return canonicalCourseMap?.[id] ?? canonicalCourseForLegacy(id) ?? id;
        };
        if (resolveCourseId(q.courseId) !== resolveCourseId(filterCourse)) return false;
      }
      if (filterOrigin !== "all" && q.origin !== filterOrigin) return false;
      if (filterQuestionType !== "all" && q.questionType !== filterQuestionType) return false;
      if (filterDifficulty !== "all" && q.difficulty !== filterDifficulty) return false;

      return true;
    });
  }, [localQuestions, searchQuery, filterStatus, filterCourse, filterOrigin, filterQuestionType, filterDifficulty, courseMap, authoringCourses, canonicalCourseMap]);

  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const tableRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedQuestions = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safeCurrentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterCourse, filterOrigin, filterQuestionType, filterDifficulty, pageSize]);

  const goToPage = (page: number) => {
    const target = Math.max(1, Math.min(totalPages, page));
    setCurrentPage(target);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const activeFilterCount = [filterStatus, filterCourse, filterOrigin, filterQuestionType, filterDifficulty]
    .filter((value) => value !== "all").length;

  function resetFilters() {
    setFilterStatus("all");
    setFilterCourse("all");
    setFilterOrigin("all");
    setFilterQuestionType("all");
    setFilterDifficulty("all");
    setCurrentPage(1);
  }

  function toggleSelect(id: string) {
    const question = localQuestions.find((item) => item.id === id);
    if (question?.origin === "historical_reference") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const selectableQuestions = filtered.filter((question) => question.origin !== "historical_reference");
    const allVisibleSelected = selectableQuestions.length > 0 && selectableQuestions.every((q) => selected.has(q.id));
    if (allVisibleSelected) {
      setSelected((current) => {
        const next = new Set(current);
        selectableQuestions.forEach((question) => next.delete(question.id));
        return next;
      });
    } else {
      setSelected((current) => new Set([...current, ...selectableQuestions.map((question) => question.id)]));
    }
  }

  async function bulkUpdate(status: ReviewStatus) {
    if (selected.size === 0) {
      toast.error(t("selectAtLeastOne"));
      return;
    }
    if (localQuestions.some((question) => selected.has(question.id) && question.origin === "historical_reference")) {
      toast.error(t("historicalReviewTabOnly"));
      return;
    }
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], reviewStatus: status }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(t("updateFailed"));
        return;
      }
      toast.success(t("updatedCount", { count: data.updated, status: t(status) }));
      setLocalQuestions((prev) =>
        prev.map((q) => (selected.has(q.id) ? { ...q, reviewStatus: status } : q)),
      );
      setSelected(new Set());
    } finally {
      setUpdating(false);
    }
  }

  const handleStartEdit = (q: Question) => {
    setEditingQuestion(q);
    setEditCourseId(canonicalCourseForLegacy(q.courseId));
    setEditChapterId(q.chapterId ?? "");
    setEditIdeaLinks(q.ideaLinks ?? []);
    setEditCognitiveLevel(q.cognitiveLevel ?? "understand");
    setEditReasoningPattern(q.reasoningPattern ?? "manual_authoring");
    setEditPrompt(q.prompt);
    setEditQuestionType((q.questionType as any) || "multiple_choice");
    const opts = Array.isArray(q.options) ? [...q.options] : ["", "", "", "", ""];
    while (opts.length < 4) opts.push("");
    setEditOptions(opts.slice(0, 4));
    const correctIdxs = Array.isArray(q.correctIndices) ? q.correctIndices : [];
    setEditCorrectIndices(correctIdxs.length > 0 ? (correctIdxs as number[]) : [0]);
    const accAnswers = Array.isArray(q.acceptableAnswers) ? (q.acceptableAnswers as string[]) : [];
    setEditAcceptableAnswers(accAnswers.join(", "));
    setEditExplanation(q.explanation || "");
    setEditDifficulty(q.difficulty);
    const tagsArr = Array.isArray(q.tags) ? q.tags : [];
    setEditTagsStr(tagsArr.join(", "));
    setEditOpen(true);
  };

  const handleStartDelete = (q: Question) => {
    setDeletingQuestion(q);
    setDeleteOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!createPrompt.trim()) return toast.error(t("promptRequired"));

    const reviewStatus = reviewStatusFromSubmit(e);
    if (!hasValidIdeaWeights(createIdeaLinks)) return toast.error(t("ideaWeightMustTotal"));
    if (createQuestionType === "multiple_choice" || createQuestionType === "multiple_choices") {
      if (createOptions.some((opt) => !opt.trim())) return toast.error(t("allOptionsRequired"));
      if (createCorrectIndices.length === 0) return toast.error(t("selectCorrectOption"));
      if (createQuestionType === "multiple_choice" && createCorrectIndices.length !== 1) return toast.error(t("singleChoiceOneAnswer"));
    } else if (createQuestionType === "short_answer") {
      if (!createAcceptableAnswers.trim()) return toast.error(t("acceptedAnswerRequired"));
    }

    try {
      setSubmittingCreate(true);
      const tags = createTagsStr.split(",").map((t) => t.trim()).filter(Boolean);
      const acceptableAnswers = createAcceptableAnswers.split(",").map((a) => a.trim()).filter(Boolean);

      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: createCourseId,
          chapterId: createChapterId || null,
          ideaLinks: createIdeaLinks,
          prompt: createPrompt,
          questionType: createQuestionType,
          options: createQuestionType === "short_answer" || createQuestionType === "essay" ? [] : createOptions,
          correctIndices: createQuestionType === "short_answer" || createQuestionType === "essay" ? [] : createCorrectIndices,
          acceptableAnswers,
          explanation: createExplanation,
          difficulty: createDifficulty,
          cognitiveLevel: createCognitiveLevel,
          reasoningPattern: createReasoningPattern,
          tags,
          reviewStatus,
        }),
      });

      if (!res.ok) {
        throw new Error(t("createFailed"));
      }

      const newQ = await res.json();
      toast.success(reviewStatus === "published" ? t("manualPublished") : t("manualDraftSaved"));

      const createdQuestion: Question = {
        id: newQ.id,
        courseId: newQ.courseId ?? authoringCourses.find((course) => course.id === createCourseId)?.legacyCourseId ?? createCourseId,
        origin: "zyx_original",
        sourceEventName: null,
        sourceReferenceId: null,
        difficulty: createDifficulty,
        questionType: createQuestionType,
        tags,
        prompt: createPrompt,
        options: createQuestionType === "short_answer" || createQuestionType === "essay" ? [] : createOptions,
        correctIndices: createQuestionType === "short_answer" || createQuestionType === "essay" ? [] : createCorrectIndices,
        acceptableAnswers,
        explanation: createExplanation,
        reviewStatus,
        useCount: 0,
        createdAt: new Date(),
        chapterId: createChapterId || null,
        canonicalStatus: reviewStatus === "published" ? "published" : "draft",
        cognitiveLevel: createCognitiveLevel,
        reasoningPattern: createReasoningPattern,
        ideaLinks: createIdeaLinks,
      };

      setLocalQuestions(prev => [createdQuestion, ...prev]);
      setCreateOpen(false);

      setCreatePrompt("");
      setCreateOptions(["", "", "", ""]);
      setCreateCorrectIndices([0]);
      setCreateChapterId("");
      setCreateIdeaLinks([]);
      setCreateAcceptableAnswers("");
      setCreateExplanation("");
      setCreateTagsStr("");
    } catch {
      toast.error(t("createFailed"));
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!bulkCourseId) return toast.error(t("chooseCourseFirst"));
    if (!hasValidIdeaWeights(bulkIdeaLinks)) return toast.error(t("ideaWeightMustTotal"));
    if (!bulkMarkdown.trim()) return toast.error(t("markdownRequired"));
    const reviewStatus = reviewStatusFromSubmit(e);

    try {
      setBulkSubmitting(true);
      const res = await fetch("/api/admin/questions/bulk-markdown", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: bulkCourseId,
          chapterId: bulkChapterId || null,
          ideaLinks: bulkIdeaLinks,
          rawMarkdown: bulkMarkdown,
          reviewStatus,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || t("importSucceeded"));
        setBulkOpen(false);
        setBulkMarkdown("");
        setBulkChapterId("");
        setBulkIdeaLinks([]);
        // Reload page data to get the new questions in list
        router.refresh();
      } else {
        toast.error(t("importFailed"));
      }
    } catch {
      toast.error(t("connectionError"));
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setBulkMarkdown(event.target.result as string);
        toast.success(t("markdownRead"));
      }
    };
    reader.readAsText(file);
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingQuestion) return;
    if (!editPrompt.trim()) return toast.error(t("promptRequired"));
    const reviewStatus = reviewStatusFromSubmit(e);
    if (!hasValidIdeaWeights(editIdeaLinks)) return toast.error(t("ideaWeightMustTotal"));

    if (editQuestionType === "multiple_choice" || editQuestionType === "multiple_choices") {
      if (editOptions.some((opt) => !opt.trim())) return toast.error(t("allOptionsRequired"));
      if (editCorrectIndices.length === 0) return toast.error(t("selectCorrectOption"));
      if (editQuestionType === "multiple_choice" && editCorrectIndices.length !== 1) return toast.error(t("singleChoiceOneAnswer"));
    } else if (editQuestionType === "short_answer") {
      if (!editAcceptableAnswers.trim()) return toast.error(t("acceptedAnswerRequired"));
    }

    try {
      setSubmittingEdit(true);
      const tags = editTagsStr.split(",").map((t) => t.trim()).filter(Boolean);
      const acceptableAnswers = editAcceptableAnswers.split(",").map((a) => a.trim()).filter(Boolean);

      const res = await fetch(`/api/admin/questions/${editingQuestion.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: editCourseId,
          chapterId: editChapterId || null,
          ideaLinks: editIdeaLinks,
          prompt: editPrompt,
          questionType: editQuestionType,
          options: editQuestionType === "short_answer" || editQuestionType === "essay" ? [] : editOptions,
          correctIndices: editQuestionType === "short_answer" || editQuestionType === "essay" ? [] : editCorrectIndices,
          acceptableAnswers,
          explanation: editExplanation,
          difficulty: editDifficulty,
          cognitiveLevel: editCognitiveLevel,
          reasoningPattern: editReasoningPattern,
          tags,
          reviewStatus,
        }),
      });

      if (!res.ok) {
        throw new Error(t("saveFailed"));
      }

      toast.success(reviewStatus === "published" ? t("updatedPublished") : t("draftChangesSaved"));

      setLocalQuestions(prev =>
        prev.map(item =>
          item.id === editingQuestion.id
            ? {
                ...item,
                prompt: editPrompt,
                questionType: editQuestionType,
                options: editQuestionType === "short_answer" || editQuestionType === "essay" ? [] : editOptions,
                correctIndices: editQuestionType === "short_answer" || editQuestionType === "essay" ? [] : editCorrectIndices,
                acceptableAnswers,
                explanation: editExplanation,
                difficulty: editDifficulty,
                tags,
                reviewStatus,
                chapterId: editChapterId || null,
                canonicalStatus: reviewStatus === "published" ? "published" : "draft",
                cognitiveLevel: editCognitiveLevel,
                reasoningPattern: editReasoningPattern,
                ideaLinks: editIdeaLinks,
              }
            : item
        )
      );
      setEditOpen(false);
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingQuestion) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/questions/${deletingQuestion.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(t("questionDeleted"));
        setLocalQuestions((prev) => prev.filter((item) => item.id !== deletingQuestion.id));
        setDeleteOpen(false);
      } else {
        toast.error(t("deleteFailed"));
      }
    } catch {
      toast.error(t("genericError"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full space-y-6 font-sans">
      {/* Search, filters, and actions */}
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
        <SearchBar
          size="sm"
          placeholder={t("search")}
          value={searchQuery}
          onSearch={setSearchQuery}
          onClear={() => setSearchQuery("")}
          containerClassName="min-w-[140px] flex-1"
        />

        <QuestionFilterPopover activeCount={activeFilterCount} onReset={resetFilters}>
          <QuestionFilterField label={t("status")}>
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as ReviewStatus | "all")}>
              <SelectTrigger aria-label={t("filterStatus")} className="h-9 w-full rounded-lg text-body-sm">
                <SelectValue placeholder={t("status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allStatuses")}</SelectItem>
                <SelectItem value="generated">{t("generated")}</SelectItem>
                <SelectItem value="reviewed">{t("reviewed")}</SelectItem>
                <SelectItem value="published">{t("published")}</SelectItem>
                <SelectItem value="flagged">{t("flagged")}</SelectItem>
                <SelectItem value="retired">{t("retired")}</SelectItem>
              </SelectContent>
            </Select>
          </QuestionFilterField>
          <QuestionFilterField label={t("course")}>
            <Select value={filterCourse} onValueChange={setFilterCourse}>
              <SelectTrigger aria-label={t("filterCourse")} className="h-9 w-full rounded-lg text-body-sm">
                <SelectValue placeholder={t("course")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allCourses")}</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </QuestionFilterField>
          <QuestionFilterField label={t("origin")}>
            <Select value={filterOrigin} onValueChange={(value) => setFilterOrigin(value as QuestionOrigin | "all")}>
              <SelectTrigger aria-label={t("filterOrigin")} className="h-9 w-full rounded-lg text-body-sm">
                <SelectValue placeholder={t("origin")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allOrigins")}</SelectItem>
                <SelectItem value="zyx_original">{t("zyxOriginal")}</SelectItem>
                <SelectItem value="itb_example">{t("itbExample")}</SelectItem>
              </SelectContent>
            </Select>
          </QuestionFilterField>
          <QuestionFilterField label={t("type")}>
            <Select value={filterQuestionType} onValueChange={(value) => setFilterQuestionType(value as QuestionType | "all")}>
              <SelectTrigger aria-label={t("filterType")} className="h-9 w-full rounded-lg text-body-sm">
                <SelectValue placeholder={t("type")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allQuestionTypes")}</SelectItem>
                <SelectItem value="multiple_choice">{t("multipleChoice")}</SelectItem>
                <SelectItem value="multiple_choices">{t("multipleChoices")}</SelectItem>
                <SelectItem value="short_answer">{t("shortAnswer")}</SelectItem>
                <SelectItem value="essay">{t("essay")}</SelectItem>
              </SelectContent>
            </Select>
          </QuestionFilterField>
          <QuestionFilterField label={t("difficulty")}>
            <Select value={filterDifficulty} onValueChange={(value) => setFilterDifficulty(value as Difficulty | "all")}>
              <SelectTrigger aria-label={t("filterDifficulty")} className="h-9 w-full rounded-lg text-body-sm">
                <SelectValue placeholder={t("difficulty")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allDifficulties")}</SelectItem>
                <SelectItem value="easy">{t("easy")}</SelectItem>
                <SelectItem value="medium">{t("medium")}</SelectItem>
                <SelectItem value="hard">{t("hard")}</SelectItem>
              </SelectContent>
            </Select>
          </QuestionFilterField>
        </QuestionFilterPopover>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setBulkOpen(true)}
                variant="outline"
                size="sm"
                aria-label={t("importMarkdown")}
                className="size-9 p-0 rounded-lg shrink-0"
              >
                <Upload className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("importMarkdown")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setCreateOpen(true)}
                size="sm"
                aria-label={t("addQuestion")}
                className="size-9 p-0 rounded-lg shrink-0 bg-brand-primary text-white hover:bg-brand-primary/95 shadow-2xs"
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("addQuestion")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div ref={tableRef} className="w-full space-y-6">
        {/* Bulk actions - Floating Overlay */}
        {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-xl border border-border/80 bg-background/90 backdrop-blur-md px-5 py-3.5 shadow-xl min-w-[320px] max-w-[90vw] animate-in slide-in-from-bottom-4 duration-300">
              <span className="text-body-sm font-bold text-foreground shrink-0">{selected.size} {t("selectedCountLabel")}</span>
          <div className="h-4 w-px bg-border/85 shrink-0" />
          <div className="flex gap-1.5 ml-auto flex-wrap">
            {(["reviewed", "published", "flagged", "retired"] as ReviewStatus[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                className="rounded-lg text-body-sm cursor-pointer border-border/60 hover:bg-muted font-bold capitalize transition-all"
                onClick={() => bulkUpdate(s)}
                disabled={updating}
              >
                Set {s}
              </Button>
            ))}
          </div>
        </div>
        )}

      {/* Question list */}
      <AdminTable className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleAll}
              aria-label={filtered.filter((q) => q.origin !== "historical_reference").length > 0 && filtered.filter((q) => q.origin !== "historical_reference").every((q) => selected.has(q.id)) ? t("clearAllSelection") : t("selectAllQuestions")}
              className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            >
              {filtered.filter((q) => q.origin !== "historical_reference").length > 0 && filtered.filter((q) => q.origin !== "historical_reference").every((q) => selected.has(q.id)) ? (
                <CheckSquare className="size-4 text-brand-primary" />
              ) : (
                <Square className="size-4" />
              )}
            </button>
            <span className="text-body-xs font-semibold text-muted-foreground">
              Daftar soal ({filtered.length})
            </span>
          </div>

          <div className="flex items-center gap-3 ml-auto flex-wrap">
            <div className="flex items-center gap-1.5 text-body-xs text-muted-foreground">
              <span className="hidden sm:inline">{t("perPage")}</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger aria-label={t("pageSize")} className="h-7 w-[68px] rounded-md text-body-xs px-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-7 p-0 rounded-md"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => goToPage(safeCurrentPage - 1)}
                  aria-label={t("previousPage")}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="text-body-xs font-semibold px-1.5 tabular-nums text-muted-foreground">
                  {safeCurrentPage} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-7 p-0 rounded-md"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => goToPage(safeCurrentPage + 1)}
                  aria-label={t("nextPage")}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <AdminEmptyState compact title={t("empty")} />
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden">
              {paginatedQuestions.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                courseMap={courseMap}
                selected={selected.has(q.id)}
                onToggle={() => toggleSelect(q.id)}
                onEdit={handleStartEdit}
                onDelete={handleStartDelete}
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3 text-body-sm">
            <span className="text-body-xs text-muted-foreground">
              {t("showingQuestions", { start: (safeCurrentPage - 1) * pageSize + 1, end: Math.min(safeCurrentPage * pageSize, filtered.length), count: filtered.length })}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="size-8 p-0 rounded-lg"
                disabled={safeCurrentPage <= 1}
                onClick={() => goToPage(safeCurrentPage - 1)}
                aria-label={t("previousPage")}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-body-xs font-semibold px-2 tabular-nums">
                {safeCurrentPage} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="size-8 p-0 rounded-lg"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => goToPage(safeCurrentPage + 1)}
                aria-label={t("nextPage")}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </AdminTable>
      </div>

      {/* CREATE DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/60 shrink-0">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">{t("manualQuestionTitle")}</DialogTitle>
            <DialogDescription>{t("manualQuestionDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-body-sm text-foreground">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("courseLabel")}</label>
                  <Select value={createCourseId} onValueChange={(value) => { setCreateCourseId(value); setCreateChapterId(""); setCreateIdeaLinks([]); }}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                      <SelectValue placeholder={t("chooseCourse")} />
                    </SelectTrigger>
                    <SelectContent>
                      {authoringCourses.map((course) => (
                        <SelectItem key={course.id} value={course.id}>
                          {course.code} · {course.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("chapter")}</label>
                  <Select value={createChapterId || "all"} onValueChange={(value) => { setCreateChapterId(value === "all" ? "" : value); setCreateIdeaLinks([]); }}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                      <SelectValue placeholder={t("allChaptersLabel")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("allChaptersLabel")}</SelectItem>
                      {chaptersForCourse(createCourseId).map((chapter) => (
                        <SelectItem key={chapter.id} value={chapter.id}>
                          {chapter.code} · {chapter.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("typeLabel")}</label>
                  <Select value={createQuestionType} onValueChange={(val) => setCreateQuestionType(val as any)}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                      <SelectValue placeholder={t("selectType")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiple_choice">{t("optionChoiceOne")}</SelectItem>
                      <SelectItem value="multiple_choices">{t("complexChoice")}</SelectItem>
                      <SelectItem value="short_answer">{t("shortAnswerType")}</SelectItem>
                      <SelectItem value="essay">{t("essayType")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("difficultyLabel")}</label>
                  <Select value={createDifficulty} onValueChange={(val) => setCreateDifficulty(val as any)}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                      <SelectValue placeholder={t("selectDifficulty")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">{t("easy")}</SelectItem>
                      <SelectItem value="medium">{t("medium")}</SelectItem>
                      <SelectItem value="hard">{t("hard")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("cognitiveLevelLabel")}</label>
                  <Select value={createCognitiveLevel} onValueChange={(value) => setCreateCognitiveLevel(value as CognitiveLevel)}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["remember", "understand", "apply", "analyze", "evaluate", "create"] as CognitiveLevel[]).map((level) => <SelectItem key={level} value={level}>{t(`cognitive${level[0].toUpperCase()}${level.slice(1)}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("reasoningPatternLabel")}</label>
                  <Input value={createReasoningPattern} onChange={(event) => setCreateReasoningPattern(event.target.value)} placeholder={t("reasoningPlaceholder")} className="h-10 border-border/80 bg-background/50 text-body-sm font-medium" />
                </div>
              </div>

              <IdeaAssignmentFields
                idPrefix="create"
                ideas={ideasForSelection(createCourseId, createChapterId)}
                links={createIdeaLinks}
                onChange={setCreateIdeaLinks}
              />

              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("questionPrompt")}</label>
                <Textarea
                  value={createPrompt}
                  onChange={(e) => setCreatePrompt(e.target.value)}
                  placeholder={t("promptPlaceholder")}
                  rows={3}
                  className="w-full rounded-lg border border-border/80 bg-background/50 p-3 hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-sans text-body-sm font-medium"
                />
              </div>

              {(createQuestionType === "multiple_choice" || createQuestionType === "multiple_choices") && (
                <div className="space-y-3 border-t border-border pt-4">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">{t("optionsAndAnswerKeyLabel")}</label>
                  <p className="text-body-xs text-muted-foreground">{t("multipleChoiceHelp")}</p>
                  <div className="space-y-2.5">
                    {createOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <Checkbox
                          id={`create-correct-option-${idx}`}
                          checked={createCorrectIndices.includes(idx)}
                          onCheckedChange={(checked) => {
                            const next = createCorrectIndices.filter((value) => value !== idx);
                            if (checked === true) {
                              setCreateCorrectIndices(createQuestionType === "multiple_choice" ? [idx] : [...next, idx].sort((left, right) => left - right));
                            } else setCreateCorrectIndices(next);
                          }}
                          className="size-4 text-brand-primary cursor-pointer"
                        />
                        <label htmlFor={`create-correct-option-${idx}`} className="font-bold text-muted-foreground text-body-sm w-4 text-center cursor-pointer">
                          {String.fromCharCode(65 + idx)}
                        </label>
                        <Input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const next = [...createOptions];
                            next[idx] = e.target.value;
                            setCreateOptions(next);
                          }}
                          placeholder={t("optionNumber", { number: String.fromCharCode(65 + idx) })}
                          className="h-9 border-border/85 bg-background text-body-sm font-medium"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {createQuestionType === "short_answer" && (
                <div className="space-y-1.5 border-t border-border pt-4">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">{t("acceptedAnswersLabel")}</label>
                  <Input
                    type="text"
                    value={createAcceptableAnswers}
                    onChange={(e) => setCreateAcceptableAnswers(e.target.value)}
                    placeholder={t("acceptedAnswersPlaceholder")}
                    className="h-10 border-border/85 bg-background text-body-sm font-medium"
                  />
                  <p className="text-body-xs text-muted-foreground mt-1">{t("acceptedAnswersHelp")}</p>
                </div>
              )}

              {createQuestionType === "essay" && (
                <div className="border-t border-border pt-4 text-body-xs text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">{t("essayQuestion")}</p>
                  {t("solutionHelpEssay")}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("solutionRubricLabel")}</label>
                <Textarea
                  value={createExplanation}
                  onChange={(e) => setCreateExplanation(e.target.value)}
                  placeholder={t("solutionPlaceholder")}
                  rows={2}
                  className="w-full rounded-lg border border-border/80 bg-background/50 p-3 hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-sans text-body-sm font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("tagsLabel")}</label>
                <Input
                  type="text"
                  value={createTagsStr}
                  onChange={(e) => setCreateTagsStr(e.target.value)}
                  placeholder={t("tagsPlaceholder")}
                  className="h-10 border-border/80 bg-background text-body-sm font-medium"
                />
              </div>
            </div>

            <DialogFooter className="p-6 pt-4 border-t border-border/40 bg-muted/5 flex items-center justify-end gap-2.5 shrink-0">
              <Button type="button" variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setCreateOpen(false)} disabled={submittingCreate}>{t("cancel")}</Button>
              <Button type="submit" name="reviewStatus" value="generated" variant="outline" isLoading={submittingCreate} className="rounded-lg cursor-pointer font-bold">
                {t("saveDraft")}
              </Button>
              <Button type="submit" name="reviewStatus" value="published" isLoading={submittingCreate} className="rounded-lg cursor-pointer bg-brand-primary !text-white hover:bg-brand-primary/95 font-bold px-6 shadow-sm">
                {t("savePublish")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/60 shrink-0">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">{t("editQuestionAnswerKey")}</DialogTitle>
            <DialogDescription>{t("editDescription")}</DialogDescription>
          </DialogHeader>
          {editingQuestion && (
            <form onSubmit={handleEditSubmit} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-body-sm text-foreground">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("courseLabel")}</label>
                    <Select value={editCourseId} onValueChange={(value) => { setEditCourseId(value); setEditChapterId(""); setEditIdeaLinks([]); }}>
                      <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"><SelectValue placeholder={t("chooseCourse")} /></SelectTrigger>
                      <SelectContent>
                        {authoringCourses.map((course) => <SelectItem key={course.id} value={course.id}>{course.code} · {course.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("chapter")}</label>
                    <Select value={editChapterId || "all"} onValueChange={(value) => { setEditChapterId(value === "all" ? "" : value); setEditIdeaLinks([]); }}>
                      <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"><SelectValue placeholder={t("allChaptersLabel")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("allChaptersLabel")}</SelectItem>
                        {chaptersForCourse(editCourseId).map((chapter) => <SelectItem key={chapter.id} value={chapter.id}>{chapter.code} · {chapter.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("typeLabel")}</label>
                    <Select value={editQuestionType} onValueChange={(val) => setEditQuestionType(val as any)}>
                      <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                        <SelectValue placeholder={t("selectType")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="multiple_choice">{t("optionChoiceOne")}</SelectItem>
                        <SelectItem value="multiple_choices">{t("complexChoice")}</SelectItem>
                        <SelectItem value="short_answer">{t("shortAnswerType")}</SelectItem>
                        <SelectItem value="essay">{t("essayType")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("difficultyLabel")}</label>
                    <Select value={editDifficulty} onValueChange={(val) => setEditDifficulty(val as any)}>
                      <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                        <SelectValue placeholder={t("selectDifficulty")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">{t("easy")}</SelectItem>
                        <SelectItem value="medium">{t("medium")}</SelectItem>
                        <SelectItem value="hard">{t("hard")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("cognitiveLevelLabel")}</label>
                    <Select value={editCognitiveLevel} onValueChange={(value) => setEditCognitiveLevel(value as CognitiveLevel)}>
                      <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"><SelectValue /></SelectTrigger>
                      <SelectContent>
                      {(["remember", "understand", "apply", "analyze", "evaluate", "create"] as CognitiveLevel[]).map((level) => <SelectItem key={level} value={level}>{t(`cognitive${level[0].toUpperCase()}${level.slice(1)}`)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("reasoningPatternLabel")}</label>
                    <Input value={editReasoningPattern} onChange={(event) => setEditReasoningPattern(event.target.value)} placeholder={t("reasoningPlaceholder")} className="h-10 border-border/80 bg-background/50 text-body-sm font-medium" />
                  </div>
                </div>

                <IdeaAssignmentFields
                  idPrefix="edit"
                  ideas={ideasForSelection(editCourseId, editChapterId)}
                  links={editIdeaLinks}
                  onChange={setEditIdeaLinks}
                />

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("questionPrompt")}</label>
                  <Textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder={t("promptPlaceholder")}
                    rows={3}
                    className="w-full rounded-lg border border-border/80 bg-background/50 p-3 hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-sans text-body-sm font-medium"
                  />
                </div>

                {(editQuestionType === "multiple_choice" || editQuestionType === "multiple_choices") && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">{t("optionsAndAnswerKeyLabel")}</label>
                    <p className="text-body-xs text-muted-foreground">{t("multipleChoiceHelp")}</p>
                    <div className="space-y-2.5">
                      {editOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <Checkbox
                            id={`edit-correct-option-${idx}`}
                            checked={editCorrectIndices.includes(idx)}
                            onCheckedChange={(checked) => {
                              const next = editCorrectIndices.filter((value) => value !== idx);
                              if (checked === true) {
                                setEditCorrectIndices(editQuestionType === "multiple_choice" ? [idx] : [...next, idx].sort((left, right) => left - right));
                              } else setEditCorrectIndices(next);
                            }}
                            className="size-4 text-brand-primary cursor-pointer"
                          />
                          <label htmlFor={`edit-correct-option-${idx}`} className="font-bold text-muted-foreground text-body-sm w-4 text-center cursor-pointer">
                            {String.fromCharCode(65 + idx)}
                          </label>
                          <Input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const next = [...editOptions];
                              next[idx] = e.target.value;
                              setEditOptions(next);
                            }}
                            placeholder={t("optionNumber", { number: String.fromCharCode(65 + idx) })}
                            className="h-9 border-border/85 bg-background text-body-sm font-medium"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {editQuestionType === "short_answer" && (
                  <div className="space-y-1.5 border-t border-border pt-4">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">{t("acceptedAnswersLabel")}</label>
                    <Input
                      type="text"
                      value={editAcceptableAnswers}
                      onChange={(e) => setEditAcceptableAnswers(e.target.value)}
                      placeholder={t("acceptedAnswersPlaceholder")}
                      className="h-10 border-border/85 bg-background text-body-sm font-medium"
                    />
                  </div>
                )}

                {editQuestionType === "essay" && (
                  <div className="border-t border-border pt-4 text-body-xs text-muted-foreground">
                    <p className="font-semibold text-foreground mb-1">{t("essayQuestion")}</p>
                    Tuliskan rubrik atau kunci jawaban referensi pada kolom Penjelasan Solusi.
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("solutionRubricLabel")}</label>
                  <Textarea
                    value={editExplanation}
                    onChange={(e) => setEditExplanation(e.target.value)}
                    placeholder={t("solutionPlaceholder")}
                    rows={2}
                    className="w-full rounded-lg border border-border/80 bg-background/50 p-3 hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-sans text-body-sm font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("tagsLabel")}</label>
                  <Input
                    type="text"
                    value={editTagsStr}
                    onChange={(e) => setEditTagsStr(e.target.value)}
                    placeholder={t("tagsPlaceholder")}
                    className="h-10 border-border/80 bg-background text-body-sm font-medium"
                  />
                </div>
              </div>

              <DialogFooter className="p-6 pt-4 border-t border-border/40 bg-muted/5 flex items-center justify-end gap-2.5 shrink-0">
                <Button type="button" variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setEditOpen(false)} disabled={submittingEdit}>{t("cancel")}</Button>
                <Button type="submit" name="reviewStatus" value="generated" variant="outline" isLoading={submittingEdit} className="rounded-lg cursor-pointer font-bold">
                  {t("saveDraft")}
                </Button>
                <Button type="submit" name="reviewStatus" value="published" isLoading={submittingEdit} className="rounded-lg cursor-pointer bg-brand-primary !text-white hover:bg-brand-primary/95 font-bold px-6 shadow-sm">
                  {t("savePublish")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* DELETE DIALOG */}
      <AdminConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeletingQuestion(null);
        }}
        title={t("deleteQuestion")}
        description={t("deleteQuestionConfirm")}
        confirmLabel={t("confirmDelete")}
        loading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />

      {/* BULK UPLOAD DIALOG */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/60 shrink-0">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">{t("importMarkdownTitle")}</DialogTitle>
            <DialogDescription>{t("importMarkdownDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBulkSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-body-sm text-foreground">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("courseLabel")}</label>
                  <Select value={bulkCourseId} onValueChange={(value) => { setBulkCourseId(value); setBulkChapterId(""); setBulkIdeaLinks([]); }}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"><SelectValue placeholder={t("chooseCourse")} /></SelectTrigger>
                    <SelectContent>
                      {authoringCourses.map((course) => <SelectItem key={course.id} value={course.id}>{course.code} · {course.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("chapter")}</label>
                  <Select value={bulkChapterId || "all"} onValueChange={(value) => { setBulkChapterId(value === "all" ? "" : value); setBulkIdeaLinks([]); }}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"><SelectValue placeholder={t("allChaptersLabel")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("allChaptersLabel")}</SelectItem>
                      {chaptersForCourse(bulkCourseId).map((chapter) => <SelectItem key={chapter.id} value={chapter.id}>{chapter.code} · {chapter.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <IdeaAssignmentFields
                idPrefix="bulk"
                ideas={ideasForSelection(bulkCourseId, bulkChapterId)}
                links={bulkIdeaLinks}
                onChange={setBulkIdeaLinks}
              />

              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("markdownFileOptional")}</label>
                <Input
                  type="file"
                  accept=".md"
                  onChange={handleFileChange}
                  className="file:bg-muted file:text-foreground file:border-0 file:rounded-md file:px-2 file:py-1 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>{t("markdownContentRequired")}</span>
                  <span className="text-[10px] text-muted-foreground lowercase normal-case">{t("markdownFormatHelp")}</span>
                </label>
                <Textarea
                  required
                  value={bulkMarkdown}
                  onChange={(e) => setBulkMarkdown(e.target.value)}
                  placeholder={t("markdownImportPlaceholder")}
                  rows={12}
                  className="w-full rounded-lg border border-border/80 bg-background/50 p-3 hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-mono text-body-sm leading-relaxed"
                />
              </div>
            </div>

            <DialogFooter className="p-6 pt-4 border-t border-border/40 bg-muted/5 flex items-center justify-end gap-2.5 shrink-0">
              <Button type="button" variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setBulkOpen(false)} disabled={bulkSubmitting}>{t("cancel")}</Button>
              <Button type="submit" name="reviewStatus" value="generated" variant="outline" isLoading={bulkSubmitting} className="rounded-lg cursor-pointer font-bold">
                {t("saveDraft")}
              </Button>
              <Button type="submit" name="reviewStatus" value="published" isLoading={bulkSubmitting} className="rounded-lg cursor-pointer bg-brand-primary !text-white hover:bg-brand-primary/95 font-bold px-6 shadow-sm">
                {t("savePublish")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IdeaAssignmentFields({
  idPrefix,
  ideas,
  links,
  onChange,
}: {
  idPrefix: string;
  ideas: AuthoringIdea[];
  links: IdeaLink[];
  onChange: (links: IdeaLink[]) => void;
}) {
  const t = useTranslations("adminEval.questionBank");
  const [expanded, setExpanded] = useState(links.length > 0);
  const selected = new Map(links.map((link) => [link.ideaId, link]));
  const totalWeight = links.reduce((sum, link) => sum + link.weight, 0);
  const valid = hasValidIdeaWeights(links);

  return (
    <section className="space-y-3 border-t border-border pt-4" aria-labelledby={`${idPrefix}-idea-heading`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 id={`${idPrefix}-idea-heading`} className="text-body-sm font-semibold text-foreground">{t("ideaConnection")}</h3>
            <StatusBadge tone="muted" subtle>{t("optional")}</StatusBadge>
          </div>
          <p className="mt-1 text-body-xs text-muted-foreground">
            {links.length > 0 ? t("ideaConnectedCount", { count: links.length }) : t("ideaCanBeUnlinked")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-2 text-body-xs"
          aria-expanded={expanded}
          aria-controls={`${idPrefix}-idea-options`}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t("close") : t("manageIdeas")}
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </div>

      {expanded ? (
        <div id={`${idPrefix}-idea-options`} className="space-y-3">
          {links.length > 0 ? (
            <p className={cn("text-body-xs font-semibold", valid ? "text-status-success" : "text-status-warning")}>
              {t("totalWeight")}: {Math.round(totalWeight * 100)}%. {valid ? t("readyToSave") : t("weightMustBe100")}
            </p>
          ) : null}
          {ideas.length === 0 ? (
            <p className="text-body-xs text-muted-foreground">
              {t("noPublishedIdeas")}
            </p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {ideas.map((idea) => {
            const link = selected.get(idea.id);
            return (
              <div key={idea.id} className={cn("rounded-lg border p-3 transition-colors", link ? "border-brand-primary/40 bg-brand-primary/5" : "border-border bg-background/40")}>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={`${idPrefix}-idea-${idea.id}`}
                    checked={Boolean(link)}
                    onCheckedChange={(checked) => onChange(rebalanceIdeaLinks(links, idea.id, checked === true))}
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <label htmlFor={`${idPrefix}-idea-${idea.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-body-xs font-semibold text-foreground">{idea.code}</span>
                    <span className="mt-1 block line-clamp-2 text-body-xs leading-relaxed text-muted-foreground">{idea.statement}</span>
                  </label>
                </div>
                {link ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 pl-7">
                    <div className="space-y-1">
                      <label htmlFor={`${idPrefix}-weight-${idea.id}`} className="text-body-xs font-medium text-muted-foreground">{t("weightLabel")}</label>
                      <Input
                        id={`${idPrefix}-weight-${idea.id}`}
                        type="number"
                        min="0.01"
                        max="1"
                        step="0.01"
                        value={String(link.weight)}
                        onChange={(event) => {
                          const weight = Number(event.target.value);
                          onChange(links.map((item) => item.ideaId === idea.id ? { ...item, weight } : item));
                        }}
                        className="h-8 bg-background text-body-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`${idPrefix}-role-${idea.id}`} className="text-body-xs font-medium text-muted-foreground">{t("roleLabel")}</label>
                      <Select value={link.role} onValueChange={(role) => onChange(links.map((item) => item.ideaId === idea.id ? { ...item, role: role as IdeaRole } : item))}>
                        <SelectTrigger id={`${idPrefix}-role-${idea.id}`} className="h-8 bg-background text-body-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="primary">{t("rolePrimary")}</SelectItem>
                          <SelectItem value="supporting">{t("roleSupporting")}</SelectItem>
                          <SelectItem value="required">{t("roleRequired")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function QuestionRow({
  question,
  courseMap,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: {
  question: Question;
  courseMap: Record<string, string>;
  selected: boolean;
  onToggle: () => void;
  onEdit: (q: Question) => void;
  onDelete: (q: Question) => void;
}) {
  const t = useTranslations("adminEval.questionBank");
  const [expanded, setExpanded] = useState(false);
  const isHistoricalReference = question.origin === "historical_reference";
  const options = Array.isArray(question.options) ? (question.options as string[]) : [];
  const correctIndices = Array.isArray(question.correctIndices)
    ? (question.correctIndices as number[])
    : [];
  const acceptableAnswers = Array.isArray(question.acceptableAnswers)
    ? (question.acceptableAnswers as string[])
    : typeof question.acceptableAnswers === "string"
    ? JSON.parse(question.acceptableAnswers)
    : [];
  const tags = Array.isArray(question.tags) ? (question.tags as string[]) : [];

  // Question type display helper
  const qTypeLabel = question.questionType === "short_answer" ? t("shortAnswer") :
    question.questionType === "essay" ? t("essay") :
    question.questionType === "multiple_choices" ? t("multipleChoices") : t("multipleChoice");

  return (
    <div className={cn("px-4 py-4 transition-colors", selected ? "bg-muted/15" : "hover:bg-muted/5")}>
      <div className="flex items-start gap-3">
        {isHistoricalReference ? (
          <StatusBadge tone="info" subtle className="mt-0.5 shrink-0">{t("reviewOnly")}</StatusBadge>
        ) : (
          <button
            onClick={onToggle}
            className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0 cursor-pointer transition-colors"
          >
            {selected ? <CheckSquare className="size-4.5 text-brand-primary" /> : <Square className="size-4.5" />}
          </button>
        )}

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2.5 flex-wrap text-body-xs font-semibold">
            <StatusBadge
              tone={statusTone[question.reviewStatus]}
              subtle
              className={question.reviewStatus === "retired" ? "line-through" : undefined}
            >
              {t(question.reviewStatus)}
            </StatusBadge>

            <StatusBadge tone={question.origin === "zyx_original" ? "brand" : "info"} subtle>
              {question.origin === "itb_example" ? t("itbExample") : question.origin === "historical_reference" ? t("historicalReference") : t("zyxOriginal")}
            </StatusBadge>

            <StatusBadge tone="brand" subtle>
              {qTypeLabel}
            </StatusBadge>

            <DifficultyBadge difficulty={question.difficulty} subtle />
            <StatusBadge tone={question.ideaLinks && question.ideaLinks.length > 0 ? "success" : "muted"} subtle>
              {question.ideaLinks && question.ideaLinks.length > 0 ? t("ideaConnectedCount", { count: question.ideaLinks.length }) : t("withoutIdea")}
            </StatusBadge>
            <span className="text-muted-foreground font-medium">
              {courseMap[question.courseId] ?? question.courseId}
            </span>

            <span className="text-muted-foreground ml-auto font-medium text-body-xs normal-case">
              {t("used")} {question.useCount}×
            </span>
          </div>

          {question.sourceEventName ? (
            <p className="mt-2 text-body-xs font-medium text-muted-foreground">{t("source")} {question.sourceEventName}</p>
          ) : null}

          {expanded ? (
            <div className="mt-3 border-l-2 border-brand-primary/40 pl-3">
              <MarkdownRenderer content={question.prompt} className="text-body-sm text-foreground font-medium space-y-3" />
            </div>
          ) : (
            <MathText className="text-body-sm text-foreground mt-2 line-clamp-2 font-medium leading-relaxed font-sans block" as="div">
              {question.prompt}
            </MathText>
          )}

          {tags.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="rounded-md border border-border/20 bg-muted/65 px-1.5 py-0.5 text-body-xs font-semibold text-muted-foreground/90">
                  #{t}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer p-1 rounded-md hover:bg-muted"
        >
          {expanded ? <ChevronUp className="size-4.5" /> : <ChevronDown className="size-4.5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 ml-7.5 space-y-4 border-t border-border/40 pt-4 text-left">
          {/* Multiple choice options */}
          {(question.questionType === "multiple_choice" || question.questionType === "multiple_choices" || (!question.questionType && options.length > 0)) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((opt, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-3 text-body-sm rounded-lg px-3.5 py-2.5 border transition-all duration-200",
                    correctIndices.includes(i)
                      ? "bg-status-success/5 text-status-success border-status-success/20 font-medium"
                      : "text-muted-foreground border-border/30 hover:border-border/60 bg-muted/5"
                  )}
                >
                  <span className="font-bold font-sans text-muted-foreground/80 shrink-0">{String.fromCharCode(65 + i)}.</span>
                  <MarkdownRenderer content={opt} className="flex-1 text-body-sm leading-relaxed space-y-3" />
                </div>
              ))}
            </div>
          )}

          {/* Short answer acceptable answers */}
          {question.questionType === "short_answer" && (
            <div className="rounded-xl bg-status-success/5 p-4 border border-status-success/20">
              <p className="text-body-xs font-bold text-status-success uppercase tracking-wider mb-1.5">{t("acceptedAnswerTitle")}</p>
              <div className="flex flex-wrap gap-2">
                {acceptableAnswers.map((ans: string, idx: number) => (
                  <span key={idx} className="rounded-md bg-background px-2.5 py-1 border border-status-success/30 font-mono text-body-sm font-semibold text-foreground">
                    <MathText as="span">{ans}</MathText>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Solution Explanation */}
          {question.explanation && (
            <div className="rounded-xl bg-muted/20 p-4 border border-border/60">
              <p className="text-body-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                {question.questionType === "essay" ? t("solutionRubric") : t("solutionExplanation")}
              </p>
              <MarkdownRenderer content={question.explanation} className="text-body-sm text-foreground/80 leading-relaxed font-sans space-y-3" />
            </div>
          )}

          {isHistoricalReference ? (
            <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-3">
              <StatusBadge tone="info" subtle>{t("historicalReviewOnly")}</StatusBadge>
            </div>
          ) : (
            <div className="flex gap-2 justify-end pt-3 border-t border-border/40">
              <Button size="sm" variant="outline" className="rounded-lg gap-1.5 cursor-pointer text-body-sm font-bold" onClick={() => onEdit(question)}>
                <Edit2 className="size-3.5" /> {t("editQuestionAnswerKey")}
              </Button>
              <Button size="sm" variant="destructive" className="rounded-lg gap-1.5 cursor-pointer text-body-sm font-bold animate-colors" onClick={() => onDelete(question)}>
                <Trash2 className="size-3.5" /> {t("deleteQuestion")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
