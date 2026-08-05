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

interface NativeFormDetails {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category: string;
  questions: any[];
  googleResponderUri?: string;
  createdAt: string;
}

interface FormResponseItem {
  id: string;
  responderEmail?: string;
  answers: Record<string, any>;
  submittedAt: string;
}

export default function DetailedFormAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const formId = resolvedParams.id;

  const [form, setForm] = useState<NativeFormDetails | null>(null);
  const [responses, setResponses] = useState<FormResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/custom-forms/${formId}`);
      const data = await res.json();
      if (data.success && data.form) {
        setForm(data.form);
        setResponses(data.responses || []);
      } else {
        setError(data.error || "Gagal memuat data formulir.");
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
    if (!form || responses.length === 0) return;

    const allQuestionTitles = (form.questions || []).map((q: any, i: number) => q.title || `Soal #${i + 1}`);
    const headersRow = ["Response ID", "Submitted At", "Responder Email", ...allQuestionTitles];

    const rows = responses.map((r) => {
      const answerCols = (form.questions || []).map((q: any, i: number) => {
        const val = r.answers[i] ?? r.answers[q.title] ?? "";
        const formatted = typeof val === "object" ? JSON.stringify(val) : String(val);
        return `"${formatted.replace(/"/g, '""')}"`;
      });
      return [
        `"${r.id}"`,
        `"${r.submittedAt}"`,
        `"${r.responderEmail || "Anonim"}"`,
        ...answerCols,
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headersRow.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `zyx_form_${form.slug}_responses.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredResponses = responses.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if ((r.responderEmail || "").toLowerCase().includes(q)) return true;
    for (const val of Object.values(r.answers || {})) {
      if (String(val).toLowerCase().includes(q)) return true;
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
        Kembali ke Dashboard Formulir
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-h4 font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="size-6 text-brand-primary" />
            Visualisasi & Diagnostik Respon Formulir Zyx
          </h1>
          {form && (
            <p className="mt-1 text-body-sm font-semibold text-foreground flex items-center gap-2">
              <span>{form.title}</span>
              <span className="font-mono text-muted-foreground">(Slug: /f/{form.slug})</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {form && (
            <Link
              href={`/f/${form.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-body-xs font-semibold text-brand-primary hover:bg-muted transition-colors"
            >
              Buka Short Link /f/{form.slug} <ExternalLink className="size-3.5" />
            </Link>
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
      ) : !form ? (
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
                {responses.length} Responden
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                Tercatat pada Zyx Storage Engine
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
                {(form.questions || []).length} Soal
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                Di dalam instrumen formulir
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="size-4 text-status-success" />
                <span className="text-body-xs font-semibold uppercase tracking-wider">
                  Short Link Path
                </span>
              </div>
              <p className="mt-2 font-mono font-bold text-body-md text-foreground truncate">
                /f/{form.slug}
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                Siap dibagikan ke responden
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
                {responses.length > 0
                  ? formatIsoDate(new Date(responses[0].submittedAt))
                  : "Belum ada"}
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                Tanggal submit terbaru
              </p>
            </div>
          </div>

          {/* Question Breakdown Cards */}
          <section className="space-y-6">
            <div className="border-b border-border pb-3">
              <h2 className="font-heading text-h5 font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="size-5 text-brand-primary" />
                Visualisasi Distribusi Respon per Pertanyaan
              </h2>
            </div>

            {(form.questions || []).map((q: any, qIdx: number) => {
              const questionTitle = q.title || `Soal #${qIdx + 1}`;
              const allAnswersForQ = responses.map((r) => r.answers[qIdx] ?? r.answers[questionTitle]).filter((a) => a !== undefined && a !== null && a !== "");

              return (
                <div key={qIdx} className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
                  <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-xs font-bold text-brand-primary">
                        Pertanyaan #{qIdx + 1} ({q.type})
                      </span>
                      <h3 className="font-heading text-h6 font-semibold text-foreground mt-1">
                        {questionTitle}
                      </h3>
                    </div>
                    <span className="text-body-xs font-semibold text-muted-foreground">
                      {allAnswersForQ.length} Jawaban
                    </span>
                  </div>

                  {/* Sample Text / Link Answers */}
                  <div className="space-y-2">
                    <p className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <MessageSquare className="size-3.5" /> Sampel Isian Jawaban Responden:
                    </p>
                    {allAnswersForQ.length === 0 ? (
                      <p className="text-body-sm text-muted-foreground italic">Belum ada pengisian.</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {allAnswersForQ.slice(0, 8).map((ans: any, aIdx: number) => {
                          const displayStr = typeof ans === "object" ? JSON.stringify(ans) : String(ans);
                          const isUrl = displayStr.startsWith("http");

                          return (
                            <div key={aIdx} className="rounded-xl border border-border bg-muted/40 p-3 text-body-sm text-foreground">
                              {isUrl ? (
                                <a
                                  href={displayStr}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-brand-primary font-semibold hover:underline flex items-center gap-1.5 truncate"
                                >
                                  <ExternalLink className="size-3.5 shrink-0" />
                                  {displayStr}
                                </a>
                              ) : (
                                <span className="italic">&quot;{displayStr}&quot;</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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

            {filteredResponses.length === 0 ? (
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
                        {(form.questions || []).map((q: any, i: number) => (
                          <th key={i} className="px-4 py-3 min-w-[200px]">
                            {q.title || `Soal #${i + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredResponses.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-mono">
                            {formatIsoDate(new Date(row.submittedAt))}
                          </td>
                          <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                            {row.responderEmail || "Anonim"}
                          </td>
                          {(form.questions || []).map((q: any, i: number) => {
                            const val = row.answers[i] ?? row.answers[q.title] ?? "-";
                            const valStr = typeof val === "object" ? JSON.stringify(val) : String(val);

                            return (
                              <td key={i} className="px-4 py-3 text-foreground font-medium max-w-xs truncate">
                                {valStr}
                              </td>
                            );
                          })}
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
