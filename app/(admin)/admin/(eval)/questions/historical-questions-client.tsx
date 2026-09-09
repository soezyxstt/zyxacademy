"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  CheckSquare,
  Eye,
  EyeOff,
  Flag,
  Square,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { DifficultyBadge, StatusBadge } from "@/components/admin/status-badges";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { SearchBar } from "@/components/ui/search-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";

type ReviewStatus = "generated" | "reviewed" | "published" | "flagged" | "retired";
type Difficulty = "easy" | "medium" | "hard";
type CanonicalStatus = "draft" | "in_review" | "published" | "retired";
type ReviewActionStatus = "reviewed" | "flagged";

interface HistoricalOption {
  id?: string;
  text: string;
  isCorrect?: boolean;
}

interface HistoricalQuestion {
  id: string;
  difficulty: Difficulty;
  questionMarkdown: string;
  answerMarkdown: string | null;
  options: unknown[] | null;
  questionType: "multiple_choice" | "multiple_choices" | "short_answer" | "essay";
  sourceTitle: string;
  sourceCategory: string;
  sourceYear: number | null;
  courseId: string;
  reviewStatus: ReviewStatus;
  canonicalStatus: CanonicalStatus;
  quizEligible: boolean;
  sourceQuestionNumber: string | null;
  sourceQuestionPart: string | null;
  sourcePage: number | null;
  answerProvenance: "official" | "source_solution" | "zyx_generated" | "unavailable" | null;
  solutionProvenance: "official" | "source_solution" | "zyx_generated" | "unavailable" | null;
}

interface Course {
  id: string;
  title: string;
}

interface Props {
  questions: HistoricalQuestion[];
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

const statusLabel: Record<ReviewStatus, string> = {
  generated: "Belum ditinjau",
  reviewed: "Ditinjau",
  published: "Published",
  flagged: "Perlu perhatian",
  retired: "Retired",
};

const categoryLabel: Record<string, string> = {
  tutorial: "Tutorial",
  quiz: "Quiz",
  uts: "UTS",
  uas: "UAS",
  tryout: "Tryout",
  homework: "Tugas",
  exercise: "Latihan",
  other: "Lainnya",
};

const provenanceLabel: Record<NonNullable<HistoricalQuestion["answerProvenance"]>, string> = {
  official: "Jawaban resmi",
  source_solution: "Dokumen pembahasan",
  zyx_generated: "Generated Zyx",
  unavailable: "Belum tersedia",
};

function normalizeOptions(value: unknown): HistoricalOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (typeof option === "string") return [{ text: option }];
    if (!option || typeof option !== "object" || !("text" in option) || typeof option.text !== "string") return [];
    return [{
      id: "id" in option && typeof option.id === "string" ? option.id : undefined,
      text: option.text,
      isCorrect: "isCorrect" in option && typeof option.isCorrect === "boolean" ? option.isCorrect : undefined,
    }];
  });
}

function reviewActionFor(question: HistoricalQuestion): { status: ReviewActionStatus; label: string } | null {
  if (question.reviewStatus === "generated" || question.reviewStatus === "flagged") {
    return { status: "reviewed", label: "Tandai ditinjau" };
  }
  if (question.reviewStatus === "reviewed") {
    return { status: "flagged", label: "Tandai perlu perhatian" };
  }
  return null;
}

export function HistoricalQuestionsClient({ questions, courses, courseMap }: Props) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDifficulty, setFilterDifficulty] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [localQuestions, setLocalQuestions] = useState(questions);
  const [updating, setUpdating] = useState(false);

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return localQuestions.filter((question) => {
      const searchableText = [
        question.questionMarkdown,
        question.sourceTitle,
        question.sourceQuestionNumber,
        question.sourceQuestionPart,
        courseMap[question.courseId],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
      const matchCourse = filterCourse === "all" || question.courseId === filterCourse;
      const matchCategory = filterCategory === "all" || question.sourceCategory === filterCategory;
      const matchDifficulty = filterDifficulty === "all" || question.difficulty === filterDifficulty;
      return matchSearch && matchCourse && matchCategory && matchDifficulty;
    });
  }, [courseMap, filterCategory, filterCourse, filterDifficulty, localQuestions, searchTerm]);

  const reviewableQuestions = filteredQuestions.filter((question) => reviewActionFor(question));
  const allReviewableSelected = reviewableQuestions.length > 0 && reviewableQuestions.every((question) => selected.has(question.id));

  function toggleSelect(id: string) {
    const question = localQuestions.find((item) => item.id === id);
    if (!question || !reviewActionFor(question)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allReviewableSelected) reviewableQuestions.forEach((question) => next.delete(question.id));
      else reviewableQuestions.forEach((question) => next.add(question.id));
      return next;
    });
  }

  async function updateReviewStatus(ids: string[], reviewStatus: ReviewActionStatus) {
    if (ids.length === 0) {
      toast.error("Pilih minimal satu soal yang dapat ditinjau.");
      return;
    }
    setUpdating(true);
    try {
      const response = await fetch("/api/admin/questions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, reviewStatus }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Gagal memperbarui status review.");
        return;
      }
      setLocalQuestions((current) => current.map((question) => ids.includes(question.id)
        ? { ...question, reviewStatus, canonicalStatus: "in_review" }
        : question));
      setSelected(new Set());
      toast.success(reviewStatus === "reviewed" ? "Soal ditandai sudah ditinjau." : "Soal ditandai perlu perhatian.");
      router.refresh();
    } catch {
      toast.error("Terjadi kesalahan koneksi saat memperbarui review.");
    } finally {
      setUpdating(false);
    }
  }

  const hasActiveFilters = Boolean(searchTerm.trim() || filterCourse !== "all" || filterCategory !== "all" || filterDifficulty !== "all");

  function resetFilters() {
    setSearchTerm("");
    setFilterCourse("all");
    setFilterCategory("all");
    setFilterDifficulty("all");
    setSelected(new Set());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          size="sm"
          placeholder="Cari isi soal atau sumber..."
          value={searchTerm}
          onSearch={setSearchTerm}
          onClear={() => setSearchTerm("")}
          containerClassName="min-w-[140px] flex-1"
        />
        <Select value={filterCourse} onValueChange={setFilterCourse}>
          <SelectTrigger aria-label="Filter mata kuliah" className="h-9 w-[150px] shrink-0 rounded-lg text-body-sm sm:w-[170px]">
            <SelectValue placeholder="Mata kuliah" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua mata kuliah</SelectItem>
            {courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger aria-label="Filter kategori sumber" className="h-9 w-[120px] shrink-0 rounded-lg text-body-sm sm:w-[135px]">
            <SelectValue placeholder="Kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kategori</SelectItem>
            {Object.entries(categoryLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
          <SelectTrigger aria-label="Filter tingkat kesulitan" className="h-9 w-[120px] shrink-0 rounded-lg text-body-sm sm:w-[135px]">
            <SelectValue placeholder="Kesulitan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kesulitan</SelectItem>
            <SelectItem value="easy">Easy</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="hard">Hard</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters ? (
          <Button type="button" variant="outline" size="sm" onClick={resetFilters} className="h-9 rounded-lg text-body-sm">
            Reset filter
          </Button>
        ) : null}
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/80 bg-background/90 px-4 py-3 shadow-sm">
          <span className="text-body-sm font-semibold text-foreground">{selected.size} soal dipilih</span>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button type="button" size="sm" variant="outline" className="rounded-lg text-body-sm" onClick={() => updateReviewStatus([...selected], "reviewed")} disabled={updating}>
              <CheckCircle2 className="size-4" /> Tandai ditinjau
            </Button>
            <Button type="button" size="sm" variant="outline" className="rounded-lg text-body-sm" onClick={() => updateReviewStatus([...selected], "flagged")} disabled={updating}>
              <Flag className="size-4" /> Perlu perhatian
            </Button>
          </div>
        </div>
      ) : null}

      <AdminTable>
        {filteredQuestions.length === 0 ? (
          <AdminEmptyState compact title="Tidak ada soal referensi historis yang cocok dengan filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <AdminTableHead>
                <tr>
                  <th className="w-10 px-4 py-3 text-center text-body-sm font-medium text-muted-foreground">
                    <button type="button" onClick={toggleAll} aria-label={allReviewableSelected ? "Batalkan pilih semua" : "Pilih semua soal yang dapat ditinjau"} className="text-muted-foreground hover:text-foreground">
                      {allReviewableSelected ? <CheckSquare className="size-4 text-brand-primary" /> : <Square className="size-4" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-muted-foreground">Soal</th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-muted-foreground">Mata kuliah</th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-muted-foreground">Sumber</th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-muted-foreground">Status</th>
                  <th className="w-12 px-4 py-3 text-center text-body-sm font-medium text-muted-foreground">Detail</th>
                </tr>
              </AdminTableHead>
              <tbody>
                {filteredQuestions.map((question) => {
                  const isExpanded = expandedId === question.id;
                  const reviewAction = reviewActionFor(question);
                  const textExcerpt = question.questionMarkdown.length > 140
                    ? question.questionMarkdown.slice(0, 140) + "..."
                    : question.questionMarkdown;
                  return (
                    <tr key={question.id} className="border-b border-border transition-colors duration-150 hover:bg-muted/50">
                      <td className="px-4 py-3 text-center align-top">
                        {reviewAction ? (
                          <button type="button" onClick={() => toggleSelect(question.id)} aria-label={"Pilih soal " + (question.sourceQuestionNumber || question.id)} className="mt-1 text-muted-foreground hover:text-foreground">
                            {selected.has(question.id) ? <CheckSquare className="size-4 text-brand-primary" /> : <Square className="size-4" />}
                          </button>
                        ) : <span className="text-body-xs text-muted-foreground">-</span>}
                      </td>
                      <td className="max-w-md px-4 py-3 align-top text-body-sm font-medium text-foreground">
                        {isExpanded ? (
                          <div className="rounded border border-border/50 bg-background/40 p-3">
                            <MarkdownRenderer content={question.questionMarkdown} className="space-y-3" />
                          </div>
                        ) : <MathText className="block line-clamp-2" as="div">{textExcerpt}</MathText>}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <DifficultyBadge difficulty={question.difficulty} subtle />
                          <StatusBadge tone={question.quizEligible ? "success" : "muted"} subtle>
                            {question.quizEligible ? "Layak kuis" : "Referensi saja"}
                          </StatusBadge>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top text-body-sm text-muted-foreground">{courseMap[question.courseId] || "Mata kuliah"}</td>
                      <td className="whitespace-nowrap px-4 py-3 align-top text-body-sm">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">{question.sourceTitle}</span>
                          <span className="text-body-xs text-muted-foreground">
                            {categoryLabel[question.sourceCategory] ?? question.sourceCategory}
                            {question.sourceYear ? " · " + question.sourceYear : ""}
                            {question.sourceQuestionNumber ? " · Soal " + question.sourceQuestionNumber + (question.sourceQuestionPart || "") : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusBadge tone={statusTone[question.reviewStatus]} subtle>{statusLabel[question.reviewStatus]}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-center align-top">
                        <button type="button" onClick={() => setExpandedId(isExpanded ? null : question.id)} aria-label={isExpanded ? "Sembunyikan detail soal" : "Lihat detail soal"} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                          {isExpanded ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminTable>

      {filteredQuestions.map((question) => {
        if (expandedId !== question.id) return null;
        const options = normalizeOptions(question.options);
        const reviewAction = reviewActionFor(question);
        return (
          <section key={"detail-" + question.id} className="space-y-4 rounded-xl border border-border/70 bg-card/75 p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
              <div>
                <p className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Detail referensi historis</p>
                <p className="mt-1 text-body-sm font-semibold text-foreground">{question.sourceTitle}</p>
              </div>
              {reviewAction ? (
                <Button type="button" size="sm" variant="outline" className="rounded-lg text-body-sm" onClick={() => updateReviewStatus([question.id], reviewAction.status)} disabled={updating}>
                  {reviewAction.status === "reviewed" ? <CheckCircle2 className="size-4" /> : <Flag className="size-4" />}
                  {reviewAction.label}
                </Button>
              ) : <StatusBadge tone="muted" subtle>Tidak ada aksi review</StatusBadge>}
            </div>
            {options.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option, index) => (
                  <div key={option.id ?? question.id + "-option-" + index} className={option.isCorrect ? "flex gap-3 rounded-lg border border-status-success/20 bg-status-success/5 px-3.5 py-2.5 text-body-sm text-status-success" : "flex gap-3 rounded-lg border border-border/30 bg-muted/5 px-3.5 py-2.5 text-body-sm text-muted-foreground"}>
                    <span className="shrink-0 font-bold">{String.fromCharCode(65 + index)}.</span>
                    <MarkdownRenderer content={option.text} className="flex-1 space-y-3 leading-relaxed" />
                    {option.isCorrect ? <Check className="size-4 shrink-0" aria-label="Jawaban sumber" /> : null}
                  </div>
                ))}
              </div>
            ) : null}
            {question.answerMarkdown ? (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="mb-1.5 text-body-xs font-bold uppercase tracking-wide text-muted-foreground">Jawaban / pembahasan sumber</p>
                <MarkdownRenderer content={question.answerMarkdown} className="space-y-3 text-body-sm leading-relaxed text-foreground/80" />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-body-xs text-muted-foreground">
              <span>Jawaban: {question.answerProvenance ? provenanceLabel[question.answerProvenance] : "Belum tercatat"}</span>
              <span>Pembahasan: {question.solutionProvenance ? provenanceLabel[question.solutionProvenance] : "Belum tercatat"}</span>
              {question.sourcePage ? <span>Halaman {question.sourcePage}</span> : null}
              <span>Status canonical: {question.canonicalStatus}</span>
            </div>
          </section>
        );
      })}
    </div>
  );
}
