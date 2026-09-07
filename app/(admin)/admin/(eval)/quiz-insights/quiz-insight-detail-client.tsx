"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  BrainCircuit,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Target,
  RefreshCw,
  Lightbulb,
  FileSpreadsheet,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge, BetaBadge } from "@/components/ui/badge";
import { FormattedDate } from "@/components/ui/formatted-date";
import { MathText } from "@/components/course/math-text";
import { QuizAttemptsSpreadsheet } from "@/app/(admin)/admin/(eval)/quiz-insights/[id]/_components/quiz-attempts-spreadsheet";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { DifficultyBadge } from "@/components/admin/status-badges";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";

export interface QuizDetailResponse {
  template: {
    id: string;
    title: string;
    category: string;
    courseId: string;
    courseName: string;
    timeLimitSeconds: number | null;
    status: string;
    createdAt: string;
  };
  summary: {
    totalStarted: number;
    totalCompleted: number;
    completionRate: number;
    avgScore: number;
    minScore: number;
    maxScore: number;
    medianScore: number;
    avgDurationSeconds: number;
    scoreRanges: {
      range0_20: number;
      range21_40: number;
      range41_60: number;
      range61_80: number;
      range81_100: number;
    };
  };
  questionAnalysis: Array<{
    questionId: string;
    prompt: string;
    options: string[];
    correctIndices: number[];
    tags: string[];
    difficulty: string;
    explanation?: string;
    distractorMap?: any[];
    totalAnswers: number;
    correctCount: number;
    accuracyRate: number;
    optionCounts: Record<number, number>;
  }>;
  conceptAnalysis: Array<{
    tag: string;
    totalAnswered: number;
    correctCount: number;
    accuracyRate: number;
  }>;
  latestAiInsight: {
    id: string;
    sampleSize: number;
    summary: string;
    insights: {
      summaryOverview: string;
      misconceptions: Array<{
        concept: string;
        description: string;
        frequency: "high" | "medium" | "low";
        targetedQuestions?: string[];
      }>;
      teachingRecommendations: Array<{
        topic: string;
        actionItem: string;
        rationale: string;
      }>;
      hardestQuestionsAnalysis: Array<{
        questionId: string;
        promptSnippet: string;
        accuracyRate: number;
        diagnosis: string;
        distractorTrap: string;
      }>;
      easiestQuestionsAnalysis: Array<{
        questionId: string;
        promptSnippet: string;
        accuracyRate: number;
        reason: string;
      }>;
      actionableNextSteps: string[];
    };
    createdAt: string;
  } | null;
}

export interface QuizInsightDetailClientProps {
  quizId: string;
  lockedCourse?: {
    id: string;
    slug: string;
    title: string;
  };
  backHref?: string;
  backLabel?: string;
}

export function QuizInsightDetailClient({
  quizId,
  lockedCourse,
  backHref = "/admin/quiz-insights",
  backLabel = "Analisis & Insight Kuis",
}: QuizInsightDetailClientProps) {
  const [data, setData] = useState<QuizDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [activeTab, setActiveTab] = useUrlTab("tab", "ai-insights");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/quiz-insights/${encodeURIComponent(quizId)}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || "Gagal mengambil data kuis.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Terjadi kesalahan saat memuat data kuis.");
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleRunAiAnalysis = async () => {
    setAnalyzingAi(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/quiz-insights/${encodeURIComponent(quizId)}/analyze`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchDetail();
      } else {
        const err = await res.json();
        setErrorMsg(err.error || "Gagal menjalankan analisis performa.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Terjadi kesalahan saat memproses analisis.");
    } finally {
      setAnalyzingAi(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-body-sm text-muted-foreground space-y-3">
        <RefreshCw className="size-8 animate-spin mx-auto text-brand-primary" />
        <p className="font-medium text-foreground">Memuat data analitik kuis...</p>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="p-8 border border-status-error/30 bg-status-error/10 rounded-xl space-y-4 text-center">
        <AlertTriangle className="size-8 mx-auto text-status-error" />
        <p className="text-body-base font-semibold text-status-error">{errorMsg}</p>
        <Link href={backHref}>
          <Button variant="outline" size="sm" className="rounded-lg">
            {backLabel}
          </Button>
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const { template, summary, questionAnalysis, conceptAnalysis, latestAiInsight } = data;

  const formatDuration = (secs: number) => {
    if (!secs) return "0 detik";
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    if (mins === 0) return `${remainder} dtk`;
    return `${mins} mnt ${remainder} dtk`;
  };

  const courseDisplayName = lockedCourse?.title || template.courseName || template.courseId;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={BarChart3}
        backHref={backHref}
        backLabel={backLabel}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>{template.title}</span>
            <Badge variant="outline" className="rounded-md font-medium text-body-xs">
              {courseDisplayName}
            </Badge>
            <Badge variant="secondary" className="rounded-md text-body-xs capitalize">
              {template.category}
            </Badge>
          </span>
        }
        description={
          <>
            ID Kuis: {template.id} | Limit: {template.timeLimitSeconds ? formatDuration(template.timeLimitSeconds) : "Tanpa Batas"} | Dibuat pada:{" "}
            <FormattedDate date={template.createdAt} options={{ day: "numeric", month: "short", year: "numeric" }} />
          </>
        }
        actions={
          <Button
            onClick={handleRunAiAnalysis}
            disabled={analyzingAi || summary.totalCompleted === 0}
            className="gap-2 bg-brand-primary text-white hover:bg-brand-primary/90 rounded-lg"
          >
            {analyzingAi ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <BrainCircuit className="size-4 text-amber-300" />
            )}
            <span>{analyzingAi ? "Menganalisis..." : "Jalankan Analisis Performa"}</span>
          </Button>
        }
      />

      {errorMsg && (
        <div className="p-4 border border-status-error/40 bg-status-error/10 text-status-error rounded-xl text-body-sm flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Overview Stat Strip */}
      <AdminStatStrip className="lg:grid-cols-4">
        <AdminStatStripItem
          label="Total Peserta Selesai"
          value={summary.totalCompleted}
          caption={`Tingkat penyelesaian ${summary.completionRate}% dari ${summary.totalStarted} mulai`}
          icon={Target}
          iconClassName="text-brand-primary"
        />
        <AdminStatStripItem
          label="Rata-rata Skor"
          value={`${summary.avgScore} / 100`}
          caption={`Median: ${summary.medianScore} | Min: ${summary.minScore} | Max: ${summary.maxScore}`}
          icon={BarChart3}
          iconClassName="text-status-info"
        />
        <AdminStatStripItem
          label="Rata-rata Waktu"
          value={formatDuration(summary.avgDurationSeconds)}
          caption="Durasi pengerjaan siswa"
          icon={BookOpen}
          iconClassName="text-brand-secondary"
        />
        <AdminStatStripItem
          label="Status Evaluasi AI"
          value={
            latestAiInsight ? (
              <div className="flex items-center gap-1.5 text-status-success">
                <CheckCircle2 className="size-5" />
                <span className="text-body-sm font-semibold">Tersedia</span>
              </div>
            ) : (
              <span className="text-body-sm font-normal text-muted-foreground">Belum Dianalisis</span>
            )
          }
          caption={latestAiInsight ? `Berdasarkan ${latestAiInsight.sampleSize} pengerjaan` : "Klik tombol analisis di atas"}
          icon={BrainCircuit}
          iconClassName="text-amber-500"
        />
      </AdminStatStrip>

      {/* Multi-Tab Analytics Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="ai-insights" className="gap-2">
            <BrainCircuit className="size-4 text-brand-primary" />
            <span>AI Insight & Pedagogi</span>
            <BetaBadge />
          </TabsTrigger>
          <TabsTrigger value="questions" className="gap-2">
            <Target className="size-4" />
            <span>Analisis Butir Soal</span>
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-body-xs font-semibold">
              {questionAnalysis.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="score-dist" className="gap-2">
            <BarChart3 className="size-4" />
            <span>Distribusi Nilai</span>
          </TabsTrigger>
          <TabsTrigger value="attempts-sheet" className="gap-2">
            <FileSpreadsheet className="size-4 text-brand-primary" />
            <span>Pengerjaan Siswa</span>
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-body-xs font-semibold">
              {summary.totalCompleted}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: AI Insight & Pedagogical Recommendations */}
        <TabsContent value="ai-insights" className="space-y-6">
          {!latestAiInsight ? (
            <div className="border border-border/80 rounded-2xl p-12 text-center bg-card/50 space-y-4">
              <div className="size-12 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center mx-auto">
                <BrainCircuit className="size-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-body-base font-semibold text-foreground">Belum Ada Analisis AI</h3>
                <p className="text-body-sm text-muted-foreground">
                  Gunakan model penalaran AI untuk mendiagnosis miskonsepsi umum siswa, distraktor paling mengecoh, dan rekomendasi bahan ajar.
                </p>
              </div>
              <Button
                onClick={handleRunAiAnalysis}
                disabled={analyzingAi || summary.totalCompleted === 0}
                className="gap-2 bg-brand-primary text-white hover:bg-brand-primary/90"
              >
                {analyzingAi ? <RefreshCw className="size-4 animate-spin" /> : <Zap className="size-4" />}
                {summary.totalCompleted === 0 ? "Butuh minimal 1 pengerjaan siswa" : "Jalankan Analisis Sekarang"}
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Executive Summary */}
              <div className="border border-border rounded-xl p-5 bg-card/80 space-y-3">
                <div className="flex items-center gap-2 text-foreground font-semibold text-body-base">
                  <Lightbulb className="size-5 text-amber-500" />
                  <h4>Ringkasan Evaluasi Performa</h4>
                </div>
                <p className="text-body-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {latestAiInsight.insights.summaryOverview || latestAiInsight.summary}
                </p>
              </div>

              {/* Teaching Recommendations & Misconceptions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Misconceptions */}
                <div className="border border-border rounded-xl p-5 bg-card/60 space-y-4">
                  <h4 className="font-semibold text-body-base text-foreground flex items-center gap-2">
                    <AlertTriangle className="size-4 text-status-warning" />
                    <span>Miskonsepsi Siswa Teridentifikasi</span>
                  </h4>
                  {latestAiInsight.insights.misconceptions?.length === 0 ? (
                    <p className="text-body-xs text-muted-foreground italic">Tidak ditemukan pola miskonsepsi kritis.</p>
                  ) : (
                    <div className="space-y-3">
                      {latestAiInsight.insights.misconceptions?.map((misc, idx) => (
                        <div key={idx} className="p-3 bg-muted/40 rounded-lg border border-border space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-body-sm text-foreground">{misc.concept}</span>
                            <Badge
                              variant="secondary"
                              className={misc.frequency === "high" ? "text-body-xs capitalize border-status-error/30 text-status-error" : "text-body-xs capitalize"}
                            >
                              Frekuensi {misc.frequency}
                            </Badge>
                          </div>
                          <p className="text-body-xs text-muted-foreground">{misc.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recommendations */}
                <div className="border border-border rounded-xl p-5 bg-card/60 space-y-4">
                  <h4 className="font-semibold text-body-base text-foreground flex items-center gap-2">
                    <Target className="size-4 text-status-info" />
                    <span>Rekomendasi Tindak Lanjut Tutor</span>
                  </h4>
                  {latestAiInsight.insights.teachingRecommendations?.length === 0 ? (
                    <p className="text-body-xs text-muted-foreground italic">Belum ada rekomendasi khusus.</p>
                  ) : (
                    <div className="space-y-3">
                      {latestAiInsight.insights.teachingRecommendations?.map((rec, idx) => (
                        <div key={idx} className="p-3 bg-muted/40 rounded-lg border border-border space-y-1.5">
                          <span className="font-semibold text-body-sm text-foreground">{rec.topic}</span>
                          <p className="text-body-xs font-medium text-brand-primary">{rec.actionItem}</p>
                          <p className="text-body-xs text-muted-foreground">{rec.rationale}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Hardest Questions Deep Dive */}
              {latestAiInsight.insights.hardestQuestionsAnalysis?.length > 0 && (
                <div className="border border-border rounded-xl p-5 bg-card/60 space-y-4">
                  <h4 className="font-semibold text-body-base text-foreground flex items-center gap-2">
                    <AlertTriangle className="size-4 text-status-error" />
                    <span>Analisis Soal Paling Sulit & Distraktor Jebakan</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {latestAiInsight.insights.hardestQuestionsAnalysis.map((item, idx) => (
                      <div key={idx} className="p-3.5 bg-muted/30 border border-border rounded-lg space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-body-xs font-mono text-muted-foreground">ID: {item.questionId}</span>
                          <Badge variant="outline" className="text-status-error border-status-error/40 text-body-xs">
                            Akurasi {item.accuracyRate}%
                          </Badge>
                        </div>
                        <p className="text-body-sm font-medium text-foreground line-clamp-2">{item.promptSnippet}</p>
                        <div className="text-body-xs space-y-1 pt-1 border-t border-border">
                          <p className="text-muted-foreground"><strong className="text-foreground">Diagnosis:</strong> {item.diagnosis}</p>
                          <p className="text-status-warning"><strong className="text-foreground">Jebakan:</strong> {item.distractorTrap}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Question Item & Distractor Analysis */}
        <TabsContent value="questions" className="space-y-6">
          <div className="space-y-4">
            {questionAnalysis.map((q, idx) => (
              <div key={q.questionId} className="border border-border rounded-xl p-5 bg-card/60 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="size-6 rounded-full bg-brand-primary/10 text-brand-primary text-body-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-mono text-body-xs text-muted-foreground">ID: {q.questionId}</span>
                    <DifficultyBadge difficulty={q.difficulty} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-body-xs text-muted-foreground">
                      Jawaban Siswa: <strong className="text-foreground">{q.totalAnswers}</strong>
                    </span>
                    <Badge
                      variant="secondary"
                      className={q.accuracyRate >= 70 ? "text-body-xs font-semibold" : "text-body-xs font-semibold border-status-error/30 text-status-error"}
                    >
                      Akurasi: {q.accuracyRate}%
                    </Badge>
                  </div>
                </div>

                <div className="text-body-sm font-medium text-foreground">
                  <MathText>{q.prompt}</MathText>
                </div>

                {/* Option Breakdown */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-body-xs font-semibold text-muted-foreground">Distribusi Pilihan Jawaban Siswa:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, optIdx) => {
                      const isCorrect = q.correctIndices.includes(optIdx);
                      const chosenCount = q.optionCounts[optIdx] || 0;
                      const percentage = q.totalAnswers > 0 ? Math.round((chosenCount / q.totalAnswers) * 100) : 0;

                      return (
                        <div
                          key={optIdx}
                          className={`p-2.5 rounded-lg border text-body-xs flex items-center justify-between gap-2 ${
                            isCorrect
                              ? "border-status-success/40 bg-status-success/10 text-status-success font-medium"
                              : "border-border bg-muted/20 text-muted-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold shrink-0">{String.fromCharCode(65 + optIdx)}.</span>
                            <div className="truncate"><MathText>{opt}</MathText></div>
                          </div>
                          <div className="shrink-0 tabular-nums text-right">
                            <span>{chosenCount} ({percentage}%)</span>
                            {isCorrect && <CheckCircle2 className="size-3.5 inline ml-1.5 text-status-success" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {q.explanation && (
                  <div className="p-3 bg-muted/40 rounded-lg text-body-xs text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground">Pembahasan:</p>
                    <MathText>{q.explanation}</MathText>
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Score Distribution & Concept Mastery */}
        <TabsContent value="score-dist" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Score Ranges */}
            <div className="border border-border rounded-xl p-5 bg-card/60 space-y-4">
              <h4 className="font-semibold text-body-base text-foreground flex items-center gap-2">
                <BarChart3 className="size-4 text-brand-primary" />
                <span>Distribusi Rentang Nilai Siswa</span>
              </h4>
              <div className="space-y-3 pt-2">
                {[
                  { label: "81 - 100 (Sangat Baik)", count: summary.scoreRanges.range81_100, color: "bg-status-success" },
                  { label: "61 - 80 (Baik / Lulus)", count: summary.scoreRanges.range61_80, color: "bg-brand-primary" },
                  { label: "41 - 60 (Cukup)", count: summary.scoreRanges.range41_60, color: "bg-status-warning" },
                  { label: "21 - 40 (Kurang)", count: summary.scoreRanges.range21_40, color: "bg-amber-600" },
                  { label: "0 - 20 (Sangat Kurang)", count: summary.scoreRanges.range0_20, color: "bg-status-error" },
                ].map((range, idx) => {
                  const pct = summary.totalCompleted > 0 ? Math.round((range.count / summary.totalCompleted) * 100) : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-body-xs text-muted-foreground">
                        <span>{range.label}</span>
                        <span className="font-semibold text-foreground">{range.count} siswa ({pct}%)</span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${range.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Concept Mastery Tags */}
            <div className="border border-border rounded-xl p-5 bg-card/60 space-y-4">
              <h4 className="font-semibold text-body-base text-foreground flex items-center gap-2">
                <Target className="size-4 text-brand-secondary" />
                <span>Penguasaan Topik & Konsep</span>
              </h4>
              {conceptAnalysis.length === 0 ? (
                <p className="text-body-xs text-muted-foreground italic">Tidak ada metadata tag pada soal kuis ini.</p>
              ) : (
                <div className="space-y-3 pt-2">
                  {conceptAnalysis.map((c, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-body-xs">
                        <span className="font-medium text-foreground capitalize">{c.tag}</span>
                        <span className="text-muted-foreground">
                          Akurasi: <strong className={c.accuracyRate >= 70 ? "text-status-success" : "text-status-warning"}>{c.accuracyRate}%</strong> ({c.correctCount}/{c.totalAnswered})
                        </span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${c.accuracyRate >= 70 ? "bg-status-success" : "bg-status-warning"}`}
                          style={{ width: `${c.accuracyRate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab 4: Student Attempts Spreadsheet */}
        <TabsContent value="attempts-sheet" className="space-y-4">
          <QuizAttemptsSpreadsheet templateId={quizId} quizTitle={template.title} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
