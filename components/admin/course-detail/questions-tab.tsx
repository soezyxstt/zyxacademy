"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Search,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
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
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari kata kunci soal atau pembahasan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-lg"
            />
          </div>

          <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
            <SelectTrigger className="w-[150px] rounded-lg">
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

        <Link href={`/admin/ai/questions?courseId=${courseId}`}>
          <Button size="sm" variant="outline" className="gap-1.5 rounded-lg text-body-xs">
            <ExternalLink className="size-3.5" />
            Buka Studio Bank Soal
          </Button>
        </Link>
      </div>

      {/* Questions List */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
            <Library className="size-4 text-brand-primary" />
            Bank Soal {courseTitle} ({filteredQuestions.length})
          </h3>
        </div>

        {filteredQuestions.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-xl">
            <HelpCircle className="size-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-body-sm font-medium text-foreground">Tidak ada butir soal ditemukan</p>
            <p className="text-body-xs text-muted-foreground mt-1">
              Gunakan Studio Bank Soal atau Generasi AI untuk menambahkan soal ke mata kuliah ini.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
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
                  className="p-4 rounded-xl border border-border/80 bg-card hover:border-brand-primary/40 transition-all space-y-3"
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
                      className="rounded-md text-[11px] capitalize font-medium"
                    >
                      {q.difficulty}
                    </Badge>
                  </div>

                  <div className="text-body-sm text-foreground">
                    <MathText text={q.prompt} />
                  </div>

                  {optionsArr.length > 0 && (
                    <div className="space-y-1.5 pt-1">
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
                              <MathText text={opt} />
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
                    <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40 text-body-xs text-muted-foreground space-y-1">
                      <strong className="text-foreground block">Pembahasan:</strong>
                      <MathText text={q.explanation} />
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
