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
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  Table as TableIcon,
  Layers,
  MoreVertical,
  Shuffle,
  ZoomIn,
  Link2,
} from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import type { CreateCustomQuestionInput, QuestionType } from "@/lib/google-forms";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

interface ExtendedQuestionInput extends CreateCustomQuestionInput {
  showDescription?: boolean;
  shuffleOptions?: boolean;
}

interface StoredNativeForm {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category: "survey" | "quiz" | "feedback" | "registration";
  questions: ExtendedQuestionInput[];
  googleResponderUri?: string;
  totalResponses: number;
  createdAt: string;
}

export default function AdminFormsPage() {
  const [activeTab, setActiveTab] = useState<"builder" | "settings" | "forms">("builder");

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"survey" | "quiz" | "feedback" | "registration">("survey");
  const [slug, setSlug] = useState("");

  const [settings, setSettings] = useState({
    acceptingResponses: true,
    closedMessage: "Formulir ini telah ditutup dan tidak lagi menerima tanggapan.",
    openAt: "",
    closeAt: "",
    collectEmail: "none" as "none" | "input" | "verified",
    sendResponseCopy: "off" as "off" | "requested" | "always",
    allowResponseEditing: false,
    limitToOneResponse: false,
    maxFileSizeLimit: "1GB" as "1GB" | "10GB" | "100GB",
    customSuccessMessage: "Jawaban Anda telah berhasil disimpan.",
  });

  const [activeQIndex, setActiveQIndex] = useState<number>(0);

  // Drag & Drop reorder state
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Shadcn Dialog states
  const [confirmDeleteFormId, setConfirmDeleteFormId] = useState<string | null>(null);
  const [alertDialogInfo, setAlertDialogInfo] = useState<{ title: string; message: string } | null>(null);
  const [zoomImageUri, setZoomImageUri] = useState<{ url: string; title: string } | null>(null);

  // Question Builder state (Default blank single question card)
  const [questions, setQuestions] = useState<ExtendedQuestionInput[]>([
    {
      title: "",
      description: "",
      showDescription: true,
      type: "TEXT",
      required: true,
    },
  ]);

  const [forms, setForms] = useState<StoredNativeForm[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchForms = useCallback(async () => {
    setLoadingForms(true);
    try {
      const res = await fetch("/api/admin/custom-forms");
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

  const moveQuestion = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= questions.length || fromIdx === toIdx) return;
    setQuestions((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, moved);
      return updated;
    });
    setActiveQIndex(toIdx);
  };

  const handleAddQuestion = () => {
    const newQ: ExtendedQuestionInput = {
      title: "",
      type: "TEXT",
      required: true,
    };
    setQuestions([...questions, newQ]);
    setActiveQIndex(questions.length);
  };

  const handleAddSection = () => {
    const newSection: ExtendedQuestionInput = {
      title: "Bagian Baru",
      description: "Petunjuk atau deskripsi untuk bagian ini",
      type: "SECTION",
      required: false,
    };
    setQuestions([...questions, newSection]);
    setActiveQIndex(questions.length);
  };

  const handleLoadFull12TypePreset = () => {
    setQuestions([
      { title: "Nama Lengkap (Short Answer)", type: "TEXT", required: true, showDescription: true },
      { title: "Saran & Masukan (Paragraph)", type: "PARAGRAPH", required: false, showDescription: true },
      { title: "Peminatan Matkul (Multiple Choice)", type: "RADIO", options: ["Matematika", "Fisika", "Kimia"], required: true, showDescription: true },
      { title: "Fasilitas Diinginkan (Checkboxes)", type: "CHECKBOX", options: ["Diktat PDF", "Video Rekaman", "Gmeet Live"], required: true, showDescription: true },
      { title: "Pilih Angkatan (Dropdown)", type: "DROP_DOWN", options: ["TPB 2024", "TPB 2025", "Lainnya"], required: true, showDescription: true },
      { title: "Unggah Berkas / Dokumen (File Upload)", type: "FILE_UPLOAD", required: false, showDescription: true },
      { title: "Skala Penilaian Pembelajaran (Linear Scale)", type: "SCALE", scaleLow: 1, scaleHigh: 5, scaleLowLabel: "Kurang", scaleHighLabel: "Baik", required: true, showDescription: true },
      { title: "Rating Pengajar (Rating Bintang)", type: "RATING", required: true, showDescription: true },
      { title: "Matrix Kinerja (Multiple Choice Grid)", type: "GRID_RADIO", gridRows: ["Penguasaan Materi", "Kerapihan Slide"], gridColumns: ["Cukup", "Baik", "Sangat Baik"], required: true, showDescription: true },
      { title: "Matrix Keahlian (Checkbox Grid)", type: "GRID_CHECKBOX", gridRows: ["Dasar", "Lanjut"], gridColumns: ["Teori", "Praktek"], required: true, showDescription: true },
      { title: "Tanggal Pengisian (Date)", type: "DATE", required: true, showDescription: true },
      { title: "Jam Kehadiran (Time)", type: "TIME", required: true, showDescription: true },
    ]);
    setActiveQIndex(0);
  };

  const handleDuplicateQuestion = (index: number) => {
    const target = questions[index];
    if (!target) return;
    const duplicated: ExtendedQuestionInput = {
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

  const handleQuestionChange = (index: number, updated: Partial<ExtendedQuestionInput>) => {
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

  const [uploadingQIndex, setUploadingQIndex] = useState<number | null>(null);

  const handleImageFileUpload = async (qIndex: number, file: File) => {
    setUploadingQIndex(qIndex);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/storage/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.url) {
        handleQuestionChange(qIndex, { imageUrl: data.url, showDescription: true });
      } else {
        setAlertDialogInfo({
          title: "Gagal Mengunggah Gambar",
          message: data.error || "Gagal mengunggah berkas gambar ke penyimpan media.",
        });
      }
    } catch (err: any) {
      setAlertDialogInfo({
        title: "Kesalahan Jaringan",
        message: err.message || "Terjadi kesalahan pengunggahan.",
      });
    } finally {
      setUploadingQIndex(null);
    }
  };

  const handleCreateForm = async () => {
    if (!title.trim()) {
      setErrorMsg("Nama / Judul Formulir tidak boleh kosong.");
      return;
    }
    setCreating(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/custom-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          slug: slug.trim() || undefined,
          questions,
          settings,
        }),
      });
      const data = await res.json();
      if (data.success && data.form) {
        fetchForms();
        setActiveTab("forms");
      } else {
        setErrorMsg(data.error || "Gagal membuat formulir.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setCreating(false);
    }
  };

  const executeDeleteForm = async (formId: string) => {
    setDeletingId(formId);
    setConfirmDeleteFormId(null);
    try {
      const res = await fetch(`/api/admin/custom-forms/${formId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setForms((prev) => prev.filter((f) => f.id !== formId));
      } else {
        setAlertDialogInfo({
          title: "Gagal Menghapus Formulir",
          message: data.error || "Gagal menghapus formulir dari daftar terbit.",
        });
      }
    } catch (err: any) {
      setAlertDialogInfo({
        title: "Kesalahan Jaringan",
        message: err.message || "Terjadi kesalahan jaringan saat menghapus formulir.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyLink = (path: string, itemKey: string) => {
    const fullUrl = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(itemKey);
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
              Form Studio & Visualizer
            </h1>
            <p className="text-body-xs text-muted-foreground">
              Mendukung 12 Jenis Soal Lengkap, Short Links (/f/[slug]), Unggah Berkas & Custom UI.
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
            onClick={() => setActiveTab("settings")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-body-xs font-semibold transition-colors cursor-pointer ${
              activeTab === "settings"
                ? "bg-card text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sliders className="size-3.5" />
            Settings (Pengaturan)
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

      {/* TAB 1: FORM EDITOR EXPERIENCE */}
      {activeTab === "builder" && (
        <div className="grid gap-6 md:grid-cols-12 items-start">
          {/* Main Question Cards Column */}
          <div className="md:col-span-9 space-y-5">
            {/* Header Card (Title, Description, & Short Slug Card) */}
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

              {/* Short Link Custom Slug Row */}
              <div className="rounded-xl border border-border/80 bg-muted/20 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-body-xs">
                <div className="flex items-center gap-2">
                  <Link2 className="size-4 text-brand-primary shrink-0" />
                  <span className="font-bold text-foreground">Short Link Custom:</span>
                  <span className="font-mono text-muted-foreground">/f/</span>
                  <input
                    type="text"
                    placeholder="tpb2026-eval"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                    className="font-mono font-semibold rounded-md border border-input bg-background px-2 py-0.5 text-body-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-36"
                  />
                </div>
                <span className="text-body-2xs text-muted-foreground">Responden dapat mengakses via /f/{slug || "slug"}</span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-body-xs font-semibold text-muted-foreground">Kategori:</span>
                  <Select value={category} onValueChange={(val: any) => setCategory(val)}>
                    <SelectTrigger className="w-48 h-8 text-body-xs font-semibold">
                      <SelectValue placeholder="Pilih Kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="survey">Survei & Riset</SelectItem>
                      <SelectItem value="feedback">Umpan Balik / Feedback</SelectItem>
                      <SelectItem value="quiz">Kuis & Ujian</SelectItem>
                      <SelectItem value="registration">Pendaftaran / Registrasi</SelectItem>
                    </SelectContent>
                  </Select>
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

            {/* Question Cards List with Drag & Drop */}
            {questions.map((q, qIdx) => {
              const isActive = activeQIndex === qIdx;
              const isDragging = draggedIdx === qIdx;
              const isDragOver = dragOverIdx === qIdx && draggedIdx !== qIdx;

              return (
                <div
                  key={qIdx}
                  onClick={() => setActiveQIndex(qIdx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverIdx(qIdx);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromIdxStr = e.dataTransfer.getData("text/plain");
                    const fromIdx = parseInt(fromIdxStr, 10);
                    if (!isNaN(fromIdx)) {
                      moveQuestion(fromIdx, qIdx);
                    }
                    setDraggedIdx(null);
                    setDragOverIdx(null);
                  }}
                  className={`rounded-2xl border bg-card p-6 shadow-sm transition-all space-y-4 relative ${
                    isDragging
                      ? "opacity-40 border-dashed border-brand-primary"
                      : isDragOver
                      ? "border-2 border-brand-primary bg-brand-primary/5"
                      : isActive
                      ? "border-l-4 border-l-brand-primary border-border ring-1 ring-brand-primary/20"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  {/* Top Drag Handle & Quick Reorder Controls */}
                  <div className="flex items-center justify-between border-b border-border/40 pb-2 -mt-1">
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", qIdx.toString());
                        setDraggedIdx(qIdx);
                      }}
                      onDragEnd={() => {
                        setDraggedIdx(null);
                        setDragOverIdx(null);
                      }}
                      className="inline-flex items-center gap-1 text-body-xs font-semibold text-muted-foreground hover:text-brand-primary cursor-grab active:cursor-grabbing transition-colors"
                      title="Geser & Tarik untuk Mengubah Urutan Pertanyaan"
                    >
                      <GripVertical className="size-4 text-brand-primary" />
                      <span>Geser Posisi Pertanyaan #{qIdx + 1}</span>
                    </div>

                    {/* Quick Move Buttons & Three-Dots Menu */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={qIdx === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveQuestion(qIdx, qIdx - 1);
                        }}
                        title="Pindahkan Ke Atas"
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="size-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={qIdx === questions.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveQuestion(qIdx, qIdx + 1);
                        }}
                        title="Pindahkan Ke Bawah"
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="size-3.5" />
                      </button>

                      {/* Three-Dots Menu Popover */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
                            title="Opsi Kustomisasi Lainnya"
                          >
                            <MoreVertical className="size-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-1 space-y-0.5">
                          <button
                            type="button"
                            onClick={() => handleDuplicateQuestion(qIdx)}
                            className="w-full inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-body-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer text-left"
                          >
                            <Copy className="size-3.5 text-muted-foreground" />
                            Salin Pertanyaan
                          </button>

                          <button
                            type="button"
                            onClick={() => handleQuestionChange(qIdx, { showDescription: !q.showDescription })}
                            className="w-full inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-body-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer text-left"
                          >
                            <FileText className="size-3.5 text-muted-foreground" />
                            {q.showDescription ? "Sembunyikan Subteks" : "Tampilkan Subteks"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (q.imageUrl) {
                                handleQuestionChange(qIdx, { imageUrl: undefined });
                              } else {
                                handleQuestionChange(qIdx, { showDescription: true });
                              }
                            }}
                            className="w-full inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-body-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer text-left"
                          >
                            <ImageIcon className="size-3.5 text-muted-foreground" />
                            {q.imageUrl ? "Hapus Gambar" : "Lampirkan Gambar"}
                          </button>

                          {(q.type === "RADIO" || q.type === "CHECKBOX" || q.type === "DROP_DOWN") && (
                            <button
                              type="button"
                              onClick={() => handleQuestionChange(qIdx, { shuffleOptions: !q.shuffleOptions })}
                              className="w-full inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-body-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer text-left"
                            >
                              <Shuffle className="size-3.5 text-muted-foreground" />
                              {q.shuffleOptions ? "Nonaktifkan Acak Opsi" : "Acak Urutan Opsi"}
                            </button>
                          )}

                          {questions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveQuestion(qIdx)}
                              className="w-full inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-body-xs font-medium text-status-error hover:bg-status-error/10 transition-colors cursor-pointer text-left border-t border-border/40 mt-1 pt-1.5"
                            >
                              <Trash2 className="size-3.5 text-status-error" />
                              Hapus Pertanyaan
                            </button>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
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

                      {(q.showDescription ?? true) && (
                        <input
                          type="text"
                          placeholder="Deskripsi tambahan pertanyaan (Opsional)"
                          value={q.description || ""}
                          onChange={(e) => handleQuestionChange(qIdx, { description: e.target.value })}
                          className="w-full text-body-xs text-muted-foreground bg-transparent border-b border-border/20 pb-1 focus:border-brand-primary focus:outline-none transition-colors"
                        />
                      )}

                      {/* Image Attachment Bar & Lightbox Zoom Button */}
                      {q.imageUrl ? (
                        <div className="relative mt-2 inline-block rounded-xl border border-border bg-muted/30 p-2 overflow-hidden group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={q.imageUrl}
                            alt="Pratinjau Gambar Soal"
                            className="max-h-48 rounded-lg object-contain cursor-pointer"
                            onClick={() => setZoomImageUri({ url: q.imageUrl!, title: q.title })}
                          />
                          <button
                            type="button"
                            onClick={() => setZoomImageUri({ url: q.imageUrl!, title: q.title })}
                            className="absolute bottom-3 left-3 bg-black/75 hover:bg-black text-white px-2 py-1 rounded-md text-body-2xs font-semibold inline-flex items-center gap-1 transition-opacity cursor-pointer"
                          >
                            <ZoomIn className="size-3" /> Perbesar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuestionChange(qIdx, { imageUrl: undefined })}
                            className="absolute top-3 right-3 bg-black/70 hover:bg-status-error text-white p-1 rounded-md text-body-xs font-bold transition-colors cursor-pointer"
                            title="Hapus Gambar"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pt-1">
                          <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-body-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
                            <ImageIcon className="size-3.5 text-brand-primary" />
                            {uploadingQIndex === qIdx ? "Mengunggah..." : "Unggah Gambar Pertanyaan"}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingQIndex === qIdx}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleImageFileUpload(qIdx, f);
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="sm:col-span-5">
                      <Select
                        value={q.type}
                        onValueChange={(val: QuestionType) => handleQuestionChange(qIdx, { type: val })}
                      >
                        <SelectTrigger className="w-full h-10 text-body-xs font-semibold">
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-brand-primary shrink-0">
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
                            <SelectValue placeholder="Tipe Pertanyaan" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TEXT">Short answer (Jawaban Singkat)</SelectItem>
                          <SelectItem value="PARAGRAPH">Paragraph (Teks Panjang)</SelectItem>
                          <SelectItem value="RADIO">Multiple choice (Pilihan Ganda)</SelectItem>
                          <SelectItem value="CHECKBOX">Checkboxes (Kotak Centang)</SelectItem>
                          <SelectItem value="DROP_DOWN">Dropdown</SelectItem>
                          <SelectItem value="FILE_UPLOAD">File upload (Unggah Berkas)</SelectItem>
                          <SelectItem value="SCALE">Linear scale (Skala Penilaian 1-5)</SelectItem>
                          <SelectItem value="RATING">Rating (Penilaian Bintang)</SelectItem>
                          <SelectItem value="GRID_RADIO">Multiple choice grid (Kisi Pilihan Ganda)</SelectItem>
                          <SelectItem value="GRID_CHECKBOX">Checkbox grid (Kisi Kotak Centang)</SelectItem>
                          <SelectItem value="DATE">Date (Tanggal)</SelectItem>
                          <SelectItem value="TIME">Time (Waktu)</SelectItem>
                          <SelectItem value="SECTION">Section Header (Bagian / Break Section)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Question Content & Option Editors per Type */}
                  <div className="pt-2">
                    {/* SECTION */}
                    {q.type === "SECTION" && (
                      <div className="rounded-xl border border-brand-secondary/40 bg-brand-secondary/10 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-body-xs font-bold text-brand-secondary uppercase tracking-wider">
                          <Layers className="size-4" />
                          Pembatas Bagian Baru (Section Break)
                        </div>
                        <p className="text-body-2xs text-muted-foreground">
                          Pertanyaan setelah pembatas ini akan ditampilkan pada halaman/bagian berikutnya di formulir responden.
                        </p>
                      </div>
                    )}

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
                        <p>Responden dapat mengunggah berkas secara langsung ke Zyx Storage</p>
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

                    {/* 7. ENHANCED MATRIX EDITOR & PREVIEW UI (GRID_RADIO & GRID_CHECKBOX) */}
                    {(q.type === "GRID_RADIO" || q.type === "GRID_CHECKBOX") && (
                      <div className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 text-body-xs">
                        {/* Editor Controls Header */}
                        <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                          <Layers className="size-4 text-brand-primary" />
                          <p className="font-bold text-foreground">
                            Pengaturan Matriks Kisi ({q.type === "GRID_RADIO" ? "Pilihan Ganda Per Baris" : "Kotak Centang Per Baris"})
                          </p>
                        </div>

                        {/* Side-by-Side Row & Column Item Editors */}
                        <div className="grid gap-4 sm:grid-cols-2">
                          {/* Rows Editor */}
                          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                            <p className="font-bold text-foreground flex items-center justify-between">
                              <span>Baris (Pertanyaan)</span>
                              <span className="text-muted-foreground font-mono text-body-2xs">({(q.gridRows || []).length} items)</span>
                            </p>
                            {(q.gridRows || ["Baris 1", "Baris 2"]).map((rowVal, rIdx) => (
                              <div key={rIdx} className="flex items-center gap-2">
                                <span className="text-muted-foreground font-mono font-bold w-4">{rIdx + 1}.</span>
                                <input
                                  type="text"
                                  value={rowVal}
                                  onChange={(e) => handleGridRowChange(qIdx, rIdx, e.target.value)}
                                  className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1 text-body-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                                {(q.gridRows || []).length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveGridRow(qIdx, rIdx)}
                                    className="text-muted-foreground hover:text-status-error px-1 text-body-sm transition-colors"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => handleAddGridRow(qIdx)}
                              className="inline-flex items-center gap-1 text-brand-primary font-semibold hover:underline text-body-xs mt-1 cursor-pointer"
                            >
                              <Plus className="size-3" /> Tambah Baris
                            </button>
                          </div>

                          {/* Columns Editor */}
                          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                            <p className="font-bold text-foreground flex items-center justify-between">
                              <span>Kolom (Skala Opsi)</span>
                              <span className="text-muted-foreground font-mono text-body-2xs">({(q.gridColumns || []).length} items)</span>
                            </p>
                            {(q.gridColumns || ["Kolom 1", "Kolom 2"]).map((colVal, cIdx) => (
                              <div key={cIdx} className="flex items-center gap-2">
                                <span className="text-muted-foreground font-mono font-bold w-4">{cIdx + 1}.</span>
                                <input
                                  type="text"
                                  value={colVal}
                                  onChange={(e) => handleGridColChange(qIdx, cIdx, e.target.value)}
                                  className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1 text-body-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                                {(q.gridColumns || []).length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveGridCol(qIdx, cIdx)}
                                    className="text-muted-foreground hover:text-status-error px-1 text-body-sm transition-colors"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => handleAddGridCol(qIdx)}
                              className="inline-flex items-center gap-1 text-brand-primary font-semibold hover:underline text-body-xs mt-1 cursor-pointer"
                            >
                              <Plus className="size-3" /> Tambah Kolom
                            </button>
                          </div>
                        </div>

                        {/* Live Matrix Table Preview Panel */}
                        <div className="space-y-2 pt-2">
                          <p className="font-bold text-muted-foreground flex items-center gap-1.5 text-body-2xs uppercase tracking-wider">
                            <TableIcon className="size-3.5 text-brand-primary" /> Pratinjau Tampilan Matriks Responden:
                          </p>
                          <div className="overflow-x-auto rounded-xl border border-border bg-background p-3">
                            <table className="w-full text-left text-body-xs border-collapse">
                              <thead>
                                <tr className="border-b border-border text-muted-foreground font-semibold">
                                  <th className="p-2 w-1/3">Baris / Kolom</th>
                                  {(q.gridColumns || ["Kolom 1", "Kolom 2"]).map((col, cIdx) => (
                                    <th key={cIdx} className="p-2 text-center">{col || `Kolom ${cIdx + 1}`}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/60">
                                {(q.gridRows || ["Baris 1", "Baris 2"]).map((row, rIdx) => (
                                  <tr key={rIdx} className="hover:bg-muted/20">
                                    <td className="p-2 font-medium text-foreground">{row || `Baris ${rIdx + 1}`}</td>
                                    {(q.gridColumns || ["Kolom 1", "Kolom 2"]).map((_, cIdx) => (
                                      <td key={cIdx} className="p-2 text-center">
                                        {q.type === "GRID_RADIO" ? (
                                          <CircleDot className="size-4 text-muted-foreground/50 mx-auto" />
                                        ) : (
                                          <CheckSquare className="size-4 text-muted-foreground/50 mx-auto" />
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
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
                onClick={handleAddSection}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-brand-secondary/40 bg-brand-secondary/10 px-3 py-2.5 text-body-xs font-bold text-brand-secondary hover:bg-brand-secondary/20 transition-colors cursor-pointer"
              >
                <Layers className="size-4" />
                Tambah Bagian (Section)
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
                    Menerbitkan Formulir...
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="size-4" />
                    Terbitkan Formulir Zyx
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SETTINGS (PENGATURAN FORMULIR) */}
      {activeTab === "settings" && (
        <div className="space-y-6 max-w-3xl">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
            <div>
              <h2 className="font-heading text-h5 font-bold text-foreground">
                Pengaturan Tanggapan & Akses (Responses)
              </h2>
              <p className="text-body-xs text-muted-foreground mt-0.5">
                Kelola bagaimana respon dikumpulkan, dilindungi, dan dibatasi.
              </p>
            </div>

            {/* 1. Menerima Tanggapan & Jadwal Tutup/Buka */}
            <div className="space-y-4 border-t border-border/60 pt-4">
              <p className="text-body-xs font-bold text-foreground uppercase tracking-wider">
                Menerima Tanggapan & Jadwal (Status Form)
              </p>

              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4">
                <div>
                  <p className="text-body-sm font-semibold text-foreground">Menerima Tanggapan (Accepting Responses)</p>
                  <p className="text-body-xs text-muted-foreground">Aktifkan untuk mengizinkan responden mengisi formulir ini.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.acceptingResponses}
                  onChange={(e) => setSettings({ ...settings, acceptingResponses: e.target.checked })}
                  className="size-5 rounded border-input text-brand-primary focus:ring-ring cursor-pointer"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-body-xs font-semibold text-foreground mb-1">
                    Jadwal Otomatis Buka (openAt)
                  </label>
                  <input
                    type="datetime-local"
                    value={settings.openAt}
                    onChange={(e) => setSettings({ ...settings, openAt: e.target.value })}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-body-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <p className="text-body-2xs text-muted-foreground mt-1">Kosongkan jika selalu dibuka.</p>
                </div>

                <div>
                  <label className="block text-body-xs font-semibold text-foreground mb-1">
                    Jadwal Otomatis Tutup (closeAt)
                  </label>
                  <input
                    type="datetime-local"
                    value={settings.closeAt}
                    onChange={(e) => setSettings({ ...settings, closeAt: e.target.value })}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-body-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <p className="text-body-2xs text-muted-foreground mt-1">Kosongkan jika selalu dibuka.</p>
                </div>
              </div>

              <div>
                <label className="block text-body-xs font-semibold text-foreground mb-1">
                  Pesan Saat Formulir Ditutup (Closed Message)
                </label>
                <textarea
                  rows={2}
                  value={settings.closedMessage}
                  onChange={(e) => setSettings({ ...settings, closedMessage: e.target.value })}
                  placeholder="Formulir ini telah ditutup dan tidak lagi menerima tanggapan."
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-body-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                />
              </div>
            </div>

            {/* 2. Collect Email & Privacy */}
            <div className="space-y-4 border-t border-border/60 pt-4">
              <p className="text-body-xs font-bold text-foreground uppercase tracking-wider">
                Pengumpulan Alamat Email & Autentikasi
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-body-xs font-semibold text-foreground mb-1">
                    Collect email addresses
                  </label>
                  <Select
                    value={settings.collectEmail}
                    onValueChange={(val: any) => setSettings({ ...settings, collectEmail: val })}
                  >
                    <SelectTrigger className="w-full h-10 text-body-xs">
                      <SelectValue placeholder="Pilih Pengumpulan Email" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Do not collect (Tidak dikumpulkan)</SelectItem>
                      <SelectItem value="input">Responder input (Diisi manual)</SelectItem>
                      <SelectItem value="verified">Verified (Verifikasi Akun Zyx)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-body-xs font-semibold text-foreground mb-1">
                    Send responders a copy of their response
                  </label>
                  <Select
                    value={settings.sendResponseCopy}
                    onValueChange={(val: any) => setSettings({ ...settings, sendResponseCopy: val })}
                  >
                    <SelectTrigger className="w-full h-10 text-body-xs">
                      <SelectValue placeholder="Kirim Salinan Respon" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Off (Mati)</SelectItem>
                      <SelectItem value="requested">When requested (Saat diminta)</SelectItem>
                      <SelectItem value="always">Always (Selalu dikirim)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4">
                <div>
                  <p className="text-body-sm font-semibold text-foreground">Allow response editing</p>
                  <p className="text-body-xs text-muted-foreground">Respon dapat diubah kembali setelah dikirimkan.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.allowResponseEditing}
                  onChange={(e) => setSettings({ ...settings, allowResponseEditing: e.target.checked })}
                  className="size-5 rounded border-input text-brand-primary focus:ring-ring cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4">
                <div>
                  <p className="text-body-sm font-semibold text-foreground">Limit to 1 response (Requires Sign in)</p>
                  <p className="text-body-xs text-muted-foreground">Membatasi responden hanya boleh mengisi 1 kali pengisian.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.limitToOneResponse}
                  onChange={(e) => setSettings({ ...settings, limitToOneResponse: e.target.checked })}
                  className="size-5 rounded border-input text-brand-primary focus:ring-ring cursor-pointer"
                />
              </div>
            </div>

            {/* 3. File Upload Limits & Presentation */}
            <div className="space-y-4 border-t border-border/60 pt-4">
              <p className="text-body-xs font-bold text-foreground uppercase tracking-wider">
                Batas Ukuran File Upload & Tampilan
              </p>

              <div>
                <label className="block text-body-xs font-semibold text-foreground mb-1">
                  Total size limit for all uploaded files
                </label>
                <Select
                  value={settings.maxFileSizeLimit}
                  onValueChange={(val: any) => setSettings({ ...settings, maxFileSizeLimit: val })}
                >
                  <SelectTrigger className="w-full sm:w-1/2 h-10 text-body-xs">
                    <SelectValue placeholder="Batas Ukuran File" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1GB">1 GB</SelectItem>
                    <SelectItem value="10GB">10 GB</SelectItem>
                    <SelectItem value="100GB">100 GB</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-body-xs font-semibold text-foreground mb-1">
                  Pesan Konfirmasi Setelah Submit (Presentation)
                </label>
                <input
                  type="text"
                  value={settings.customSuccessMessage}
                  onChange={(e) => setSettings({ ...settings, customSuccessMessage: e.target.value })}
                  placeholder="Jawaban Anda telah berhasil disimpan."
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-body-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PUBLISHED FORMS LIST */}
      {activeTab === "forms" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="font-heading text-h5 font-bold text-foreground">
                Daftar Formulir Terbit Zyx Native
              </h2>
              <p className="text-body-sm text-muted-foreground">
                Daftar Formulir Zyx yang telah diterbitkan dengan dukungan Short Link (/f/[slug]) dan analisis grafik respon.
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
                Belum Ada Formulir Terbuat
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
                      <th className="px-4 py-3">Total Respon</th>
                      <th className="px-4 py-3">Link Responden & Short Link</th>
                      <th className="px-4 py-3 text-right">Visualisasi & Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {forms.map((f) => {
                      const isDeleting = deletingId === f.id;
                      const shortPath = `/f/${f.slug}`;
                      const fullPath = `/forms/${f.id}`;
                      const isShortCopied = copiedId === `short_${f.id}`;
                      const isFullCopied = copiedId === `full_${f.id}`;

                      return (
                        <tr key={f.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3.5 font-medium text-foreground whitespace-nowrap">
                            <p className="font-bold text-body-sm text-foreground">{f.title}</p>
                            <p className="font-mono text-body-xs text-muted-foreground">
                              Slug: /f/{f.slug}
                            </p>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="rounded-md bg-muted px-2.5 py-1 text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {f.category}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="font-mono font-bold text-body-sm text-brand-primary">
                              {f.totalResponses || 0} Pengisian
                            </span>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-body-2xs text-muted-foreground w-14">Short:</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(shortPath, `short_${f.id}`)}
                                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-body-2xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                                >
                                  {isShortCopied ? <Check className="size-3 text-status-success" /> : <Copy className="size-3" />}
                                  {isShortCopied ? "Tersalin!" : shortPath}
                                </button>
                                <a
                                  href={shortPath}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-brand-primary hover:underline text-body-2xs"
                                >
                                  <ExternalLink className="size-3 inline" />
                                </a>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-body-2xs text-muted-foreground w-14">Full:</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(fullPath, `full_${f.id}`)}
                                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-body-2xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                                >
                                  {isFullCopied ? <Check className="size-3 text-status-success" /> : <Copy className="size-3" />}
                                  {isFullCopied ? "Tersalin!" : fullPath}
                                </button>
                                <a
                                  href={fullPath}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-brand-primary hover:underline text-body-2xs"
                                >
                                  <ExternalLink className="size-3 inline" />
                                </a>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`/admin/forms/${f.id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-body-xs font-semibold text-brand-primary hover:bg-brand-primary/20 transition-colors"
                              >
                                <BarChart3 className="size-3.5" />
                                Visualisasi Data & Respon
                                <ChevronRight className="size-3.5" />
                              </Link>

                              <button
                                type="button"
                                onClick={() => setConfirmDeleteFormId(f.id)}
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

      {/* SHADCN DIALOG: DELETE CONFIRMATION */}
      <Dialog
        open={Boolean(confirmDeleteFormId)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteFormId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Formulir Terbit</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus formulir ini dari daftar terbit platform? Akses ke visualisasi respon pada formulir ini akan dihapus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteFormId(null)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDeleteFormId) executeDeleteForm(confirmDeleteFormId);
              }}
            >
              Hapus Formulir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHADCN DIALOG: GENERIC ALERT / ERROR MESSAGE */}
      <Dialog
        open={Boolean(alertDialogInfo)}
        onOpenChange={(open) => {
          if (!open) setAlertDialogInfo(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{alertDialogInfo?.title || "Pemberitahuan Sistem"}</DialogTitle>
            <DialogDescription>
              {alertDialogInfo?.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setAlertDialogInfo(null)}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHADCN DIALOG: LIGHTBOX IMAGE ZOOM IN EDITOR */}
      <Dialog
        open={Boolean(zoomImageUri)}
        onOpenChange={(open) => {
          if (!open) setZoomImageUri(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{zoomImageUri?.title || "Pratinjau Gambar Soal"}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-2">
            {zoomImageUri && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={zoomImageUri.url}
                alt={zoomImageUri.title}
                className="max-h-[75vh] rounded-xl object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Reveal>
  );
}
