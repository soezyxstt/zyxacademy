"use client";

import { Skeleton } from "@/components/ui/skeleton";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronDown,
  ListFilter,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Info,
  Users,
  AlertTriangle,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/search-bar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useSpreadsheetExport } from "@/components/admin/spreadsheet-export";
import { useTranslations } from "next-intl";

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
  translationNamespace?: string;
}

function formatSnapshotAnswer(answer: unknown, options: string[] | undefined): string {
  if (typeof answer === "number") {
    return options?.[answer] ?? String.fromCharCode(65 + answer);
  }
  if (typeof answer === "string") return answer;
  if (Array.isArray(answer)) {
    return answer.map((choice) => formatSnapshotAnswer(choice, options)).filter(Boolean).join(", ");
  }
  if (answer && typeof answer === "object") {
    const { text, fileName } = answer as Record<string, unknown>;
    return [text, fileName].filter((value) => typeof value === "string" && value.trim()).join(" ");
  }
  return "";
}

export function QuizAttemptsSpreadsheet({ templateId, quizTitle, translationNamespace = "adminEval" }: Props) {
  const t = useTranslations(translationNamespace);
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
        setErrorMsg(t("quizAttempts.loadFailed"));
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(t("quizAttempts.connectionError"));
    } finally {
      setLoading(false);
    }
  }, [templateId, includeInProgress, t]);

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

  const { sheetControls, confirmDialog, resultPanel, runExport } = useSpreadsheetExport({
    scope: `${templateId}:${exportType}`, entityType: "quiz", enabled: translationNamespace === "adminEval",
    onError: (message) => {
      toast.error(message);
    },
  });

  const handleExportGoogleSheets = (type: "matrix" | "summary") => {
    let headersRow: string[] = [];
    let rowsMatrix: (string | number)[][] = [];

    if (type === "summary") {
      headersRow = [t("quizAttempts.export.attemptId"), t("quizAttempts.export.studentName"), t("quizAttempts.export.studentEmail"), t("quizAttempts.export.status"), t("quizAttempts.export.score"), t("quizAttempts.export.duration"), t("quizAttempts.export.started"), t("quizAttempts.export.submitted")];
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
      headersRow = [t("quizAttempts.export.attemptId"), t("quizAttempts.export.studentName"), t("quizAttempts.export.studentEmail"), t("quizAttempts.export.score"), ...qHeaders];

      rowsMatrix = filteredAttempts.map((att) => {
        const itemAnswers = allQuestions.map((q: any) => {
          const userChoice = att.answersSnapshot[q.id];
          if (userChoice === undefined || userChoice === null) return t("quizAttempts.unanswered");
          return String(userChoice);
        });
        return [att.id, att.studentName, att.studentEmail, att.score ?? 0, ...itemAnswers];
      });
    }

    runExport({
      entityType: "quiz",
      entityId: `${templateId}:${type}`,
      folderSubpath: "quizzes/" + quizTitle,
      title: `${quizTitle} (${type === "matrix" ? t("quizAttempts.matrix") : t("quizAttempts.summary")})`,
      headers: headersRow,
      rows: rowsMatrix,
    }, Boolean(searchQuery.trim()) || statusFilter !== "all" || !includeInProgress);
  };

  const formatDuration = (secs: number) => {
    if (!secs) return t("quizAttempts.durationSeconds", { seconds: 0 });
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    if (mins === 0) return t("quizAttempts.durationSeconds", { seconds: remainder });
    return t("quizAttempts.durationMinutesSeconds", { minutes: mins, seconds: remainder });
  };

  if (loading && attempts.length === 0) {
    return (
      <div role="status" aria-label={t("quizAttempts.loading")} className="space-y-6">
        <div className="flex items-center gap-2"><Skeleton className="size-9" /><Skeleton className="size-9" /><Skeleton className="ml-auto h-9 w-28" /></div>
        <div className="divide-y divide-border border-y border-border md:hidden">
          {[0, 1, 2].map((row) => (
            <div key={row} className="space-y-2 py-3">
              <div className="flex justify-between gap-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-16" /></div>
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
        <div className="hidden overflow-hidden border-y border-border md:block"><div className="flex gap-4 border-b border-border bg-muted p-3"><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-16" /><Skeleton className="hidden h-4 w-24 sm:block" /></div><div className="divide-y divide-border">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex gap-4 p-3"><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-16" /><Skeleton className="hidden h-4 w-24 sm:block" /></div>)}</div></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="p-4 border border-status-error/40 bg-status-error/10 text-status-error rounded-xl text-body-sm flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      <section aria-label={t("quizAttempts.filters")} className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <SearchBar
            collapsible
            size="sm"
            containerClassName="min-w-[140px]"
            placeholder={t("quizAttempts.search")}
            value={searchQuery}
            onSearch={setSearchQuery}
            onClear={() => setSearchQuery("")}
          />
          <Popover>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button type="button" size="icon-lg" variant={statusFilter !== "all" || !includeInProgress ? "secondary" : "ghost"} aria-label={t("quizAttempts.filters")}>
                      <ListFilter aria-hidden />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>{t("quizAttempts.filters")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <PopoverContent align="start" className="max-w-[calc(100vw-2rem)] space-y-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger variant="inline" aria-label={t("quizAttempts.status")}>
                  <SelectValue placeholder={t("quizAttempts.status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("quizAttempts.allStatuses")}</SelectItem>
                  <SelectItem value="completed">{t("quizAttempts.completed")}</SelectItem>
                  <SelectItem value="in_progress">{t("quizAttempts.inProgress")}</SelectItem>
                  <SelectItem value="abandoned">{t("quizAttempts.abandoned")}</SelectItem>
                </SelectContent>
              </Select>

              <label className="flex items-center gap-2 text-body-sm text-muted-foreground cursor-pointer select-none">
                <Checkbox
                  checked={includeInProgress}
                  onCheckedChange={(checked) => setIncludeInProgress(Boolean(checked))}
                  className="rounded-sm border-border text-brand-primary data-[state=checked]:bg-brand-primary data-[state=checked]:border-brand-primary"
                />
                {t("quizAttempts.includeInProgress")}
              </label>

            </PopoverContent>
          </Popover>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="text-body-xs tabular-nums text-muted-foreground" aria-live="polite">
            {t("quizAttempts.attempts")} {filteredAttempts.length}{filteredAttempts.length !== attempts.length ? ` / ${attempts.length}` : ""}
          </span>
          {translationNamespace === "adminEval" && <Button type="button" size="lg" onClick={() => setExportDialogOpen(true)}>
            <FileSpreadsheet aria-hidden />
            {t("quizAttempts.export")}
          </Button>}
        </div>
      </section>
      {resultPanel}

      <div className="divide-y divide-border border-y border-border md:hidden">
        {filteredAttempts.length === 0 ? (
          <AdminEmptyState
            icon={Users}
            title={t(attempts.length === 0 ? "quizAttempts.noAttempts" : "quizAttempts.noFilteredAttempts")}
          />
        ) : filteredAttempts.map((attempt) => (
          <Collapsible key={attempt.id} className="space-y-2 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <p className="font-heading text-body-sm font-semibold">{attempt.studentName}</p>
                <p className="text-body-xs text-muted-foreground">{attempt.studentEmail}</p>
              </div>
              <Badge variant="outline" className="shrink-0">
                {t(attempt.status === "completed" ? "quizAttempts.completed" : attempt.status === "in_progress" ? "quizAttempts.inProgress" : "quizAttempts.abandoned")}
              </Badge>
            </div>
            <dl className="flex flex-wrap gap-x-3 gap-y-1 text-body-xs">
              <div className="flex gap-1">
                <dt className="text-muted-foreground">{t("quizAttempts.score")}</dt>
                <dd className="font-semibold">{attempt.score}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-muted-foreground">{t("quizAttempts.duration")}</dt>
                <dd>{formatDuration(attempt.durationSeconds)}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-muted-foreground">{t("quizAttempts.submittedAt")}</dt>
                <dd>{attempt.submittedAt ? <FormattedDate date={attempt.submittedAt} /> : "-"}</dd>
              </div>
            </dl>
            {attempt.questionsSnapshot?.length > 0 && (
              <>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="group" aria-description={attempt.studentName}>
                    <ChevronDown aria-hidden className="group-aria-expanded:rotate-180" />
                    {t("quizAttempts.questions")} ({attempt.questionsSnapshot.length})
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ol className="max-h-80 divide-y divide-border overflow-y-auto border-t border-border">
                    {attempt.questionsSnapshot.map((question, index) => {
                      const answer = formatSnapshotAnswer(attempt.answersSnapshot?.[question.id], question.options);
                      const key = formatSnapshotAnswer(question.correct_indices ?? question.correctIndices, question.options);
                      return (
                        <li key={question.id} className="space-y-1 py-2 text-body-xs [overflow-wrap:anywhere]">
                          <p className="font-semibold">{t("quizAttempts.questionNumber", { number: index + 1 })}</p>
                          <div><MathText>{question.prompt || question.content || ""}</MathText></div>
                          <p>{t("quizAttempts.studentChoice")} {answer ? <MathText>{answer}</MathText> : t("quizAttempts.none")}</p>
                          {key && <p>{t("quizAttempts.answerKey")} <MathText>{key}</MathText></p>}
                        </li>
                      );
                    })}
                  </ol>
                </CollapsibleContent>
              </>
            )}
          </Collapsible>
        ))}
      </div>

      {/* Spreadsheet Data Grid */}
      <div className="hidden border-y border-border md:block">
        <div className="relative max-h-[600px] overflow-auto">
          <table className="w-full text-left border-collapse text-body-sm">
            <thead className="sticky top-0 z-20 border-b border-border bg-muted shadow-sm">
              <tr>
                <th className="p-3 font-semibold text-foreground whitespace-nowrap min-w-[200px] sticky left-0 bg-muted z-30 border-r border-border">
                  {t("quizAttempts.student")}
                </th>
                <th className="p-3 font-semibold text-foreground whitespace-nowrap text-center w-[100px]">
                  {t("quizAttempts.score")}
                </th>
                <th className="p-3 font-semibold text-foreground whitespace-nowrap text-center w-[110px]">
                  {t("quizAttempts.status")}
                </th>
                <th className="p-3 font-semibold text-foreground whitespace-nowrap text-center w-[100px]">
                  {t("quizAttempts.duration")}
                </th>
                <th className="p-3 font-semibold text-foreground whitespace-nowrap text-center w-[150px]">
                  {t("quizAttempts.submittedAt")}
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
                      <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] p-4 text-body-sm space-y-2 z-50">
                        <div className="font-semibold text-foreground flex items-center justify-between">
                          <span>{t("quizAttempts.questionNumber", { number: idx + 1 })}</span>
                        </div>
                        <div className="text-muted-foreground line-clamp-3 bg-muted p-2 rounded-md">
                          <MathText>{q.prompt}</MathText>
                        </div>
                        {q.options.length > 0 && (
                          <div className="space-y-1 text-body-xs">
                            <p className="font-medium text-foreground">{t("quizAttempts.answerOptions")}</p>
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
                    {t("quizAttempts.noFilteredAttempts")}
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
                                    {isCorrect ? t("quizAttempts.correct") : hasAnswered ? t("quizAttempts.incorrect") : t("quizAttempts.unanswered")}
                                  </Badge>
                                </div>
                                <div className="text-muted-foreground text-body-xs line-clamp-2">
                                  <MathText>{q.prompt}</MathText>
                                </div>
                                <div className="text-body-xs space-y-1 bg-muted p-2 rounded">
                                  <div>
                                    {t("quizAttempts.studentChoice")}{" "}
                                    <span className="font-bold text-foreground">
                                      {hasAnswered ? selectedLabels : t("quizAttempts.none")}
                                    </span>
                                  </div>
                                  <div>
                                    {t("quizAttempts.answerKey")}{" "}
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
      </div>

      {/* Spreadsheet export */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-semibold flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-brand-primary" />
              {t("quizAttempts.exportTitle")}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {t("quizAttempts.exportDescription", { quizTitle })}
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
                <span>{t("quizAttempts.matrixTitle")}</span>
                {exportType === "matrix" && (
                  <CheckCircle2 className="size-4 text-brand-primary" />
                )}
              </div>
              <p className="text-body-xs text-muted-foreground">
                {t("quizAttempts.matrixDescription")}
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
                <span>{t("quizAttempts.summaryTitle")}</span>
                {exportType === "summary" && (
                  <CheckCircle2 className="size-4 text-brand-primary" />
                )}
              </div>
              <p className="text-body-xs text-muted-foreground">
                {t("quizAttempts.summaryDescription")}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setExportDialogOpen(false)}
              className="rounded-lg"
            >
              {t("quizAttempts.cancel")}
            </Button>
            {sheetControls(() => handleExportGoogleSheets(exportType), !filteredAttempts.length)}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}
