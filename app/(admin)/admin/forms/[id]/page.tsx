"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  PieChart as PieIcon,
  User,
  HelpCircle as QuestionIcon,
} from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { formatIsoDate } from "@/lib/date-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

// Pure SVG Pie Chart Component for Choice Question Visualizations
function SimpleSvgPieChart({
  slices,
}: {
  slices: { label: string; count: number; percentage: number; color: string }[];
}) {
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  let currentAngle = 0;
  const pieSlices = [];
  for (const slice of slices) {
    const angle = (slice.count / total) * 360;
    const startAngle = currentAngle;
    const endAngle = startAngle + angle;
    currentAngle = endAngle;

    // Convert angles to SVG arc paths
    const x1 = 100 + 80 * Math.cos((Math.PI * (startAngle - 90)) / 180);
    const y1 = 100 + 80 * Math.sin((Math.PI * (startAngle - 90)) / 180);
    const x2 = 100 + 80 * Math.cos((Math.PI * (endAngle - 90)) / 180);
    const y2 = 100 + 80 * Math.sin((Math.PI * (endAngle - 90)) / 180);
    const largeArcFlag = angle > 180 ? 1 : 0;

    const pathData =
      angle >= 360
        ? `M 100 20 A 80 80 0 1 1 99.99 20 Z`
        : `M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

    pieSlices.push({ ...slice, pathData });
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-4">
      <div className="relative size-44 shrink-0">
        <svg viewBox="0 0 200 200" className="size-full transform -rotate-90">
          {pieSlices.map((slice, i) => (
            <path key={i} d={slice.pathData} fill={slice.color} className="transition-all hover:opacity-90" />
          ))}
        </svg>
      </div>

      <div className="space-y-2 text-body-xs min-w-44">
        {slices.map((slice, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="size-3 rounded-xs shrink-0" style={{ backgroundColor: slice.color }} />
            <span className="font-medium text-foreground truncate max-w-40">{slice.label}</span>
            <span className="font-bold text-muted-foreground ml-auto">{slice.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const PIE_COLORS = [
  "#3b82f6", // Blue
  "#ef4444", // Red
  "#f59e0b", // Yellow/Orange
  "#10b981", // Teal/Green
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
];

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

  // 3 Response Sub-Tabs: "summary" | "question" | "individual"
  const [responseTab, setResponseTab] = useState<"summary" | "question" | "individual">("summary");

  // State for "question" tab selector
  const [selectedQIndex, setSelectedQIndex] = useState<number>(0);

  // State for "individual" tab respondent index
  const [individualIndex, setIndividualIndex] = useState<number>(0);

  // Search filter state in summary spreadsheet
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

  const [exportingSheets, setExportingSheets] = useState(false);

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

  const handleExportGoogleSheets = async () => {
    if (!form || responses.length === 0) return;
    setExportingSheets(true);

    try {
      const allQuestionTitles = (form.questions || []).map((q: any, i: number) => q.title || `Soal #${i + 1}`);
      const headersRow = ["Response ID", "Submitted At", "Responder Email", ...allQuestionTitles];

      const rowsMatrix = responses.map((r) => {
        const answerCols = (form.questions || []).map((q: any, i: number) => {
          const val = r.answers[i] ?? r.answers[q.title] ?? "";
          return typeof val === "object" ? JSON.stringify(val) : String(val);
        });
        return [r.id, r.submittedAt, r.responderEmail || "Anonim", ...answerCols];
      });

      const res = await fetch("/api/admin/export-spreadsheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${form.title} Responses`,
          headers: headersRow,
          rows: rowsMatrix,
        }),
      });

      const data = await res.json();
      if (data.success && data.spreadsheetUrl) {
        window.open(data.spreadsheetUrl, "_blank");
      } else {
        alert(data.error || "Gagal membuat Google Spreadsheet. Silakan gunakan ekspor CSV.");
      }
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan saat mengekspor ke Google Spreadsheet.");
    } finally {
      setExportingSheets(false);
    }
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
    <Reveal className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 space-y-6">
      {/* Back Link */}
      <Link
        href="/admin/forms"
        className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Kembali ke Form Studio
      </Link>

      {/* Main Form Title Header Card */}
      {form && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm border-t-8 border-t-brand-primary space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-md bg-brand-primary/10 px-2.5 py-1 text-body-2xs font-bold uppercase tracking-wider text-brand-primary">
              {form.category}
            </span>
            <Link
              href={`/f/${form.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
            >
              Short Link: /f/{form.slug} <ExternalLink className="size-3.5" />
            </Link>
          </div>
          <h1 className="font-heading text-h3 font-bold text-foreground">{form.title}</h1>
          {form.description && (
            <p className="text-body-sm text-muted-foreground">{form.description}</p>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-body-sm text-status-error">
          <AlertCircle className="size-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex h-60 items-center justify-center rounded-2xl border border-border bg-card">
          <RefreshCw className="size-8 animate-spin text-brand-primary" />
        </div>
      ) : !form ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center">
          <AlertCircle className="size-10 text-muted-foreground" />
          <p className="mt-3 font-heading text-h6 font-semibold text-foreground">
            Data Formulir Tidak Ditemukan
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Responses Header & 3-Tab Selector Bar */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="font-heading text-h3 font-bold text-foreground">
                  {responses.length} responses
                </h2>
                <p className="text-body-xs text-muted-foreground mt-0.5">
                  Visualisasi & diagnosa pengisian responden secara real-time
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportGoogleSheets}
                  disabled={responses.length === 0 || exportingSheets}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-brand-primary/40 bg-brand-primary/10 px-3.5 py-2 text-body-xs font-bold text-brand-primary hover:bg-brand-primary/20 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`size-4 ${exportingSheets ? "animate-spin" : "hidden"}`} />
                  <FileText className="size-4" />
                  {exportingSheets ? "Mengekspor..." : "Ekspor ke Google Sheets"}
                </button>

                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={responses.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-status-success/40 bg-status-success/10 px-3.5 py-2 text-body-xs font-bold text-status-success hover:bg-status-success/20 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Download className="size-4" />
                  Ekspor ke CSV
                </button>

                <button
                  type="button"
                  onClick={fetchAnalytics}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background p-2 text-body-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  title="Muat Ulang"
                >
                  <RefreshCw className="size-4" />
                </button>
              </div>
            </div>

            {/* Google Forms 3-Tab Selector (Summary | Question | Individual) */}
            <div className="flex items-center justify-center border-t border-border/60 pt-4">
              <div className="inline-flex items-center gap-2 rounded-xl bg-muted/60 p-1.5 border border-border/80 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setResponseTab("summary")}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-lg px-6 py-2 text-body-xs font-bold transition-all cursor-pointer ${
                    responseTab === "summary"
                      ? "bg-card text-foreground shadow-xs border border-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <PieIcon className="size-4 text-brand-primary" />
                  Summary (Ringkasan Total)
                </button>

                <button
                  type="button"
                  onClick={() => setResponseTab("question")}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-lg px-6 py-2 text-body-xs font-bold transition-all cursor-pointer ${
                    responseTab === "question"
                      ? "bg-card text-foreground shadow-xs border border-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <QuestionIcon className="size-4 text-brand-secondary" />
                  Question (Per Soal)
                </button>

                <button
                  type="button"
                  onClick={() => setResponseTab("individual")}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-lg px-6 py-2 text-body-xs font-bold transition-all cursor-pointer ${
                    responseTab === "individual"
                      ? "bg-card text-foreground shadow-xs border border-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <User className="size-4 text-tertiary-1" />
                  Individual (Per Responden)
                </button>
              </div>
            </div>
          </div>

          {/* TAB 1: SUMMARY (RINGKASAN TOTAL VISUAL) */}
          {responseTab === "summary" && (
            <div className="space-y-6">
              {(form.questions || []).map((q: any, qIdx: number) => {
                const questionTitle = q.title || `Pertanyaan #${qIdx + 1}`;
                const allAnswers = responses
                  .map((r) => r.answers[qIdx] ?? r.answers[questionTitle])
                  .filter((a) => a !== undefined && a !== null && a !== "");

                const isChoiceType =
                  q.type === "RADIO" ||
                  q.type === "CHECKBOX" ||
                  q.type === "DROP_DOWN" ||
                  q.type === "SCALE" ||
                  q.type === "RATING";

                // Calculate breakdown for choices
                let slices: { label: string; count: number; percentage: number; color: string }[] = [];
                if (isChoiceType && allAnswers.length > 0) {
                  const counts: Record<string, number> = {};
                  allAnswers.forEach((ans) => {
                    if (Array.isArray(ans)) {
                      ans.forEach((sub) => {
                        counts[sub] = (counts[sub] || 0) + 1;
                      });
                    } else {
                      const str = String(ans);
                      counts[str] = (counts[str] || 0) + 1;
                    }
                  });

                  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);
                  slices = Object.entries(counts).map(([lbl, cnt], i) => ({
                    label: lbl,
                    count: cnt,
                    percentage: Math.round((cnt / totalCount) * 100),
                    color: PIE_COLORS[i % PIE_COLORS.length],
                  }));
                }

                return (
                  <div key={qIdx} className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-heading text-h6 font-semibold text-foreground">
                          {qIdx + 1}. {questionTitle}
                        </h3>
                        <p className="text-body-2xs text-muted-foreground mt-0.5 font-semibold">
                          {allAnswers.length} responses
                        </p>
                      </div>

                      {isChoiceType && slices.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `${questionTitle}:\n` + slices.map((s) => `- ${s.label}: ${s.count} (${s.percentage}%)`).join("\n")
                            );
                            alert("Data grafik disalin ke clipboard!");
                          }}
                          className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline cursor-pointer"
                        >
                          <Copy className="size-3.5" />
                          Salin Grafik
                        </button>
                      )}
                    </div>

                    {/* Content visualization */}
                    {allAnswers.length === 0 ? (
                      <p className="text-body-xs text-muted-foreground italic bg-muted/20 p-4 rounded-xl">
                        Belum ada jawaban untuk pertanyaan ini.
                      </p>
                    ) : isChoiceType ? (
                      <SimpleSvgPieChart slices={slices} />
                    ) : q.type === "FILE_UPLOAD" ? (
                      <div className="space-y-2">
                        {allAnswers.map((fileUrl: any, fIdx: number) => (
                          <div key={fIdx} className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3 text-body-xs">
                            <span className="font-semibold text-foreground truncate max-w-md">
                              📄 {String(fileUrl)}
                            </span>
                            <a
                              href={String(fileUrl)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-brand-primary font-bold hover:underline"
                            >
                              Buka File <ExternalLink className="size-3" />
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* Text & List answers */
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {allAnswers.map((ans: any, aIdx: number) => {
                          const displayStr = typeof ans === "object" ? JSON.stringify(ans) : String(ans);

                          return (
                            <div
                              key={aIdx}
                              className="rounded-xl border border-border/80 bg-muted/20 p-3 text-body-xs font-medium text-foreground"
                            >
                              {displayStr}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Structured Response Matrix Table Section */}
              <section className="space-y-4 pt-4 border-t border-border">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-h5 font-bold text-foreground">
                      Spreadsheet Jawaban Responden
                    </h3>
                    <p className="text-body-xs text-muted-foreground">
                      Tabel matriks terstruktur seluruh pengisian jawaban.
                    </p>
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Cari email / kata kunci..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-input bg-card pl-9 pr-4 py-2 text-body-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-body-xs">
                      <thead className="border-b border-border bg-muted/60 text-muted-foreground font-semibold">
                        <tr>
                          <th className="px-4 py-3 whitespace-nowrap">Timestamp</th>
                          <th className="px-4 py-3 whitespace-nowrap">Responden</th>
                          {(form.questions || []).map((q: any, i: number) => (
                            <th key={i} className="px-4 py-3 min-w-[180px]">
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
              </section>
            </div>
          )}

          {/* TAB 2: QUESTION (PER PERTANYAAN) */}
          {responseTab === "question" && (
            <div className="space-y-6">
              {/* Question Selector Bar */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <span className="text-body-2xs font-bold text-brand-primary uppercase tracking-wider">
                    Pertanyaan {selectedQIndex + 1} dari {(form.questions || []).length}
                  </span>
                  <Select
                    value={selectedQIndex.toString()}
                    onValueChange={(val) => setSelectedQIndex(parseInt(val, 10))}
                  >
                    <SelectTrigger className="w-full h-11 text-body-sm font-semibold">
                      <SelectValue placeholder="Pilih Pertanyaan" />
                    </SelectTrigger>
                    <SelectContent>
                      {(form.questions || []).map((q: any, i: number) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i + 1}. {q.title || `Soal #${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    disabled={selectedQIndex === 0}
                    onClick={() => setSelectedQIndex((prev) => Math.max(0, prev - 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-2 text-body-xs font-semibold text-foreground hover:bg-muted disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="size-4" /> Prev Soal
                  </button>
                  <button
                    type="button"
                    disabled={selectedQIndex === (form.questions || []).length - 1}
                    onClick={() => setSelectedQIndex((prev) => Math.min((form.questions || []).length - 1, prev + 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-2 text-body-xs font-semibold text-foreground hover:bg-muted disabled:opacity-30 cursor-pointer"
                  >
                    Next Soal <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>

              {/* Inspector for Selected Question */}
              {(() => {
                const targetQ = (form.questions || [])[selectedQIndex];
                if (!targetQ) return null;
                const qTitle = targetQ.title || `Soal #${selectedQIndex + 1}`;

                const responsesForQ = responses.map((r) => ({
                  responderEmail: r.responderEmail || "Anonim",
                  submittedAt: r.submittedAt,
                  answer: r.answers[selectedQIndex] ?? r.answers[qTitle],
                })).filter((x) => x.answer !== undefined && x.answer !== null && x.answer !== "");

                return (
                  <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
                    <div className="border-b border-border pb-3">
                      <h3 className="font-heading text-h5 font-bold text-foreground">
                        {selectedQIndex + 1}. {qTitle}
                      </h3>
                      <p className="text-body-xs text-muted-foreground mt-0.5 font-semibold">
                        {responsesForQ.length} responses tercatat
                      </p>
                    </div>

                    <div className="space-y-3">
                      {responsesForQ.map((item, idx) => {
                        const strVal = typeof item.answer === "object" ? JSON.stringify(item.answer) : String(item.answer);

                        return (
                          <div key={idx} className="rounded-xl border border-border bg-muted/20 p-4 space-y-1">
                            <div className="flex items-center justify-between text-body-2xs font-semibold text-muted-foreground">
                              <span>Responden: {item.responderEmail}</span>
                              <span className="font-mono">{formatIsoDate(new Date(item.submittedAt))}</span>
                            </div>
                            <p className="text-body-sm font-semibold text-foreground">{strVal}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 3: INDIVIDUAL (PER RESPONDEN) */}
          {responseTab === "individual" && (
            <div className="space-y-6">
              {responses.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
                  Belum ada respon yang masuk.
                </div>
              ) : (
                <>
                  {/* Respondent Switcher Header */}
                  <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={individualIndex === 0}
                        onClick={() => setIndividualIndex((prev) => Math.max(0, prev - 1))}
                        className="p-2 rounded-xl border border-border bg-background hover:bg-muted disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronLeft className="size-5" />
                      </button>

                      <span className="font-heading text-h6 font-bold text-foreground">
                        {individualIndex + 1} dari {responses.length}
                      </span>

                      <button
                        type="button"
                        disabled={individualIndex === responses.length - 1}
                        onClick={() => setIndividualIndex((prev) => Math.min(responses.length - 1, prev + 1))}
                        className="p-2 rounded-xl border border-border bg-background hover:bg-muted disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronRight className="size-5" />
                      </button>
                    </div>

                    <div className="text-right text-body-xs">
                      <p className="font-bold text-foreground">{responses[individualIndex]?.responderEmail || "Anonim"}</p>
                      <p className="text-muted-foreground font-mono text-body-2xs">
                        {formatIsoDate(new Date(responses[individualIndex]?.submittedAt))}
                      </p>
                    </div>
                  </div>

                  {/* Individual Respondent Form View */}
                  {(() => {
                    const currentResp = responses[individualIndex];
                    if (!currentResp) return null;

                    return (
                      <div className="space-y-4">
                        {(form.questions || []).map((q: any, qIdx: number) => {
                          const qTitle = q.title || `Soal #${qIdx + 1}`;
                          const userAns = currentResp.answers[qIdx] ?? currentResp.answers[qTitle];
                          const strAns = typeof userAns === "object" ? JSON.stringify(userAns) : String(userAns ?? "-");

                          return (
                            <div key={qIdx} className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-2">
                              <h4 className="font-heading text-h6 font-semibold text-foreground">
                                {qIdx + 1}. {qTitle}
                              </h4>
                              {q.description && (
                                <p className="text-body-xs text-muted-foreground">{q.description}</p>
                              )}

                              <div className="pt-2">
                                {userAns && String(userAns).startsWith("http") ? (
                                  <a
                                    href={String(userAns)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-brand-primary/30 bg-brand-primary/10 px-4 py-2 text-body-xs font-bold text-brand-primary hover:bg-brand-primary/20 transition-colors"
                                  >
                                    📄 Buka Lampiran File <ExternalLink className="size-3.5" />
                                  </a>
                                ) : (
                                  <div className="rounded-xl border border-border bg-muted/30 p-4 text-body-sm font-semibold text-foreground">
                                    {strAns}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Reveal>
  );
}
