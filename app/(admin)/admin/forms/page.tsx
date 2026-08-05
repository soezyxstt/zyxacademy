"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  FileText,
  PlusCircle,
  Trash2,
  Copy,
  ExternalLink,
  RefreshCw,
  BarChart3,
  Check,
  AlertCircle,
  HelpCircle,
  ChevronRight,
} from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { formatIsoDate } from "@/lib/date-utils";
import type { CreateCustomQuestionInput } from "@/lib/google-forms";

interface StoredFormItem {
  id: string;
  formId: string;
  title: string;
  description?: string;
  responderUri: string;
  category: "survey" | "quiz" | "feedback" | "registration";
  createdAt: string;
}

export default function AdminFormsPage() {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"survey" | "quiz" | "feedback" | "registration">("survey");

  // Question Builder state
  const [questions, setQuestions] = useState<CreateCustomQuestionInput[]>([
    {
      title: "Bagaimana tingkat kepuasan Anda terhadap materi ini?",
      type: "SCALE",
      required: true,
      scaleLow: 1,
      scaleHigh: 5,
      scaleLowLabel: "Sangat Buruk",
      scaleHighLabel: "Sangat Baik",
    },
    {
      title: "Topik mana yang paling Anda minati?",
      type: "RADIO",
      required: fontRequiredDefault(),
      options: ["Fisika Kinematika", "Kalkulus Lanjut", "Kimia Dasar"],
    },
  ]);

  function fontRequiredDefault() { return true; }

  const [forms, setForms] = useState<StoredFormItem[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchForms = useCallback(async () => {
    setLoadingForms(true);
    try {
      const res = await fetch("/api/admin/forms");
      const data = await res.json();
      if (data.success && Array.isArray(data.forms)) {
        setForms(data.forms);
      } else {
        setForms([]);
      }
    } catch {
      setForms([]);
    } finally {
      setLoadingForms(false);
    }
  }, []);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  const handleAddQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        title: "",
        type: "TEXT",
        required: true,
      },
    ]);
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQuestionChange = (index: number, updated: Partial<CreateCustomQuestionInput>) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...updated } : q))
    );
  };

  const handleAddOption = (qIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const currentOptions = q.options || [];
        return {
          ...q,
          options: [...currentOptions, `Pilihan ${currentOptions.length + 1}`],
        };
      })
    );
  };

  const handleOptionChange = (qIndex: number, optIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const opts = [...(q.options || [])];
        opts[optIndex] = value;
        return { ...q, options: opts };
      })
    );
  };

  const handleRemoveOption = (qIndex: number, optIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        return {
          ...q,
          options: (q.options || []).filter((_, oi) => oi !== optIndex),
        };
      })
    );
  };

  const handleCreateForm = async () => {
    if (!title.trim()) {
      setErrorMsg("Nama / Judul Formulir tidak boleh kosong.");
      return;
    }
    setCreating(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          questions,
        }),
      });
      const data = await res.json();
      if (data.success && data.form) {
        setTitle("");
        setDescription("");
        fetchForms();
      } else {
        setErrorMsg(data.error || "Gagal membuat Google Form.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteForm = async (formId: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus formulir ini dari daftar?")) return;
    setDeletingId(formId);
    try {
      const res = await fetch(`/api/admin/forms/${formId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setForms((prev) => prev.filter((f) => f.formId !== formId));
      } else {
        alert(data.error || "Gagal menghapus formulir.");
      }
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyLink = (uri: string, formId: string) => {
    navigator.clipboard.writeText(uri);
    setCopiedId(formId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Reveal className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
              <FileText className="size-5" />
            </span>
            <h1 className="font-heading text-h4 font-bold text-foreground">
              Google Forms Operations & Custom Builder
            </h1>
          </div>
          <p className="mt-2 text-body-md text-muted-foreground">
            Buat survei, kuis, dan formulir feedback custom dengan Google Forms API, lalu pantau analisis grafik dan visualisasi data respon secara real-time.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-body-sm text-status-error">
          <AlertCircle className="size-5 shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Form Builder Section */}
      <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <PlusCircle className="size-5 text-brand-primary" />
            <h2 className="font-heading text-h5 font-semibold text-foreground">
              Perancang & Pembuat Formulir Custom
            </h2>
          </div>
          <span className="rounded-md bg-brand-primary/10 px-2.5 py-1 text-body-xs font-semibold text-brand-primary">
            {questions.length} Pertanyaan Ditambahkan
          </span>
        </div>

        {/* Basic Form Metadata */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="block text-body-xs font-semibold text-foreground mb-1">
              Nama / Judul Formulir <span className="text-status-error">*</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: Evaluasi Pembelajaran & Feedback Kuliah"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <label className="block text-body-xs font-semibold text-foreground mb-1">
              Kategori Formulir
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="survey">Survei & Riset</option>
              <option value="feedback">Umpan Balik / Feedback</option>
              <option value="quiz">Kuis & Ujian</option>
              <option value="registration">Pendaftaran / Registrasi</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <label className="block text-body-xs font-semibold text-foreground mb-1">
              Deskripsi Formulir (Opsional)
            </label>
            <textarea
              rows={2}
              placeholder="Berikan deskripsi atau petunjuk pengerjaan bagi responden..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Questions Editor */}
        <div className="space-y-4 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-h6 font-semibold text-foreground flex items-center gap-2">
              <HelpCircle className="size-4 text-brand-primary" />
              Daftar Pertanyaan Custom
            </h3>
            <button
              type="button"
              onClick={handleAddQuestion}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-primary/40 bg-brand-primary/10 px-3 py-1.5 text-body-xs font-semibold text-brand-primary hover:bg-brand-primary/20 transition-colors cursor-pointer"
            >
              <PlusCircle className="size-3.5" />
              Tambah Pertanyaan
            </button>
          </div>

          {questions.map((q, qIdx) => (
            <div
              key={qIdx}
              className="rounded-xl border border-border bg-muted/20 p-4 space-y-3 relative group"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder={`Pertanyaan #${qIdx + 1}`}
                    value={q.title}
                    onChange={(e) => handleQuestionChange(qIdx, { title: e.target.value })}
                    className="w-full font-semibold rounded-lg border border-input bg-background px-3 py-1.5 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={q.type}
                    onChange={(e) => handleQuestionChange(qIdx, { type: e.target.value as any })}
                    className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-body-xs font-semibold text-foreground"
                  >
                    <option value="RADIO">Pilihan Ganda (Radio)</option>
                    <option value="CHECKBOX">Kotak Centang (Checkbox)</option>
                    <option value="DROP_DOWN">Drop-down Menu</option>
                    <option value="TEXT">Jawaban Singkat</option>
                    <option value="PARAGRAPH">Paragraf / Teks Panjang</option>
                    <option value="SCALE">Skala Penilaian (1-5)</option>
                  </select>

                  <label className="inline-flex items-center gap-1 text-body-xs text-muted-foreground font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={q.required ?? true}
                      onChange={(e) => handleQuestionChange(qIdx, { required: e.target.checked })}
                      className="rounded border-input text-brand-primary focus:ring-ring"
                    />
                    Wajib
                  </label>

                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(qIdx)}
                      className="text-status-error hover:bg-status-error/10 p-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Options Editor for Choice Questions */}
              {(q.type === "RADIO" || q.type === "CHECKBOX" || q.type === "DROP_DOWN") && (
                <div className="pl-2 space-y-2 border-l-2 border-brand-primary/30 mt-2">
                  <p className="text-body-xs font-semibold text-muted-foreground">Pilihan Jawaban:</p>
                  {(q.options || []).map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-muted-foreground/40" />
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => handleOptionChange(qIdx, oIdx, e.target.value)}
                        className="flex-1 rounded-md border border-input bg-background px-2.5 py-1 text-body-xs text-foreground"
                      />
                      {(q.options || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(qIdx, oIdx)}
                          className="text-muted-foreground hover:text-status-error text-body-xs px-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleAddOption(qIdx)}
                    className="text-body-xs font-semibold text-brand-primary hover:underline mt-1"
                  >
                    + Tambah Opsi
                  </button>
                </div>
              )}

              {/* Scale Labels for Scale Questions */}
              {q.type === "SCALE" && (
                <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t border-border/40 text-body-xs">
                  <div>
                    <label className="block text-muted-foreground font-medium mb-0.5">Label Nilai Terendah (1)</label>
                    <input
                      type="text"
                      value={q.scaleLowLabel || "Sangat Buruk"}
                      onChange={(e) => handleQuestionChange(qIdx, { scaleLowLabel: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-2 py-1"
                    />
                  </div>
                  <div>
                    <label className="block text-muted-foreground font-medium mb-0.5">Label Nilai Tertinggi (5)</label>
                    <input
                      type="text"
                      value={q.scaleHighLabel || "Sangat Baik"}
                      onChange={(e) => handleQuestionChange(qIdx, { scaleHighLabel: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-2 py-1"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Submit Form Creation */}
        <div className="pt-4 border-t border-border">
          <button
            type="button"
            onClick={handleCreateForm}
            disabled={creating}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-body-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {creating ? (
              <>
                <RefreshCw className="size-4 animate-spin" />
                Membuat Google Form ke API...
              </>
            ) : (
              <>
                <FileText className="size-4" />
                Mulai & Terbitkan Google Form Custom
              </>
            )}
          </button>
        </div>
      </div>

      {/* Forms List & Analytics Table */}
      <section className="mt-10 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="font-heading text-h5 font-bold text-foreground">
              Daftar Formulir Terbit & Log Respon
            </h2>
            <p className="text-body-sm text-muted-foreground">
              Daftar Google Forms yang telah diterbitkan beserta link responden dan akses ke dashboard analisis grafik.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchForms}
            disabled={loadingForms}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${loadingForms ? "animate-spin" : ""}`} />
            Muat Ulang
          </button>
        </div>

        {loadingForms ? (
          <div className="flex h-40 items-center justify-center rounded-2xl border border-border bg-card">
            <RefreshCw className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : forms.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center">
            <FileText className="size-10 text-muted-foreground/60" />
            <p className="mt-3 font-heading text-h6 font-semibold text-foreground">
              Belum Ada Google Form Terbuat
            </p>
            <p className="mt-1 text-body-sm text-muted-foreground max-w-md">
              Buat Google Form baru di atas untuk mulai mengumpulkan respon dan melihat visualisasi datanya secara terstruktur.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead className="border-b border-border bg-muted/50 text-body-xs font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Nama Formulir</th>
                    <th className="px-4 py-3">Kategori</th>
                    <th className="px-4 py-3">Waktu Pembuatan</th>
                    <th className="px-4 py-3">URL Responden</th>
                    <th className="px-4 py-3 text-right">Visualisasi & Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {forms.map((f) => {
                    const isDeleting = deletingId === f.formId;
                    const isCopied = copiedId === f.formId;

                    return (
                      <tr key={f.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3.5 font-medium text-foreground whitespace-nowrap">
                          <p className="font-bold text-body-sm text-foreground">{f.title}</p>
                          <p className="font-mono text-body-xs text-muted-foreground">
                            ID: {f.formId}
                          </p>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="rounded-md bg-muted px-2.5 py-1 text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {f.category}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap font-medium">
                          {formatIsoDate(new Date(f.createdAt))}
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleCopyLink(f.responderUri, f.formId)}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                            >
                              {isCopied ? <Check className="size-3 text-status-success" /> : <Copy className="size-3" />}
                              {isCopied ? "Tersalin!" : "Salin Link"}
                            </button>

                            <a
                              href={f.responderUri}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
                            >
                              Buka Form <ExternalLink className="size-3" />
                            </a>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/forms/${f.formId}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-body-xs font-semibold text-brand-primary hover:bg-brand-primary/20 transition-colors"
                            >
                              <BarChart3 className="size-3.5" />
                              Visualisasi Data & Respon
                              <ChevronRight className="size-3.5" />
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleDeleteForm(f.formId)}
                              disabled={isDeleting}
                              title="Hapus formulir"
                              className="inline-flex items-center justify-center rounded-lg border border-status-error/30 bg-status-error/10 p-1.5 text-status-error hover:bg-status-error/20 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {isDeleting ? (
                                <RefreshCw className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </Reveal>
  );
}
