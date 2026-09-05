"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckSquare, Square, ChevronDown, ChevronUp, Plus, Edit2, Trash2, RotateCcw, Upload, ChevronLeft, ChevronRight } from "lucide-react";
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

type ReviewStatus = "generated" | "reviewed" | "published" | "flagged" | "retired";
type Difficulty = "easy" | "medium" | "hard";
type QuestionOrigin = "zyx_original" | "itb_example";
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

const cognitiveLevelLabel: Record<CognitiveLevel, string> = {
  remember: "Mengingat",
  understand: "Memahami",
  apply: "Menerapkan",
  analyze: "Menganalisis",
  evaluate: "Mengevaluasi",
  create: "Mencipta",
};

function reviewStatusFromSubmit(event: React.FormEvent<HTMLFormElement>): ReviewStatus {
  const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  return submitter?.value === "published" ? "published" : "generated";
}

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

function hasValidIdeaWeights(links: IdeaLink[]): boolean {
  return links.length === 0 || Math.abs(links.reduce((sum, link) => sum + link.weight, 0) - 1) <= 0.000001;
}

export function QuestionBankClient({ questions, courses, courseMap, authoringCourses, authoringChapters, authoringIdeas }: Props) {
  const router = useRouter();

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
  const [localQuestions, setLocalQuestions] = useState(questions);

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
      if (filterCourse !== "all" && q.courseId !== filterCourse) return false;
      if (filterOrigin !== "all" && q.origin !== filterOrigin) return false;
      if (filterQuestionType !== "all" && q.questionType !== filterQuestionType) return false;
      if (filterDifficulty !== "all" && q.difficulty !== filterDifficulty) return false;

      return true;
    });
  }, [localQuestions, searchQuery, filterStatus, filterCourse, filterOrigin, filterQuestionType, filterDifficulty, courseMap]);

  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedQuestions = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safeCurrentPage]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      filterStatus !== "all" ||
      filterCourse !== "all" ||
      filterOrigin !== "all" ||
      filterQuestionType !== "all" ||
      filterDifficulty !== "all",
  );

  function resetFilters() {
    setSearchQuery("");
    setFilterStatus("all");
    setFilterCourse("all");
    setFilterOrigin("all");
    setFilterQuestionType("all");
    setFilterDifficulty("all");
    setSelected(new Set());
    setCurrentPage(1);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const allVisibleSelected = filtered.length > 0 && filtered.every((q) => selected.has(q.id));
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((q) => q.id)));
    }
  }

  async function bulkUpdate(status: ReviewStatus) {
    if (selected.size === 0) {
      toast.error("Pilih minimal satu soal.");
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
        toast.error("Gagal update: " + JSON.stringify(data.error));
        return;
      }
      toast.success(`${data.updated} soal diupdate ke "${status}".`);
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
    if (!createPrompt.trim()) return toast.error("Prompt soal wajib diisi.");

    const reviewStatus = reviewStatusFromSubmit(e);
    if (!hasValidIdeaWeights(createIdeaLinks)) return toast.error("Jika Idea dipilih, total bobotnya harus 100%.");
    if (createQuestionType === "multiple_choice" || createQuestionType === "multiple_choices") {
      if (createOptions.some((opt) => !opt.trim())) return toast.error("Semua empat opsi harus diisi.");
      if (createCorrectIndices.length === 0) return toast.error("Pilih minimal satu opsi yang benar.");
      if (createQuestionType === "multiple_choice" && createCorrectIndices.length !== 1) return toast.error("Pilihan ganda harus memiliki tepat satu jawaban benar.");
    } else if (createQuestionType === "short_answer") {
      if (!createAcceptableAnswers.trim()) return toast.error("Jawaban benar yang diterima wajib diisi.");
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
        const data = await res.json();
        throw new Error(data.error || "Gagal membuat soal");
      }

      const newQ = await res.json();
      toast.success(reviewStatus === "published" ? "Soal manual disimpan dan diterbitkan." : "Soal manual disimpan sebagai draft.");

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
    } catch (err: any) {
      toast.error(err.message || "Gagal membuat soal");
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!bulkCourseId) return toast.error("Silakan pilih mata kuliah.");
    if (!hasValidIdeaWeights(bulkIdeaLinks)) return toast.error("Jika Idea dipilih, total bobotnya harus 100%.");
    if (!bulkMarkdown.trim()) return toast.error("Konten markdown tidak boleh kosong.");
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
        toast.success(data.message || "Berhasil mengimpor soal.");
        setBulkOpen(false);
        setBulkMarkdown("");
        setBulkChapterId("");
        setBulkIdeaLinks([]);
        // Reload page data to get the new questions in list
        router.refresh();
      } else {
        toast.error(data.error || "Gagal mengimpor soal.");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi.");
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
        toast.success("File Markdown berhasil dibaca.");
      }
    };
    reader.readAsText(file);
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingQuestion) return;
    if (!editPrompt.trim()) return toast.error("Prompt soal wajib diisi.");
    const reviewStatus = reviewStatusFromSubmit(e);
    if (!hasValidIdeaWeights(editIdeaLinks)) return toast.error("Jika Idea dipilih, total bobotnya harus 100%.");

    if (editQuestionType === "multiple_choice" || editQuestionType === "multiple_choices") {
      if (editOptions.some((opt) => !opt.trim())) return toast.error("Semua empat opsi harus diisi.");
      if (editCorrectIndices.length === 0) return toast.error("Pilih minimal satu opsi yang benar.");
      if (editQuestionType === "multiple_choice" && editCorrectIndices.length !== 1) return toast.error("Pilihan ganda harus memiliki tepat satu jawaban benar.");
    } else if (editQuestionType === "short_answer") {
      if (!editAcceptableAnswers.trim()) return toast.error("Jawaban benar yang diterima wajib diisi.");
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
        const data = await res.json();
        throw new Error(data.error || "Gagal menyimpan perubahan");
      }

      toast.success(reviewStatus === "published" ? "Soal diperbarui dan diterbitkan." : "Perubahan disimpan sebagai draft.");

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
    } catch (err: any) {
      toast.error(err.message || "Gagal menyimpan perubahan");
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
        toast.success("Soal berhasil dihapus.");
        setLocalQuestions((prev) => prev.filter((item) => item.id !== deletingQuestion.id));
        setDeleteOpen(false);
      } else {
        toast.error("Gagal menghapus soal.");
      }
    } catch {
      toast.error("Terjadi kesalahan.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="font-sans space-y-6">
      {/* Search, filters, and actions */}
      <div className="flex items-center gap-2">
        <SearchBar
          size="sm"
          placeholder="Cari isi soal, tag, sumber..."
          value={searchQuery}
          onSearch={setSearchQuery}
          onClear={() => setSearchQuery("")}
          containerClassName="flex-1 min-w-0"
        />

        <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as ReviewStatus | "all")}>
          <SelectTrigger aria-label="Filter status" className="w-[110px] sm:w-[120px] h-9 text-body-sm rounded-lg shrink-0">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="generated">Generated</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="flagged">Flagged</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterCourse} onValueChange={setFilterCourse}>
          <SelectTrigger aria-label="Filter mata kuliah" className="w-[125px] sm:w-[145px] h-9 text-body-sm rounded-lg shrink-0">
            <SelectValue placeholder="Mata kuliah" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua mata kuliah</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterOrigin} onValueChange={(value) => setFilterOrigin(value as QuestionOrigin | "all")}>
          <SelectTrigger aria-label="Filter asal soal" className="w-[105px] sm:w-[115px] h-9 text-body-sm rounded-lg shrink-0">
            <SelectValue placeholder="Asal soal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua asal</SelectItem>
            <SelectItem value="zyx_original">Asli Zyx</SelectItem>
            <SelectItem value="itb_example">Contoh ITB</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterQuestionType} onValueChange={(value) => setFilterQuestionType(value as QuestionType | "all")}>
          <SelectTrigger aria-label="Filter tipe soal" className="w-[105px] sm:w-[115px] h-9 text-body-sm rounded-lg shrink-0">
            <SelectValue placeholder="Tipe soal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua tipe soal</SelectItem>
            <SelectItem value="multiple_choice">Pilihan ganda</SelectItem>
            <SelectItem value="multiple_choices">PG kompleks</SelectItem>
            <SelectItem value="short_answer">Isian singkat</SelectItem>
            <SelectItem value="essay">Uraian</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterDifficulty} onValueChange={(value) => setFilterDifficulty(value as Difficulty | "all")}>
          <SelectTrigger aria-label="Filter tingkat kesulitan" className="w-[100px] sm:w-[110px] h-9 text-body-sm rounded-lg shrink-0">
            <SelectValue placeholder="Kesulitan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kesulitan</SelectItem>
            <SelectItem value="easy">Easy</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="hard">Hard</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  aria-label="Reset filter"
                  className="size-9 p-0 rounded-lg shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset filter</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setBulkOpen(true)}
                variant="outline"
                size="sm"
                aria-label="Impor markdown"
                className="size-9 p-0 rounded-lg shrink-0"
              >
                <Upload className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Impor markdown</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setCreateOpen(true)}
                size="sm"
                aria-label="Tambah soal"
                className="size-9 p-0 rounded-lg shrink-0 bg-brand-primary text-white hover:bg-brand-primary/95 shadow-2xs"
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Tambah soal</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Bulk actions - Floating Overlay */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-xl border border-border/80 bg-background/90 backdrop-blur-md px-5 py-3.5 shadow-xl min-w-[320px] max-w-[90vw] animate-in slide-in-from-bottom-4 duration-300">
          <span className="text-body-sm font-bold text-foreground shrink-0">{selected.size} soal dipilih</span>
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
      <AdminTable>
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleAll}
              aria-label={filtered.length > 0 && filtered.every((q) => selected.has(q.id)) ? "Batalkan pilih semua" : "Pilih semua soal"}
              className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            >
              {filtered.length > 0 && filtered.every((q) => selected.has(q.id)) ? (
                <CheckSquare className="size-4 text-brand-primary" />
              ) : (
                <Square className="size-4" />
              )}
            </button>
            <span className="text-body-xs font-semibold text-muted-foreground">
              Daftar soal ({filtered.length})
            </span>
          </div>
          {totalPages > 1 && (
            <span className="text-body-xs text-muted-foreground">
              Halaman {safeCurrentPage} dari {totalPages}
            </span>
          )}
        </div>

        {filtered.length === 0 ? (
          <AdminEmptyState compact title="Tidak ada soal yang cocok dengan filter." />
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
              Menampilkan {(safeCurrentPage - 1) * PAGE_SIZE + 1} - {Math.min(safeCurrentPage * PAGE_SIZE, filtered.length)} dari {filtered.length} soal
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="size-8 p-0 rounded-lg"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-body-xs font-semibold px-2">
                {safeCurrentPage} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="size-8 p-0 rounded-lg"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Halaman berikutnya"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </AdminTable>

      {/* CREATE DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/60 shrink-0">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">Tambah Soal Manual</DialogTitle>
            <DialogDescription>Tambahkan soal pilihan ganda, isian singkat, atau essay ke bank soal secara manual.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-body-sm text-foreground">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Mata Kuliah</label>
                  <Select value={createCourseId} onValueChange={(value) => { setCreateCourseId(value); setCreateChapterId(""); setCreateIdeaLinks([]); }}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                      <SelectValue placeholder="Pilih Mata Kuliah" />
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
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Bab</label>
                  <Select value={createChapterId || "all"} onValueChange={(value) => { setCreateChapterId(value === "all" ? "" : value); setCreateIdeaLinks([]); }}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                      <SelectValue placeholder="Semua bab" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua bab</SelectItem>
                      {chaptersForCourse(createCourseId).map((chapter) => (
                        <SelectItem key={chapter.id} value={chapter.id}>
                          {chapter.code} · {chapter.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipe Soal</label>
                  <Select value={createQuestionType} onValueChange={(val) => setCreateQuestionType(val as any)}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                      <SelectValue placeholder="Pilih Tipe Soal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiple_choice">Pilihan Ganda (1 Jawaban)</SelectItem>
                      <SelectItem value="multiple_choices">Pilihan Ganda Kompleks</SelectItem>
                      <SelectItem value="short_answer">Isian Singkat</SelectItem>
                      <SelectItem value="essay">Essay / Uraian</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Tingkat Kesulitan</label>
                  <Select value={createDifficulty} onValueChange={(val) => setCreateDifficulty(val as any)}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                      <SelectValue placeholder="Pilih Kesulitan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Level kognitif</label>
                  <Select value={createCognitiveLevel} onValueChange={(value) => setCreateCognitiveLevel(value as CognitiveLevel)}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(cognitiveLevelLabel) as CognitiveLevel[]).map((level) => <SelectItem key={level} value={level}>{cognitiveLevelLabel[level]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Pola penalaran</label>
                  <Input value={createReasoningPattern} onChange={(event) => setCreateReasoningPattern(event.target.value)} placeholder="Contoh: direct_application" className="h-10 border-border/80 bg-background/50 text-body-sm font-medium" />
                </div>
              </div>

              <IdeaAssignmentFields
                idPrefix="create"
                ideas={ideasForSelection(createCourseId, createChapterId)}
                links={createIdeaLinks}
                onChange={setCreateIdeaLinks}
              />

              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Pertanyaan / Prompt (Mendukung LaTeX, contoh: $x^2$)</label>
                <Textarea
                  value={createPrompt}
                  onChange={(e) => setCreatePrompt(e.target.value)}
                  placeholder="Masukkan isi pertanyaan..."
                  rows={3}
                  className="w-full rounded-lg border border-border/80 bg-background/50 p-3 hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-sans text-body-sm font-medium"
                />
              </div>

              {(createQuestionType === "multiple_choice" || createQuestionType === "multiple_choices") && (
                <div className="space-y-3 rounded-xl border border-border bg-muted/5 p-5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Opsi pilihan dan kunci jawaban</label>
                  <p className="text-body-xs text-muted-foreground">Centang satu jawaban untuk Pilihan Ganda, atau beberapa jawaban untuk PG Kompleks.</p>
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
                          placeholder={`Masukkan Opsi ${String.fromCharCode(65 + idx)}`}
                          className="h-9 border-border/85 bg-background text-body-sm font-medium"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {createQuestionType === "short_answer" && (
                <div className="space-y-1.5 rounded-xl border border-border bg-muted/5 p-5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Jawaban Benar yang Diterima (Pisahkan dengan koma jika ada variasi)</label>
                  <Input
                    type="text"
                    value={createAcceptableAnswers}
                    onChange={(e) => setCreateAcceptableAnswers(e.target.value)}
                    placeholder="Contoh: 12, duabelas, 12.0"
                    className="h-10 border-border/85 bg-background text-body-sm font-medium"
                  />
                  <p className="text-body-xs text-muted-foreground mt-1">Siswa dianggap benar jika jawabannya cocok dengan salah satu kata kunci di atas (tidak peka huruf besar/kecil).</p>
                </div>
              )}

              {createQuestionType === "essay" && (
                <div className="p-4 rounded-xl border border-border bg-muted/5 text-body-xs text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">Soal Tipe Essay / Uraian</p>
                  Siswa akan menjawab dengan teks bebas. Tuliskan kunci jawaban referensi atau rubrik penilaian pada kolom Penjelasan Solusi di bawah.
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Penjelasan Solusi / Rubrik (Mendukung LaTeX)</label>
                <Textarea
                  value={createExplanation}
                  onChange={(e) => setCreateExplanation(e.target.value)}
                  placeholder="Mengapa opsi ini benar atau rincian poin penilaian..."
                  rows={2}
                  className="w-full rounded-lg border border-border/80 bg-background/50 p-3 hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-sans text-body-sm font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Tags (Pisahkan dengan koma)</label>
                <Input
                  type="text"
                  value={createTagsStr}
                  onChange={(e) => setCreateTagsStr(e.target.value)}
                  placeholder="limit, turunan, trigonometri"
                  className="h-10 border-border/80 bg-background text-body-sm font-medium"
                />
              </div>
            </div>

            <DialogFooter className="p-6 pt-4 border-t border-border/40 bg-muted/5 flex items-center justify-end gap-2.5 shrink-0">
              <Button type="button" variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setCreateOpen(false)} disabled={submittingCreate}>Batal</Button>
              <Button type="submit" name="reviewStatus" value="generated" variant="outline" isLoading={submittingCreate} className="rounded-lg cursor-pointer font-bold">
                Simpan draft
              </Button>
              <Button type="submit" name="reviewStatus" value="published" isLoading={submittingCreate} className="rounded-lg cursor-pointer bg-brand-primary !text-white hover:bg-brand-primary/95 font-bold px-6 shadow-sm">
                Simpan dan terbitkan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/60 shrink-0">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">Edit Soal &amp; Kunci</DialogTitle>
            <DialogDescription>Modifikasi detail pertanyaan. Menyimpan perubahan secara otomatis akan mengunci status peninjauan soal.</DialogDescription>
          </DialogHeader>
          {editingQuestion && (
            <form onSubmit={handleEditSubmit} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-body-sm text-foreground">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Mata Kuliah</label>
                    <Select value={editCourseId} onValueChange={(value) => { setEditCourseId(value); setEditChapterId(""); setEditIdeaLinks([]); }}>
                      <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"><SelectValue placeholder="Pilih Mata Kuliah" /></SelectTrigger>
                      <SelectContent>
                        {authoringCourses.map((course) => <SelectItem key={course.id} value={course.id}>{course.code} · {course.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Bab</label>
                    <Select value={editChapterId || "all"} onValueChange={(value) => { setEditChapterId(value === "all" ? "" : value); setEditIdeaLinks([]); }}>
                      <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"><SelectValue placeholder="Semua bab" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua bab</SelectItem>
                        {chaptersForCourse(editCourseId).map((chapter) => <SelectItem key={chapter.id} value={chapter.id}>{chapter.code} · {chapter.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipe Soal</label>
                    <Select value={editQuestionType} onValueChange={(val) => setEditQuestionType(val as any)}>
                      <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                        <SelectValue placeholder="Pilih Tipe Soal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="multiple_choice">Pilihan Ganda (1 Jawaban)</SelectItem>
                        <SelectItem value="multiple_choices">Pilihan Ganda Kompleks</SelectItem>
                        <SelectItem value="short_answer">Isian Singkat</SelectItem>
                        <SelectItem value="essay">Essay / Uraian</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Tingkat Kesulitan</label>
                    <Select value={editDifficulty} onValueChange={(val) => setEditDifficulty(val as any)}>
                      <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                        <SelectValue placeholder="Pilih Kesulitan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Level kognitif</label>
                    <Select value={editCognitiveLevel} onValueChange={(value) => setEditCognitiveLevel(value as CognitiveLevel)}>
                      <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(cognitiveLevelLabel) as CognitiveLevel[]).map((level) => <SelectItem key={level} value={level}>{cognitiveLevelLabel[level]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Pola penalaran</label>
                    <Input value={editReasoningPattern} onChange={(event) => setEditReasoningPattern(event.target.value)} placeholder="Contoh: direct_application" className="h-10 border-border/80 bg-background/50 text-body-sm font-medium" />
                  </div>
                </div>

                <IdeaAssignmentFields
                  idPrefix="edit"
                  ideas={ideasForSelection(editCourseId, editChapterId)}
                  links={editIdeaLinks}
                  onChange={setEditIdeaLinks}
                />

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Pertanyaan / Prompt (Mendukung LaTeX)</label>
                  <Textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Masukkan isi pertanyaan..."
                    rows={3}
                    className="w-full rounded-lg border border-border/80 bg-background/50 p-3 hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-sans text-body-sm font-medium"
                  />
                </div>

                {(editQuestionType === "multiple_choice" || editQuestionType === "multiple_choices") && (
                  <div className="space-y-3 rounded-xl border border-border bg-muted/5 p-5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Opsi pilihan dan kunci jawaban</label>
                    <p className="text-body-xs text-muted-foreground">Centang satu jawaban untuk Pilihan Ganda, atau beberapa jawaban untuk PG Kompleks.</p>
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
                            placeholder={`Opsi ${String.fromCharCode(65 + idx)}`}
                            className="h-9 border-border/85 bg-background text-body-sm font-medium"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {editQuestionType === "short_answer" && (
                  <div className="space-y-1.5 rounded-xl border border-border bg-muted/5 p-5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Jawaban Benar yang Diterima (Pisahkan dengan koma)</label>
                    <Input
                      type="text"
                      value={editAcceptableAnswers}
                      onChange={(e) => setEditAcceptableAnswers(e.target.value)}
                      placeholder="Contoh: 12, duabelas"
                      className="h-10 border-border/85 bg-background text-body-sm font-medium"
                    />
                  </div>
                )}

                {editQuestionType === "essay" && (
                  <div className="p-4 rounded-xl border border-border bg-muted/5 text-body-xs text-muted-foreground">
                    <p className="font-semibold text-foreground mb-1">Soal Tipe Essay / Uraian</p>
                    Tuliskan rubrik atau kunci jawaban referensi pada kolom Penjelasan Solusi.
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Penjelasan Solusi (Mendukung LaTeX)</label>
                  <Textarea
                    value={editExplanation}
                    onChange={(e) => setEditExplanation(e.target.value)}
                    placeholder="Mengapa opsi ini benar..."
                    rows={2}
                    className="w-full rounded-lg border border-border/80 bg-background/50 p-3 hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-sans text-body-sm font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Tags (Pisahkan dengan koma)</label>
                  <Input
                    type="text"
                    value={editTagsStr}
                    onChange={(e) => setEditTagsStr(e.target.value)}
                    placeholder="limit, turunan, trigonometri"
                    className="h-10 border-border/80 bg-background text-body-sm font-medium"
                  />
                </div>
              </div>

              <DialogFooter className="p-6 pt-4 border-t border-border/40 bg-muted/5 flex items-center justify-end gap-2.5 shrink-0">
                <Button type="button" variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setEditOpen(false)} disabled={submittingEdit}>Batal</Button>
                <Button type="submit" name="reviewStatus" value="generated" variant="outline" isLoading={submittingEdit} className="rounded-lg cursor-pointer font-bold">
                  Simpan draft
                </Button>
                <Button type="submit" name="reviewStatus" value="published" isLoading={submittingEdit} className="rounded-lg cursor-pointer bg-brand-primary !text-white hover:bg-brand-primary/95 font-bold px-6 shadow-sm">
                  Simpan dan terbitkan
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
        title="Hapus Soal"
        description="Tindakan ini tidak dapat dibatalkan. Apakah Anda yakin ingin menghapus soal ini dari Bank Soal?"
        confirmLabel="Ya, Hapus"
        loading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />

      {/* BULK UPLOAD DIALOG */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/60 shrink-0">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">Impor Soal via Markdown</DialogTitle>
            <DialogDescription>Impor banyak soal (Pilihan Ganda, Isian Singkat, atau Essay) sekaligus menggunakan file Markdown (.md).</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBulkSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-body-sm text-foreground">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Mata Kuliah</label>
                  <Select value={bulkCourseId} onValueChange={(value) => { setBulkCourseId(value); setBulkChapterId(""); setBulkIdeaLinks([]); }}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"><SelectValue placeholder="Pilih Mata Kuliah" /></SelectTrigger>
                    <SelectContent>
                      {authoringCourses.map((course) => <SelectItem key={course.id} value={course.id}>{course.code} · {course.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Bab</label>
                  <Select value={bulkChapterId || "all"} onValueChange={(value) => { setBulkChapterId(value === "all" ? "" : value); setBulkIdeaLinks([]); }}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"><SelectValue placeholder="Semua bab" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua bab</SelectItem>
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
                <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Pilih File Markdown (.md) (Opsional)</label>
                <Input
                  type="file"
                  accept=".md"
                  onChange={handleFileChange}
                  className="file:bg-muted file:text-foreground file:border-0 file:rounded-md file:px-2 file:py-1 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Konten Markdown *</span>
                  <span className="text-[10px] text-muted-foreground lowercase normal-case">Pisahkan soal dengan ## Soal 1, ## Soal 2, dst.</span>
                </label>
                <Textarea
                  required
                  value={bulkMarkdown}
                  onChange={(e) => setBulkMarkdown(e.target.value)}
                  placeholder={`## Soal 1\n**Tipe:** Pilihan Ganda\n**Kesulitan:** Sedang\n**Level Kognitif:** Menerapkan\n**Pola Penalaran:** direct_application\nTentukan hasil dari $2 + 2$.\n\nA. 3\nB. 4\nC. 5\nD. 6\n\n**Jawaban:** B\n**Pembahasan:** $2+2=4$.`}
                  rows={12}
                  className="w-full rounded-lg border border-border/80 bg-background/50 p-3 hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-mono text-body-sm leading-relaxed"
                />
              </div>
            </div>

            <DialogFooter className="p-6 pt-4 border-t border-border/40 bg-muted/5 flex items-center justify-end gap-2.5 shrink-0">
              <Button type="button" variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setBulkOpen(false)} disabled={bulkSubmitting}>Batal</Button>
              <Button type="submit" name="reviewStatus" value="generated" variant="outline" isLoading={bulkSubmitting} className="rounded-lg cursor-pointer font-bold">
                Simpan draft
              </Button>
              <Button type="submit" name="reviewStatus" value="published" isLoading={bulkSubmitting} className="rounded-lg cursor-pointer bg-brand-primary !text-white hover:bg-brand-primary/95 font-bold px-6 shadow-sm">
                Simpan dan terbitkan
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
  const [expanded, setExpanded] = useState(links.length > 0);
  const selected = new Map(links.map((link) => [link.ideaId, link]));
  const totalWeight = links.reduce((sum, link) => sum + link.weight, 0);
  const valid = hasValidIdeaWeights(links);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/5 p-5" aria-labelledby={`${idPrefix}-idea-heading`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 id={`${idPrefix}-idea-heading`} className="text-body-sm font-semibold text-foreground">Koneksi Idea</h3>
            <StatusBadge tone="muted" subtle>Opsional</StatusBadge>
          </div>
          <p className="mt-1 text-body-xs text-muted-foreground">
            {links.length > 0 ? `${links.length} Idea terhubung.` : "Biarkan kosong jika soal belum terkait Idea tertentu."}
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
          {expanded ? "Tutup" : "Atur Idea"}
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </div>

      {expanded ? (
        <div id={`${idPrefix}-idea-options`} className="space-y-3">
          {links.length > 0 ? (
            <p className={cn("text-body-xs font-semibold", valid ? "text-status-success" : "text-status-warning")}>
              Total bobot {Math.round(totalWeight * 100)}%. {valid ? "Siap disimpan." : "Bobot harus berjumlah 100%."}
            </p>
          ) : null}
          {ideas.length === 0 ? (
            <p className="rounded-lg border border-border bg-muted/30 p-3 text-body-xs text-muted-foreground">
              Belum ada Idea published untuk mata kuliah dan bab ini. Soal tetap dapat disimpan tanpa Idea.
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
                      <label htmlFor={`${idPrefix}-weight-${idea.id}`} className="text-body-xs font-medium text-muted-foreground">Bobot</label>
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
                      <label htmlFor={`${idPrefix}-role-${idea.id}`} className="text-body-xs font-medium text-muted-foreground">Peran</label>
                      <Select value={link.role} onValueChange={(role) => onChange(links.map((item) => item.ideaId === idea.id ? { ...item, role: role as IdeaRole } : item))}>
                        <SelectTrigger id={`${idPrefix}-role-${idea.id}`} className="h-8 bg-background text-body-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="primary">Primary</SelectItem>
                          <SelectItem value="supporting">Supporting</SelectItem>
                          <SelectItem value="required">Required</SelectItem>
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
  const [expanded, setExpanded] = useState(false);
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
  const qTypeLabel =
    question.questionType === "short_answer" ? "Isian Singkat" :
    question.questionType === "essay" ? "Essay" :
    question.questionType === "multiple_choices" ? "PG Kompleks" : "Pilihan Ganda";

  return (
    <div className={cn("px-4 py-4 transition-colors", selected ? "bg-muted/15" : "hover:bg-muted/5")}>
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0 cursor-pointer transition-colors"
        >
          {selected ? <CheckSquare className="size-4.5 text-brand-primary" /> : <Square className="size-4.5" />}
        </button>

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2.5 flex-wrap text-body-xs font-semibold">
            <StatusBadge
              tone={statusTone[question.reviewStatus]}
              subtle
              className={question.reviewStatus === "retired" ? "line-through" : undefined}
            >
              {question.reviewStatus}
            </StatusBadge>

            <StatusBadge tone={question.origin === "itb_example" ? "info" : "brand"} subtle>
              {question.origin === "itb_example" ? "Contoh ITB" : "Asli Zyx"}
            </StatusBadge>

            <StatusBadge tone="brand" subtle>
              {qTypeLabel}
            </StatusBadge>

            <DifficultyBadge difficulty={question.difficulty} subtle />
            <StatusBadge tone={question.ideaLinks && question.ideaLinks.length > 0 ? "success" : "muted"} subtle>
              {question.ideaLinks && question.ideaLinks.length > 0 ? `${question.ideaLinks.length} Idea` : "Tanpa Idea"}
            </StatusBadge>
            <span className="text-muted-foreground font-medium">
              {courseMap[question.courseId] ?? question.courseId}
            </span>

            <span className="text-muted-foreground ml-auto font-medium text-body-xs normal-case">
              digunakan {question.useCount}×
            </span>
          </div>

          {question.sourceEventName ? (
            <p className="mt-2 text-body-xs font-medium text-muted-foreground">Sumber: {question.sourceEventName}</p>
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
              <p className="text-body-xs font-bold text-status-success uppercase tracking-wider mb-1.5">Jawaban Benar Diterima</p>
              <div className="flex flex-wrap gap-2">
                {acceptableAnswers.map((ans: string, idx: number) => (
                  <span key={idx} className="rounded-md bg-background px-2.5 py-1 border border-status-success/30 font-mono text-body-sm font-semibold text-foreground">
                    {ans}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Solution Explanation */}
          {question.explanation && (
            <div className="rounded-xl bg-muted/20 p-4 border border-border/60">
              <p className="text-body-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                {question.questionType === "essay" ? "Rubrik / Kunci Jawaban Referensi" : "Penjelasan Solusi"}
              </p>
              <MarkdownRenderer content={question.explanation} className="text-body-sm text-foreground/80 leading-relaxed font-sans space-y-3" />
            </div>
          )}

          <div className="flex gap-2 justify-end pt-3 border-t border-border/40">
            <Button size="sm" variant="outline" className="rounded-lg gap-1.5 cursor-pointer text-body-sm font-bold" onClick={() => onEdit(question)}>
              <Edit2 className="size-3.5" /> Edit Soal &amp; Kunci
            </Button>
            <Button size="sm" variant="destructive" className="rounded-lg gap-1.5 cursor-pointer text-body-sm font-bold animate-colors" onClick={() => onDelete(question)}>
              <Trash2 className="size-3.5" /> Hapus Soal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
