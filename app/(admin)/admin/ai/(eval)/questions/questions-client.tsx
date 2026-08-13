"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckSquare, Square, ChevronDown, ChevronUp, Filter, Plus, Edit2, Trash2, Lock, Cpu, Upload } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { DifficultyBadge, StatusBadge } from "@/components/admin/status-badges";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/ui/search-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";

type ReviewStatus = "generated" | "reviewed" | "published" | "flagged" | "retired";
type Difficulty = "easy" | "medium" | "hard";
type QuestionOrigin = "zyx_original" | "itb_example";

interface Question {
  id: string;
  courseId: string;
  origin: QuestionOrigin;
  sourceEventName: string | null;
  sourceReferenceId: string | null;
  difficulty: Difficulty;
  questionType: string;
  tags: unknown;
  prompt: string;
  options: unknown;
  correctIndices: unknown;
  acceptableAnswers?: unknown;
  explanation: string;
  reviewStatus: ReviewStatus;
  qualityScore: number | null;
  useCount: number;
  createdAt: Date;
  knowledgeObjectId?: string | null;
  generationHash?: string | null;
}

interface Course {
  id: string;
  title: string;
}

interface Props {
  questions: Question[];
  courses: Course[];
  courseMap: Record<string, string>;
}

const statusTone: Record<ReviewStatus, "muted" | "info" | "success" | "warning" | "error"> = {
  generated: "muted",
  reviewed: "info",
  published: "success",
  flagged: "warning",
  retired: "error",
};

const provenanceEnabled = process.env.NEXT_PUBLIC_FEATURE_QUESTION_PROVENANCE_V1 === "1";

export function QuestionBankClient({ questions, courses, courseMap }: Props) {
  const router = useRouter();

  // Bulk Upload State
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCourseId, setBulkCourseId] = useState(courses[0]?.id || "");
  const [bulkMarkdown, setBulkMarkdown] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const [filterStatus, setFilterStatus] = useState<ReviewStatus | "all">("all");
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterOrigin, setFilterOrigin] = useState<QuestionOrigin | "all">("all");
  const [filterKOId, setFilterKOId] = useState("");
  const [filterBloom, setFilterBloom] = useState("all");
  const [filterBlueprint, setFilterBlueprint] = useState("all");
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
  const [createCourseId, setCreateCourseId] = useState(courses[0]?.id || "");
  const [createPrompt, setCreatePrompt] = useState("");
  const [createQuestionType, setCreateQuestionType] = useState<"multiple_choice" | "multiple_choices" | "short_answer" | "essay">("multiple_choice");
  const [createOptions, setCreateOptions] = useState<string[]>(["", "", "", "", ""]);
  const [createCorrectIndex, setCreateCorrectIndex] = useState<number>(0);
  const [createAcceptableAnswers, setCreateAcceptableAnswers] = useState("");
  const [createExplanation, setCreateExplanation] = useState("");
  const [createDifficulty, setCreateDifficulty] = useState<Difficulty>("medium");
  const [createTagsStr, setCreateTagsStr] = useState("");
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Edit Form State
  const [editPrompt, setEditPrompt] = useState("");
  const [editQuestionType, setEditQuestionType] = useState<"multiple_choice" | "multiple_choices" | "short_answer" | "essay">("multiple_choice");
  const [editOptions, setEditOptions] = useState<string[]>(["", "", "", "", ""]);
  const [editCorrectIndex, setEditCorrectIndex] = useState<number>(0);
  const [editAcceptableAnswers, setEditAcceptableAnswers] = useState("");
  const [editExplanation, setEditExplanation] = useState("");
  const [editDifficulty, setEditDifficulty] = useState<Difficulty>("medium");
  const [editTagsStr, setEditTagsStr] = useState("");
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const filtered = useMemo(() => {
    return localQuestions.filter((q) => {
      if (filterStatus !== "all" && q.reviewStatus !== filterStatus) return false;
      if (filterCourse !== "all" && q.courseId !== filterCourse) return false;
      if (provenanceEnabled && filterOrigin !== "all" && q.origin !== filterOrigin) return false;
      if (filterKOId && (!q.knowledgeObjectId || !q.knowledgeObjectId.toLowerCase().includes(filterKOId.toLowerCase()))) return false;
      
      const tagsList = Array.isArray(q.tags) ? (q.tags as string[]) : [];
      if (filterBloom !== "all" && !tagsList.some(t => t.toLowerCase() === filterBloom.toLowerCase())) return false;
      if (filterBlueprint !== "all" && !tagsList.some(t => t.toLowerCase().includes(filterBlueprint.toLowerCase()))) return false;
      
      return true;
    });
  }, [localQuestions, filterStatus, filterCourse, filterOrigin, filterKOId, filterBloom, filterBlueprint]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
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
    setEditPrompt(q.prompt);
    setEditQuestionType((q.questionType as any) || "multiple_choice");
    const opts = Array.isArray(q.options) ? [...q.options] : ["", "", "", "", ""];
    while (opts.length < 5) opts.push("");
    setEditOptions(opts.slice(0, 5));
    const correctIdxs = Array.isArray(q.correctIndices) ? q.correctIndices : [];
    setEditCorrectIndex(correctIdxs[0] ?? 0);
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

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createPrompt.trim()) return toast.error("Prompt soal wajib diisi.");
    
    if (createQuestionType === "multiple_choice" || createQuestionType === "multiple_choices") {
      if (createOptions.some(opt => !opt.trim())) return toast.error("Semua 5 pilihan opsi harus diisi.");
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
          prompt: createPrompt,
          questionType: createQuestionType,
          options: createQuestionType === "short_answer" || createQuestionType === "essay" ? [] : createOptions,
          correctIndices: createQuestionType === "short_answer" || createQuestionType === "essay" ? [] : [createCorrectIndex],
          acceptableAnswers,
          explanation: createExplanation,
          difficulty: createDifficulty,
          tags,
          reviewStatus: "published",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal membuat soal");
      }

      const newQ = await res.json();
      toast.success("Soal manual berhasil ditambahkan!");
      
      const createdQuestion: Question = {
        id: newQ.id,
        courseId: createCourseId,
        origin: "zyx_original",
        sourceEventName: null,
        sourceReferenceId: null,
        difficulty: createDifficulty,
        questionType: createQuestionType,
        tags,
        prompt: createPrompt,
        options: createQuestionType === "short_answer" || createQuestionType === "essay" ? [] : createOptions,
        correctIndices: createQuestionType === "short_answer" || createQuestionType === "essay" ? [] : [createCorrectIndex],
        acceptableAnswers,
        explanation: createExplanation,
        reviewStatus: "published",
        qualityScore: 1.0,
        useCount: 0,
        createdAt: new Date(),
      };
      
      setLocalQuestions(prev => [createdQuestion, ...prev]);
      setCreateOpen(false);
      
      setCreatePrompt("");
      setCreateOptions(["", "", "", "", ""]);
      setCreateCorrectIndex(0);
      setCreateAcceptableAnswers("");
      setCreateExplanation("");
      setCreateTagsStr("");
    } catch (err: any) {
      toast.error(err.message || "Gagal membuat soal");
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkCourseId) return toast.error("Silakan pilih mata kuliah.");
    if (!bulkMarkdown.trim()) return toast.error("Konten markdown tidak boleh kosong.");

    try {
      setBulkSubmitting(true);
      const res = await fetch("/api/admin/questions/bulk-markdown", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: bulkCourseId,
          rawMarkdown: bulkMarkdown,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Berhasil mengimpor soal.");
        setBulkOpen(false);
        setBulkMarkdown("");
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

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    if (!editPrompt.trim()) return toast.error("Prompt soal wajib diisi.");

    if (editQuestionType === "multiple_choice" || editQuestionType === "multiple_choices") {
      if (editOptions.some(opt => !opt.trim())) return toast.error("Semua 5 pilihan opsi harus diisi.");
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
          prompt: editPrompt,
          questionType: editQuestionType,
          options: editQuestionType === "short_answer" || editQuestionType === "essay" ? [] : editOptions,
          correctIndices: editQuestionType === "short_answer" || editQuestionType === "essay" ? [] : [editCorrectIndex],
          acceptableAnswers,
          explanation: editExplanation,
          difficulty: editDifficulty,
          tags,
          reviewStatus: "published",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal menyimpan perubahan");
      }

      toast.success("Soal berhasil diperbarui dan dikunci!");
      
      setLocalQuestions(prev =>
        prev.map(item =>
          item.id === editingQuestion.id
            ? {
                ...item,
                prompt: editPrompt,
                questionType: editQuestionType,
                options: editQuestionType === "short_answer" || editQuestionType === "essay" ? [] : editOptions,
                correctIndices: editQuestionType === "short_answer" || editQuestionType === "essay" ? [] : [editCorrectIndex],
                acceptableAnswers,
                explanation: editExplanation,
                difficulty: editDifficulty,
                tags,
                reviewStatus: "published",
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
    }
  };

  return (
    <div className="font-sans space-y-6">
      
      {/* Filters and Action */}
      <div className="space-y-4 pb-4 border-b border-border/80 text-left">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="size-4 shrink-0" />
          <span className="text-body-sm font-semibold">Filter Pencarian &amp; Curation Grid</span>
        </div>

        <div className={cn("grid grid-cols-1 gap-3 md:grid-cols-3", provenanceEnabled ? "xl:grid-cols-6" : "xl:grid-cols-5")}>
          <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as any)}>
            <SelectTrigger className="h-9 border-border/80 bg-background/50 text-body-sm font-medium">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="generated">Generated</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
              <SelectItem value="retired">Retired</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterCourse} onValueChange={setFilterCourse}>
            <SelectTrigger className="h-9 border-border/80 bg-background/50 text-body-sm font-medium">
              <SelectValue placeholder="Kursus" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kursus</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {provenanceEnabled ? <Select value={filterOrigin} onValueChange={(value) => setFilterOrigin(value as QuestionOrigin | "all")}>
            <SelectTrigger className="h-9 border-border/80 bg-background/50 text-body-sm font-medium">
              <SelectValue placeholder="Asal soal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua asal</SelectItem>
              <SelectItem value="zyx_original">Asli Zyx</SelectItem>
              <SelectItem value="itb_example">Contoh ITB</SelectItem>
            </SelectContent>
          </Select> : null}

          <Select value={filterBloom} onValueChange={setFilterBloom}>
            <SelectTrigger className="h-9 border-border/80 bg-background/50 text-body-sm font-medium">
              <SelectValue placeholder="Tingkat Kognitif (Bloom)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kognitif</SelectItem>
              <SelectItem value="remember">remember</SelectItem>
              <SelectItem value="understand">understand</SelectItem>
              <SelectItem value="apply">apply</SelectItem>
              <SelectItem value="analyze">analyze</SelectItem>
              <SelectItem value="evaluate">evaluate</SelectItem>
              <SelectItem value="create">create</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterBlueprint} onValueChange={setFilterBlueprint}>
            <SelectTrigger className="h-9 border-border/80 bg-background/50 text-body-sm font-medium">
              <SelectValue placeholder="Tipe Blueprint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Blueprint</SelectItem>
              <SelectItem value="concept">Conceptual Check</SelectItem>
              <SelectItem value="formula">Formula Application</SelectItem>
              <SelectItem value="misconception">Misconception Rebuttal</SelectItem>
            </SelectContent>
          </Select>

          <SearchBar
            size="sm"
            placeholder="Cari ID KO..."
            value={filterKOId}
            onSearch={setFilterKOId}
            onClear={() => setFilterKOId("")}
            containerClassName="sm:w-48"
          />
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <span className="text-body-sm text-muted-foreground font-medium bg-muted/65 border border-border/30 px-2.5 py-0.5 rounded-md">
            Menampilkan {filtered.length} Soal
          </span>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setBulkOpen(true)}
              variant="outline"
              className="rounded-lg flex items-center gap-1.5 cursor-pointer text-body-sm font-bold shadow-sm px-4 py-2 border-border/80 hover:bg-muted transition-all"
            >
              <Upload className="size-4" /> Impor via Markdown
            </Button>
            <Button
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-brand-primary !text-white hover:bg-brand-primary/95 flex items-center gap-1.5 cursor-pointer text-body-sm font-bold shadow-sm px-4 py-2 interactive transition-all"
            >
              <Plus className="size-4" /> Tambah Soal Manual
            </Button>
          </div>
        </div>
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
                className="rounded-lg text-xs cursor-pointer border-border/60 hover:bg-muted font-bold capitalize transition-all"
                onClick={() => bulkUpdate(s)}
                disabled={updating}
              >
                Set {s}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center gap-3 py-3 border border-border bg-muted px-4 rounded-t-xl">
        <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0 transition-colors">
          {selected.size === filtered.length && filtered.length > 0 ? (
            <CheckSquare className="size-4 text-brand-primary" />
          ) : (
            <Square className="size-4" />
          )}
        </button>
        <span className="text-body-xs font-bold text-muted-foreground uppercase tracking-wider">
          Daftar Soal Pelajaran
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-body-sm border-x border-b border-border/60 rounded-b-xl bg-card">
          Tidak ada soal yang cocok dengan filter.
        </div>
      ) : (
        <div className="divide-y divide-border/60 border-x border-b border-border/60 rounded-b-xl overflow-hidden bg-card">
          {filtered.map((q) => (
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

      {/* CREATE DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/60 shrink-0">
            <DialogTitle className="font-heading text-h6 font-bold text-foreground">Tambah Soal Manual</DialogTitle>
            <DialogDescription>Tambahkan soal pilihan ganda, isian singkat, atau essay ke bank soal secara manual.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-body-sm text-foreground">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Mata Kuliah</label>
                  <Select value={createCourseId} onValueChange={setCreateCourseId}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                      <SelectValue placeholder="Pilih Mata Kuliah" />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title}
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

              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Pertanyaan / Prompt (Mendukung LaTeX, contoh: $x^2$)</label>
                <textarea
                  value={createPrompt}
                  onChange={(e) => setCreatePrompt(e.target.value)}
                  placeholder="Masukkan isi pertanyaan..."
                  rows={3}
                  className="w-full rounded-lg border border-border/80 bg-background/50 p-3 hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-sans text-body-sm font-medium"
                />
              </div>

              {(createQuestionType === "multiple_choice" || createQuestionType === "multiple_choices") && (
                <div className="space-y-3 rounded-xl border border-border bg-muted/5 p-5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Opsi Pilihan (Isi Kelima Opsi & Pilih Opsi yang Benar)</label>
                  <div className="space-y-2.5">
                    <RadioGroup
                      value={String(createCorrectIndex)}
                      onValueChange={(val) => setCreateCorrectIndex(Number(val))}
                    >
                      {createOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <RadioGroupItem
                            id={`create-correct-option-${idx}`}
                            value={String(idx)}
                            className="size-4 text-brand-primary cursor-pointer"
                          />
                          <label
                            htmlFor={`create-correct-option-${idx}`}
                            className="font-bold text-muted-foreground text-body-sm w-4 text-center cursor-pointer"
                          >
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
                    </RadioGroup>
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
                  <p className="text-xs text-muted-foreground mt-1">Siswa dianggap benar jika jawabannya cocok dengan salah satu kata kunci di atas (tidak peka huruf besar/kecil).</p>
                </div>
              )}

              {createQuestionType === "essay" && (
                <div className="p-4 rounded-xl border border-border bg-muted/5 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">Soal Tipe Essay / Uraian</p>
                  Siswa akan menjawab dengan teks bebas. Tuliskan kunci jawaban referensi atau rubrik penilaian pada kolom Penjelasan Solusi di bawah.
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Penjelasan Solusi / Rubrik (Mendukung LaTeX)</label>
                <textarea
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
              <Button type="button" variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setCreateOpen(false)}>Batal</Button>
              <Button type="submit" isLoading={submittingCreate} className="rounded-lg cursor-pointer bg-brand-primary !text-white hover:bg-brand-primary/95 font-bold px-6 shadow-sm">
                Simpan Soal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/60 shrink-0">
            <DialogTitle className="font-heading text-h6 font-bold text-foreground">Edit Soal &amp; Kunci</DialogTitle>
            <DialogDescription>Modifikasi detail pertanyaan. Menyimpan perubahan secara otomatis akan mengunci status peninjauan soal.</DialogDescription>
          </DialogHeader>
          {editingQuestion && (
            <form onSubmit={handleEditSubmit} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-body-sm text-foreground">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Pertanyaan / Prompt (Mendukung LaTeX)</label>
                  <textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Masukkan isi pertanyaan..."
                    rows={3}
                    className="w-full rounded-lg border border-border/80 bg-background/50 p-3 hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-sans text-body-sm font-medium"
                  />
                </div>

                {(editQuestionType === "multiple_choice" || editQuestionType === "multiple_choices") && (
                  <div className="space-y-3 rounded-xl border border-border bg-muted/5 p-5">
                    <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Opsi Pilihan (Isi Kelima Opsi & Pilih Opsi yang Benar)</label>
                    <div className="space-y-2.5">
                      <RadioGroup
                        value={String(editCorrectIndex)}
                        onValueChange={(val) => setEditCorrectIndex(Number(val))}
                      >
                        {editOptions.map((opt, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            <RadioGroupItem
                              id={`edit-correct-option-${idx}`}
                              value={String(idx)}
                              className="size-4 text-brand-primary cursor-pointer"
                            />
                            <label
                              htmlFor={`edit-correct-option-${idx}`}
                              className="font-bold text-muted-foreground text-body-sm w-4 text-center cursor-pointer"
                            >
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
                      </RadioGroup>
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
                  <div className="p-4 rounded-xl border border-border bg-muted/5 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground mb-1">Soal Tipe Essay / Uraian</p>
                    Tuliskan rubrik atau kunci jawaban referensi pada kolom Penjelasan Solusi.
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Penjelasan Solusi (Mendukung LaTeX)</label>
                  <textarea
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
                <Button type="button" variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setEditOpen(false)}>Batal</Button>
                <Button type="submit" isLoading={submittingEdit} className="rounded-lg cursor-pointer bg-brand-primary !text-white hover:bg-brand-primary/95 font-bold px-6 shadow-sm">
                  Simpan Perubahan &amp; Kunci
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* DELETE DIALOG */}
      <AdminConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus Soal"
        description="Tindakan ini tidak dapat dibatalkan. Apakah Anda yakin ingin menghapus soal ini dari Bank Soal?"
        confirmLabel="Ya, Hapus"
        onConfirm={handleDeleteConfirm}
      />

      {/* BULK UPLOAD DIALOG */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border/60 shrink-0">
            <DialogTitle className="font-heading text-h6 font-bold text-foreground">Impor Soal via Markdown</DialogTitle>
            <DialogDescription>Impor banyak soal (Pilihan Ganda, Isian Singkat, atau Essay) sekaligus menggunakan file Markdown (.md).</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBulkSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-body-sm text-foreground">
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Mata Kuliah</label>
                <Select value={bulkCourseId} onValueChange={setBulkCourseId}>
                  <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
                    <SelectValue placeholder="Pilih Mata Kuliah" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                <textarea
                  required
                  value={bulkMarkdown}
                  onChange={(e) => setBulkMarkdown(e.target.value)}
                  placeholder={`## Soal 1\n**Tipe:** Pilihan Ganda\n**Kesulitan:** Sedang\nTentukan hasil dari $2 + 2$.\n\nA. 3\nB. 4\nC. 5\nD. 6\n\n**Jawaban:** B\n**Pembahasan:** $2+2=4$.\n\n## Soal 2\n**Tipe:** Isian Singkat\n**Kesulitan:** Mudah\nBerapakah 5 + 7?\n\n**Jawaban:** 12, duabelas\n\n## Soal 3\n**Tipe:** Essay\n**Kesulitan:** Sulit\nJelaskan Hukum III Newton!\n\n**Kunci Jawaban:** Setiap aksi ada reaksi yang sama besar dan berlawanan arah.`}
                  rows={12}
                  className="w-full rounded-lg border border-border/80 bg-background/50 p-3 hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-mono text-xs leading-relaxed"
                />
              </div>
            </div>

            <DialogFooter className="p-6 pt-4 border-t border-border/40 bg-muted/5 flex items-center justify-end gap-2.5 shrink-0">
              <Button type="button" variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setBulkOpen(false)}>Batal</Button>
              <Button type="submit" isLoading={bulkSubmitting} className="rounded-lg cursor-pointer bg-brand-primary !text-white hover:bg-brand-primary/95 font-bold px-6 shadow-sm">
                Impor Sekarang
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
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

  // Edit Lock determination
  const isLocked = question.reviewStatus === "reviewed" || question.reviewStatus === "published";

  // Dynamic QC Validation warnings calculated client-side
  const qcWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!question.prompt.includes("$")) {
      warnings.push("⚠️ Kualitas Rendah: Tidak menggunakan LaTeX ($)");
    }
    if (question.explanation.length < 50 && question.questionType !== "short_answer") {
      warnings.push("⚠️ Kualitas Rendah: Penjelasan terlalu singkat (<50 karakter)");
    }
    const promptLower = question.prompt.toLowerCase();
    if ((promptLower.includes("gaya") || promptLower.includes("massa") || promptLower.includes("kecepatan")) && 
        (!question.prompt.includes("kg") && !question.prompt.includes("m/s") && !question.prompt.includes("N"))) {
      warnings.push("⚠️ Kelengkapan: Soal fisika terdeteksi tanpa satuan standar SI (kg, m/s, N)");
    }
    return warnings;
  }, [question]);

  return (
    <div className={cn("py-4 transition-colors px-4 border-b border-border/55 last:border-b-0", selected ? "bg-muted/15" : "hover:bg-muted/5")}>
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
              className={question.reviewStatus === "retired" ? "line-through" : undefined}
            >
              {question.reviewStatus}
            </StatusBadge>

            {provenanceEnabled ? <StatusBadge tone={question.origin === "itb_example" ? "info" : "brand"}>
              {question.origin === "itb_example" ? "Contoh ITB" : "Asli Zyx"}
            </StatusBadge> : null}

            <span className="rounded-md bg-brand-primary/10 text-brand-primary border border-brand-primary/20 px-2 py-0.5 text-xs font-semibold">
              {qTypeLabel}
            </span>
            
            {/* Tutor edit lock badge */}
            {isLocked && (
              <span className="rounded-md bg-status-warning/10 text-status-warning border border-status-warning/20 px-2 py-0.5 text-xs font-semibold flex items-center gap-1">
                <Lock className="size-3" /> Locked
              </span>
            )}

            <DifficultyBadge difficulty={question.difficulty} />
            <span className="text-muted-foreground font-medium bg-muted/40 px-1.5 py-0.5 rounded-md">
              {courseMap[question.courseId] ?? question.courseId}
            </span>
            
            <span className="text-muted-foreground ml-auto font-medium text-xs normal-case">
              digunakan {question.useCount}×
            </span>
          </div>

          {provenanceEnabled && question.origin === "itb_example" && question.sourceEventName ? (
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

          {/* Tags list */}
          <div className="flex gap-1.5 flex-wrap mt-2.5">
            {tags.length > 0 && tags.map((t) => (
              <span key={t} className="rounded bg-muted/65 border border-border/20 px-1.5 py-0.5 text-body-xs font-semibold text-muted-foreground/90">
                #{t}
              </span>
            ))}
          </div>

          {/* QC warnings box if fails criteria */}
          {qcWarnings.length > 0 && (
            <div className="mt-2.5 space-y-1">
              {qcWarnings.map((w, idx) => (
                <div key={idx} className="text-body-xs text-status-error bg-status-error/5 px-2 py-0.5 rounded border border-status-error/10 font-medium inline-block mr-2">
                  {w}
                </div>
              ))}
            </div>
          )}
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

          {/* AI Provenance details box */}
          <div className="rounded-xl bg-muted/40 p-4 border border-border/50 space-y-2 text-xs text-muted-foreground">
            <span className="font-bold text-foreground flex items-center gap-1.5 border-b border-border pb-1.5 mb-2">
              <Cpu className="size-3.5 text-primary" /> Detail Provenansi Generasi (RAG)
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono">
              <div>
                <span className="font-sans font-semibold text-foreground block">ID Objek Pengetahuan (KO)</span>
                <span className="text-xs select-all">{question.knowledgeObjectId || "Tidak Terhubung (Input Manual)"}</span>
              </div>
              <div>
                <span className="font-sans font-semibold text-foreground block">Model Generator</span>
                <span>{question.knowledgeObjectId ? "gemini-2.5-flash" : "N/A (Tutor Created)"}</span>
              </div>
              <div>
                <span className="font-sans font-semibold text-foreground block">Hash Keandalan</span>
                <span className="text-xs select-all">{question.generationHash || "N/A"}</span>
              </div>
              <div>
                <span className="font-sans font-semibold text-foreground block">Kualitas Penilaian</span>
                <span>{question.qualityScore != null ? `${question.qualityScore.toFixed(2)} / 1.00` : "Belum diverifikasi"}</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2 justify-end pt-3 border-t border-border/40">
            <Button size="sm" variant="outline" className="rounded-lg gap-1.5 cursor-pointer text-xs font-bold" onClick={() => onEdit(question)}>
              <Edit2 className="size-3.5" /> Edit Soal &amp; Kunci
            </Button>
            <Button size="sm" variant="destructive" className="rounded-lg gap-1.5 cursor-pointer text-xs font-bold animate-colors" onClick={() => onDelete(question)}>
              <Trash2 className="size-3.5" /> Hapus Soal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
