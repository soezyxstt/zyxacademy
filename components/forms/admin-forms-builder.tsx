"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  ListPlus,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  Table as TableIcon,
  Layers,
  MoreVertical,
  Shuffle,
  ZoomIn,
  Link2,
  Edit3,
  Undo2,
} from "lucide-react";
import type { CreateCustomQuestionInput, QuestionType } from "@/lib/google-forms";
import { formatDatetimeLocal } from "@/lib/date-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { FormPresetsPanel, PresetSettingsLoader } from "@/components/forms/form-presets";

interface ExtendedQuestionInput extends CreateCustomQuestionInput {
  showDescription?: boolean;
  shuffleOptions?: boolean;
  otherOption?: { enabled: boolean; label: string };
  maxFileSizeMb?: number;
}

interface StoredNativeForm {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category: "survey" | "quiz" | "feedback" | "registration";
  questions: ExtendedQuestionInput[];
  settings?: any;
  googleResponderUri?: string;
  totalResponses: number;
  createdAt: string;
}

function settingsForSave<T extends { openAt?: string; closeAt?: string }>(settings: T): T {
  return {
    ...settings,
    openAt: settings.openAt ? new Date(settings.openAt).toISOString() : "",
    closeAt: settings.closeAt ? new Date(settings.closeAt).toISOString() : "",
  };
}

const DEFAULT_FORM_SETTINGS = {
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
};

export default function AdminFormsBuilder({
  presetsEnabled,
}: {
  presetsEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editIdParam = searchParams.get("edit");

  const [activeTab, setActiveTab] = useUrlTab("tab", "builder");
  const [editingFormId, setEditingFormId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"survey" | "quiz" | "feedback" | "registration">("survey");
  const [slug, setSlug] = useState("");

  const [settings, setSettings] = useState(DEFAULT_FORM_SETTINGS);

  const [activeQIndex, setActiveQIndex] = useState<number>(0);

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

  const builderListRef = useRef<HTMLDivElement | null>(null);

  const [confirmPresetDialogOpen, setConfirmPresetDialogOpen] = useState(false);

  const realQuestionNumbers = useMemo(() => {
    const map = new Map<number, number>();
    let n = 0;
    questions.forEach((q, idx) => {
      if (q.type === "SECTION") {
        map.set(idx, 0);
      } else {
        n += 1;
        map.set(idx, n);
      }
    });
    return map;
  }, [questions]);

  // Drag & Drop reorder state
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Shadcn Dialog states
  const [confirmDeleteFormId, setConfirmDeleteFormId] = useState<string | null>(null);
  const [alertDialogInfo, setAlertDialogInfo] = useState<{ title: string; message: string } | null>(null);
  const [zoomImageUri, setZoomImageUri] = useState<{ url: string; title: string } | null>(null);

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

  const loadFormIntoEditor = useCallback((formToLoad: StoredNativeForm) => {
    setEditingFormId(formToLoad.id);
    setTitle(formToLoad.title || "");
    setDescription(formToLoad.description || "");
    setCategory(formToLoad.category || "survey");
    setSlug(formToLoad.slug || "");
    setQuestions(
      Array.isArray(formToLoad.questions) && formToLoad.questions.length > 0
        ? formToLoad.questions
        : [
            {
              title: "",
              description: "",
              showDescription: true,
              type: "TEXT",
              required: true,
            },
          ]
    );
    const s = formToLoad.settings || {};
    setSettings({
      acceptingResponses: s.acceptingResponses ?? true,
      closedMessage: s.closedMessage || "Formulir ini telah ditutup dan tidak lagi menerima tanggapan.",
      openAt: s.openAt ? formatDatetimeLocal(s.openAt) : "",
      closeAt: s.closeAt ? formatDatetimeLocal(s.closeAt) : "",
      collectEmail: s.collectEmail || "none",
      sendResponseCopy: s.sendResponseCopy || "off",
      allowResponseEditing: s.allowResponseEditing ?? false,
      limitToOneResponse: s.limitToOneResponse ?? false,
      maxFileSizeLimit: s.maxFileSizeLimit || "1GB",
      customSuccessMessage: s.customSuccessMessage || "Jawaban Anda telah berhasil disimpan.",
    });
    setActiveQIndex(0);
    setActiveTab("builder");
    setErrorMsg(null);
  }, []);

  const handleStartEdit = useCallback((formToEdit: StoredNativeForm) => {
    loadFormIntoEditor(formToEdit);
    router.replace(`/admin/forms?edit=${formToEdit.id}`);
  }, [loadFormIntoEditor, router]);

  const handleCancelEdit = useCallback(() => {
    setEditingFormId(null);
    setTitle("");
    setDescription("");
    setCategory("survey");
    setSlug("");
    setQuestions([
      {
        title: "",
        description: "",
        showDescription: true,
        type: "TEXT",
        required: true,
      },
    ]);
    setSettings({ ...DEFAULT_FORM_SETTINGS });
    setActiveQIndex(0);
    setErrorMsg(null);
    router.replace("/admin/forms");
  }, [router]);

  useEffect(() => {
    if (!editIdParam) return;
    if (editIdParam === editingFormId) return;

    const existing = forms.find((f) => f.id === editIdParam);
    if (existing) {
      loadFormIntoEditor(existing);
    } else {
      let isSubscribed = true;
      (async () => {
        try {
          const res = await fetch(`/api/admin/custom-forms/${editIdParam}`);
          const data = await res.json();
          if (isSubscribed && data.success && data.form) {
            loadFormIntoEditor(data.form);
          }
        } catch {
          // ignore network error
        }
      })();
      return () => {
        isSubscribed = false;
      };
    }
  }, [editIdParam, editingFormId, forms, loadFormIntoEditor]);

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
    const nextIdx = questions.length;
    setQuestions([...questions, newQ]);
    setActiveQIndex(nextIdx);
    setTimeout(() => {
      if (builderListRef.current) {
        const el = builderListRef.current.querySelector(`[data-qidx="${nextIdx}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  };

  const handleAddSection = () => {
    const newSection: ExtendedQuestionInput = {
      title: "Bagian Baru",
      description: "Petunjuk atau deskripsi untuk bagian ini",
      type: "SECTION",
      required: false,
    };
    const nextIdx = questions.length;
    setQuestions([...questions, newSection]);
    setActiveQIndex(nextIdx);
    setTimeout(() => {
      if (builderListRef.current) {
        const el = builderListRef.current.querySelector(`[data-qidx="${nextIdx}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  };

  const apply12TypePreset = () => {
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
    setConfirmPresetDialogOpen(false);
  };

  const handleLoadFull12TypePreset = () => {
    const hasCustomInput =
      questions.length > 1 ||
      (questions.length === 1 && (questions[0].title.trim() !== "" || Boolean(questions[0].description?.trim())));
    if (hasCustomInput) {
      setConfirmPresetDialogOpen(true);
    } else {
      apply12TypePreset();
    }
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
      if (title) {
        formData.append("formTitle", title);
      }
      formData.append("questionNumber", String(qIndex + 1));

      const res = await fetch("/api/forms/upload", {
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

  const handleSubmitForm = async () => {
    if (!title.trim()) {
      setErrorMsg("Nama / Judul Formulir tidak boleh kosong.");
      return;
    }

    if (settings.openAt && settings.closeAt) {
      const openDate = new Date(settings.openAt);
      const closeDate = new Date(settings.closeAt);
      if (!isNaN(openDate.getTime()) && !isNaN(closeDate.getTime()) && openDate >= closeDate) {
        setErrorMsg("Jadwal buka harus lebih awal dari jadwal tutup.");
        return;
      }
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qNum = realQuestionNumbers.get(i) || i + 1;
      const qLabel = q.type === "SECTION" ? `Bagian #${i + 1}` : `Pertanyaan #${qNum}`;

      if (q.type !== "SECTION" && !q.title.trim()) {
        setErrorMsg(`Teks pada ${qLabel} wajib diisi.`);
        setActiveQIndex(i);
        return;
      }

      if (q.type === "RADIO" || q.type === "CHECKBOX" || q.type === "DROP_DOWN") {
        const validOptions = (q.options || []).filter((opt) => opt && opt.trim().length > 0);
        if (validOptions.length === 0) {
          setErrorMsg(`${qLabel} ("${q.title || "Tanpa Judul"}") harus memiliki minimal 1 opsi jawaban.`);
          setActiveQIndex(i);
          return;
        }
      }

      if (q.type === "GRID_RADIO" || q.type === "GRID_CHECKBOX") {
        const validRows = (q.gridRows || []).filter((r) => r && r.trim().length > 0);
        const validCols = (q.gridColumns || []).filter((c) => c && c.trim().length > 0);
        if (validRows.length === 0 || validCols.length === 0) {
          setErrorMsg(`${qLabel} ("${q.title || "Tanpa Judul"}") harus memiliki minimal 1 baris dan 1 kolom.`);
          setActiveQIndex(i);
          return;
        }
      }
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (editingFormId) {
        const res = await fetch(`/api/admin/custom-forms/${editingFormId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || undefined,
            category,
            slug: slug.trim() || undefined,
            questions,
            settings: settingsForSave(settings),
          }),
        });
        const data = await res.json();
        if (data.success && data.form) {
          fetchForms();
          if (data.form.slug) setSlug(data.form.slug);
          toast.success("Perubahan formulir berhasil disimpan.");
        } else {
          setErrorMsg(data.error || "Gagal memperbarui formulir.");
        }
      } else {
        const res = await fetch("/api/admin/custom-forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || undefined,
            category,
            slug: slug.trim() || undefined,
            questions,
            settings: settingsForSave(settings),
          }),
        });
        const data = await res.json();
        if (data.success && data.form) {
          fetchForms();
          setActiveTab("forms");
          setTitle("");
          setDescription("");
          setCategory("survey");
          setSlug("");
          setQuestions([
            { title: "", description: "", showDescription: true, type: "TEXT", required: true },
          ]);
          setSettings({ ...DEFAULT_FORM_SETTINGS });
          setActiveQIndex(0);
          toast.success("Formulir baru berhasil diterbitkan.");
        } else {
          setErrorMsg(data.error || "Gagal membuat formulir.");
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateForm = handleSubmitForm;

  const executeDeleteForm = async (formId: string) => {
    setDeletingId(formId);
    try {
      const res = await fetch(`/api/admin/custom-forms/${formId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setForms((prev) => prev.filter((f) => f.id !== formId));
        setConfirmDeleteFormId(null);
      } else {
        setConfirmDeleteFormId(null);
        setAlertDialogInfo({
          title: "Gagal Menghapus Formulir",
          message: data.error || "Gagal menghapus formulir dari daftar terbit.",
        });
      }
    } catch (err: any) {
      setConfirmDeleteFormId(null);
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
    <div className="space-y-8">
      {errorMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-body-sm text-status-error">
          <AlertCircle className="size-5 shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="builder">
            <FileText className="size-3.5" />
            {editingFormId ? "Editor Pertanyaan (Edit)" : "Editor Pertanyaan"}
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Sliders className="size-3.5" />
            Pengaturan
          </TabsTrigger>
          <TabsTrigger value="forms">
            <BarChart3 className="size-3.5" />
            Daftar Terbit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder">
        <div className="grid gap-4 md:grid-cols-12 items-start">
          {/* Main Question Cards Column */}
          <div className="md:col-span-9 space-y-4" ref={builderListRef}>
            {editingFormId && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-primary/40 bg-brand-primary/10 p-3.5 sm:p-4 text-body-xs shadow-2xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="bg-brand-primary text-brand-primary-foreground font-bold uppercase tracking-wider text-[10px]">
                    Mode Edit
                  </Badge>
                  <span className="font-semibold text-foreground">
                    Menyunting: <span className="font-bold text-brand-primary">{title || "Tanpa Judul"}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/forms/${editingFormId}`}
                    className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
                  >
                    <BarChart3 className="size-3.5" />
                    Visualisasi Respon
                  </Link>
                  <span className="text-muted-foreground">•</span>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Undo2 className="size-3.5" />
                    Batal Edit
                  </button>
                </div>
              </div>
            )}

            {/* Header Card (Title, Description, & Compact Toolbar) */}
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm border-l-4 border-l-brand-primary space-y-3">
              <div>
                <input
                  type="text"
                  placeholder="Judul Formulir"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full font-heading text-body-sm font-bold text-foreground bg-transparent border-b border-border/40 pb-1.5 focus:border-brand-primary focus:outline-none transition-colors"
                />
              </div>

              <div>
                <textarea
                  rows={1}
                  placeholder="Deskripsi formulir atau petunjuk bagi responden..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-body-xs text-muted-foreground bg-transparent border-b border-border/40 pb-1 focus:border-brand-primary focus:outline-none transition-colors resize-none"
                />
              </div>

              {/* Compact Toolbar Row: Category, Short Link Slug & Preset Load */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-body-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-body-xs font-semibold text-muted-foreground">Kategori:</span>
                    <Select value={category} onValueChange={(val: any) => setCategory(val)}>
                      <SelectTrigger className="w-40 h-7 text-body-xs font-semibold">
                        <SelectValue placeholder="Pilih Kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="survey">Survei & Riset</SelectItem>
                        <SelectItem value="feedback">Umpan Balik</SelectItem>
                        <SelectItem value="quiz">Kuis & Ujian</SelectItem>
                        <SelectItem value="registration">Pendaftaran</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-1 rounded-md border border-border bg-muted/20 px-2 py-0.5">
                    <Link2 className="size-3.5 text-brand-primary shrink-0" />
                    <span className="font-semibold text-foreground">Link:</span>
                    <span className="font-mono text-muted-foreground">/f/</span>
                    <Input
                      type="text"
                      placeholder="slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                      className="font-mono font-semibold rounded px-1 py-0 text-body-xs h-5 w-28 bg-background border-none shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLoadFull12TypePreset}
                  className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline cursor-pointer"
                >
                  <ListPlus className="size-3.5" />
                  Preset 12 Jenis Soal
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
                  data-qidx={qIdx}
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
                  className={`rounded-2xl border bg-card p-4 sm:p-4.5 shadow-sm transition-all space-y-3 relative ${
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
                  <div className="flex items-center justify-between border-b border-border/40 pb-2 -mt-0.5">
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
                      className="inline-flex items-center gap-1.5 text-body-xs font-semibold text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing transition-colors"
                      title="Geser & Tarik untuk Mengubah Urutan"
                    >
                      <GripVertical className="size-3.5 text-muted-foreground" />
                      <span>
                        {q.type === "SECTION"
                          ? "Bagian"
                          : `Pertanyaan #${realQuestionNumbers.get(qIdx) || qIdx + 1}`}
                      </span>
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
                        className="w-full font-heading text-body-base font-semibold text-foreground bg-transparent border-b border-border/40 pb-1 focus:border-brand-primary focus:outline-none transition-colors"
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
                            className="absolute bottom-3 left-3 bg-black/75 hover:bg-black text-white px-2 py-1 rounded-md text-body-xs font-semibold inline-flex items-center gap-1 transition-opacity cursor-pointer"
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
                        <SelectTrigger className="w-full h-8.5 text-body-xs font-semibold">
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
                      <div className="rounded-xl border border-brand-secondary/40 bg-brand-secondary/10 p-3 space-y-1">
                        <div className="flex items-center gap-2 text-body-xs font-bold text-brand-secondary uppercase tracking-wider">
                          <Layers className="size-3.5" />
                          Pembatas Bagian Baru
                        </div>
                        <p className="text-body-xs text-muted-foreground">
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
                          <div key={oIdx} className="flex items-center gap-2">
                            <span className="text-muted-foreground shrink-0">
                              {q.type === "RADIO" && <CircleDot className="size-4" />}
                              {q.type === "CHECKBOX" && <CheckSquare className="size-4" />}
                              {q.type === "DROP_DOWN" && (
                                <span className="font-mono text-body-xs font-bold w-4 inline-block text-center">
                                  {oIdx + 1}.
                                </span>
                              )}
                            </span>

                            <Input
                              type="text"
                              value={opt}
                              onChange={(e) => handleOptionChange(qIdx, oIdx, e.target.value)}
                              placeholder={`Opsi ${oIdx + 1}`}
                              className="flex-1 rounded-lg px-3 py-1.5 text-body-xs h-8"
                            />

                            {(q.options || []).length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveOption(qIdx, oIdx)}
                                className="text-muted-foreground hover:text-status-error p-1 text-body-sm transition-colors cursor-pointer"
                                title="Hapus Opsi"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}

                        <div className="flex items-center gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => handleAddOption(qIdx)}
                            className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline cursor-pointer"
                          >
                            <Plus className="size-3.5" /> Tambah Opsi
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 4. FILE UPLOAD */}
                    {q.type === "FILE_UPLOAD" && (
                      <div className="space-y-3 rounded-xl border border-dashed border-border/80 bg-muted/20 p-4">
                        <div className="flex items-center gap-2 text-muted-foreground text-body-xs">
                          <UploadCloud className="size-4 text-brand-primary" />
                          <span>Responden akan diminta mengunggah dokumen/gambar ke Cloudflare R2 Zyx.</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-body-xs">
                          <label className="flex items-center gap-1.5 font-semibold text-foreground">
                            <span>Maksimal Ukuran:</span>
                            <select
                              value={q.maxFileSizeMb || 10}
                              onChange={(e) =>
                                handleQuestionChange(qIdx, { maxFileSizeMb: parseInt(e.target.value, 10) })
                              }
                              className="rounded-md border border-border bg-background px-2 py-1 text-body-xs"
                            >
                              <option value={5}>5 MB</option>
                              <option value={10}>10 MB</option>
                              <option value={25}>25 MB</option>
                              <option value={50}>50 MB</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    )}

                    {/* 5. LINEAR SCALE */}
                    {q.type === "SCALE" && (
                      <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-3">
                        <div className="flex items-center justify-between text-body-xs font-semibold text-muted-foreground">
                          <span>1 = {q.scaleLowLabel || "Sangat Tidak Setuju"}</span>
                          <span>5 = {q.scaleHighLabel || "Sangat Setuju"}</span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            type="text"
                            placeholder="Label Nilai Terendah (1)"
                            value={q.scaleLowLabel || ""}
                            onChange={(e) => handleQuestionChange(qIdx, { scaleLowLabel: e.target.value })}
                            className="rounded-lg px-2.5 py-1 text-body-xs h-8"
                          />
                          <Input
                            type="text"
                            placeholder="Label Nilai Tertinggi (5)"
                            value={q.scaleHighLabel || ""}
                            onChange={(e) => handleQuestionChange(qIdx, { scaleHighLabel: e.target.value })}
                            className="rounded-lg px-2.5 py-1 text-body-xs h-8"
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
                      <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-3.5 text-body-xs">
                        {/* Editor Controls Header */}
                        <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                          <Layers className="size-4 text-brand-primary" />
                          <p className="font-bold text-foreground">
                            Pengaturan Matriks Kisi ({q.type === "GRID_RADIO" ? "Pilihan Ganda Per Baris" : "Kotak Centang Per Baris"})
                          </p>
                        </div>

                        {/* Side-by-Side Row & Column Item Editors */}
                        <div className="grid gap-3 sm:grid-cols-2">
                          {/* Rows Editor */}
                          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                            <p className="font-bold text-foreground flex items-center justify-between">
                              <span>Baris (Pertanyaan)</span>
                              <span className="text-muted-foreground font-mono text-body-xs">({(q.gridRows || []).length} items)</span>
                            </p>
                            {(q.gridRows || ["Baris 1", "Baris 2"]).map((rowVal, rIdx) => (
                              <div key={rIdx} className="flex items-center gap-2">
                                <span className="text-muted-foreground font-mono font-bold w-4">{rIdx + 1}.</span>
                                <Input
                                  type="text"
                                  value={rowVal}
                                  onChange={(e) => handleGridRowChange(qIdx, rIdx, e.target.value)}
                                  className="flex-1 rounded-lg px-2.5 py-1 text-body-xs h-8"
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
                              <span className="text-muted-foreground font-mono text-body-xs">({(q.gridColumns || []).length} items)</span>
                            </p>
                            {(q.gridColumns || ["Kolom 1", "Kolom 2"]).map((colVal, cIdx) => (
                              <div key={cIdx} className="flex items-center gap-2">
                                <span className="text-muted-foreground font-mono font-bold w-4">{cIdx + 1}.</span>
                                <Input
                                  type="text"
                                  value={colVal}
                                  onChange={(e) => handleGridColChange(qIdx, cIdx, e.target.value)}
                                  className="flex-1 rounded-lg px-2.5 py-1 text-body-xs h-8"
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
                        <div className="space-y-2 pt-1">
                          <p className="font-bold text-muted-foreground flex items-center gap-1.5 text-body-xs uppercase tracking-wider">
                            <TableIcon className="size-3.5 text-brand-primary" /> Pratinjau Tampilan Matriks:
                          </p>
                          <div className="overflow-x-auto rounded-xl border border-border bg-background p-2.5">
                            <table className="w-full text-left text-body-xs border-collapse">
                              <thead>
                                <tr className="border-b border-border text-muted-foreground font-semibold">
                                  <th className="p-1.5 w-1/3">Baris / Kolom</th>
                                  {(q.gridColumns || ["Kolom 1", "Kolom 2"]).map((col, cIdx) => (
                                    <th key={cIdx} className="p-1.5 text-center">{col || `Kolom ${cIdx + 1}`}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/60">
                                {(q.gridRows || ["Baris 1", "Baris 2"]).map((row, rIdx) => (
                                  <tr key={rIdx} className="hover:bg-muted/20">
                                    <td className="p-1.5 font-medium text-foreground">{row || `Baris ${rIdx + 1}`}</td>
                                    {(q.gridColumns || ["Kolom 1", "Kolom 2"]).map((_, cIdx) => (
                                      <td key={cIdx} className="p-1.5 text-center">
                                        {q.type === "GRID_RADIO" ? (
                                          <CircleDot className="size-3.5 text-muted-foreground/50 mx-auto" />
                                        ) : (
                                          <CheckSquare className="size-3.5 text-muted-foreground/50 mx-auto" />
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
                  <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
                    <div className="flex items-center gap-2">
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
                      <div className="inline-flex items-center gap-2">
                        <Label
                          htmlFor={`question-required-${qIdx}`}
                          className="text-body-xs font-semibold text-foreground cursor-pointer"
                        >
                          Wajib Diisi
                        </Label>
                        <Switch
                          id={`question-required-${qIdx}`}
                          checked={q.required ?? true}
                          onCheckedChange={(checked) => handleQuestionChange(qIdx, { required: Boolean(checked) })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Floating Actions Sidebar Column */}
          <div className="md:col-span-3 space-y-3 md:sticky md:top-24">
            <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm space-y-2">
              <p className="text-body-xs font-bold text-foreground uppercase tracking-wider">
                {editingFormId ? "Aksi Edit Formulir" : "Aksi Formulir"}
              </p>

              <button
                type="button"
                onClick={handleAddQuestion}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand-primary/40 bg-brand-primary/10 px-3 py-2 text-body-xs font-bold text-brand-primary hover:bg-brand-primary/20 transition-colors cursor-pointer"
              >
                <PlusCircle className="size-3.5" />
                Tambah Pertanyaan
              </button>

              <button
                type="button"
                onClick={handleAddSection}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand-secondary/40 bg-brand-secondary/10 px-3 py-2 text-body-xs font-bold text-brand-secondary hover:bg-brand-secondary/20 transition-colors cursor-pointer"
              >
                <Layers className="size-3.5" />
                Tambah Bagian
              </button>

              <button
                type="button"
                onClick={handleSubmitForm}
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-body-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" />
                    {editingFormId ? "Menyimpan..." : "Menerbitkan..."}
                  </>
                ) : editingFormId ? (
                  <>
                    <Check className="size-3.5" />
                    Simpan Perubahan
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="size-3.5" />
                    Terbitkan
                  </>
                )}
              </button>

              {editingFormId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-body-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <Undo2 className="size-3.5" />
                  Batal Edit
                </button>
              )}
            </div>

            {presetsEnabled && (
              <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
                <FormPresetsPanel
                  category={category}
                  questions={questions}
                  settings={settings}
                  onApplyQuestions={(qs) => {
                    setQuestions(qs);
                    setActiveQIndex(0);
                  }}
                  onApplySettings={(s) => setSettings((prev) => ({ ...prev, ...s }))}
                />
              </div>
            )}
          </div>
        </div>
        </TabsContent>

        <TabsContent value="settings">
        <div className="space-y-4 w-full">
          {presetsEnabled && (
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
              <PresetSettingsLoader
                onApplySettings={(s) => setSettings((prev) => ({ ...prev, ...s }))}
              />
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
              <div>
                <h2 className="font-heading text-body-base font-bold text-foreground">
                  Pengaturan Tanggapan & Akses
                </h2>
                <p className="text-body-xs text-muted-foreground mt-0.5">
                  Kelola pengumpulan respon, privasi, dan batasan jadwal.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {editingFormId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEdit}
                    className="text-body-xs h-8"
                  >
                    <Undo2 className="size-3.5" />
                    Batal Edit
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleSubmitForm}
                  disabled={submitting}
                  isLoading={submitting}
                  size="sm"
                  className="text-body-xs h-8"
                >
                  {editingFormId ? (
                    <>
                      <Check className="size-3.5" />
                      Simpan Perubahan
                    </>
                  ) : (
                    <>
                      <ArrowUpRight className="size-3.5" />
                      Terbitkan
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* 1. Menerima Tanggapan & Jadwal Tutup/Buka */}
            <div className="space-y-3 border-t border-border/60 pt-3">
              <p className="text-body-xs font-bold text-foreground uppercase tracking-wider">
                Status & Jadwal Formulir
              </p>

              <div
                className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3"
              >
                <div>
                  <Label htmlFor="builder-setting-accepting" className="text-body-sm font-semibold text-foreground cursor-pointer">
                    Menerima Tanggapan
                  </Label>
                  <p className="text-body-xs text-muted-foreground">Izinkan responden mengisi formulir ini.</p>
                </div>
                <Switch
                  id="builder-setting-accepting"
                  checked={settings.acceptingResponses}
                  onCheckedChange={(checked) => setSettings({ ...settings, acceptingResponses: Boolean(checked) })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-body-xs font-semibold text-foreground mb-1">
                    Jadwal Buka
                  </label>
                  <Input
                    type="datetime-local"
                    value={settings.openAt}
                    onChange={(e) => setSettings({ ...settings, openAt: e.target.value })}
                    className="w-full rounded-xl px-3 py-1.5 text-body-xs h-8"
                  />
                  <p className="text-body-xs text-muted-foreground mt-0.5">Kosongkan jika selalu dibuka.</p>
                </div>

                <div>
                  <label className="block text-body-xs font-semibold text-foreground mb-1">
                    Jadwal Tutup
                  </label>
                  <Input
                    type="datetime-local"
                    value={settings.closeAt}
                    onChange={(e) => setSettings({ ...settings, closeAt: e.target.value })}
                    className="w-full rounded-xl px-3 py-1.5 text-body-xs h-8"
                  />
                  <p className="text-body-xs text-muted-foreground mt-0.5">Kosongkan jika selalu dibuka.</p>
                </div>
              </div>

              <div>
                <label className="block text-body-xs font-semibold text-foreground mb-1">
                  Pesan Saat Formulir Ditutup
                </label>
                <Textarea
                  rows={2}
                  value={settings.closedMessage}
                  onChange={(e) => setSettings({ ...settings, closedMessage: e.target.value })}
                  placeholder="Formulir ini telah ditutup dan tidak lagi menerima tanggapan."
                  className="w-full rounded-xl px-3 py-1.5 text-body-xs min-h-[40px]"
                />
              </div>
            </div>

            {/* 2. Collect Email & Privacy */}
            <div className="space-y-3 border-t border-border/60 pt-3">
              <p className="text-body-xs font-bold text-foreground uppercase tracking-wider">
                Email & Autentikasi
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-body-xs font-semibold text-foreground mb-1">
                    Kumpulkan alamat email
                  </label>
                  <Select
                    value={settings.collectEmail}
                    onValueChange={(val: any) => setSettings({ ...settings, collectEmail: val })}
                  >
                    <SelectTrigger className="w-full h-8 text-body-xs">
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
                    Kirim salinan respons ke responden
                  </label>
                  <Select
                    value={settings.sendResponseCopy}
                    onValueChange={(val: any) => setSettings({ ...settings, sendResponseCopy: val })}
                  >
                    <SelectTrigger className="w-full h-8 text-body-xs">
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

              <div
                className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3"
              >
                <div>
                  <Label htmlFor="builder-setting-allow-edit" className="text-body-sm font-semibold text-foreground cursor-pointer">
                    Izinkan pengeditan respons
                  </Label>
                  <p className="text-body-xs text-muted-foreground">Respon dapat diubah kembali setelah dikirimkan.</p>
                </div>
                <Switch
                  id="builder-setting-allow-edit"
                  checked={settings.allowResponseEditing}
                  onCheckedChange={(checked) => setSettings({ ...settings, allowResponseEditing: Boolean(checked) })}
                />
              </div>

              <div
                className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3"
              >
                <div>
                  <Label htmlFor="builder-setting-limit-one" className="text-body-sm font-semibold text-foreground cursor-pointer">
                    Batasi 1 respons per pengguna
                  </Label>
                  <p className="text-body-xs text-muted-foreground">Membatasi responden hanya boleh 1 kali pengisian.</p>
                </div>
                <Switch
                  id="builder-setting-limit-one"
                  checked={settings.limitToOneResponse}
                  onCheckedChange={(checked) => setSettings({ ...settings, limitToOneResponse: Boolean(checked) })}
                />
              </div>
            </div>

            {/* 3. File Upload Limits & Presentation */}
            <div className="space-y-3 border-t border-border/60 pt-3">
              <p className="text-body-xs font-bold text-foreground uppercase tracking-wider">
                Batas Ukuran Berkas & Pesan
              </p>

              <div>
                <label className="block text-body-xs font-semibold text-foreground mb-1">
                  Batas total ukuran berkas
                </label>
                <Select
                  value={settings.maxFileSizeLimit}
                  onValueChange={(val: any) => setSettings({ ...settings, maxFileSizeLimit: val })}
                >
                  <SelectTrigger className="w-full sm:w-1/2 h-8 text-body-xs">
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
                  Pesan konfirmasi setelah submit
                </label>
                <Input
                  type="text"
                  value={settings.customSuccessMessage}
                  onChange={(e) => setSettings({ ...settings, customSuccessMessage: e.target.value })}
                  placeholder="Jawaban Anda telah berhasil disimpan."
                  className="w-full rounded-xl px-3 py-1.5 text-body-xs h-8"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
                {editingFormId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEdit}
                    className="text-body-xs h-8"
                  >
                    <Undo2 className="size-3.5" />
                    Batal Edit
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleSubmitForm}
                  disabled={submitting}
                  isLoading={submitting}
                  size="sm"
                  className="text-body-xs h-8"
                >
                  {editingFormId ? (
                    <>
                      <Check className="size-3.5" />
                      Simpan Perubahan
                    </>
                  ) : (
                    <>
                      <ArrowUpRight className="size-3.5" />
                      Terbitkan
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
        </TabsContent>

        <TabsContent value="forms">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="font-heading text-body-base font-bold text-foreground">
                Daftar Formulir Terbit
              </h2>
              <p className="text-body-xs text-muted-foreground">
                Kelola formulir yang telah diterbitkan beserta short link dan visualisasi respon.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchForms}
              disabled={loadingForms}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
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
              <p className="mt-3 font-heading text-body-base font-semibold text-foreground">
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
                                <span className="font-mono text-body-xs text-muted-foreground w-14">Short:</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(shortPath, `short_${f.id}`)}
                                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                                >
                                  {isShortCopied ? <Check className="size-3 text-status-success" /> : <Copy className="size-3" />}
                                  {isShortCopied ? "Tersalin!" : shortPath}
                                </button>
                                <a
                                  href={shortPath}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-brand-primary hover:underline text-body-xs"
                                >
                                  <ExternalLink className="size-3 inline" />
                                </a>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-body-xs text-muted-foreground w-14">Full:</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(fullPath, `full_${f.id}`)}
                                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                                >
                                  {isFullCopied ? <Check className="size-3 text-status-success" /> : <Copy className="size-3" />}
                                  {isFullCopied ? "Tersalin!" : fullPath}
                                </button>
                                <a
                                  href={fullPath}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-brand-primary hover:underline text-body-xs"
                                >
                                  <ExternalLink className="size-3 inline" />
                                </a>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(f)}
                                title="Edit formulir"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                              >
                                <Edit3 className="size-3.5 text-brand-primary" />
                                Edit
                              </button>

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
        </TabsContent>
      </Tabs>

      {/* SHADCN DIALOG: DELETE CONFIRMATION */}
      <Dialog
        open={Boolean(confirmDeleteFormId)}
        onOpenChange={(open) => {
          if (deletingId === null && !open) setConfirmDeleteFormId(null);
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
              disabled={deletingId !== null}
              onClick={() => setConfirmDeleteFormId(null)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={deletingId !== null}
              isLoading={deletingId !== null}
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

      {/* SHADCN DIALOG: CONFIRM PRESET REPLACEMENT */}
      <Dialog
        open={confirmPresetDialogOpen}
        onOpenChange={setConfirmPresetDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Muat Preset 12 Jenis Soal</DialogTitle>
            <DialogDescription>
              Memuat preset ini akan mengganti daftar pertanyaan yang saat ini sedang Anda susun. Apakah Anda yakin ingin melanjutkan?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmPresetDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              onClick={apply12TypePreset}
            >
              Ya, Muat Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
