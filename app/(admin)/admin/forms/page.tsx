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
  GripVertical,
  AlignLeft,
  Menu,
  CircleDot,
  CheckSquare,
  ChevronDown,
  Sliders,
  Calendar,
  Clock,
  Plus,
  ArrowUpRight,
  ChevronRight,
  UploadCloud,
  Star,
  Grid,
  Grid3X3,
  Sparkles,
} from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { formatIsoDate } from "@/lib/date-utils";
import type { CreateCustomQuestionInput, QuestionType } from "@/lib/google-forms";

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
  const [activeTab, setActiveTab] = useState<"builder" | "forms">("builder");

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("Formulir Pembelajaran & Evaluasi Custom");
  const [description, setDescription] = useState("Silakan isi formulir ini dengan cermat dan seksama.");
  const [category, setCategory] = useState<"survey" | "quiz" | "feedback" | "registration">("survey");

  const [activeQIndex, setActiveQIndex] = useState<number>(0);

  // Question Builder state (Default initialized with common questions)
  const [questions, setQuestions] = useState<CreateCustomQuestionInput[]>([
    {
      title: "Nama Lengkap",
      description: "Sesuai dengan kartu identitas mahasiswa (KTM / KTP)",
      type: "TEXT",
      required: true,
    },
    {
      title: "Topik Mana yang Paling Dipahami?",
      description: "Pilih salah satu materi utama",
      type: "RADIO",
      required: true,
      options: ["Fisika Kinematika", "Kalkulus Vektor", "Kimia Organik"],
    },
    {
      title: "Tingkat Kepuasan Sesi Tutorial",
      description: "Penilaian 1 (Sangat Buruk) hingga 5 (Sangat Baik)",
      type: "SCALE",
      required: true,
      scaleLow: 1,
      scaleHigh: 5,
      scaleLowLabel: "Sangat Buruk",
      scaleHighLabel: "Sangat Baik",
    },
    {
      title: "Evaluasi Komponen Pembelajaran",
      description: "Beri jawaban per baris",
      type: "GRID_RADIO",
      required: true,
      gridRows: ["Kejelasan Penjelasan", "Kecepatan Materi"],
      gridColumns: ["Kurang", "Cukup", "Sangat Baik"],
    },
  ]);

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
    const newIdx = questions.length;
    setQuestions((prev) => [
      ...prev,
      {
        title: "",
        description: "",
        type: "TEXT",
        required: true,
      },
    ]);
    setActiveQIndex(newIdx);
  };

  const handleLoadFull12TypePreset = () => {
    setQuestions([
      { title: "Nama Lengkap (Short Answer)", type: "TEXT", required: true },
      { title: "Saran & Masukan (Paragraph)", type: "PARAGRAPH", required: false },
      { title: "Peminatan Matkul (Multiple Choice)", type: "RADIO", options: ["Matematika", "Fisika", "Kimia"], required: true },
      { title: "Fasilitas Diinginkan (Checkboxes)", type: "CHECKBOX", options: ["Diktat PDF", "Video Rekaman", "Gmeet Live"], required: true },
      { title: "Pilih Angkatan (Dropdown)", type: "DROP_DOWN", options: ["TPB 2024", "TPB 2025", "Lainnya"], required: true },
      { title: "Unggah KTM / Berkas (File Upload)", type: "FILE_UPLOAD", required: false },
      { title: "Skala Penilaian Pembelajaran (Linear Scale)", type: "SCALE", scaleLow: 1, scaleHigh: 5, scaleLowLabel: "Kurang", scaleHighLabel: "Baik", required: true },
      { title: "Rating Pengajar (Rating Bintang)", type: "RATING", required: true },
      { title: "Matrix Kinerja (Multiple Choice Grid)", type: "GRID_RADIO", gridRows: ["Materi", "Kejelasan"], gridColumns: ["Buruk", "Baik"], required: true },
      { title: "Matrix Keahlian (Checkbox Grid)", type: "GRID_CHECKBOX", gridRows: ["Dasar", "Lanjut"], gridColumns: ["Teori", "Praktek"], required: true },
      { title: "Tanggal Pengisian (Date)", type: "DATE", required: true },
      { title: "Jam Kehadiran (Time)", type: "TIME", required: true },
    ]);
    setActiveQIndex(0);
  };

  const handleDuplicateQuestion = (index: number) => {
    const target = questions[index];
    if (!target) return;
    const duplicated: CreateCustomQuestionInput = {
      ...target,
      title: `${target.title} (Salinan)`,
      options: target.options ? [...target.options] : undefined,
      gridRows: target.gridRows ? [...target.gridRows] : undefined,
      gridColumns: target.gridColumns ? [...target.gridColumns] : undefined,
    };
    const updated = [...questions];
    updated.splice(index + 1, 0, duplicated);
    setQuestions(updated);
    setActiveQIndex(index + 1);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== index));
    setActiveQIndex(Math.max(0, index - 1));
  };

  const handleQuestionChange = (index: number, updated: Partial<CreateCustomQuestionInput>) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...updated } : q))
    );
  };

  // Options Helpers
  const handleAddOption = (qIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const currentOptions = q.options || [];
        return {
          ...q,
          options: [...currentOptions, `Opsi ${currentOptions.length + 1}`],
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

  // Grid Helpers
  const handleAddGridRow = (qIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const rows = q.gridRows || [];
        return { ...q, gridRows: [...rows, `Baris ${rows.length + 1}`] };
      })
    );
  };

  const handleGridRowChange = (qIndex: number, rIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const rows = [...(q.gridRows || [])];
        rows[rIndex] = value;
        return { ...q, gridRows: rows };
      })
    );
  };

  const handleRemoveGridRow = (qIndex: number, rIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        return { ...q, gridRows: (q.gridRows || []).filter((_, ri) => ri !== rIndex) };
      })
    );
  };

  const handleAddGridCol = (qIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const cols = q.gridColumns || [];
        return { ...q, gridColumns: [...cols, `Kolom ${cols.length + 1}`] };
      })
    );
  };

  const handleGridColChange = (qIndex: number, cIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const cols = [...(q.gridColumns || [])];
        cols[cIndex] = value;
        return { ...q, gridColumns: cols };
      })
    );
  };

  const handleRemoveGridCol = (qIndex: number, cIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        return { ...q, gridColumns: (q.gridColumns || []).filter((_, ci) => ci !== cIndex) };
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
        fetchForms();
        setActiveTab("forms");
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
    <Reveal className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      {/* Top App Bar & Tab Navigation */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <FileText className="size-5" />
          </span>
          <div>
            <h1 className="font-heading text-h5 font-bold text-foreground">
              Google Forms Studio & Visualizer
            </h1>
            <p className="text-body-xs text-muted-foreground">
              Mendukung 12 Jenis Soal Lengkap Google Forms dengan kustomisasi Zyx Design System.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1 border border-border/80">
          <button
            type="button"
            onClick={() => setActiveTab("builder")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-body-xs font-semibold transition-colors cursor-pointer ${
              activeTab === "builder"
                ? "bg-card text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="size-3.5" />
            Editor Pertanyaan ({questions.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("forms")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-body-xs font-semibold transition-colors cursor-pointer ${
              activeTab === "forms"
                ? "bg-card text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="size-3.5" />
            Daftar Terbit ({forms.length})
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-body-sm text-status-error">
          <AlertCircle className="size-5 shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* TAB 1: GOOGLE FORMS EDITOR EXPERIENCE */}
      {activeTab === "builder" && (
        <div className="grid gap-6 md:grid-cols-12 items-start">
          {/* Main Question Cards Column */}
          <div className="md:col-span-9 space-y-5">
            {/* Header Card (Title & Description Card) */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm border-l-4 border-l-brand-primary space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="Judul Formulir"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full font-heading text-h4 font-bold text-foreground bg-transparent border-b border-border/40 pb-2 focus:border-brand-primary focus:outline-none transition-colors"
                />
              </div>

              <div>
                <textarea
                  rows={2}
                  placeholder="Deskripsi formulir atau petunjuk bagi responden..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-body-sm text-muted-foreground bg-transparent border-b border-border/40 pb-1 focus:border-brand-primary focus:outline-none transition-colors resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-body-xs font-semibold text-muted-foreground">Kategori:</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="rounded-lg border border-input bg-background px-2.5 py-1 text-body-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="survey">Survei & Riset</option>
                    <option value="feedback">Umpan Balik / Feedback</option>
                    <option value="quiz">Kuis & Ujian</option>
                    <option value="registration">Pendaftaran / Registrasi</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleLoadFull12TypePreset}
                  className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline cursor-pointer"
                >
                  <Sparkles className="size-3.5" />
                  Muat Preset 12 Jenis Soal
                </button>
              </div>
            </div>

            {/* Question Cards List */}
            {questions.map((q, qIdx) => {
              const isActive = activeQIndex === qIdx;

              return (
                <div
                  key={qIdx}
                  onClick={() => setActiveQIndex(qIdx)}
                  className={`rounded-2xl border bg-card p-6 shadow-sm transition-all space-y-4 relative ${
                    isActive
                      ? "border-l-4 border-l-brand-primary border-border ring-1 ring-brand-primary/20"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  {/* Top Drag Handle */}
                  <div className="flex items-center justify-center -mt-2 text-muted-foreground/40 hover:text-muted-foreground cursor-grab">
                    <GripVertical className="size-5 rotate-90" />
                  </div>

                  {/* Question Title & Question Type Selector Row */}
                  <div className="grid gap-3 sm:grid-cols-12 items-start">
                    <div className="sm:col-span-7 space-y-2">
                      <input
                        type="text"
                        placeholder="Teks Pertanyaan"
                        value={q.title}
                        onChange={(e) => handleQuestionChange(qIdx, { title: e.target.value })}
                        className="w-full font-heading text-h6 font-semibold text-foreground bg-transparent border-b border-border/40 pb-1.5 focus:border-brand-primary focus:outline-none transition-colors"
                      />
                      <input
                        type="text"
                        placeholder="Deskripsi tambahan pertanyaan (Opsional)"
                        value={q.description || ""}
                        onChange={(e) => handleQuestionChange(qIdx, { description: e.target.value })}
                        className="w-full text-body-xs text-muted-foreground bg-transparent border-b border-border/20 pb-1 focus:border-brand-primary focus:outline-none transition-colors"
                      />
                    </div>

                    <div className="sm:col-span-5">
                      <div className="relative">
                        <select
                          value={q.type}
                          onChange={(e) => handleQuestionChange(qIdx, { type: e.target.value as QuestionType })}
                          className="w-full rounded-xl border border-input bg-background pl-9 pr-8 py-2 text-body-xs font-semibold text-foreground appearance-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                        >
                          <option value="TEXT">Short answer (Jawaban Singkat)</option>
                          <option value="PARAGRAPH">Paragraph (Teks Panjang)</option>
                          <option value="RADIO">Multiple choice (Pilihan Ganda)</option>
                          <option value="CHECKBOX">Checkboxes (Kotak Centang)</option>
                          <option value="DROP_DOWN">Dropdown</option>
                          <option value="FILE_UPLOAD">File upload (Unggah Berkas)</option>
                          <option value="SCALE">Linear scale (Skala Penilaian 1-5)</option>
                          <option value="RATING">Rating (Penilaian Bintang)</option>
                          <option value="GRID_RADIO">Multiple choice grid (Kisi Pilihan Ganda)</option>
                          <option value="GRID_CHECKBOX">Checkbox grid (Kisi Kotak Centang)</option>
                          <option value="DATE">Date (Tanggal)</option>
                          <option value="TIME">Time (Waktu)</option>
                        </select>

                        {/* Icon Prefix for Question Type */}
                        <span className="absolute left-3 top-2.5 text-brand-primary pointer-events-none">
                          {q.type === "TEXT" && <AlignLeft className="size-4" />}
                          {q.type === "PARAGRAPH" && <Menu className="size-4" />}
                          {q.type === "RADIO" && <CircleDot className="size-4" />}
                          {q.type === "CHECKBOX" && <CheckSquare className="size-4" />}
                          {q.type === "DROP_DOWN" && <ChevronDown className="size-4" />}
                          {q.type === "FILE_UPLOAD" && <UploadCloud className="size-4" />}
                          {q.type === "SCALE" && <Sliders className="size-4" />}
                          {q.type === "RATING" && <Star className="size-4" />}
                          {q.type === "GRID_RADIO" && <Grid className="size-4" />}
                          {q.type === "GRID_CHECKBOX" && <Grid3X3 className="size-4" />}
                          {q.type === "DATE" && <Calendar className="size-4" />}
                          {q.type === "TIME" && <Clock className="size-4" />}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Question Content & Option Editors per Type */}
                  <div className="pt-2">
                    {/* 1. TEXT */}
                    {q.type === "TEXT" && (
                      <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-body-xs text-muted-foreground w-2/3">
                        Teks jawaban singkat
                      </div>
                    )}

                    {/* 2. PARAGRAPH */}
                    {q.type === "PARAGRAPH" && (
                      <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-body-xs text-muted-foreground w-full">
                        Teks jawaban panjang (Paragraf)
                      </div>
                    )}

                    {/* 3. CHOICE (RADIO, CHECKBOX, DROP_DOWN) */}
                    {(q.type === "RADIO" || q.type === "CHECKBOX" || q.type === "DROP_DOWN") && (
                      <div className="space-y-2.5 pl-1">
                        {(q.options || []).map((opt, oIdx) => (
                          <div key={oIdx} className="flex items-center gap-2.5">
                            {q.type === "RADIO" && <CircleDot className="size-4 text-muted-foreground shrink-0" />}
                            {q.type === "CHECKBOX" && <CheckSquare className="size-4 text-muted-foreground shrink-0" />}
                            {q.type === "DROP_DOWN" && <span className="text-body-xs font-mono font-bold text-muted-foreground w-4">{oIdx + 1}.</span>}

                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => handleOptionChange(qIdx, oIdx, e.target.value)}
                              className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-body-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />

                            {(q.options || []).length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveOption(qIdx, oIdx)}
                                className="text-muted-foreground hover:text-status-error p-1 rounded-md transition-colors"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => handleAddOption(qIdx)}
                          className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline mt-1 cursor-pointer"
                        >
                          <Plus className="size-3.5" />
                          Tambah opsi jawaban
                        </button>
                      </div>
                    )}

                    {/* 4. FILE UPLOAD */}
                    {q.type === "FILE_UPLOAD" && (
                      <div className="rounded-xl border border-dashed border-brand-primary/40 bg-brand-primary/5 p-4 text-center text-body-xs text-muted-foreground space-y-1">
                        <UploadCloud className="size-6 text-brand-primary mx-auto" />
                        <p className="font-semibold text-foreground">Area Unggah Berkas Responden</p>
                        <p>File akan diunggah langsung ke Google Drive Cloud Storage</p>
                      </div>
                    )}

                    {/* 5. LINEAR SCALE */}
                    {q.type === "SCALE" && (
                      <div className="grid gap-3 sm:grid-cols-2 rounded-xl border border-border/80 bg-muted/20 p-3 text-body-xs">
                        <div>
                          <label className="block text-muted-foreground font-semibold mb-1">Label Terendah (1)</label>
                          <input
                            type="text"
                            value={q.scaleLowLabel || "Sangat Buruk"}
                            onChange={(e) => handleQuestionChange(qIdx, { scaleLowLabel: e.target.value })}
                            className="w-full rounded-lg border border-input bg-background px-3 py-1 text-body-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-muted-foreground font-semibold mb-1">Label Tertinggi (5)</label>
                          <input
                            type="text"
                            value={q.scaleHighLabel || "Sangat Baik"}
                            onChange={(e) => handleQuestionChange(qIdx, { scaleHighLabel: e.target.value })}
                            className="w-full rounded-lg border border-input bg-background px-3 py-1 text-body-xs"
                          />
                        </div>
                      </div>
                    )}

                    {/* 6. RATING */}
                    {q.type === "RATING" && (
                      <div className="flex items-center gap-2 p-2 rounded-xl border border-border/80 bg-muted/20">
                        <span className="text-body-xs font-semibold text-muted-foreground">Pratinjau Rating:</span>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star key={star} className="size-5 text-status-warning fill-status-warning/30" />
                        ))}
                      </div>
                    )}

                    {/* 7. GRID (GRID_RADIO & GRID_CHECKBOX) */}
                    {(q.type === "GRID_RADIO" || q.type === "GRID_CHECKBOX") && (
                      <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-border/80 bg-muted/20 p-4 text-body-xs">
                        {/* Rows Editor */}
                        <div className="space-y-2">
                          <p className="font-bold text-foreground">Baris (Pertanyaan Per-Baris):</p>
                          {(q.gridRows || ["Baris 1", "Baris 2"]).map((rowVal, rIdx) => (
                            <div key={rIdx} className="flex items-center gap-2">
                              <span className="text-muted-foreground font-bold">{rIdx + 1}.</span>
                              <input
                                type="text"
                                value={rowVal}
                                onChange={(e) => handleGridRowChange(qIdx, rIdx, e.target.value)}
                                className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1"
                              />
                              {(q.gridRows || []).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveGridRow(qIdx, rIdx)}
                                  className="text-muted-foreground hover:text-status-error px-1"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleAddGridRow(qIdx)}
                            className="text-brand-primary font-semibold hover:underline text-body-xs mt-1"
                          >
                            + Tambah Baris
                          </button>
                        </div>

                        {/* Columns Editor */}
                        <div className="space-y-2">
                          <p className="font-bold text-foreground">Kolom (Pilihan Kolom):</p>
                          {(q.gridColumns || ["Kolom 1", "Kolom 2"]).map((colVal, cIdx) => (
                            <div key={cIdx} className="flex items-center gap-2">
                              <span className="text-muted-foreground font-bold">{cIdx + 1}.</span>
                              <input
                                type="text"
                                value={colVal}
                                onChange={(e) => handleGridColChange(qIdx, cIdx, e.target.value)}
                                className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1"
                              />
                              {(q.gridColumns || []).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveGridCol(qIdx, cIdx)}
                                  className="text-muted-foreground hover:text-status-error px-1"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleAddGridCol(qIdx)}
                            className="text-brand-primary font-semibold hover:underline text-body-xs mt-1"
                          >
                            + Tambah Kolom
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 8. DATE */}
                    {q.type === "DATE" && (
                      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-body-xs text-muted-foreground w-1/2">
                        <Calendar className="size-4 text-brand-primary" />
                        <span>Format Tanggal: bbbb-bb-hh</span>
                      </div>
                    )}

                    {/* 9. TIME */}
                    {q.type === "TIME" && (
                      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-body-xs text-muted-foreground w-1/2">
                        <Clock className="size-4 text-brand-primary" />
                        <span>Format Waktu: hh:mm</span>
                      </div>
                    )}
                  </div>

                  {/* Card Bottom Actions Bar */}
                  <div className="flex items-center justify-between border-t border-border/60 pt-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleDuplicateQuestion(qIdx)}
                        title="Salin Pertanyaan"
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Copy className="size-3.5" />
                        Salin
                      </button>

                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(qIdx)}
                          title="Hapus Pertanyaan"
                          className="inline-flex items-center gap-1 rounded-lg border border-status-error/30 bg-status-error/10 px-2.5 py-1 text-body-xs font-semibold text-status-error hover:bg-status-error/20 transition-colors cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                          Hapus
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="h-4 w-px bg-border" />
                      <label className="inline-flex items-center gap-1.5 text-body-xs font-semibold text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={q.required ?? true}
                          onChange={(e) => handleQuestionChange(qIdx, { required: e.target.checked })}
                          className="rounded border-input text-brand-primary focus:ring-ring"
                        />
                        Wajib Diisi
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Floating Actions Sidebar Column */}
          <div className="md:col-span-3 space-y-4 md:sticky md:top-24">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
              <p className="text-body-xs font-bold text-foreground uppercase tracking-wider">
                Aksi Formulir:
              </p>

              <button
                type="button"
                onClick={handleAddQuestion}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-brand-primary/40 bg-brand-primary/10 px-3 py-2.5 text-body-xs font-bold text-brand-primary hover:bg-brand-primary/20 transition-colors cursor-pointer"
              >
                <PlusCircle className="size-4" />
                Tambah Pertanyaan
              </button>

              <button
                type="button"
                onClick={handleCreateForm}
                disabled={creating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-body-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {creating ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Terbitkan ke Google...
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="size-4" />
                    Terbitkan ke Google Forms
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PUBLISHED FORMS LIST */}
      {activeTab === "forms" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="font-heading text-h5 font-bold text-foreground">
                Daftar Formulir Google Terbit
              </h2>
              <p className="text-body-sm text-muted-foreground">
                Daftar Google Forms yang dibuat dari panel ini beserta link responden dan akses ke dashboard analisis grafik.
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
                Gunakan tab &quot;Editor Pertanyaan&quot; untuk merancang dan menerbitkan formulir baru.
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
        </div>
      )}
    </Reveal>
  );
}
