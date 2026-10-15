"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
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
  Library,
  ExternalLink,
  HelpCircle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  BookOpenCheck,
} from "lucide-react";
import { SearchBar } from "@/components/ui/search-bar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MathText } from "@/components/course/math-text";
import { AdminOptionLetter } from "@/components/admin/option-letter";
import { DifficultyBadge } from "@/components/admin/status-badges";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";

type Chapter = {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
};

type QuestionItem = {
  id: string;
  courseId: string;
  chapterId?: string | null;
  origin?: "zyx_original" | "historical_reference" | "itb_example" | null;
  sourceEventName?: string | null;
  sourceQuestionNumber?: string | null;
  sourceQuestionPart?: string | null;
  prompt: string;
  options: unknown;
  correctIndices: unknown;
  difficulty: "easy" | "medium" | "hard";
  questionType: string;
  explanation?: string | null;
  tags?: unknown;
  createdAt: Date | string | number;
};

type Props = {
  courseId: string;
  courseTitle: string;
  chapters: Chapter[];
  initialQuestions: QuestionItem[];
};

/**
 * Tab component for course-level question management and inspection.
 *
 * Displays course question catalog with origin sub-tabs (Zyx original vs historical reference),
 * search filtering, difficulty selection, accessible pagination, and safe deletion.
 */
export function QuestionsTab({
  courseId,
  chapters: _chapters,
  initialQuestions,
}: Props) {
  const [questions, setQuestions] = useState<QuestionItem[]>(initialQuestions);
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [originTab, setOriginTab] = useState<"all" | "zyx" | "reference">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deletingQuestion, setDeletingQuestion] = useState<QuestionItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Counts for each origin category
  const zyxCount = useMemo(
    () => questions.filter((q) => q.origin === "zyx_original").length,
    [questions]
  );
  const refCount = useMemo(
    () => questions.filter((q) => q.origin === "historical_reference" || q.origin === "itb_example").length,
    [questions]
  );

  // Filtered list
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      // Tab filter
      if (originTab === "zyx" && q.origin !== "zyx_original") return false;
      if (originTab === "reference" && q.origin !== "historical_reference" && q.origin !== "itb_example") return false;

      // Difficulty filter
      if (difficultyFilter !== "all" && q.difficulty !== difficultyFilter) return false;

      // Search filter
      const trimmed = search.trim();
      if (!trimmed) return true;
      const term = trimmed.toLowerCase();
      const matchPrompt = q.prompt.toLowerCase().includes(term);
      const matchExpl = q.explanation ? q.explanation.toLowerCase().includes(term) : false;
      const matchSource = q.sourceEventName ? q.sourceEventName.toLowerCase().includes(term) : false;
      return matchPrompt || matchExpl || matchSource;
    });
  }, [questions, originTab, difficultyFilter, search]);

  // Pagination calculations
  const totalItems = filteredQuestions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedQuestions = useMemo(() => {
    const startIndex = (validPage - 1) * pageSize;
    return filteredQuestions.slice(startIndex, startIndex + pageSize);
  }, [filteredQuestions, validPage, pageSize]);

  const handleTabChange = (val: string) => {
    setOriginTab(val as "all" | "zyx" | "reference");
    setCurrentPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
  };

  const handleDifficultyChange = (val: string) => {
    setDifficultyFilter(val);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (val: string) => {
    setPageSize(Number(val));
    setCurrentPage(1);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingQuestion) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/questions/${deletingQuestion.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Gagal menghapus soal.");
      }
      setQuestions((prev) => prev.filter((q) => q.id !== deletingQuestion.id));
      toast.success("Soal berhasil dihapus.");
      setDeletingQuestion(null);
    } catch (err: any) {
      toast.error(err.message || "Gagal menghapus soal.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Origin Filter Tabs */}
      <Tabs value={originTab} onValueChange={handleTabChange} syncUrl={false}>
        <TabsList className="bg-muted/40 border border-border rounded-xl p-1">
          <TabsTrigger value="all" className="text-body-sm font-medium">
            Semua Soal ({questions.length})
          </TabsTrigger>
          <TabsTrigger value="zyx" className="text-body-sm font-medium flex items-center gap-1.5">
            <BookOpenCheck className="size-3.5 text-brand-primary" />
            Soal Asli Zyx ({zyxCount})
          </TabsTrigger>
          <TabsTrigger value="reference" className="text-body-sm font-medium flex items-center gap-1.5">
            <BookOpen className="size-3.5 text-muted-foreground" />
            Referensi Historis ({refCount})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Toolbar Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          size="sm"
          placeholder="Cari butir soal, pembahasan, atau sumber..."
          value={search}
          onSearch={handleSearchChange}
          onClear={() => handleSearchChange("")}
          containerClassName="flex-1 min-w-[160px]"
        />

        <Select value={difficultyFilter} onValueChange={handleDifficultyChange}>
          <SelectTrigger className="w-[140px] h-9 text-body-sm rounded-lg shrink-0">
            <SelectValue placeholder="Tingkat Kesulitan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Tingkat</SelectItem>
            <SelectItem value="easy">Mudah</SelectItem>
            <SelectItem value="medium">Sedang</SelectItem>
            <SelectItem value="hard">Sulit</SelectItem>
          </SelectContent>
        </Select>

        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
          <SelectTrigger className="w-[120px] h-9 text-body-sm rounded-lg shrink-0">
            <SelectValue placeholder="Per Halaman" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 per hal.</SelectItem>
            <SelectItem value="25">25 per hal.</SelectItem>
            <SelectItem value="50">50 per hal.</SelectItem>
          </SelectContent>
        </Select>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href={`/admin/questions?courseId=${courseId}`} className="shrink-0">
                <Button size="sm" variant="outline" className="size-9 p-0 rounded-lg shrink-0" aria-label="Buka Studio Bank Soal">
                  <ExternalLink className="size-4" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent>Buka Studio Bank Soal</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Questions Container */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
            <Library className="size-4 text-brand-primary" />
            Bank soal ({totalItems})
          </h2>
          <span className="text-body-xs text-muted-foreground">
            Menampilkan {totalItems === 0 ? 0 : (validPage - 1) * pageSize + 1} - {Math.min(validPage * pageSize, totalItems)} dari {totalItems}
          </span>
        </div>

        {paginatedQuestions.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-xl">
            <HelpCircle className="size-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-body-sm font-medium text-foreground">Tidak ada butir soal yang sesuai</p>
            <p className="text-body-xs text-muted-foreground mt-0.5">
              Ubah pencarian atau filter kesulitan.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {paginatedQuestions.map((q, idx) => {
              const questionIndex = (validPage - 1) * pageSize + idx + 1;

              let optionsArr: string[] = [];
              if (Array.isArray(q.options)) {
                optionsArr = q.options;
              } else if (typeof q.options === "string") {
                try {
                  optionsArr = JSON.parse(q.options);
                } catch {
                  optionsArr = [];
                }
              }

              let corrects: number[] = [];
              if (Array.isArray(q.correctIndices)) {
                corrects = q.correctIndices;
              } else if (typeof q.correctIndices === "string") {
                try {
                  corrects = JSON.parse(q.correctIndices);
                } catch {
                  corrects = [];
                }
              }

              const isReference = q.origin === "historical_reference" || q.origin === "itb_example";

              return (
                <div
                  key={q.id}
                  className="py-4 first:pt-1 last:pb-1 space-y-3"
                >
                  {/* Top Metadata Row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading font-bold text-body-sm text-foreground">
                        Soal #{questionIndex}
                      </span>
                      {isReference ? (
                        <Badge variant="outline" className="rounded-md text-body-xs font-normal bg-muted/40 border-border text-foreground">
                          {q.sourceEventName ? q.sourceEventName : "Referensi Historis"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-md text-body-xs font-normal border-brand-primary/30 text-brand-primary">
                          Soal Asli Zyx
                        </Badge>
                      )}
                      <DifficultyBadge difficulty={q.difficulty} />
                    </div>

                    {q.origin === "zyx_original" && (
                      <div className="flex items-center gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="size-8 p-0 text-muted-foreground hover:text-status-error"
                                onClick={() => setDeletingQuestion(q)}
                                aria-label="Hapus Soal"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Hapus Soal</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                  </div>

                  {/* Question Prompt */}
                  <div className="text-body-base text-foreground leading-relaxed">
                    <MathText>{q.prompt}</MathText>
                  </div>

                  {/* Options */}
                  {optionsArr.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {optionsArr.map((opt, optIdx) => {
                        const isCorrect = corrects.includes(optIdx);
                        return (
                          <div
                            key={optIdx}
                            className={`flex items-start gap-2 p-2.5 rounded-lg text-body-sm border ${
                              isCorrect
                                ? "border-status-success/50 bg-status-success/10 text-foreground font-medium"
                                : "border-border/60 text-muted-foreground"
                            }`}
                          >
                            <AdminOptionLetter index={optIdx} isCorrect={isCorrect} />
                            <div className="flex-1 min-w-0">
                              <MathText>{opt}</MathText>
                            </div>
                            {isCorrect && (
                              <span className="text-body-xs font-bold text-status-success shrink-0">
                                Benar
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Explanation */}
                  {q.explanation && (
                    <div className="p-3 rounded-lg bg-muted/20 border border-border/40 text-body-sm text-muted-foreground space-y-1">
                      <strong className="text-foreground text-body-xs block">Pembahasan:</strong>
                      <MathText>{q.explanation}</MathText>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <nav
            aria-label="Navigasi halaman bank soal"
            className="flex items-center justify-between pt-3 border-t border-border/60"
          >
            <p className="text-body-xs text-muted-foreground">
              Halaman {validPage} dari {totalPages}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-body-xs rounded-lg"
                disabled={validPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="size-3.5 mr-1" />
                Sebelumnya
              </Button>
              <div className="hidden sm:flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (validPage <= 3) {
                    pageNum = i + 1;
                  } else if (validPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = validPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={validPage === pageNum ? "default" : "outline"}
                      size="sm"
                      className="size-8 p-0 text-body-xs rounded-lg"
                      onClick={() => setCurrentPage(pageNum)}
                      aria-current={validPage === pageNum ? "page" : undefined}
                      aria-label={`Halaman ${pageNum}`}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-body-xs rounded-lg"
                disabled={validPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Halaman berikutnya"
              >
                Berikutnya
                <ChevronRight className="size-3.5 ml-1" />
              </Button>
            </div>
          </nav>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AdminConfirmDialog
        open={Boolean(deletingQuestion)}
        onOpenChange={(open) => {
          if (!open) setDeletingQuestion(null);
        }}
        title="Hapus Butir Soal"
        description="Apakah Anda yakin ingin menghapus butir soal ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel={isDeleting ? "Menghapus..." : "Hapus"}
        destructive={true}
        loading={isDeleting}
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
      />
    </div>
  );
}
