"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ComputedQuizMetrics, StudentQuizDiagnosis } from "@/lib/student-quiz-analytics/types";
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Clock,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  TriangleAlert,
  Zap,
  ArrowUpRight,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

interface QuizAnalyticsViewProps {
  attemptId: string;
  courseId: string;
}

export function QuizAnalyticsView({ attemptId, courseId }: QuizAnalyticsViewProps) {
  const [data, setData] = useState<{
    status: string;
    computedMetrics?: ComputedQuizMetrics;
    aiDiagnosis?: StudentQuizDiagnosis;
    errorMessage?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/quiz/attempts/${attemptId}/analytics`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load quiz analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  async function handleRecompute() {
    try {
      setRecomputing(true);
      await fetch(`/api/quiz/attempts/${attemptId}/analytics`, { method: "POST" });
      await fetchAnalytics();
    } catch (err) {
      console.error("Failed to trigger recompute:", err);
    } finally {
      setRecomputing(false);
    }
  }

  const isStatusProcessing = data?.status === "processing";

  useEffect(() => {
    fetchAnalytics();

    // Auto poll if processing
    const timer = setInterval(() => {
      if (isStatusProcessing) {
        fetchAnalytics();
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [attemptId, fetchAnalytics, isStatusProcessing]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
        <Loader2 className="size-8 animate-spin text-brand-primary" />
        <p className="font-heading text-body-base font-bold text-foreground">Menyiapkan Diagnosis Pembelajaran...</p>
        <p className="text-body-sm text-muted-foreground max-w-md">
          Sistem backend dan AI sedang menganalisis penguasaan konsep, pola kesalahan, dan waktu pengerjaan Anda.
        </p>
      </div>
    );
  }

  const metrics = data?.computedMetrics;
  const diagnosis = data?.aiDiagnosis;
  const isProcessing = data?.status === "processing";

  if (!metrics && !diagnosis) {
    return (
      <div className="rounded-2xl border border-brand-primary/30 bg-gradient-to-br from-brand-primary/5 via-card to-card p-8 text-center space-y-5 shadow-xs">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary mx-auto ring-1 ring-brand-primary/20">
          <Sparkles className="size-7" />
        </div>
        <div className="space-y-2 max-w-lg mx-auto">
          <h3 className="font-heading text-h4 font-bold text-foreground">Diagnosis Pembelajaran AI Belum Dihasilkan</h3>
          <p className="text-body-sm text-muted-foreground leading-relaxed">
            Kuis ini telah selesai dikerjakan. Klik tombol di bawah untuk mentrigger diagnosis pembelajaran terperinci, pemetaan konsep, dan rencana belajar personal secara otomatis.
          </p>
        </div>
        <Button
          onClick={handleRecompute}
          disabled={recomputing}
          className="rounded-md bg-brand-primary text-white hover:bg-brand-primary/90 font-semibold px-6 py-2.5 shadow-sm"
        >
          <Sparkles className={`mr-2 size-4 ${recomputing ? "animate-spin" : ""}`} />
          {recomputing ? "Menghasilkan Diagnosis AI..." : "Hasilkan Diagnosis Pembelajaran AI Sekarang"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans">
      {/* Processing Banner if AI is still running */}
      {isProcessing && (
        <div className="flex items-center justify-between rounded-lg border border-brand-primary/30 bg-brand-primary/10 p-4 text-brand-primary">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin shrink-0" />
            <div className="text-body-sm">
              <span className="font-bold">Analisis AI Sedang Berjalan:</span> Menghasilkan diagnosis terperinci & pola kesalahan...
            </div>
          </div>
          <Button onClick={fetchAnalytics} variant="ghost" size="sm" className="text-brand-primary hover:bg-brand-primary/20 rounded-md">
            Perbarui Status
          </Button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          LAYER 1: RINGKASAN CEPAT (QUICK EXECUTIVE SUMMARY)
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Main Headline Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-brand-primary/30 bg-gradient-to-br from-brand-primary/10 via-card to-card p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-md border-brand-primary/40 bg-brand-primary/10 text-brand-primary text-body-xs font-semibold uppercase tracking-wider">
                  <Sparkles className="mr-1 size-3" /> Learning Diagnosis Zyx AI
                </Badge>
                {metrics && (
                  <Badge variant="outline" className="rounded-md border-border bg-card text-muted-foreground text-body-xs">
                    {metrics.quizTitle}
                  </Badge>
                )}
                <Button
                  onClick={handleRecompute}
                  disabled={recomputing}
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-body-xs text-muted-foreground hover:text-foreground rounded-md ml-auto md:ml-0"
                >
                  <RefreshCw className={`mr-1 size-3 ${recomputing ? "animate-spin" : ""}`} />
                  {recomputing ? "Memproses..." : "Generasi Ulang AI"}
                </Button>
              </div>
              <h2 className="font-heading text-h4 font-bold text-foreground">
                {diagnosis?.headline || `Hasil Kuis: ${metrics?.score}% (${metrics?.correctCount}/${metrics?.totalQuestions} Benar)`}
              </h2>
              <p className="text-body-base text-muted-foreground leading-relaxed">
                {diagnosis?.overall_summary || `Anda telah menyelesaikan ${metrics?.totalQuestions} soal kuis.`}
              </p>
            </div>

            {/* Score & Performance Badge */}
            {metrics && (
              <div className="flex flex-col items-center justify-center shrink-0 rounded-xl border border-border/80 bg-card p-5 text-center shadow-xs min-w-[150px]">
                <span className="text-body-xs uppercase font-semibold text-muted-foreground tracking-wider">Skor Total</span>
                <div className="font-heading text-h2 font-bold text-brand-primary mt-1">
                  {metrics.score}<span className="text-body-lg text-muted-foreground font-normal">%</span>
                </div>
                <Badge className={`mt-2 rounded-md ${getPerformanceBadgeClass(diagnosis?.performance_level || (metrics.score >= 75 ? "good" : "developing"))}`}>
                  {getPerformanceLabel(diagnosis?.performance_level || (metrics.score >= 75 ? "good" : "developing"))}
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Quick Facts Strip */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/60 p-3.5 backdrop-blur-xs">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-status-success/10 text-status-success">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <span className="block text-body-xs text-muted-foreground font-medium">Jawaban Benar</span>
                <span className="font-heading text-h6 font-bold text-foreground">{metrics.correctCount} / {metrics.totalQuestions}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/60 p-3.5 backdrop-blur-xs">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-status-error/10 text-status-error">
                <TriangleAlert className="size-5" />
              </div>
              <div>
                <span className="block text-body-xs text-muted-foreground font-medium">Salah / Kosong</span>
                <span className="font-heading text-h6 font-bold text-foreground">{metrics.incorrectCount + metrics.unansweredCount}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/60 p-3.5 backdrop-blur-xs">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-tertiary-1/10 text-tertiary-1">
                <Clock className="size-5" />
              </div>
              <div>
                <span className="block text-body-xs text-muted-foreground font-medium">Waktu Pengerjaan</span>
                <span className="font-heading text-h6 font-bold text-foreground">{formatDuration(metrics.durationSeconds)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/60 p-3.5 backdrop-blur-xs">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-secondary/10 text-brand-secondary">
                <TrendingUp className="size-5" />
              </div>
              <div>
                <span className="block text-body-xs text-muted-foreground font-medium">Perkembangan</span>
                <span className="font-heading text-h6 font-bold text-foreground">
                  {metrics.historicalComparison.overallImprovementDelta >= 0 ? `+${metrics.historicalComparison.overallImprovementDelta}%` : `${metrics.historicalComparison.overallImprovementDelta}%`}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          LAYER 2: DIAGNOSIS TERPERINCI (DETAILED DIAGNOSTICS)
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        <div className="border-b border-border pb-3">
          <h3 className="font-heading text-h4 font-bold text-foreground flex items-center gap-2">
            <Brain className="size-5 text-brand-primary" /> Diagnosis Pembelajaran Terperinci
          </h3>
          <p className="text-body-sm text-muted-foreground">
            Pemetaan penguasaan konsep deterministik backend & interpretasi pedagogis AI.
          </p>
        </div>

        {/* SECTION A: PENGUASAAN KONSEP (CONCEPT MASTERY TABLE) */}
        {metrics && metrics.conceptMastery.length > 0 && (
          <div className="rounded-xl border border-border/80 bg-card/70 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-heading text-h5 font-bold text-foreground flex items-center gap-2">
                  <Target className="size-4 text-brand-primary" /> Penguasaan Konsep Utama
                </h4>
                <p className="text-body-xs text-muted-foreground">
                  Status penguasaan dihitung secara deterministik dari proporsi ketepatan soal & bukti pengerjaan.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-semibold text-body-xs uppercase tracking-wider">
                    <th className="py-2.5 px-3">Konsep</th>
                    <th className="py-2.5 px-3 text-center">Soal</th>
                    <th className="py-2.5 px-3">Tingkat Penguasaan</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Tren</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {metrics.conceptMastery.map((c, idx) => (
                    <tr key={idx} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-foreground">{c.concept}</div>
                        {c.subconcepts && c.subconcepts.length > 0 && (
                          <div className="text-body-xs text-muted-foreground mt-0.5">
                            Subkonsep: {c.subconcepts.join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-medium">
                        {c.correctCount} / {c.totalQuestions}
                      </td>
                      <td className="py-3 px-3 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-full max-w-[100px] rounded-md bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-md transition-all duration-500 ${getAccuracyBarColor(c.accuracyPercent)}`}
                              style={{ width: `${c.accuracyPercent}%` }}
                            />
                          </div>
                          <span className="font-bold text-body-xs text-foreground">{c.accuracyPercent}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant="outline" className={`rounded-md ${getMasteryBadgeClass(c.status)}`}>
                          {getMasteryLabel(c.status)}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-body-xs text-muted-foreground">
                        {getTrendLabel(c.trend, c.previousAccuracyPercent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION B: KEKUATAN SISWA & AREA FOKUS (STRENGTHS & FOCUS AREAS) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Strengths Card */}
          <div className="rounded-xl border border-status-success/30 bg-status-success/5 p-5 space-y-4">
            <h4 className="font-heading text-h5 font-bold text-foreground flex items-center gap-2 text-status-success">
              <ShieldCheck className="size-5" /> Kekuatan & Keunggulan Anda
            </h4>
            {diagnosis?.strengths && diagnosis.strengths.length > 0 ? (
              <div className="space-y-3">
                {diagnosis.strengths.map((item, i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-card p-3.5 space-y-1.5 shadow-xs">
                    <div className="font-heading text-body-base font-bold text-foreground">{item.title}</div>
                    <p className="text-body-sm text-muted-foreground leading-snug">{item.description}</p>
                    {item.evidence && item.evidence.length > 0 && (
                      <div className="text-body-xs text-brand-primary bg-brand-primary/5 p-2 rounded-md font-medium mt-1">
                        ✓ {item.evidence[0].observation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground">
                Performa Anda stabil di beberapa konsep dasar. Lanjutkan latihan untuk membentuk keunggulan spesifik.
              </p>
            )}
          </div>

          {/* Focus Areas Card */}
          <div className="rounded-xl border border-status-warning/30 bg-status-warning/5 p-5 space-y-4">
            <h4 className="font-heading text-h5 font-bold text-foreground flex items-center gap-2 text-status-warning">
              <Target className="size-5" /> Area yang Perlu Diperkuat
            </h4>
            {diagnosis?.focus_areas && diagnosis.focus_areas.length > 0 ? (
              <div className="space-y-3">
                {diagnosis.focus_areas.map((item, i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-card p-3.5 space-y-1.5 shadow-xs">
                    <div className="font-heading text-body-base font-bold text-foreground">{item.title}</div>
                    <p className="text-body-sm text-muted-foreground leading-snug">{item.description}</p>
                    <div className="text-body-xs text-status-warning bg-status-warning/10 p-2 rounded-md font-medium mt-1">
                      ! {item.importance}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground">
                Tidak ada area kelemahan kritis yang terdeteksi. Pertahankan latihan soal bertingkat.
              </p>
            )}
          </div>
        </div>

        {/* SECTION C: POLA KESALAHAN (ERROR PATTERNS) */}
        {diagnosis?.error_patterns && diagnosis.error_patterns.length > 0 && (
          <div className="rounded-xl border border-border/80 bg-card/70 p-5 space-y-4">
            <h4 className="font-heading text-h5 font-bold text-foreground flex items-center gap-2">
              <Lightbulb className="size-5 text-brand-secondary" /> Analisis Pola Kesalahan (Error Pattern Detection)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {diagnosis.error_patterns.map((errItem, idx) => (
                <div key={idx} className="rounded-lg border border-border/80 bg-card p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading text-body-base font-bold text-foreground">{errItem.title}</span>
                    <Badge variant="outline" className="rounded-md border-border text-body-xs uppercase font-medium">
                      {getErrorCategoryLabel(errItem.category)}
                    </Badge>
                  </div>
                  <p className="text-body-sm text-muted-foreground leading-snug">{errItem.description}</p>
                  <div className="rounded-md bg-muted/50 p-2.5 text-body-xs text-foreground mt-2 border border-border/50">
                    <span className="font-bold text-brand-primary block mb-0.5">Strategi Perbaikan:</span>
                    {errItem.correction_strategy}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION D: KEMAMPUAN KOGNITIF & KECEPATAN */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cognitive Skills Matrix */}
            <div className="rounded-xl border border-border/80 bg-card/70 p-5 space-y-4">
              <h4 className="font-heading text-h5 font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="size-5 text-brand-primary" /> Performa Kemampuan Kognitif
              </h4>
              <div className="space-y-3">
                {metrics.cognitiveSkills.map((s, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-body-xs font-semibold">
                      <span className="text-foreground">{s.skill}</span>
                      <span className="text-muted-foreground">{s.correctCount}/{s.totalQuestions} ({s.accuracyPercent}%)</span>
                    </div>
                    <div className="h-2 w-full rounded-md bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-md transition-all duration-500 ${getAccuracyBarColor(s.accuracyPercent)}`}
                        style={{ width: `${s.accuracyPercent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Time & Speed Insights */}
            <div className="rounded-xl border border-border/80 bg-card/70 p-5 space-y-4">
              <h4 className="font-heading text-h5 font-bold text-foreground flex items-center gap-2">
                <Zap className="size-5 text-tertiary-1" /> Efisiensi & Kecepatan Pengerjaan
              </h4>
              <div className="space-y-3 text-body-sm">
                <div className="flex justify-between border-b border-border/60 pb-2">
                  <span className="text-muted-foreground">Rata-rata Waktu Per Soal</span>
                  <span className="font-bold text-foreground">{metrics.timeAnalysis.avgTimePerQuestionSeconds} detik</span>
                </div>
                <div className="flex justify-between border-b border-border/60 pb-2">
                  <span className="text-muted-foreground">Jawaban Sangat Cepat (&lt; 15 detik)</span>
                  <span className="font-bold text-foreground">{metrics.timeAnalysis.fastAnswerCount} soal</span>
                </div>
                {metrics.timeAnalysis.fastIncorrectCount > 0 && (
                  <div className="rounded-md bg-status-warning/10 p-2.5 text-body-xs text-status-warning font-medium">
                    ⚠️ Terdapat {metrics.timeAnalysis.fastIncorrectCount} jawaban salah yang dipilih secara sangat cepat (&lt; 15s). Indikasi terburu-buru atau ketelitian.
                  </div>
                )}
                {diagnosis?.time_insights && diagnosis.time_insights.length > 0 && (
                  <div className="text-body-xs text-muted-foreground leading-relaxed pt-1">
                    <span className="font-semibold text-foreground block">Catatan Waktu AI:</span>
                    {diagnosis.time_insights[0].observation} {diagnosis.time_insights[0].suggestion}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          LAYER 3: RENCANA BELAJAR PERSONAL (3-STEP ACTION PLAN)
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div>
          <h3 className="font-heading text-h4 font-bold text-foreground flex items-center gap-2">
            <BookOpen className="size-5 text-brand-primary" /> Rencana Belajar Personal (3 Prioritas Utama)
          </h3>
          <p className="text-body-sm text-muted-foreground">
            Langkah konkrit yang direkomendasikan AI untuk memperkuat pemahaman Anda setelah kuis ini.
          </p>
        </div>

        {diagnosis?.study_plan && diagnosis.study_plan.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {diagnosis.study_plan.map((step, idx) => (
              <div
                key={idx}
                className="flex flex-col justify-between rounded-xl border border-brand-primary/30 bg-card p-5 shadow-xs relative overflow-hidden group hover:border-brand-primary/60 transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="rounded-md border-brand-primary/40 bg-brand-primary/10 text-brand-primary font-bold text-body-xs">
                      Prioritas {step.priority || idx + 1}
                    </Badge>
                    <span className="text-body-xs text-muted-foreground font-semibold">Langkah {idx + 1}</span>
                  </div>

                  <h4 className="font-heading text-body-lg font-bold text-foreground group-hover:text-brand-primary transition-colors">
                    {step.focus}
                  </h4>

                  <p className="text-body-sm text-muted-foreground leading-snug">
                    <span className="font-semibold text-foreground block mb-0.5">Alasan:</span>
                    {step.reason}
                  </p>

                  <div className="rounded-md bg-muted/60 p-3 text-body-xs text-foreground space-y-1 border border-border/40">
                    <span className="font-bold text-brand-primary block">Aktivitas Konkret:</span>
                    <p className="leading-snug">{step.action}</p>
                  </div>

                  <div className="text-body-xs text-status-success font-medium flex items-start gap-1.5">
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                    <span>Cek Sukses: {step.success_check}</span>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-border/60">
                  <Button asChild className="w-full rounded-md bg-brand-primary text-white hover:bg-brand-primary/90 text-body-xs font-semibold">
                    <Link href={`/courses/${courseId}`}>
                      Mulai Belajar
                      <ArrowUpRight className="ml-1.5 size-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border/80 bg-card p-5 text-center space-y-3">
            <p className="text-body-sm text-muted-foreground">
              Pertahankan performa Anda! Lanjutkan membaca materi utama bab berikutnya.
            </p>
            <Button asChild variant="outline" size="sm" className="rounded-md border-border">
              <Link href={`/courses/${courseId}`}>Kembali ke Halaman Kelas</Link>
            </Button>
          </div>
        )}

        {/* Encouragement Footer */}
        {diagnosis?.encouragement && (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-center">
            <p className="font-heading text-body-base font-semibold text-foreground italic">
              &ldquo;{diagnosis.encouragement}&rdquo;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function getPerformanceBadgeClass(level: string): string {
  switch (level) {
    case "excellent":
      return "border-status-success/40 bg-status-success/10 text-status-success";
    case "good":
      return "border-brand-primary/40 bg-brand-primary/10 text-brand-primary";
    case "developing":
      return "border-brand-secondary/40 bg-brand-secondary/10 text-brand-secondary";
    default:
      return "border-status-warning/40 bg-status-warning/10 text-status-warning";
  }
}

function getPerformanceLabel(level: string): string {
  switch (level) {
    case "excellent":
      return "Sangat Baik";
    case "good":
      return "Baik & Stabil";
    case "developing":
      return "Sedang Berkembang";
    default:
      return "Perlu Pendampingan";
  }
}

function getMasteryBadgeClass(status: string): string {
  switch (status) {
    case "strong":
      return "border-status-success/40 bg-status-success/10 text-status-success";
    case "adequate":
      return "border-brand-primary/40 bg-brand-primary/10 text-brand-primary";
    case "developing":
      return "border-brand-secondary/40 bg-brand-secondary/10 text-brand-secondary";
    case "needs_reinforcement":
      return "border-status-error/40 bg-status-error/10 text-status-error";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function getMasteryLabel(status: string): string {
  switch (status) {
    case "strong":
      return "Kuat";
    case "adequate":
      return "Cukup dikuasai";
    case "developing":
      return "Sedang berkembang";
    case "needs_reinforcement":
      return "Perlu diperkuat";
    default:
      return "Belum cukup data";
  }
}

function getAccuracyBarColor(acc: number): string {
  if (acc >= 85) return "bg-status-success";
  if (acc >= 70) return "bg-brand-primary";
  if (acc >= 50) return "bg-brand-secondary";
  return "bg-status-error";
}

function getTrendLabel(trend?: string, prevAcc?: number): string {
  if (trend === "improving") return `↗ Meningkat (${prevAcc}% -> kini)`;
  if (trend === "declining") return `↘ Menurun (${prevAcc}% -> kini)`;
  if (trend === "stable") return `→ Stabil (${prevAcc}%)`;
  return "-";
}

function getErrorCategoryLabel(cat: string): string {
  switch (cat) {
    case "conceptual_misunderstanding":
      return "Miskonsepsi Konsep";
    case "procedural_error":
      return "Kesalahan Prosedur";
    case "calculation_error":
      return "Kesalahan Perhitungan";
    case "question_misinterpretation":
      return "Salah Interpretasi Soal";
    case "representation_error":
      return "Kesalahan Representasi";
    case "prerequisite_gap":
      return "Prasyarat Belum Kuat";
    case "incomplete_reasoning":
      return "Penalaran Belum Lengkap";
    default:
      return "Kelemahan Konsistensi";
  }
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs}d`;
  return `${mins}m ${secs}d`;
}
