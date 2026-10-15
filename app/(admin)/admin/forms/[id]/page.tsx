"use client";

import { useState, useEffect, useCallback, use, useMemo } from "react";
import Link from "next/link";
import {
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Download,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  PieChart as PieIcon,
  User,
  HelpCircle as QuestionIcon,
  Settings as SettingsIcon,
  Edit3,
} from "lucide-react";
import { formatIsoDate, formatDatetimeLocal } from "@/lib/date-utils";
import { slugifySegment } from "@/lib/storage/keys";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminPageHeader } from "@/components/admin/page-header";
import { MathText } from "@/components/course/math-text";
import { useSpreadsheetExport } from "@/components/admin/spreadsheet-export";

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

function formatAnswerForText(val: any): string {
  if (val === null || val === undefined || val === "") return "-";
  if (typeof val !== "object") return String(val);

  if (Array.isArray(val)) {
    return val.map((v) => formatAnswerForText(v)).join(", ");
  }

  const entries = Object.entries(val);
  if (entries.length === 0) return "-";

  return entries
    .map(([row, colVal]) => {
      const colStr = Array.isArray(colVal) ? colVal.join(", ") : String(colVal ?? "");
      return `${row}: ${colStr}`;
    })
    .join(" | ");
}

function settingsForSave<T extends { openAt?: string; closeAt?: string }>(settings: T): T {
  return {
    ...settings,
    openAt: settings.openAt ? new Date(settings.openAt).toISOString() : "",
    closeAt: settings.closeAt ? new Date(settings.closeAt).toISOString() : "",
  };
}

function RenderFormattedAnswer({ val }: { val: any }) {
  if (val === null || val === undefined || val === "") {
    return <span className="text-muted-foreground italic">-</span>;
  }

  if (typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"))) {
    return (
      <a
        href={val}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-body-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
      >
        📄 Buka Lampiran File <ExternalLink className="size-3.5" />
      </a>
    );
  }

  if (typeof val !== "object") {
    return <span className="text-body-sm text-foreground">{String(val)}</span>;
  }

  if (Array.isArray(val)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {val.map((item, idx) => (
          <Badge key={idx} variant="secondary" className="text-body-xs font-semibold">
            {String(item)}
          </Badge>
        ))}
      </div>
    );
  }

  const entries = Object.entries(val);
  if (entries.length === 0) return <span className="text-muted-foreground italic">-</span>;

  return (
    <div className="space-y-1.5 w-full py-2">
      {entries.map(([rowName, colVal], idx) => (
        <div key={idx} className="flex flex-wrap items-center justify-between text-body-xs gap-2 py-1 border-b border-border/40 last:border-0">
          <span className="font-semibold text-foreground">{rowName}</span>
          <div className="flex flex-wrap items-center gap-1">
            {Array.isArray(colVal) ? (
              colVal.map((c: any, cIdx: number) => (
                <Badge key={cIdx} variant="secondary" className="bg-primary/15 text-primary text-body-xs">
                  {String(c)}
                </Badge>
              ))
            ) : (
              <Badge variant="secondary" className="bg-primary/15 text-primary text-body-xs">
                {String(colVal)}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
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

  const [responseTab, setResponseTab] = useUrlTab("tab", "summary");
  const [selectedQIndex, setSelectedQIndex] = useState<number>(0);
  const [individualIndex, setIndividualIndex] = useState<number>(0);

  const [formSettings, setFormSettings] = useState<any>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const { exporting: exportingSheets, confirmDialog, runExport } = useSpreadsheetExport({
    onSuccess: ({ spreadsheetUrl }) => {
      window.open(spreadsheetUrl, "_blank");
      toast.success("Google Spreadsheet berhasil dibuat.");
    },
    onError: (message) => toast.error(message),
  });

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/custom-forms/${formId}`);
      const data = await res.json();
      if (data.success && data.form) {
        setForm(data.form);
        setResponses(data.responses || []);
        setFormSettings(data.form.settings || {
          acceptingResponses: true,
          closedMessage: "Formulir ini telah ditutup dan tidak lagi menerima tanggapan.",
          openAt: "",
          closeAt: "",
          collectEmail: "none",
          sendResponseCopy: "off",
          allowResponseEditing: false,
          limitToOneResponse: false,
          maxFileSizeLimit: "1GB",
          customSuccessMessage: "Jawaban Anda telah berhasil disimpan.",
        });
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

  const questionNumberMap = useMemo(() => {
    const map = new Map<number, number>();
    (form?.questions || []).forEach((q: any, idx: number) => {
      if (q.type === "SECTION" || q.type === "STATEMENT") return;
      const n = (map.size) + 1;
      map.set(idx, n);
    });
    return map;
  }, [form]);

  const visibleQuestions = useMemo(() => {
    return (form?.questions || [])
      .map((q: any, idx: number) => ({ qIdx: idx, q }))
      .filter((x) => x.q.type !== "SECTION" && x.q.type !== "STATEMENT");
  }, [form]);

  const exportQuestions = visibleQuestions.map(({ qIdx, q }) => {
    const num = questionNumberMap.get(qIdx) || qIdx + 1;
    return {
      qIdx,
      q,
      header: `${num}. ${q.title || `Soal #${num}`}`,
    };
  });

  const safeFormSlug = form ? slugifySegment(form.slug || form.title, "form") : "form";

  const handleSaveSettings = async () => {
    if (
      formSettings.openAt &&
      formSettings.closeAt &&
      new Date(formSettings.openAt).getTime() >= new Date(formSettings.closeAt).getTime()
    ) {
      toast.error("Jadwal buka harus lebih awal dari jadwal tutup.");
      return;
    }
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/admin/custom-forms/${formId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: settingsForSave(formSettings),
        }),
      });
      const data = await res.json();
      if (data.success && data.form) {
        setForm(data.form);
        setFormSettings(data.form.settings || {});
        toast.success("Pengaturan formulir berhasil diperbarui.");
      } else {
        toast.error(data.error || "Gagal menyimpan pengaturan formulir.");
      }
    } catch (err: any) {
      toast.error(err.message || "Terjadi kesalahan jaringan saat menyimpan pengaturan.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExportCSV = () => {
    if (!form || responses.length === 0) return;

    const headersRow = ["Response ID", "Submitted At", "Responder Email", ...exportQuestions.map((x) => x.header)];

    const rows = responses.map((r) => {
      const answerCols = exportQuestions.map(({ qIdx, q }) => {
        const val = r.answers[qIdx] ?? r.answers[q.title] ?? "";
        const formatted = formatAnswerForText(val);
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
    link.setAttribute("download", `zyx_form_${safeFormSlug}_responses.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("File CSV berhasil diunduh.");
  };

  const handleExportGoogleSheets = () => {
    if (!form || responses.length === 0) return;

    const headersRow = ["Response ID", "Submitted At", "Responder Email", ...exportQuestions.map((x) => x.header)];

    const rowsMatrix = responses.map((r) => {
      const answerCols = exportQuestions.map(({ qIdx, q }) => {
        const val = r.answers[qIdx] ?? r.answers[q.title] ?? "";
        return formatAnswerForText(val);
      });
      return [r.id, r.submittedAt, r.responderEmail || "Anonim", ...answerCols];
    });

    runExport({
      entityType: "form",
      entityId: form.id,
      folderSubpath: ["forms", safeFormSlug].join("/"),
      title: `form-${safeFormSlug}-responses`,
      headers: headersRow,
      rows: rowsMatrix,
    });
  };

  return (
    <div className="space-y-4">
      {form && (
        <AdminPageHeader
          icon={FileText}
          backHref="/admin/forms"
          backLabel="Kembali ke Form Studio"
          title={
            <span className="flex flex-wrap items-center gap-3">
              {form.title}
              <Badge variant="secondary" className="bg-primary/10 text-primary uppercase font-bold text-[10px]">
                {form.category}
              </Badge>
            </span>
          }
          description={form.description}
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/admin/forms?edit=${form.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors"
              >
                <Edit3 className="size-3.5 text-primary" />
                Edit Formulir
              </Link>
              <Link
                href={`/f/${form.slug}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-body-xs font-semibold text-primary hover:underline"
              >
                Short Link: /f/{form.slug} <ExternalLink className="size-3.5" />
              </Link>
            </div>
          }
        />
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-body-sm text-destructive">
          <AlertCircle className="size-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <Card className="flex h-60 items-center justify-center">
          <RefreshCw className="size-8 animate-spin text-primary" />
        </Card>
      ) : !form ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <AlertCircle className="size-10 text-muted-foreground" />
          <CardTitle className="mt-3 text-body-base font-heading">Data Formulir Tidak Ditemukan</CardTitle>
        </Card>
      ) : (
        <Tabs
          value={responseTab}
          onValueChange={(val) => setResponseTab(val as any)}
          className="w-full"
        >
          {/* Action Header & Tabs List */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4">
              <div>
                <CardTitle className="text-body-base font-heading">
                  {responses.length} tanggapan
                </CardTitle>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportGoogleSheets}
                  disabled={responses.length === 0 || exportingSheets}
                  isLoading={exportingSheets}
                  className="text-primary hover:text-primary"
                >
                  <FileText className="size-4" />
                  <span>{exportingSheets ? "Mengekspor..." : "Ekspor ke Google Sheets"}</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={responses.length === 0}
                  className="text-status-success hover:text-status-success"
                >
                  <Download className="size-4" />
                  <span>Ekspor ke CSV</span>
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={fetchAnalytics}
                  title="Muat Ulang"
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="border-t border-border pt-4">
              <TabsList>
                <TabsTrigger value="summary">
                  <PieIcon className="size-4 text-primary" />
                  Ringkasan
                </TabsTrigger>
                <TabsTrigger value="question">
                  <QuestionIcon className="size-4 text-brand-secondary" />
                  Per pertanyaan
                </TabsTrigger>
                <TabsTrigger value="individual">
                  <User className="size-4 text-tertiary-1" />
                  Per responden
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <SettingsIcon className="size-4 text-status-warning" />
                  Pengaturan
                </TabsTrigger>
              </TabsList>
            </CardContent>
          </Card>

          {/* TAB 1: SUMMARY */}
          <TabsContent value="summary" className="space-y-6">
            {(form.questions || []).map((q: any, qIdx: number) => {
              if (q.type === "SECTION" || q.type === "STATEMENT") return null;
              const num = questionNumberMap.get(qIdx) || qIdx + 1;
              const questionTitle = q.title || `Pertanyaan #${num}`;
              const allAnswers = responses
                .map((r) => r.answers[qIdx] ?? r.answers[questionTitle])
                .filter((a) => a !== undefined && a !== null && a !== "");

              const isChoiceType =
                q.type === "RADIO" ||
                q.type === "CHECKBOX" ||
                q.type === "DROP_DOWN" ||
                q.type === "SCALE" ||
                q.type === "RATING";

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
                <Card key={qIdx} className="shadow-sm">
                  <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                    <div>
                      <CardTitle className="text-body-sm font-heading">
                        {num}. {questionTitle}
                      </CardTitle>
                      <CardDescription className="text-body-xs font-medium mt-1">
                        {allAnswers.length} tanggapan
                      </CardDescription>
                    </div>

                    {isChoiceType && slices.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${questionTitle}:\n` + slices.map((s) => `- ${s.label}: ${s.count} (${s.percentage}%)`).join("\n")
                          );
                          toast.success("Data grafik disalin ke clipboard!");
                        }}
                        className="text-primary hover:text-primary gap-1 text-body-xs font-semibold"
                      >
                        <Copy className="size-3.5" />
                        Salin Grafik
                      </Button>
                    )}
                  </CardHeader>

                  <CardContent>
                    {allAnswers.length === 0 ? (
                      <p className="text-body-xs text-muted-foreground italic bg-muted/30 p-4 rounded-lg">
                        Belum ada jawaban untuk pertanyaan ini.
                      </p>
                    ) : isChoiceType ? (
                      <SimpleSvgPieChart slices={slices} />
                    ) : q.type === "GRID_RADIO" || q.type === "GRID_CHECKBOX" ? (
                      <div className="overflow-x-auto rounded-lg border border-border bg-card p-4">
                        <table className="w-full text-left text-body-xs">
                          <thead>
                            <tr className="border-b border-border bg-muted/40">
                              <th className="p-2.5 font-bold text-foreground">Baris / Kolom</th>
                              {(q.gridColumns || []).map((col: string, cIdx: number) => (
                                <th key={cIdx} className="p-2.5 font-bold text-foreground text-center">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {(q.gridRows || []).map((rowName: string, rIdx: number) => (
                              <tr key={rIdx} className="hover:bg-muted/20">
                                <td className="p-2.5 font-semibold text-foreground">{rowName}</td>
                                {(q.gridColumns || []).map((colName: string, cIdx: number) => {
                                  let matchCount = 0;
                                  allAnswers.forEach((ansObj: any) => {
                                    if (ansObj && typeof ansObj === "object") {
                                      const userCol = ansObj[rowName];
                                      if (Array.isArray(userCol)) {
                                        if (userCol.includes(colName)) matchCount++;
                                      } else if (userCol === colName) {
                                        matchCount++;
                                      }
                                    }
                                  });
                                  const pct = allAnswers.length > 0 ? Math.round((matchCount / allAnswers.length) * 100) : 0;

                                  return (
                                    <td key={cIdx} className="p-2.5 text-center">
                                      <Badge
                                        variant="secondary"
                                        className={matchCount > 0 ? "bg-primary/15 text-primary" : "text-muted-foreground bg-muted/30"}
                                      >
                                        {matchCount} ({pct}%)
                                      </Badge>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : q.type === "FILE_UPLOAD" ? (
                      <div className="space-y-2">
                        {allAnswers.map((fileUrl: any, fIdx: number) => (
                          <div key={fIdx} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3 text-body-xs">
                            <span className="font-medium text-foreground truncate max-w-md">
                              📄 {String(fileUrl)}
                            </span>
                            <a
                              href={String(fileUrl)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary font-semibold hover:underline"
                            >
                              Buka File <ExternalLink className="size-3" />
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {allAnswers.map((ans: any, aIdx: number) => (
                          <div
                            key={aIdx}
                            className="border-b border-border/60 py-2 text-body-xs font-medium text-foreground"
                          >
                            <RenderFormattedAnswer val={ans} />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* TAB 2: QUESTION */}
          <TabsContent value="question" className="space-y-6">
            <Card className="shadow-sm">
              <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-body-xs font-bold text-primary uppercase tracking-wider">
                    Pertanyaan {selectedQIndex + 1} dari {visibleQuestions.length}
                  </Label>
                  <Select
                    value={selectedQIndex.toString()}
                    onValueChange={(val) => setSelectedQIndex(parseInt(val, 10))}
                  >
                    <SelectTrigger className="w-full text-body-sm font-medium">
                      <SelectValue placeholder="Pilih Pertanyaan" />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleQuestions.map(({ qIdx, q }, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {questionNumberMap.get(qIdx) || i + 1}. {q.title || `Soal #${questionNumberMap.get(qIdx) || i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedQIndex === 0}
                    onClick={() => setSelectedQIndex((prev) => Math.max(0, prev - 1))}
                  >
                    <ChevronLeft className="size-4" /> Prev Soal
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedQIndex === visibleQuestions.length - 1}
                    onClick={() => setSelectedQIndex((prev) => Math.min(visibleQuestions.length - 1, prev + 1))}
                  >
                    Next Soal <ChevronRight className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {(() => {
              const target = visibleQuestions[selectedQIndex];
              if (!target) return null;
              const targetQ = target.q;
              const qIdx = target.qIdx;
              const questionNumber = questionNumberMap.get(qIdx) || selectedQIndex + 1;
              const qTitle = targetQ.title || `Soal #${questionNumber}`;

              const responsesForQ = responses.map((r) => ({
                responderEmail: r.responderEmail || "Anonim",
                submittedAt: r.submittedAt,
                answer: r.answers[qIdx] ?? r.answers[qTitle],
              })).filter((x) => x.answer !== undefined && x.answer !== null && x.answer !== "");

              return (
                <Card className="shadow-sm">
                  <CardHeader className="border-b border-border pb-3">
                    <CardTitle className="text-body-sm font-heading">
                      {questionNumber}. {qTitle}
                    </CardTitle>
                    <CardDescription className="text-body-xs font-semibold">
                      {responsesForQ.length} tanggapan tercatat
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    {responsesForQ.map((item, idx) => (
                      <div key={idx} className="border-b border-border/60 py-3 space-y-1.5">
                        <div className="flex items-center justify-between text-body-xs font-medium text-muted-foreground">
                          <span>Responden: {item.responderEmail}</span>
                          <span className="font-mono">{formatIsoDate(new Date(item.submittedAt))}</span>
                        </div>
                        <div className="pt-1">
                          <RenderFormattedAnswer val={item.answer} />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })()}
          </TabsContent>

          {/* TAB 3: INDIVIDUAL */}
          <TabsContent value="individual" className="space-y-6">
            {responses.length === 0 ? (
              <Card className="p-12 text-center text-muted-foreground text-body-sm">
                Belum ada respon yang masuk.
              </Card>
            ) : (
              <>
                <Card className="shadow-sm">
                  <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={individualIndex === 0}
                        onClick={() => setIndividualIndex((prev) => Math.max(0, prev - 1))}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="text-body-sm font-semibold text-foreground px-2">
                        Responden {individualIndex + 1} dari {responses.length}
                      </span>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={individualIndex === responses.length - 1}
                        onClick={() => setIndividualIndex((prev) => Math.min(responses.length - 1, prev + 1))}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>

                    <div className="text-right text-body-xs">
                      <p className="font-semibold text-foreground">{responses[individualIndex]?.responderEmail || "Anonim"}</p>
                      <p className="text-muted-foreground font-mono text-body-xs">
                        {formatIsoDate(new Date(responses[individualIndex]?.submittedAt))}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {(() => {
                  const currentResp = responses[individualIndex];
                  if (!currentResp) return null;

                  return (
                    <div className="space-y-4">
                      {visibleQuestions.map(({ qIdx, q }, visibleIndex) => {
                        const questionNumber = questionNumberMap.get(qIdx) || visibleIndex + 1;
                        const qTitle = q.title || `Soal #${questionNumber}`;
                        const userAns = currentResp.answers[qIdx] ?? currentResp.answers[qTitle];

                        return (
                          <section key={qIdx} className="border-b border-border pb-3">
                            <CardHeader className="px-0 pb-2">
                              <CardTitle className="text-body-sm font-heading">
                                <MathText as="span">{`${questionNumber}. ${qTitle}`}</MathText>
                              </CardTitle>
                              {q.description && (
                                <CardDescription className="text-body-xs"><MathText as="span">{q.description}</MathText></CardDescription>
                              )}
                            </CardHeader>
                            <CardContent className="px-0 pt-2">
                              <RenderFormattedAnswer val={userAns} />
                            </CardContent>
                          </section>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}
          </TabsContent>

          {/* TAB 4: SETTINGS */}
          <TabsContent value="settings" className="w-full space-y-6">
            {/* Header / Save Action Bar */}
            <Card className="shadow-sm">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-body-base font-heading">
                    Pengaturan Tanggapan & Akses
                  </CardTitle>
                </div>

                <Button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  isLoading={savingSettings}
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                >
                  {savingSettings ? "Menyimpan..." : "Simpan pengaturan"}
                </Button>
              </CardHeader>
            </Card>

            {/* 1. Status & Schedule */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-body-sm font-bold uppercase text-primary tracking-wider">
                  Status dan jadwal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-2 gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="accepting-responses" className="text-body-sm font-semibold cursor-pointer">
                      Menerima Tanggapan
                    </Label>
                  </div>
                  <Switch
                    id="accepting-responses"
                    checked={formSettings.acceptingResponses ?? true}
                    onCheckedChange={(checked) => setFormSettings({ ...formSettings, acceptingResponses: checked })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="open-at" className="text-body-sm font-semibold">
                      Jadwal Buka
                    </Label>
                    <Input
                      id="open-at"
                      type="datetime-local"
                      value={formatDatetimeLocal(formSettings.openAt || "")}
                      onChange={(e) => setFormSettings({ ...formSettings, openAt: e.target.value })}
                      className="text-body-sm"
                    />
                    <p className="text-body-xs text-muted-foreground">Kosongkan jika selalu dibuka.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="close-at" className="text-body-sm font-semibold">
                      Jadwal Tutup
                    </Label>
                    <Input
                      id="close-at"
                      type="datetime-local"
                      value={formatDatetimeLocal(formSettings.closeAt || "")}
                      onChange={(e) => setFormSettings({ ...formSettings, closeAt: e.target.value })}
                      className="text-body-sm"
                    />
                    <p className="text-body-xs text-muted-foreground">Kosongkan jika selalu dibuka.</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="closed-message" className="text-body-sm font-semibold">
                    Pesan Saat Formulir Ditutup
                  </Label>
                  <Textarea
                    id="closed-message"
                    rows={2}
                    value={formSettings.closedMessage || ""}
                    onChange={(e) => setFormSettings({ ...formSettings, closedMessage: e.target.value })}
                    placeholder="Formulir ini telah ditutup dan tidak lagi menerima tanggapan."
                    className="text-body-sm resize-y"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 2. Authentication & Response Rules */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-body-sm font-bold uppercase text-primary tracking-wider">
                  Pengumpulan Alamat Email & Autentikasi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-body-sm font-semibold">
                      Kumpulkan alamat email
                    </Label>
                    <Select
                      value={formSettings.collectEmail || "none"}
                      onValueChange={(val: any) => setFormSettings({ ...formSettings, collectEmail: val })}
                    >
                      <SelectTrigger className="w-full text-body-sm">
                        <SelectValue placeholder="Pilih Pengumpulan Email" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Tidak dikumpulkan</SelectItem>
                        <SelectItem value="input">Diisi manual</SelectItem>
                        <SelectItem value="verified">Verifikasi akun Zyx</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-body-sm font-semibold">
                      Kirim salinan respons ke responden
                    </Label>
                    <Select
                      value={formSettings.sendResponseCopy || "off"}
                      onValueChange={(val: any) => setFormSettings({ ...formSettings, sendResponseCopy: val })}
                    >
                      <SelectTrigger className="w-full text-body-sm">
                        <SelectValue placeholder="Kirim Salinan Respon" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">Mati</SelectItem>
                        <SelectItem value="requested">Saat diminta</SelectItem>
                        <SelectItem value="always">Selalu dikirim</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="allow-editing" className="text-body-sm font-semibold cursor-pointer">
                      Izinkan ubah respons
                    </Label>
                    <p className="text-body-xs text-muted-foreground">
                      Respon dapat diubah kembali oleh responden setelah dikirimkan.
                    </p>
                  </div>
                  <Switch
                    id="allow-editing"
                    checked={formSettings.allowResponseEditing ?? false}
                    onCheckedChange={(checked) => setFormSettings({ ...formSettings, allowResponseEditing: checked })}
                  />
                </div>

                <div className="flex items-center justify-between py-2 gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="limit-one" className="text-body-sm font-semibold cursor-pointer">
                      Batasi 1 respons per responden
                    </Label>
                    <p className="text-body-xs text-muted-foreground">
                      Membatasi responden hanya boleh mengisi 1 kali pengisian.
                    </p>
                  </div>
                  <Switch
                    id="limit-one"
                    checked={formSettings.limitToOneResponse ?? false}
                    onCheckedChange={(checked) => setFormSettings({ ...formSettings, limitToOneResponse: checked })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 3. Storage & Presentation */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-body-sm font-bold uppercase text-primary tracking-wider">
                  Batas Ukuran File Upload & Tampilan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-body-sm font-semibold">
                    Batas total ukuran semua file
                  </Label>
                  <Select
                    value={formSettings.maxFileSizeLimit || "1GB"}
                    onValueChange={(val: any) => setFormSettings({ ...formSettings, maxFileSizeLimit: val })}
                  >
                    <SelectTrigger className="w-full sm:w-1/2 text-body-sm">
                      <SelectValue placeholder="Batas Ukuran File" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1GB">1 GB</SelectItem>
                      <SelectItem value="10GB">10 GB</SelectItem>
                      <SelectItem value="100GB">100 GB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="custom-success" className="text-body-sm font-semibold">
                    Pesan konfirmasi setelah submit
                  </Label>
                  <Input
                    id="custom-success"
                    type="text"
                    value={formSettings.customSuccessMessage || ""}
                    onChange={(e) => setFormSettings({ ...formSettings, customSuccessMessage: e.target.value })}
                    placeholder="Jawaban Anda telah berhasil disimpan."
                    className="text-body-sm"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {confirmDialog}
    </div>
  );
}
