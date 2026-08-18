"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  Sparkles,
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
import { Badge } from "@/components/ui/badge";
import { FormattedDate } from "@/components/ui/formatted-date";
import { MathText } from "@/components/course/math-text";
import { QuizAttemptsSpreadsheet } from "./_components/quiz-attempts-spreadsheet";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badges";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin/tabs";


interface QuizDetailResponse {
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

type Params = Promise<{ id: string }>;

export default function AdminQuizInsightDetailPage(props: { params: Params }) {
  const { id } = use(props.params);
  const [data, setData] = useState<QuizDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [activeTab, setActiveTab] = useState("ai-insights");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/quiz-insights/${id}`);
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
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);


  const handleRunAiAnalysis = async () => {
    setAnalyzingAi(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/quiz-insights/${id}/analyze`, {
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
        <Link href="/admin/quiz-insights">
          <Button variant="outline" size="sm" className="rounded-lg">
            Kembali ke Ringkasan Kuis
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

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={BarChart3}
        backHref="/admin/quiz-insights"
        backLabel="Analisis & Insight Kuis"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {template.title}
            <Badge variant="outline" className="rounded-md font-medium text-body-xs">
              {template.courseName || template.courseId}
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
              <Sparkles className="size-4 text-amber-300" />
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

      {/* Summary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <AdminStatCard
          size="sm"
          label="Total Selesai"
          value={summary.totalCompleted}
          caption={`dari ${summary.totalStarted} dimulai (${summary.completionRate}%)`}
        />
        <AdminStatCard
          size="sm"
          label="Rata-rata Skor"
          value={
            <>
              {summary.avgScore}{" "}
              <span className="text-body-xs text-muted-foreground font-normal">/ 100</span>
            </>
          }
          caption={`Median: ${summary.medianScore}`}
          tone="brand"
        />
        <AdminStatCard
          size="sm"
          label="Tertinggi / Terendah"
          value={
            <>
              {summary.maxScore}{" "}
              <span className="text-body-xs text-muted-foreground font-normal">/ {summary.minScore}</span>
            </>
          }
          caption="Rentang nilai siswa"
        />
        <AdminStatCard
          size="sm"
          label="Rata-rata Durasi"
          value={formatDuration(summary.avgDurationSeconds)}
          caption="Waktu pengerjaan"
        />
        <AdminStatCard
          size="sm"
          label="Total Soal"
          value={questionAnalysis.length}
          caption="Butir soal teruji"
        />
        <AdminStatCard
          size="sm"
          label="Status Insight"
          value={
            <div className="mt-1">
              {latestAiInsight ? (
                <StatusBadge tone="success">Tersedia</StatusBadge>
              ) : (
                <StatusBadge tone="muted">Belum dibuat</StatusBadge>
              )}
            </div>
          }
          caption={
            latestAiInsight ? `Sampel: ${latestAiInsight.sampleSize} siswa` : "Belum dianalisis"
          }
        />
      </div>

      {/* Tabs Component */}
      <AdminTabs value={activeTab} onValueChange={setActiveTab}>
        <AdminTabsList>
          <AdminTabsTrigger value="attempts-sheet">
            <FileSpreadsheet className="size-4 text-emerald-500" />
            <span>Sheet Attempt & Jawaban Siswa</span>
          </AdminTabsTrigger>
          <AdminTabsTrigger value="ai-insights">
            <Sparkles className="size-4 text-amber-400" />
            <span>Analisis Performa & Rekomendasi</span>
          </AdminTabsTrigger>
          <AdminTabsTrigger value="questions">
            <FileSpreadsheet className="size-4 text-brand-primary" />
            <span>Analisis Butir Soal & Distraktor</span>
          </AdminTabsTrigger>
          <AdminTabsTrigger value="concepts">
            <Target className="size-4 text-brand-secondary" />
            <span>Analisis Konsep & Topik</span>
          </AdminTabsTrigger>
          <AdminTabsTrigger value="distribution">
            <BarChart3 className="size-4 text-status-info" />
            <span>Distribusi & Statistik Nilai</span>
          </AdminTabsTrigger>
        </AdminTabsList>

        {/* TAB 0: SPREADSHEET ATTEMPT SISWA */}
        <AdminTabsContent value="attempts-sheet" className="space-y-6">
          <QuizAttemptsSpreadsheet templateId={id} quizTitle={template.title} />
        </AdminTabsContent>

        {/* TAB 1: ANALISIS PERFORMA & REKOMENDASI */}
        <AdminTabsContent value="ai-insights" className="space-y-6">
          {!latestAiInsight ? (
            <div className="bg-card border border-border rounded-xl p-10 text-center space-y-4">
              <div className="size-12 rounded-full bg-brand-primary/10 flex items-center justify-center mx-auto text-brand-primary">
                <Sparkles className="size-6 text-amber-400" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="font-heading text-body-base font-bold text-foreground">Belum Ada Analisis Performa</h3>
                <p className="text-body-sm text-muted-foreground">
                  Klik tombol di bawah ini untuk menganalisis data pengerjaan kuis. Sistem akan mendiagnosis miskonsepsi siswa, jebakan distraktor, dan memberikan rekomendasi pengajaran.
                </p>
              </div>
              <Button
                onClick={handleRunAiAnalysis}
                disabled={analyzingAi || summary.totalCompleted === 0}
                className="gap-2 bg-brand-primary text-white hover:bg-brand-primary/90 rounded-lg"
              >
                {analyzingAi ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4 text-amber-300" />}
                <span>{analyzingAi ? "Menganalisis..." : "Jalankan Analisis Performa Sekarang"}</span>
              </Button>
              {summary.totalCompleted === 0 && (
                <p className="text-body-xs text-status-warning">
                  Analisis memerlukan minimal 1 hasil pengerjaan kuis yang sudah selesai oleh siswa.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Insight Timestamp Badge */}
              <div className="bg-muted/40 border border-border rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-body-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-status-success shrink-0" />
                  <span>
                    Analisis ini dibuat berdasarkan sampel <strong className="text-foreground">{latestAiInsight.sampleSize} siswa</strong> pada <FormattedDate date={latestAiInsight.createdAt} options={{ day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }} /> WIB.
                  </span>

                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRunAiAnalysis}
                  disabled={analyzingAi}
                  className="gap-1.5 rounded-lg self-start sm:self-auto text-body-xs"
                >
                  <RefreshCw className={`size-3.5 ${analyzingAi ? "animate-spin" : ""}`} />
                  <span>Perbarui Analisis</span>
                </Button>
              </div>

              {/* 1. Ringkasan Eksekutif */}
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-brand-primary font-heading font-bold text-body-base border-b border-border pb-3">
                  <BookOpen className="size-5" />
                  <span>Ringkasan Eksekutif Hasil Kuis</span>
                </div>
                <p className="text-body-base text-foreground leading-relaxed">
                  {latestAiInsight.insights.summaryOverview}
                </p>
              </div>

              {/* 2. Konsep & Miskonsepsi */}
              {latestAiInsight.insights.misconceptions && latestAiInsight.insights.misconceptions.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-status-error font-heading font-bold text-body-base border-b border-border pb-3">
                    <AlertTriangle className="size-5" />
                    <span>Konsep & Miskonsepsi yang Menyulitkan Siswa</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {latestAiInsight.insights.misconceptions.map((misc, idx) => (
                      <div key={idx} className="border border-border/80 bg-muted/20 rounded-xl p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-heading text-body-sm font-bold text-foreground">{misc.concept}</h4>
                          <Badge
                            className={`rounded-md text-body-xs capitalize ${
                              misc.frequency === "high"
                                ? "bg-status-error/15 text-status-error border-status-error/30 font-semibold"
                                : misc.frequency === "medium"
                                ? "bg-status-warning/15 text-status-warning border-status-warning/30 font-semibold"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            Tingkat: {misc.frequency}
                          </Badge>
                        </div>
                        <p className="text-body-sm text-muted-foreground">{misc.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Rekomendasi Pengajaran untuk Tutor */}
              {latestAiInsight.insights.teachingRecommendations && latestAiInsight.insights.teachingRecommendations.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-brand-secondary font-heading font-bold text-body-base border-b border-border pb-3">
                    <Lightbulb className="size-5" />
                    <span>Rekomendasi Pengajaran & Pengayaan (Tutor & Admin)</span>
                  </div>
                  <div className="space-y-3">
                    {latestAiInsight.insights.teachingRecommendations.map((rec, idx) => (
                      <div key={idx} className="border border-border rounded-xl p-4 bg-card space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="rounded-md text-body-xs font-semibold">
                            Topik: {rec.topic}
                          </Badge>
                        </div>
                        <p className="text-body-base font-semibold text-foreground">
                          📌 Action: {rec.actionItem}
                        </p>
                        <p className="text-body-sm text-muted-foreground">
                          <em>Alasan Pedagogis:</em> {rec.rationale}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Diagnosis Soal Tersulit & Distraktor */}
              {latestAiInsight.insights.hardestQuestionsAnalysis && latestAiInsight.insights.hardestQuestionsAnalysis.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-status-warning font-heading font-bold text-body-base border-b border-border pb-3">
                    <Target className="size-5" />
                    <span>Diagnosis Soal Tersulit & Jebakan Distraktor</span>
                  </div>
                  <div className="space-y-4">
                    {latestAiInsight.insights.hardestQuestionsAnalysis.map((hq, idx) => (
                      <div key={idx} className="border border-border rounded-xl p-4 bg-muted/20 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-body-xs font-mono text-muted-foreground">ID Soal: {hq.questionId}</span>
                          <Badge className="bg-status-error/10 text-status-error border-status-error/20 rounded-md font-semibold text-body-xs">
                            Akurasi: {hq.accuracyRate}%
                          </Badge>
                        </div>
                        <p className="text-body-sm font-medium text-foreground italic">
                          &quot;{hq.promptSnippet}&quot;
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-body-sm">
                          <div className="p-3 bg-card border border-border rounded-lg">
                            <span className="font-semibold text-foreground block mb-1">🔍 Diagnosis Kegagalan:</span>
                            <span className="text-muted-foreground">{hq.diagnosis}</span>
                          </div>
                          <div className="p-3 bg-card border border-border rounded-lg">
                            <span className="font-semibold text-foreground block mb-1">⚠️ Jebakan Distraktor:</span>
                            <span className="text-muted-foreground">{hq.distractorTrap}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. Langkah Konkret Selanjutnya */}
              {latestAiInsight.insights.actionableNextSteps && latestAiInsight.insights.actionableNextSteps.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-foreground font-heading font-bold text-body-base border-b border-border pb-3">
                    <Zap className="size-5 text-brand-primary" />
                    <span>Rekomendasi Langkah Konkret</span>
                  </div>
                  <ul className="space-y-2 text-body-sm text-foreground">
                    {latestAiInsight.insights.actionableNextSteps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="size-5 rounded-full bg-brand-primary/10 text-brand-primary font-bold text-body-xs flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </AdminTabsContent>

        {/* TAB 2: ANALISIS BUTIR SOAL & DISTRAKTOR */}
        <AdminTabsContent value="questions" className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-heading text-body-base font-bold text-foreground">Detail Butir Soal & Pilihan Jawaban (Distraktor)</h3>
                <p className="text-body-xs text-muted-foreground mt-0.5">
                  Menampilkan pilihan jawaban siswa per opsi (A, B, C, D, E) untuk mendeteksi pilihan jebakan.
                </p>
              </div>
              <Badge variant="outline" className="rounded-md font-medium text-body-xs">
                Total Soal: {questionAnalysis.length}
              </Badge>
            </div>

            {questionAnalysis.length === 0 ? (
              <p className="text-body-sm text-muted-foreground text-center py-6">
                Belum ada data pengerjaan untuk menampilkan butir soal.
              </p>
            ) : (
              <div className="space-y-6">
                {questionAnalysis.map((q, idx) => {
                  return (
                    <div key={q.questionId} className="border border-border rounded-xl p-5 space-y-4 bg-card">
                      {/* Header Soal */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-heading font-bold text-body-base text-foreground">
                            Soal #{idx + 1}
                          </span>
                          <Badge variant="outline" className="rounded-md text-body-xs capitalize">
                            Kesulitan: {q.difficulty}
                          </Badge>
                          {q.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="rounded-md text-body-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-body-xs text-muted-foreground">Tingkat Akurasi:</span>
                          <Badge
                            className={`rounded-md font-bold text-body-xs ${
                              q.accuracyRate >= 70
                                ? "bg-status-success/15 text-status-success border-status-success/30"
                                : q.accuracyRate >= 40
                                ? "bg-status-warning/15 text-status-warning border-status-warning/30"
                                : "bg-status-error/15 text-status-error border-status-error/30"
                            }`}
                          >
                            {q.accuracyRate}% ({q.correctCount}/{q.totalAnswers} benar)
                          </Badge>
                        </div>
                      </div>

                      {/* Teks Soal */}
                      <div className="text-body-base text-foreground font-medium">
                        <MathText>{q.prompt}</MathText>
                      </div>

                      {/* Distractor Breakdown Options */}
                      <div className="space-y-2 pt-2">
                        <p className="text-body-xs font-semibold text-muted-foreground">
                          Distribusi Jawaban Siswa per Opsi:
                        </p>
                        <div className="space-y-2">
                          {q.options.map((optText, oIdx) => {
                            const isCorrect = q.correctIndices.includes(oIdx);
                            const count = q.optionCounts[oIdx] || 0;
                            const pct = q.totalAnswers > 0 ? Math.round((count / q.totalAnswers) * 100) : 0;
                            const optionLabel = String.fromCharCode(65 + oIdx);

                            return (
                              <div key={oIdx} className="space-y-1">
                                <div className="flex items-center justify-between text-body-xs">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className={`size-5 rounded-md text-body-xs font-bold flex items-center justify-center shrink-0 ${
                                        isCorrect
                                          ? "bg-status-success text-white"
                                          : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      {optionLabel}
                                    </span>
                                    <span className={`truncate ${isCorrect ? "font-semibold text-status-success" : "text-foreground"}`}>
                                      <MathText>{optText}</MathText>
                                    </span>
                                    {isCorrect && (
                                      <Badge className="bg-status-success/20 text-status-success border-none text-[10px] py-0 rounded-md">
                                        Kunci Jawaban
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="font-medium text-foreground shrink-0 ml-2">
                                    {pct}% ({count} siswa)
                                  </span>
                                </div>
                                {/* Bar */}
                                <div className="h-2 rounded-md bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-md transition-all duration-300 ${
                                      isCorrect ? "bg-status-success" : "bg-brand-primary/60"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Pembahasan jika ada */}
                      {q.explanation && (
                        <div className="p-3 bg-muted/40 border border-border rounded-lg text-body-xs text-muted-foreground space-y-1 mt-3">
                          <p className="font-semibold text-foreground">💡 Pembahasan / Penjelasan:</p>
                          <MathText>{q.explanation}</MathText>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </AdminTabsContent>

        {/* TAB 3: ANALISIS KONSEP & TOPIK */}
        <AdminTabsContent value="concepts" className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
            <div className="border-b border-border pb-3">
              <h3 className="font-heading text-body-base font-bold text-foreground">Analisis Tingkat Penguasaan Konsep</h3>
              <p className="text-body-xs text-muted-foreground mt-0.5">
                Persentase akurasi jawaban siswa dikelompokkan berdasarkan topik/konsep tag yang terhubung dengan bank soal.
              </p>
            </div>

            {conceptAnalysis.length === 0 ? (
              <p className="text-body-sm text-muted-foreground text-center py-6">
                Belum ada data tag/konsep pada soal kuis ini.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-body-sm">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium text-body-xs">
                    <tr>
                      <th className="px-4 py-3">Nama Konsep / Tag</th>
                      <th className="px-4 py-3 text-center">Total Jawaban Selesai</th>
                      <th className="px-4 py-3 text-center">Jumlah Jawaban Benar</th>
                      <th className="px-4 py-3 text-center">Tingkat Akurasi</th>
                      <th className="px-4 py-3">Status Penguasaan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {conceptAnalysis.map((c) => (
                      <tr key={c.tag} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {c.tag}
                        </td>
                        <td className="px-4 py-3 text-center text-muted-foreground">
                          {c.totalAnswered}
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-foreground">
                          {c.correctCount}
                        </td>
                        <td className="px-4 py-3 text-center font-bold">
                          <span className={c.accuracyRate >= 70 ? "text-status-success" : c.accuracyRate >= 50 ? "text-status-warning" : "text-status-error"}>
                            {c.accuracyRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {c.accuracyRate >= 70 ? (
                            <Badge className="bg-status-success/15 text-status-success border-status-success/30 rounded-md font-semibold text-body-xs">
                              Dikuasai Baik
                            </Badge>
                          ) : c.accuracyRate >= 50 ? (
                            <Badge className="bg-status-warning/15 text-status-warning border-status-warning/30 rounded-md font-semibold text-body-xs">
                              Cukup Dikuasai
                            </Badge>
                          ) : (
                            <Badge className="bg-status-error/15 text-status-error border-status-error/30 rounded-md font-semibold text-body-xs">
                              Membutuhkan Pengayaan
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </AdminTabsContent>

        {/* TAB 4: DISTRIBUSI & STATISTIK NILAI */}
        <AdminTabsContent value="distribution" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Rentang Nilai */}
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="font-heading text-body-base font-bold text-foreground border-b border-border pb-3">
                Distribusi Rentang Nilai Siswa
              </h3>
              <div className="space-y-3">
                {[
                  { label: "81 - 100 (Sangat Baik)", count: summary.scoreRanges.range81_100, color: "bg-status-success" },
                  { label: "61 - 80 (Baik)", count: summary.scoreRanges.range61_80, color: "bg-brand-primary" },
                  { label: "41 - 60 (Cukup)", count: summary.scoreRanges.range41_60, color: "bg-brand-secondary" },
                  { label: "21 - 40 (Kurang)", count: summary.scoreRanges.range21_40, color: "bg-status-warning" },
                  { label: "0 - 20 (Sangat Kurang)", count: summary.scoreRanges.range0_20, color: "bg-status-error" },
                ].map((item, i) => {
                  const pct = summary.totalCompleted > 0 ? Math.round((item.count / summary.totalCompleted) * 100) : 0;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-body-xs">
                        <span className="font-medium text-foreground">{item.label}</span>
                        <span className="text-muted-foreground">{pct}% ({item.count} siswa)</span>
                      </div>
                      <div className="h-3 rounded-md bg-muted overflow-hidden">
                        <div className={`h-full rounded-md ${item.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Durasi & Ketuntasan */}
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="font-heading text-body-base font-bold text-foreground border-b border-border pb-3">
                Metrik Ketuntasan & Durasi
              </h3>
              <div className="space-y-4 text-body-sm">
                <div className="flex justify-between items-center border-b border-border pb-2">
                  <span className="text-muted-foreground">Tingkat Penyelesaian:</span>
                  <span className="font-bold text-foreground">{summary.completionRate}%</span>
                </div>
                <div className="flex justify-between items-center border-b border-border pb-2">
                  <span className="text-muted-foreground">Rata-rata Waktu Pengerjaan:</span>
                  <span className="font-bold text-foreground">{formatDuration(summary.avgDurationSeconds)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-border pb-2">
                  <span className="text-muted-foreground">Batas Waktu Maksimal Kuis:</span>
                  <span className="font-bold text-foreground">{template.timeLimitSeconds ? formatDuration(template.timeLimitSeconds) : "Tanpa Batas"}</span>
                </div>
                <div className="flex justify-between items-center border-b border-border pb-2">
                  <span className="text-muted-foreground">Nilai Median:</span>
                  <span className="font-bold text-foreground">{summary.medianScore} / 100</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status Kuis:</span>
                  <Badge variant="outline" className="rounded-md capitalize text-body-xs font-semibold">
                    {template.status}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </AdminTabsContent>
      </AdminTabs>
    </div>
  );
}
