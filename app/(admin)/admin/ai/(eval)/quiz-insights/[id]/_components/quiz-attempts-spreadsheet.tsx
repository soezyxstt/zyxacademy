"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Filter,
  RefreshCw,
  Info,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MathText } from "@/components/course/math-text";
import { FormattedDate } from "@/components/ui/formatted-date";
import { toast } from "@/components/ui/toast";

export interface StudentAttemptItem {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  score: number;
  durationSeconds: number;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string | null;
  submittedAt: string | null;
  questionsSnapshot: Array<{
    id: string;
    prompt?: string;
    content?: string;
    options?: string[];
    correct_indices?: number[];
    correctIndices?: number[];
    explanation?: string;
  }>;
  answersSnapshot: Record<string, any>;
}

interface Props {
  templateId: string;
  quizTitle: string;
}

export function QuizAttemptsSpreadsheet({ templateId, quizTitle }: Props) {
  const [attempts, setAttempts] = useState<StudentAttemptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Controls
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [includeInProgress, setIncludeInProgress] = useState(true);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportType, setExportType] = useState<"matrix" | "summary">("matrix");

  const loadAttempts = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/admin/quiz-insights/${templateId}/attempts?includeInProgress=${includeInProgress}`
      );
      if (res.ok) {
        const json = await res.json();
        setAttempts(json.attempts || []);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || "Gagal memuat daftar attempt.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Terjadi kesalahan koneksi saat memuat attempt.");
    } finally {
      setLoading(false);
    }
  }, [templateId, includeInProgress]);

  useEffect(() => {
    loadAttempts();
  }, [loadAttempts]);

  // Extract unique questions map across all attempts
  const questionsList = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        prompt: string;
        options: string[];
        correctIndices: number[];
      }
    >();

    for (const att of attempts) {
      for (const q of att.questionsSnapshot || []) {
        if (q.id && !map.has(q.id)) {
          const correct = Array.isArray(q.correct_indices)
            ? q.correct_indices
            : Array.isArray(q.correctIndices)
            ? q.correctIndices
            : [];
          map.set(q.id, {
            id: q.id,
            prompt: q.prompt || q.content || `Soal ${map.size + 1}`,
            options: Array.isArray(q.options) ? q.options : [],
            correctIndices: correct,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [attempts]);

  // Filtered & Searched Attempts
  const filteredAttempts = useMemo(() => {
    return attempts.filter((att) => {
      // Status filter
      if (statusFilter !== "all" && att.status !== statusFilter) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = att.studentName.toLowerCase().includes(q);
        const emailMatch = att.studentEmail.toLowerCase().includes(q);
        if (!nameMatch && !emailMatch) return false;
      }
      return true;
    });
  }, [attempts, statusFilter, searchQuery]);

  const [exportingSheets, setExportingSheets] = useState(false);

  // Trigger CSV Download via API
  const handleExportCsv = (type: "matrix" | "summary") => {
    const url = `/api/admin/quiz-insights/${templateId}/attempts?export=csv&exportType=${type}&includeInProgress=${includeInProgress}`;
    window.open(url, "_blank");
    toast.success(`Memulai pengunduhan CSV (${type === "matrix" ? "Matriks Jawaban Detail" : "Ringkasan Attempt"})...`);
    setExportDialogOpen(false);
  };

  const handleExportGoogleSheets = async (type: "matrix" | "summary") => {
    setExportingSheets(true);
    try {
      let headersRow: string[] = [];
      let rowsMatrix: (string | number)[][] = [];

      if (type === "summary") {
        headersRow = ["Attempt ID", "Nama Siswa", "Email Siswa", "Status", "Skor (%)", "Durasi (detik)", "Mulai", "Selesai"];
        rowsMatrix = filteredAttempts.map((att) => [
          att.id,
          att.studentName,
          att.studentEmail,
          att.status,
          att.score ?? 0,
          att.durationSeconds ?? 0,
          att.startedAt ? new Date(att.startedAt).toLocaleString("id-ID") : "-",
          att.submittedAt ? new Date(att.submittedAt).toLocaleString("id-ID") : "-",
        ]);
      } else {
        // Matrix export
        const allQuestions = questionsList;
        const qHeaders = allQuestions.map((q: any, idx: number) => `Q${idx + 1}: ${(q.prompt || q.content || "").slice(0, 30)}`);
        headersRow = ["Attempt ID", "Nama Siswa", "Email Siswa", "Skor (%)", ...qHeaders];

        rowsMatrix = filteredAttempts.map((att) => {
          const itemAnswers = allQuestions.map((q: any) => {
            const userChoice = att.answersSnapshot[q.id];
            if (userChoice === undefined || userChoice === null) return "TIDAK DIJAWAB";
            return String(userChoice);
          });
          return [att.id, att.studentName, att.studentEmail, att.score ?? 0, ...itemAnswers];
        });
      }

      const res = await fetch("/api/admin/export-spreadsheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "quiz",
          entityId: `${templateId}:${type}`,
          folderSubpath: "quizzes/" + quizTitle,
          title: `${quizTitle} (${type === "matrix" ? "Matrix" : "Summary"})`,
          headers: headersRow,
          rows: rowsMatrix,
        }),
      });

      const data = await res.json();
      if (data.success && data.spreadsheetUrl) {
        window.open(data.spreadsheetUrl, "_blank");
        toast.success("Google Spreadsheet berhasil dibuat!");
        setExportDialogOpen(false);
      } else {
        toast.error(data.error || "Gagal membuat Google Spreadsheet. Mengalihkan ke CSV.");
        handleExportCsv(type);
      }
    } catch (err: any) {
      toast.error(err.message || "Terjadi kesalahan koneksi Google Sheets API.");
    } finally {
      setExportingSheets(false);
    }
  };

  const formatDuration = (secs: number) => {
    if (!secs) return "0s";
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    if (mins === 0) return `${remainder}s`;
    return `${mins}m ${remainder}s`;
  };

  if (loading && attempts.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="p-12 text-center text-muted-foreground space-y-3">
          <RefreshCw className="size-8 animate-spin mx-auto text-brand-primary" />
          <p className="font-medium text-foreground">Memuat spreadsheet attempt siswa...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-4 border border-status-error/40 bg-status-error/10 text-status-error rounded-xl text-body-sm flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {/* Controls Bar */}
      <Card className="border-border">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama atau email siswa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background rounded-lg"
              />
            </div>

            {/* Filter Dropdown & Status */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="size-4 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px] rounded-lg bg-background">
                    <SelectValue placeholder="Status Attempt" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="completed">Selesai (Completed)</SelectItem>
                    <SelectItem value="in_progress">Sedang Dikerjakan</SelectItem>
                    <SelectItem value="abandoned">Ditinggalkan</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center gap-2 text-body-sm text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeInProgress}
                  onChange={(e) => setIncludeInProgress(e.target.checked)}
                  className="rounded border-border text-brand-primary focus:ring-brand-primary"
                />
                Sertakan In-Progress
              </label>

              <Button
                onClick={() => setExportDialogOpen(true)}
                className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg gap-2"
              >
                <FileSpreadsheet className="size-4" />
                Export to CSV / Spreadsheet
              </Button>
            </div>
          </div>

          {/* Quick Stats Banner */}
          <div className="flex flex-wrap items-center gap-4 text-body-sm pt-2 border-t border-border/60 text-muted-foreground">
            <div>
              Total Attempt: <span className="font-semibold text-foreground">{attempts.length}</span>
            </div>
            <div>
              Ditampilkan: <span className="font-semibold text-foreground">{filteredAttempts.length}</span>
            </div>
            <div>
              Jumlah Soal: <span className="font-semibold text-foreground">{questionsList.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Spreadsheet Data Grid */}
      <Card className="border-border overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
          <table className="w-full text-left border-collapse text-body-sm">
            <thead className="bg-muted/80 backdrop-blur sticky top-0 z-20 border-b border-border shadow-sm">
              <tr>
                <th className="p-3 font-semibold text-foreground whitespace-nowrap min-w-[200px] sticky left-0 bg-muted z-30 border-r border-border">
                  Siswa
                </th>
                <th className="p-3 font-semibold text-foreground whitespace-nowrap text-center w-[100px]">
                  Skor
                </th>
                <th className="p-3 font-semibold text-foreground whitespace-nowrap text-center w-[110px]">
                  Status
                </th>
                <th className="p-3 font-semibold text-foreground whitespace-nowrap text-center w-[100px]">
                  Durasi
                </th>
                <th className="p-3 font-semibold text-foreground whitespace-nowrap text-center w-[150px]">
                  Waktu Selesai
                </th>

                {/* Question Columns Header */}
                {questionsList.map((q, idx) => (
                  <th
                    key={q.id}
                    className="p-3 font-semibold text-foreground text-center min-w-[120px] max-w-[160px] border-l border-border/60"
                  >
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center justify-center gap-1 mx-auto hover:text-brand-primary transition-colors">
                          <span>Q{idx + 1}</span>
                          <Info className="size-3 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-4 text-body-sm space-y-2 z-50">
                        <div className="font-semibold text-foreground flex items-center justify-between">
                          <span>Soal Nomor {idx + 1}</span>
                        </div>
                        <div className="text-muted-foreground line-clamp-3 bg-muted p-2 rounded-md">
                          <MathText>{q.prompt}</MathText>
                        </div>
                        {q.options.length > 0 && (
                          <div className="space-y-1 text-body-xs">
                            <p className="font-medium text-foreground">Opsi Jawaban:</p>
                            {q.options.map((opt, oIdx) => {
                              const isCorrect = q.correctIndices.includes(oIdx);
                              return (
                                <div
                                  key={oIdx}
                                  className={`p-1.5 rounded flex items-start gap-1.5 ${
                                    isCorrect
                                      ? "bg-status-success/15 text-status-success font-medium"
                                      : "bg-background border border-border text-muted-foreground"
                                  }`}
                                >
                                  <span className="font-bold">
                                    {String.fromCharCode(65 + oIdx)}.
                                  </span>
                                  <span className="flex-1">
                                    <MathText>{opt}</MathText>
                                  </span>
                                  {isCorrect && (
                                    <CheckCircle2 className="size-3.5 shrink-0 text-status-success mt-0.5" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAttempts.length === 0 ? (
                <tr>
                  <td
                    colSpan={5 + questionsList.length}
                    className="p-12 text-center text-muted-foreground"
                  >
                    Tidak ada attempt siswa yang sesuai dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredAttempts.map((att) => {
                  const answers = att.answersSnapshot || {};

                  return (
                    <tr key={att.id} className="hover:bg-muted/40 transition-colors">
                      {/* Sticky Student Column */}
                      <td className="p-3 sticky left-0 bg-card z-10 border-r border-border min-w-[200px]">
                        <div className="font-medium text-foreground line-clamp-1">
                          {att.studentName}
                        </div>
                        <div className="text-body-xs text-muted-foreground line-clamp-1">
                          {att.studentEmail}
                        </div>
                      </td>

                      {/* Score */}
                      <td className="p-3 text-center font-bold">
                        <span
                          className={
                            att.score >= 80
                              ? "text-status-success"
                              : att.score >= 60
                              ? "text-brand-secondary"
                              : "text-status-error"
                          }
                        >
                          {att.score}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="p-3 text-center">
                        {att.status === "completed" ? (
                          <Badge variant="outline" className="bg-status-success/10 text-status-success border-status-success/30 rounded-md text-body-xs">
                            Selesai
                          </Badge>
                        ) : att.status === "in_progress" ? (
                          <Badge variant="outline" className="bg-status-warning/10 text-status-warning border-status-warning/30 rounded-md text-body-xs">
                            In Progress
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground border-border rounded-md text-body-xs">
                            Ditinggalkan
                          </Badge>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="p-3 text-center text-muted-foreground text-body-xs whitespace-nowrap">
                        {formatDuration(att.durationSeconds)}
                      </td>

                      {/* Submitted At */}
                      <td className="p-3 text-center text-muted-foreground text-body-xs whitespace-nowrap">
                        {att.submittedAt ? (
                          <FormattedDate date={att.submittedAt} />
                        ) : (
                          "-"
                        )}
                      </td>

                      {/* Dynamic Question Answer Cells */}
                      {questionsList.map((q) => {
                        const rawAns = answers[q.id];
                        let selectedIndices: number[] = [];
                        if (Array.isArray(rawAns)) {
                          selectedIndices = rawAns.filter((n) => typeof n === "number");
                        } else if (typeof rawAns === "number") {
                          selectedIndices = [rawAns];
                        }

                        const hasAnswered = selectedIndices.length > 0;
                        const isCorrect =
                          hasAnswered &&
                          selectedIndices.length === q.correctIndices.length &&
                          selectedIndices.every((idx) => q.correctIndices.includes(idx));

                        const selectedLabels = selectedIndices
                          .map((idx) => String.fromCharCode(65 + idx))
                          .join(", ");

                        return (
                          <td
                            key={q.id}
                            className="p-2 text-center border-l border-border/60 align-middle"
                          >
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  className={`w-full py-1 px-2 rounded-md text-body-xs font-semibold flex items-center justify-center gap-1 transition-transform hover:scale-105 ${
                                    !hasAnswered
                                      ? "bg-muted/60 text-muted-foreground border border-border/40"
                                      : isCorrect
                                      ? "bg-status-success/15 text-status-success border border-status-success/30"
                                      : "bg-status-error/15 text-status-error border border-status-error/30"
                                  }`}
                                >
                                  {!hasAnswered ? (
                                    <span>-</span>
                                  ) : isCorrect ? (
                                    <>
                                      <CheckCircle2 className="size-3 shrink-0" />
                                      <span>{selectedLabels}</span>
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="size-3 shrink-0" />
                                      <span>{selectedLabels}</span>
                                    </>
                                  )}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 p-3 text-body-sm space-y-2 z-50">
                                <div className="font-semibold text-foreground flex items-center justify-between border-b border-border pb-1">
                                  <span>{att.studentName}</span>
                                  <Badge
                                    variant="outline"
                                    className={`rounded-md text-body-xs ${
                                      isCorrect
                                        ? "bg-status-success/15 text-status-success border-status-success/30"
                                        : hasAnswered
                                        ? "bg-status-error/15 text-status-error border-status-error/30"
                                        : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {isCorrect ? "BENAR" : hasAnswered ? "SALAH" : "TIDAK DIJAWAB"}
                                  </Badge>
                                </div>
                                <div className="text-muted-foreground text-body-xs line-clamp-2">
                                  <MathText>{q.prompt}</MathText>
                                </div>
                                <div className="text-body-xs space-y-1 bg-muted p-2 rounded">
                                  <div>
                                    Pilihan Siswa:{" "}
                                    <span className="font-bold text-foreground">
                                      {hasAnswered ? selectedLabels : "Tidak Ada"}
                                    </span>
                                  </div>
                                  <div>
                                    Kunci Jawaban:{" "}
                                    <span className="font-bold text-status-success">
                                      {q.correctIndices
                                        .map((idx) => String.fromCharCode(65 + idx))
                                        .join(", ")}
                                    </span>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Dialog Export CSV */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-h5 font-semibold flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-brand-primary" />
              Export to CSV / Google Spreadsheet
            </DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground">
              Pilih format file CSV yang ingin diunduh untuk kuis <strong>{quizTitle}</strong>. File CSV ini kompatibel 100% dengan Google Sheets dan Microsoft Excel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div
              onClick={() => setExportType("matrix")}
              className={`p-4 rounded-xl border cursor-pointer transition-colors space-y-1 ${
                exportType === "matrix"
                  ? "border-brand-primary bg-brand-primary/10"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="font-semibold text-foreground text-body-base flex items-center justify-between">
                <span>1. Matriks Jawaban Detail (Item-Response Matrix)</span>
                {exportType === "matrix" && (
                  <CheckCircle2 className="size-4 text-brand-primary" />
                )}
              </div>
              <p className="text-body-xs text-muted-foreground">
                Menampilkan kolom per soal (Q1, Q2, ..., QN) berisi teks soal, jawaban yang dipilih siswa, dan status kebenaran (BENAR / SALAH / TIDAK DIJAWAB). Ideal untuk item analysis mendalam!
              </p>
            </div>

            <div
              onClick={() => setExportType("summary")}
              className={`p-4 rounded-xl border cursor-pointer transition-colors space-y-1 ${
                exportType === "summary"
                  ? "border-brand-primary bg-brand-primary/10"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="font-semibold text-foreground text-body-base flex items-center justify-between">
                <span>2. Ringkasan Attempt Siswa (Summary)</span>
                {exportType === "summary" && (
                  <CheckCircle2 className="size-4 text-brand-primary" />
                )}
              </div>
              <p className="text-body-xs text-muted-foreground">
                Menampilkan daftar siswa, skor akhir, status attempt, durasi pengerjaan, dan tanggal selesai pengerjaan.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setExportDialogOpen(false)}
              className="rounded-lg"
            >
              Batal
            </Button>
            <Button
              onClick={() => handleExportGoogleSheets(exportType)}
              disabled={exportingSheets}
              variant="outline"
              className="border-brand-primary/30 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 rounded-lg gap-2"
            >
              <RefreshCw className={`size-4 ${exportingSheets ? "animate-spin" : "hidden"}`} />
              <FileSpreadsheet className="size-4" />
              {exportingSheets ? "Mengekspor..." : "Export Google Sheets"}
            </Button>
            <Button
              onClick={() => handleExportCsv(exportType)}
              className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg gap-2"
            >
              <Download className="size-4" />
              Unduh CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
