"use client";

import { useState, useMemo } from "react";
import { DifficultyBadge } from "@/components/admin/status-badges";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { SearchBar } from "@/components/ui/search-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { Eye, EyeOff } from "lucide-react";

interface HistoricalQuestion {
  id: string;
  difficulty: number;
  questionMarkdown: string;
  answerMarkdown: string | null;
  sourceTitle: string;
  sourceCategory: string;
  sourceYear: number;
  courseId: string;
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

export function HistoricalQuestionsClient({ questions, courses, courseMap }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDifficulty, setFilterDifficulty] = useState("all");

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter & Search logic
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchSearch =
        q.questionMarkdown.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.sourceTitle.toLowerCase().includes(searchTerm.toLowerCase());

      const matchCourse = filterCourse === "all" || q.courseId === filterCourse;
      const matchCategory = filterCategory === "all" || q.sourceCategory === filterCategory;
      const matchDifficulty =
        filterDifficulty === "all" || q.difficulty === parseInt(filterDifficulty, 10);

      return matchSearch && matchCourse && matchCategory && matchDifficulty;
    });
  }, [questions, searchTerm, filterCourse, filterCategory, filterDifficulty]);

  return (
    <div className="space-y-6">
      {/* Filters & Search Row */}
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm lg:flex-row lg:items-center">
        <SearchBar
          placeholder="Cari konten soal atau judul ujian..."
          value={searchTerm}
          onSearch={setSearchTerm}
          onClear={() => setSearchTerm("")}
          containerClassName="flex-1 max-w-xl"
        />

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-44">
            <Select value={filterCourse} onValueChange={setFilterCourse}>
              <SelectTrigger>
                <SelectValue placeholder="Mata Kuliah" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Mata Kuliah</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-36">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                <SelectItem value="uts">UTS</SelectItem>
                <SelectItem value="uas">UAS</SelectItem>
                <SelectItem value="quiz">Quiz</SelectItem>
                <SelectItem value="tutorial">Tutorial</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-36">
            <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
              <SelectTrigger>
                <SelectValue placeholder="Tingkat Kesulitan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kesulitan</SelectItem>
                <SelectItem value="1">Easy</SelectItem>
                <SelectItem value="2">Medium</SelectItem>
                <SelectItem value="3">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <AdminTable>
        <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <AdminTableHead>
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">Soal</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">Mata Kuliah</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">Asal Ujian</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">Kesulitan</th>
              <th className="px-4 py-3 w-12 text-center font-medium text-muted-foreground text-body-sm">Detail</th>
            </tr>
          </AdminTableHead>
          <tbody>
            {filteredQuestions.length === 0 ? (
              <tr>
                <td colSpan={5} className="h-32 text-center text-body-sm text-muted-foreground px-4 py-3">
                  Tidak ada soal asesmen historis yang cocok dengan filter pencarian.
                </td>
              </tr>
            ) : (
              filteredQuestions.map((q) => {
                const isExpanded = expandedId === q.id;
                // Excerpt text for table row view
                const textExcerpt = q.questionMarkdown.length > 120
                  ? q.questionMarkdown.slice(0, 120) + "..."
                  : q.questionMarkdown;

                return (
                  <>
                    <tr key={q.id} className="group border-b border-border hover:bg-muted/50 transition-colors duration-150">
                      <td className="text-body-sm text-foreground max-w-md font-medium px-4 py-3 align-middle">
                        {isExpanded ? (
                          <div className="bg-background/40 p-3 rounded border border-border/50">
                            <MarkdownRenderer content={q.questionMarkdown} className="space-y-3" />
                          </div>
                        ) : (
                          <MathText className="line-clamp-2 block" as="div">{textExcerpt}</MathText>
                        )}
                      </td>
                      <td className="text-body-sm text-muted-foreground whitespace-nowrap px-4 py-3 align-middle">
                        {courseMap[q.courseId] || "Mata Kuliah"}
                      </td>
                      <td className="text-body-sm whitespace-nowrap px-4 py-3 align-middle">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">{q.sourceTitle}</span>
                          <span className="text-[11px] text-muted-foreground uppercase">
                            {q.sourceCategory} · {q.sourceYear}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <DifficultyBadge difficulty={q.difficulty} />
                      </td>
                      <td className="text-center px-4 py-3 align-middle">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : q.id)}
                          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isExpanded ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && q.answerMarkdown && (
                      <tr className="bg-muted/30">
                        <td colSpan={5} className="p-4 border-t border-border/30">
                          <div className="space-y-2">
                            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                              Solusi / Kunci Jawaban
                            </h4>
                            <div className="bg-status-success/5 p-4 rounded-lg border border-status-success/10 text-body-sm text-foreground">
                              <MarkdownRenderer content={q.answerMarkdown} className="space-y-3" />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </AdminTable>
    </div>
  );
}
