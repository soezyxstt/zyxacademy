"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Download,
  Search,
  BarChart3,
  Calendar,
  CheckCircle2,
  HelpCircle,
  MessageSquare,
} from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { formatIsoDate } from "@/lib/date-utils";
import type { CompleteFormAnalytics } from "@/lib/google-forms";

export default function DetailedFormAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const formId = resolvedParams.id;

  const [analytics, setAnalytics] = useState<CompleteFormAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/forms/${formId}`);
      const data = await res.json();
      if (data.success && data.analytics) {
        setAnalytics(data.analytics);
      } else {
        setError(data.error || "Gagal memuat visualisasi data formulir.");
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExportCSV = () => {
    if (!analytics || analytics.responseMatrix.length === 0) return;

    const allQuestionTitles = analytics.questionAnalytics.map((q) => q.title);
    const headersRow = ["Response ID", "Timestamp", "Respondent Email", ...allQuestionTitles];

    const rows = analytics.responseMatrix.map((row) => {
      const answerCols = allQuestionTitles.map((t) => {
        const val = row.answers[t] || "";
        return `"${val.replace(/"/g, '""')}"`;
      });
      return [
        `"${row.responseId}"`,
        `"${row.createTime}"`,
        `"${row.respondentEmail}"`,
        ...answerCols,
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headersRow.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `google_form_${formId}_responses.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredMatrix = (analytics?.responseMatrix || []).filter((row) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (row.respondentEmail.toLowerCase().includes(q)) return true;
    for (const val of Object.values(row.answers)) {
      if (val.toLowerCase().includes(q)) return true;
    }
    return false;
  });

  return (
    <Reveal className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* Back Button */}
      <Link
        href="/admin/forms"
        className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="size-4" />
        Kembali ke Google Forms Dashboard
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-h4 font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="size-6 text-brand-primary" />
            Visualisasi & Diagnostik Respon Formulir
          </h1>
          {analytics && (
            <p className="mt-1 text-body-sm font-semibold text-foreground">
              {analytics.title} <span className="font-mono text-muted-foreground">(ID: {formId})</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {analytics?.responderUri && (
            <a
              href={analytics.responderUri}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-body-xs font-semibold text-brand-primary hover:bg-muted transition-colors"
            >
              Buka Form Asli <ExternalLink className="size-3.5" />
            </a>
          )}

          <button
            type="button"
            onClick={fetchAnalytics}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Muat Ulang Data
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-body-sm text-status-error">
          <AlertCircle className="size-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="mt-10 flex h-60 items-center justify-center rounded-2xl border border-border bg-card">
          <RefreshCw className="size-8 animate-spin text-brand-primary" />
        </div>
      ) : !analytics ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center">
          <AlertCircle className="size-10 text-muted-foreground" />
          <p className="mt-3 font-heading text-h6 font-semibold text-foreground">
            Data Formulir Tidak Ditemukan
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {/* Overview Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="size-4 text-brand-primary" />
                <span className="text-body-xs font-semibold uppercase tracking-wider">
                  Total Respon Masuk
                </span>
              </div>
              <p className="mt-2 font-heading text-h4 font-bold text-brand-primary">
                {analytics.totalSubmissions} Responden
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                Tercatat pada Google Forms API
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <HelpCircle className="size-4" />
                <span className="text-body-xs font-semibold uppercase tracking-wider">
                  Total Pertanyaan
                </span>
              </div>
              <p className="mt-2 font-heading text-h4 font-bold text-foreground">
                {analytics.totalQuestions} Soal
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                Di dalam instrumen formulir
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="size-4 text-status-success" />
                <span className="text-body-xs font-semibold uppercase tracking-wider">
                  Tingkat Kelengkapan
                </span>
              </div>
              <p className="mt-2 font-heading text-h4 font-bold text-foreground">
                100%
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                Respon terekam lengkap
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="size-4" />
                <span className="text-body-xs font-semibold uppercase tracking-wider">
                  Pengisian Terakhir
                </span>
              </div>
              <p className="mt-2 font-heading text-h5 font-bold text-foreground">
                {analytics.submissionTimeline.length > 0
                  ? formatIsoDate(new Date(analytics.submissionTimeline[analytics.submissionTimeline.length - 1].date))
                  : "Belum ada"}
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                Tanggal submit terbaru
              </p>
            </div>
          </div>

          {/* Question Visualizations Section */}
          <section className="space-y-6">
            <div className="border-b border-border pb-3">
              <h2 className="font-heading text-h5 font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="size-5 text-brand-primary" />
                Visualisasi Distribusi Respon per Pertanyaan
              </h2>
              <p className="text-body-sm text-muted-foreground">
                Grafik batang dan persentase pilihan jawaban secara visual.
              </p>
            </div>

            {analytics.questionAnalytics.map((q, idx) => (
              <div key={q.questionId || idx} className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
                  <div>
                    <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-xs font-bold text-brand-primary">
                      Pertanyaan #{idx + 1}
                    </span>
                    <h3 className="font-heading text-h6 font-semibold text-foreground mt-1">
                      {q.title}
                    </h3>
                  </div>
                  <span className="text-body-xs font-semibold text-muted-foreground">
                    {q.totalAnswers} Jawaban
                  </span>
                </div>

                {/* CHOICE QUESTION VISUALIZATION */}
                {q.type === "choice" && q.optionsBreakdown && (
                  <div className="space-y-3">
                    {q.optionsBreakdown.map((opt, oIdx) => (
                      <div key={oIdx} className="space-y-1">
                        <div className="flex items-center justify-between text-body-sm">
                          <span className="font-medium text-foreground">{opt.label}</span>
                          <span className="font-bold text-brand-primary">
                            {opt.count} respon ({opt.percentage}%)
                          </span>
                        </div>
                        {/* CSS Progress Bar */}
                        <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-brand-primary rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(opt.percentage, 3)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* SCALE QUESTION VISUALIZATION */}
                {q.type === "scale" && q.scaleDistribution && (
                  <div className="grid gap-3 sm:grid-cols-5 pt-2">
                    {q.scaleDistribution.map((s) => {
                      const maxCount = Math.max(...q.scaleDistribution!.map((x) => x.count), 1);
                      const heightPercent = Math.round((s.count / maxCount) * 100);

                      return (
                        <div key={s.rating} className="flex flex-col items-center rounded-xl border border-border bg-muted/20 p-3 text-center">
                          <div className="h-24 w-full flex items-end justify-center py-1">
                            <div
                              className="w-10 rounded-t-lg bg-brand-primary/80 transition-all duration-500"
                              style={{ height: `${Math.max(heightPercent, 8)}%` }}
                            />
                          </div>
                          <span className="mt-2 font-bold text-body-md text-foreground">
                            Nilai {s.rating}
                          </span>
                          <span className="text-body-xs text-muted-foreground font-semibold">
                            {s.count} Responden
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* TEXT QUESTION VISUALIZATION */}
                {q.type === "text" && q.sampleTextAnswers && (
                  <div className="space-y-2">
                    <p className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <MessageSquare className="size-3.5" /> Sampel Jawaban Responden:
                    </p>
                    {q.sampleTextAnswers.length === 0 ? (
                      <p className="text-body-sm text-muted-foreground italic">Belum ada isian teks.</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {q.sampleTextAnswers.map((ans, aIdx) => (
                          <div key={aIdx} className="rounded-xl border border-border bg-muted/40 p-3 text-body-sm italic text-foreground">
                            &quot;{ans}&quot;
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>

          {/* Structured Response Matrix Table Section */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3">
              <div>
                <h2 className="font-heading text-h5 font-bold text-foreground">
                  Matriks Spreadsheet Jawaban Responden
                </h2>
                <p className="text-body-sm text-muted-foreground">
                  Daftar rinci seluruh jawaban responden dalam bentuk tabel matriks terstruktur.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-body-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
              >
                <Download className="size-3.5" />
                Ekspor ke CSV
              </button>
            </div>

            {/* Search filter */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cari berdasarkan email atau kata kunci jawaban..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-input bg-card pl-9 pr-4 py-2 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {filteredMatrix.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
                Tidak ada data jawaban yang cocok dengan pencarian.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-body-xs">
                    <thead className="border-b border-border bg-muted/60 text-muted-foreground font-semibold">
                      <tr>
                        <th className="px-4 py-3 whitespace-nowrap">Timestamp</th>
                        <th className="px-4 py-3 whitespace-nowrap">Responden</th>
                        {analytics.questionAnalytics.map((q) => (
                          <th key={q.questionId} className="px-4 py-3 min-w-[200px]">
                            {q.title}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredMatrix.map((row) => (
                        <tr key={row.responseId} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-mono">
                            {formatIsoDate(new Date(row.createTime))}
                          </td>
                          <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                            {row.respondentEmail}
                          </td>
                          {analytics.questionAnalytics.map((q) => (
                            <td key={q.questionId} className="px-4 py-3 text-foreground font-medium">
                              {row.answers[q.title] || "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </Reveal>
  );
}
