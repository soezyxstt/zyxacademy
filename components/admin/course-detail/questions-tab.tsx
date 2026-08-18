"use client";

import { useState } from "react";
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
} from "lucide-react";
import { SearchBar } from "@/components/ui/search-bar";
import { MathText } from "@/components/course/math-text";
import { AdminOptionLetter } from "@/components/admin/option-letter";

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
  prompt: string;
  options: unknown;
  correctIndices: unknown;
  difficulty: "easy" | "medium" | "hard";
  questionType: string;
  explanation?: string | null;
  tags?: unknown;
  createdAt: Date;
};

type Props = {
  courseId: string;
  courseTitle: string;
  chapters: Chapter[];
  initialQuestions: QuestionItem[];
};

export function QuestionsTab({
  courseId,
  courseTitle,
  chapters: _chapters,
  initialQuestions,
}: Props) {
  const [questions] = useState<QuestionItem[]>(initialQuestions);
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");

  const filteredQuestions = questions.filter((q) => {
    const matchSearch =
      !search ||
      q.prompt.toLowerCase().includes(search.toLowerCase()) ||
      (q.explanation && q.explanation.toLowerCase().includes(search.toLowerCase()));
    const matchDiff = difficultyFilter === "all" || q.difficulty === difficultyFilter;
    return matchSearch && matchDiff;
  });

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-1 items-center gap-2.5">
          <div className="flex-1 max-w-sm">
            <SearchBar
              size="sm"
              placeholder="Cari butir soal atau pembahasan..."
              value={search}
              onSearch={setSearch}
              onClear={() => setSearch("")}
            />
          </div>

          <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
            <SelectTrigger className="w-[140px] h-9 rounded-lg shrink-0">
              <SelectValue placeholder="Tingkat Kesulitan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tingkat</SelectItem>
              <SelectItem value="easy">Mudah</SelectItem>
              <SelectItem value="medium">Sedang</SelectItem>
              <SelectItem value="hard">Sulit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Link href={`/admin/questions?courseId=${courseId}`} className="shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5 rounded-lg h-9">
            <ExternalLink className="size-3.5" />
            Buka Studio Bank Soal
          </Button>
        </Link>
      </div>

      {/* Questions List */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
            <Library className="size-4 text-brand-primary" />
            Bank Soal {courseTitle} ({filteredQuestions.length})
          </h3>
        </div>

        {filteredQuestions.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <HelpCircle className="size-6 text-muted-foreground/40 mx-auto mb-1.5" />
            <p className="text-body-xs font-medium text-foreground">Tidak ada butir soal ditemukan</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Gunakan Studio Bank Soal untuk menambahkan soal ke mata kuliah ini.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredQuestions.map((q, idx) => {
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

              return (
                <div
                  key={q.id}
                  className="p-3.5 rounded-xl border border-border/80 bg-card hover:border-brand-primary/40 transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-bold text-body-xs text-brand-primary">
                        Soal #{idx + 1}
                      </span>
                      <span className="text-[11px] text-muted-foreground">ID: {q.id}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-md text-[10px] px-1.5 py-0.5 capitalize font-medium"
                    >
                      {q.difficulty}
                    </Badge>
                  </div>

                  <div className="text-body-sm text-foreground">
                    <MathText>{q.prompt}</MathText>
                  </div>

                  {optionsArr.length > 0 && (
                    <div className="space-y-1 pt-0.5">
                      {optionsArr.map((opt, optIdx) => {
                        const isCorrect = corrects.includes(optIdx);
                        return (
                          <div
                            key={optIdx}
                            className={`flex items-start gap-2 p-2 rounded-lg text-body-xs border ${
                              isCorrect
                                ? "border-status-success/40 bg-status-success/10 text-foreground font-medium"
                                : "border-border/50 text-muted-foreground"
                            }`}
                          >
                            <AdminOptionLetter index={optIdx} isCorrect={isCorrect} />
                            <div className="flex-1 min-w-0">
                              <MathText>{opt}</MathText>
                            </div>
                            {isCorrect && (
                              <span className="text-[11px] font-bold text-status-success shrink-0">
                                Benar
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.explanation && (
                    <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40 text-body-xs text-muted-foreground space-y-0.5">
                      <strong className="text-foreground text-[11px] block">Pembahasan:</strong>
                      <MathText>{q.explanation}</MathText>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

