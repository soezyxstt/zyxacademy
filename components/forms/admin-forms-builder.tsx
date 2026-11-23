"use client";

import { customFormMessage } from "@/lib/forms/response-policy";

import { getAppScrollBehavior } from "@/components/appearance-preferences";
import { FormListSkeleton } from "@/components/admin/content-loading-skeletons";
import { AdminEmptyState } from "@/components/admin/state-panels";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
  Sliders,
  Plus,
  ArrowUpRight,
  ListPlus,
  Layers,
  MoreHorizontal,
  MoreVertical,
  Link2,
  Edit3,
  Undo2,
  Eye,
  Info,
  Bookmark,
  FolderOpen,
  Search,
} from "lucide-react";
import type { FormDisplayMode } from "@/lib/forms/presentation";
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
import { toast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { FormPresetsDialogs, PresetSettingsLoader } from "@/components/forms/form-presets";
import { PublicFormViewer } from "@/components/forms/public-form-viewer";
import { QuestionCard, type ExtendedQuestionInput } from "@/components/forms/question-card";

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
  displayMode: "question" as FormDisplayMode,
  acceptingResponses: true,
  closedMessage: "",
  openAt: "",
  closeAt: "",
  collectEmail: "none" as "none" | "input" | "verified",
  sendResponseCopy: "off" as "off" | "requested" | "always",
  allowResponseEditing: false,
  limitToOneResponse: false,
  maxFileSizeLimit: "1GB" as "1GB" | "10GB" | "100GB",
  customSuccessMessage: "",
};

function createBlankQuestion(): ExtendedQuestionInput {
  return {
    title: "",
    description: "",
    showDescription: false,
    type: "TEXT",
    required: true,
  };
}

export default function AdminFormsBuilder({
  presetsEnabled,
}: {
  presetsEnabled: boolean;
}) {
  const t = useTranslations("adminForms");
  const defaults = useTranslations("adminOps.formDetailsUI");
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
  const [questions, setQuestions] = useState<ExtendedQuestionInput[]>([createBlankQuestion()]);

  const builderListRef = useRef<HTMLDivElement | null>(null);

  const [confirmPresetDialogOpen, setConfirmPresetDialogOpen] = useState(false);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [loadPresetOpen, setLoadPresetOpen] = useState(false);

  const realQuestionNumbers = useMemo(() => {
    const map = new Map<number, number>();
    let n = 0;
    questions.forEach((q, idx) => {
      if (q.type === "SECTION" || q.type === "STATEMENT") {
        map.set(idx, 0);
      } else {
        n += 1;
        map.set(idx, n);
      }
    });
    return map;
  }, [questions]);

  const totalQuestionCount = useMemo(
    () => questions.filter((q) => q.type !== "SECTION" && q.type !== "STATEMENT").length,
    [questions]
  );

  const sectionIndexMap = useMemo(() => {
    const map = new Map<number, { current: number; total: number }>();
    const sectionIndices = questions
      .map((q, idx) => (q.type === "SECTION" ? idx : -1))
      .filter((idx) => idx !== -1);
    const total = sectionIndices.length + 1;
    sectionIndices.forEach((idx, order) => {
      map.set(idx, { current: order + 2, total });
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
  const [formsQuery, setFormsQuery] = useState("");
  const [formsLoadError, setFormsLoadError] = useState(false);
  const [hasLoadedForms, setHasLoadedForms] = useState(false);
  const [loadingForms, setLoadingForms] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredForms = useMemo(() => {
    const query = formsQuery.trim().toLowerCase();
    if (!query) return forms;
    return forms.filter(
      (f) =>
        f.title.toLowerCase().includes(query) ||
        f.slug.toLowerCase().includes(query) ||
        f.category.toLowerCase().includes(query)
    );
  }, [forms, formsQuery]);

  const fetchForms = useCallback(async () => {
    setLoadingForms(true);
    setFormsLoadError(false);
    try {
      const res = await fetch("/api/admin/custom-forms");
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.forms)) {
        setForms(data.forms);
      } else {
        setFormsLoadError(true);
      }
    } catch {
      setFormsLoadError(true);
    } finally {
      setHasLoadedForms(true);
      setLoadingForms(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "forms" || hasLoadedForms) return;
    void fetchForms();
  }, [activeTab, hasLoadedForms, fetchForms]);

  const loadFormIntoEditor = useCallback(
    (formToLoad: StoredNativeForm) => {
      setEditingFormId(formToLoad.id);
      setTitle(formToLoad.title || "");
      setDescription(formToLoad.description || "");
      setCategory(formToLoad.category || "survey");
      setSlug(formToLoad.slug || "");
      setQuestions(
        Array.isArray(formToLoad.questions) && formToLoad.questions.length > 0
          ? formToLoad.questions
          : [createBlankQuestion()]
      );
      const s = formToLoad.settings || {};
      setSettings({
        displayMode: s.displayMode === "section" ? "section" : "question",
        acceptingResponses: s.acceptingResponses ?? true,
        closedMessage: customFormMessage("closedMessage", s.closedMessage),
        openAt: s.openAt ? formatDatetimeLocal(s.openAt) : "",
        closeAt: s.closeAt ? formatDatetimeLocal(s.closeAt) : "",
        collectEmail: s.collectEmail || "none",
        sendResponseCopy: s.sendResponseCopy || "off",
        allowResponseEditing: s.allowResponseEditing ?? false,
        limitToOneResponse: s.limitToOneResponse ?? false,
        maxFileSizeLimit: s.maxFileSizeLimit || "1GB",
        customSuccessMessage: customFormMessage("customSuccessMessage", s.customSuccessMessage),
      });
      setActiveQIndex(0);
      setActiveTab("builder");
      setErrorMsg(null);
    },
    [setActiveTab]
  );

  const handleStartEdit = useCallback(
    (formToEdit: StoredNativeForm) => {
      loadFormIntoEditor(formToEdit);
      router.replace(`/admin/forms?edit=${formToEdit.id}`);
    },
    [loadFormIntoEditor, router]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingFormId(null);
    setTitle("");
    setDescription("");
    setCategory("survey");
    setSlug("");
    setQuestions([createBlankQuestion()]);
    setSettings({ ...DEFAULT_FORM_SETTINGS });
    setActiveQIndex(0);
    setErrorMsg(null);
    router.replace("/admin/forms");
  }, [router]);

  const formsRef = useRef<StoredNativeForm[]>(forms);
  formsRef.current = forms;

  useEffect(() => {
    if (!editIdParam) return;
    if (editIdParam === editingFormId) return;

    const existing = formsRef.current.find((f) => f.id === editIdParam);
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
  }, [editIdParam, editingFormId, loadFormIntoEditor]);

  const scrollToQuestion = (idx: number) => {
    setTimeout(() => {
      if (builderListRef.current) {
        const el = builderListRef.current.querySelector(`[data-qidx="${idx}"]`);
        el?.scrollIntoView({ behavior: getAppScrollBehavior(), block: "center" });
      }
    }, 50);
  };

  const insertAfterActive = (item: ExtendedQuestionInput) => {
    const insertAt = activeQIndex >= 0 && activeQIndex < questions.length ? activeQIndex + 1 : questions.length;
    setQuestions((prev) => {
      const next = [...prev];
      next.splice(insertAt, 0, item);
      return next;
    });
    setActiveQIndex(insertAt);
    scrollToQuestion(insertAt);
  };

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
    insertAfterActive(createBlankQuestion());
  };

  const handleAddStatement = () => {
    insertAfterActive({
      title: "",
      description: "",
      type: "STATEMENT",
      required: false,
      showDescription: true,
    });
  };

  const handleAddSection = () => {
    insertAfterActive({
      title: t("ui.newSectionName"),
      description: "",
      type: "SECTION",
      required: false,
    });
  };

  const apply12TypePreset = () => {
    setQuestions([
      { title: "Nama Lengkap (Short Answer)", type: "TEXT", required: true },
      { title: "Saran & Masukan (Paragraph)", type: "PARAGRAPH", required: false },
      { title: "Peminatan Matkul (Multiple Choice)", type: "RADIO", options: ["Matematika", "Fisika", "Kimia"], required: true },
      { title: "Fasilitas Diinginkan (Checkboxes)", type: "CHECKBOX", options: ["Diktat PDF", "Video Rekaman", "Gmeet Live"], required: true },
      { title: "Pilih Angkatan (Dropdown)", type: "DROP_DOWN", options: ["TPB 2024", "TPB 2025", "Lainnya"], required: true },
      { title: "Unggah Berkas / Dokumen (File Upload)", type: "FILE_UPLOAD", required: false },
      { title: "Skala Penilaian Pembelajaran (Linear Scale)", type: "SCALE", scaleLow: 1, scaleHigh: 5, scaleLowLabel: "Kurang", scaleHighLabel: "Baik", required: true },
      { title: "Rating Pengajar (Rating Bintang)", type: "RATING", required: true },
      { title: "Matrix Kinerja (Multiple Choice Grid)", type: "GRID_RADIO", gridRows: ["Penguasaan Materi", "Kerapihan Slide"], gridColumns: ["Cukup", "Baik", "Sangat Baik"], required: true },
      { title: "Matrix Keahlian (Checkbox Grid)", type: "GRID_CHECKBOX", gridRows: ["Dasar", "Lanjut"], gridColumns: ["Teori", "Praktek"], required: true },
      { title: "Tanggal Pengisian (Date)", type: "DATE", required: true },
      { title: "Jam Kehadiran (Time)", type: "TIME", required: true },
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

      const res = await fetch("/api/admin/custom-forms/image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.url) {
        handleQuestionChange(qIndex, { imageUrl: data.url });
      } else {
        setAlertDialogInfo({
          title: t("messages.uploadFailedTitle"),
          message: data.error || t("messages.uploadFailed"),
        });
      }
    } catch {
      setAlertDialogInfo({
        title: t("messages.networkError"),
        message: t("messages.uploadError"),
      });
    } finally {
      setUploadingQIndex(null);
    }
  };

  const handleSubmitForm = async () => {
    if (!title.trim()) {
      setErrorMsg(t("messages.titleRequired"));
      return;
    }

    if (settings.openAt && settings.closeAt) {
      const openDate = new Date(settings.openAt);
      const closeDate = new Date(settings.closeAt);
      if (!isNaN(openDate.getTime()) && !isNaN(closeDate.getTime()) && openDate >= closeDate) {
        setErrorMsg(t("messages.dateOrder"));
        return;
      }
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qNum = realQuestionNumbers.get(i) || i + 1;
      const qLabel =
        q.type === "SECTION"
          ? t("messages.sectionLabel", { number: i + 1 })
          : q.type === "STATEMENT"
          ? t("messages.statementLabel", { number: i + 1 })
          : t("messages.questionLabel", { number: qNum });

      if (q.type === "STATEMENT") {
        if (!q.title?.trim() && !q.description?.trim() && !q.imageUrl) {
          setErrorMsg(`${qLabel} ${t("messages.statementRequired")}`);
          setActiveQIndex(i);
          return;
        }
        continue;
      }

      if (q.type !== "SECTION" && !q.title.trim()) {
        setErrorMsg(t("messages.questionTextRequired", { label: qLabel }));
        setActiveQIndex(i);
        return;
      }

      if (q.type === "RADIO" || q.type === "CHECKBOX" || q.type === "DROP_DOWN") {
        const validOptions = (q.options || []).filter((opt) => opt && opt.trim().length > 0);
        if (validOptions.length === 0) {
          setErrorMsg(t("messages.answerOptionValidation", { label: qLabel, title: q.title || t("messages.untitled") }));
          setActiveQIndex(i);
          return;
        }
      }

      if (q.type === "GRID_RADIO" || q.type === "GRID_CHECKBOX") {
        const validRows = (q.gridRows || []).filter((r) => r && r.trim().length > 0);
        const validCols = (q.gridColumns || []).filter((c) => c && c.trim().length > 0);
        if (validRows.length === 0 || validCols.length === 0) {
          setErrorMsg(t("messages.gridValidation", { label: qLabel, title: q.title || t("messages.untitled") }));
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
          toast.success(t("messages.saved"));
        } else {
          setErrorMsg(t("messages.updateFailed"));
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
          setQuestions([createBlankQuestion()]);
          setSettings({ ...DEFAULT_FORM_SETTINGS });
          setActiveQIndex(0);
          toast.success(t("messages.publishedToast"));
        } else {
          setErrorMsg(t("messages.createFailed"));
        }
      }
    } catch {
      setErrorMsg(t("messages.networkSaveError"));
    } finally {
      setSubmitting(false);
    }
  };

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
          title: t("messages.deleteFailedTitle"),
          message: t("messages.deleteFailed"),
        });
      }
    } catch {
      setConfirmDeleteFormId(null);
      setAlertDialogInfo({
        title: t("messages.networkError"),
        message: t("messages.networkDeleteError"),
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyLink = (path: string) => {
    const fullUrl = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(fullUrl);
    toast.success(t("ui.copied"));
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as any);
            if (typeof window !== "undefined") {
              window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="builder">
              <FileText className="size-3.5" />
              {editingFormId ? t("ui.editorEdit") : t("ui.editor")}
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Eye className="size-3.5" />
              {t("ui.preview")}
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Sliders className="size-3.5" />
              {t("ui.settings")}
            </TabsTrigger>
            <TabsTrigger value="forms">
              <BarChart3 className="size-3.5" />
              {t("ui.published")}
            </TabsTrigger>
          </TabsList>

          {errorMsg && (
            <div
              role="alert"
              className="mx-auto mt-4 flex max-w-3xl items-center gap-3 rounded-xl border border-status-error/30 bg-status-error/10 p-3.5 text-body-sm text-status-error"
            >
              <AlertCircle className="size-4 shrink-0" />
              <p className="flex-1">{errorMsg}</p>
            </div>
          )}

          {/* TAB 1: GOOGLE FORMS-INSPIRED BUILDER */}
          <TabsContent value="builder" className="pt-4">
            <div className="mx-auto max-w-3xl space-y-4">
              {/* Top Studio Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 md:pr-14">
                <span className="text-body-xs text-muted-foreground">
                  {totalQuestionCount} {t("presets.questions")}
                </span>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {editingFormId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelEdit}
                      className="h-9 text-body-sm"
                    >
                      <Undo2 className="size-3.5" />
                      {t("ui.cancelEdit")}
                    </Button>
                  )}

                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={t("ui.moreActions")}
                            className="h-9 w-9"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>{t("ui.moreActions")}</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="w-56">
                      {editingFormId && (
                        <>
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/forms/${editingFormId}`}>
                              <BarChart3 className="size-4" />
                              {t("ui.responseAnalytics")}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      {presetsEnabled && (
                        <>
                          <DropdownMenuItem onSelect={() => setSavePresetOpen(true)}>
                            <Bookmark className="size-4" />
                            {t("presets.save")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setLoadPresetOpen(true)}>
                            <FolderOpen className="size-4" />
                            {t("presets.load")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem onSelect={handleLoadFull12TypePreset}>
                        <ListPlus className="size-4" />
                        {t("ui.preset12")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSubmitForm}
                    disabled={submitting}
                    isLoading={submitting}
                    className="h-9 text-body-sm"
                  >
                    {editingFormId ? (
                      <>
                        <Check className="size-3.5" />
                        {t("ui.saveChanges")}
                      </>
                    ) : (
                      <>
                        <ArrowUpRight className="size-3.5" />
                        {t("ui.publish")}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Centered Form Canvas + Floating Vertical Rail */}
              <div className="flex flex-col items-start gap-3 md:flex-row">
                {/* Main Form Column */}
                <div className="w-full min-w-0 flex-1" ref={builderListRef}>
                  {/* Borderless Form Header with Top Accent Line */}
                  <section className="border-t-2 border-t-primary border-b border-border pt-4 pb-5 space-y-3">
                    <Input
                      type="text"
                      aria-label={t("ui.formTitle")}
                      placeholder={t("ui.formTitle")}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="h-auto w-full min-w-0 rounded-none border-0 border-b border-transparent bg-transparent px-0 pb-1 font-heading text-h5 font-bold text-foreground shadow-none hover:border-border focus-visible:border-primary focus-visible:ring-0"
                    />

                    <Textarea
                      aria-label={t("ui.formDescriptionLabel")}
                      rows={1}
                      placeholder={t("ui.formDescription")}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="min-h-0 w-full resize-none rounded-none border-0 border-b border-transparent bg-transparent px-0 pb-1 text-body-sm text-muted-foreground shadow-none hover:border-border focus-visible:border-primary focus-visible:ring-0"
                    />

                    {/* Compact Category & Short Link Row */}
                    <div className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:items-center">
                      <Select value={category} onValueChange={(val: any) => setCategory(val)}>
                        <SelectTrigger aria-label={t("ui.category")} className="h-9 w-full sm:w-44 shrink-0 text-body-sm">
                          <SelectValue placeholder={t("ui.chooseCategory")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="survey">{t("ui.survey")}</SelectItem>
                          <SelectItem value="feedback">{t("ui.feedback")}</SelectItem>
                          <SelectItem value="quiz">{t("ui.quiz")}</SelectItem>
                          <SelectItem value="registration">{t("ui.registration")}</SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="flex h-9 min-w-0 w-full sm:flex-1 sm:max-w-xs items-center gap-1.5 rounded-md border border-border bg-muted/20 px-2.5">
                        <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-mono text-body-xs text-muted-foreground">/f/</span>
                        <Input
                          type="text"
                          aria-label={t("ui.slug")}
                          placeholder={t("ui.slug")}
                          value={slug}
                          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                          className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 font-mono text-body-sm shadow-none focus-visible:ring-0"
                        />
                      </div>
                    </div>
                  </section>

                  {/* Question List (Divided Rows; Only Active Item Lifts into Card) */}
                  <div className="divide-y divide-border border-b border-border">
                    {questions.map((q, qIdx) => (
                      <QuestionCard
                        key={qIdx}
                        question={q}
                        qIdx={qIdx}
                        totalItems={questions.length}
                        questionNumber={realQuestionNumbers.get(qIdx) || 0}
                        sectionIndex={sectionIndexMap.get(qIdx)}
                        displayMode={settings.displayMode}
                        isActive={activeQIndex === qIdx}
                        isDragging={draggedIdx === qIdx}
                        isDragOver={dragOverIdx === qIdx && draggedIdx !== qIdx}
                        isUploading={uploadingQIndex === qIdx}
                        onActivate={() => setActiveQIndex(qIdx)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", qIdx.toString());
                          setDraggedIdx(qIdx);
                        }}
                        onDragEnd={() => {
                          setDraggedIdx(null);
                          setDragOverIdx(null);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverIdx(qIdx);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
                          if (!isNaN(fromIdx)) {
                            moveQuestion(fromIdx, qIdx);
                          }
                          setDraggedIdx(null);
                          setDragOverIdx(null);
                        }}
                        onMoveUp={() => moveQuestion(qIdx, qIdx - 1)}
                        onMoveDown={() => moveQuestion(qIdx, qIdx + 1)}
                        onDuplicate={() => handleDuplicateQuestion(qIdx)}
                        onRemove={() => handleRemoveQuestion(qIdx)}
                        onChange={(updated) => handleQuestionChange(qIdx, updated)}
                        onAddOption={() => handleAddOption(qIdx)}
                        onOptionChange={(oIdx, val) => handleOptionChange(qIdx, oIdx, val)}
                        onRemoveOption={(oIdx) => handleRemoveOption(qIdx, oIdx)}
                        onAddGridRow={() => handleAddGridRow(qIdx)}
                        onGridRowChange={(rIdx, val) => handleGridRowChange(qIdx, rIdx, val)}
                        onRemoveGridRow={(rIdx) => handleRemoveGridRow(qIdx, rIdx)}
                        onAddGridCol={() => handleAddGridCol(qIdx)}
                        onGridColChange={(cIdx, val) => handleGridColChange(qIdx, cIdx, val)}
                        onRemoveGridCol={(cIdx) => handleRemoveGridCol(qIdx, cIdx)}
                        onImageUpload={(file) => handleImageFileUpload(qIdx, file)}
                        onZoomImage={(uri) => setZoomImageUri(uri)}
                      />
                    ))}
                  </div>

                  {/* Quick Inline Add Bar at Bottom */}
                  <div className="flex flex-wrap items-center gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddQuestion}
                      className="flex-1 h-10 border-dashed text-body-sm text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="size-4" />
                      {t("ui.addQuestion")}
                    </Button>

                    <div className="flex items-center gap-1.5 md:hidden">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleAddStatement}
                        aria-label={t("ui.addInformation")}
                        className="h-10 w-10 text-muted-foreground hover:text-foreground"
                      >
                        <Info className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleAddSection}
                        aria-label={t("ui.addSection")}
                        className="h-10 w-10 text-muted-foreground hover:text-foreground"
                      >
                        <Layers className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Desktop Floating Vertical Tool Rail (Google Forms Signature) */}
                <aside
                  aria-label={t("ui.formActions")}
                  className="hidden md:flex shrink-0 flex-col gap-1 sticky top-16 rounded-xl border border-border bg-card p-1.5 shadow-sm"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleAddQuestion}
                        aria-label={t("ui.addQuestion")}
                        className="h-9 w-9 text-foreground hover:bg-primary/10 hover:text-primary"
                      >
                        <PlusCircle className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{t("ui.addQuestion")}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleAddStatement}
                        aria-label={t("ui.addInformation")}
                        className="h-9 w-9 text-muted-foreground hover:text-foreground"
                      >
                        <Info className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{t("ui.addInformation")}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleAddSection}
                        aria-label={t("ui.addSection")}
                        className="h-9 w-9 text-muted-foreground hover:text-foreground"
                      >
                        <Layers className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{t("ui.addSection")}</TooltipContent>
                  </Tooltip>

                  {presetsEnabled && (
                    <>
                      <div className="my-0.5 h-px bg-border" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setLoadPresetOpen(true)}
                            aria-label={t("presets.load")}
                            className="h-9 w-9 text-muted-foreground hover:text-foreground"
                          >
                            <FolderOpen className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">{t("presets.load")}</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setSavePresetOpen(true)}
                            aria-label={t("presets.save")}
                            className="h-9 w-9 text-muted-foreground hover:text-foreground"
                          >
                            <Bookmark className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">{t("presets.save")}</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </aside>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: PREVIEW */}
          <TabsContent value="preview" className="pt-4">
            <div className="mx-auto max-w-3xl overflow-hidden">
              <PublicFormViewer
                key={settings.displayMode}
                previewForm={{
                  id: editingFormId || "preview",
                  slug: slug || "preview",
                  title: title || t("ui.formUntitled"),
                  description: description || undefined,
                  category,
                  questions,
                  settings,
                }}
                isPreview={true}
              />
            </div>
          </TabsContent>

          {/* TAB 3: SETTINGS (CLEAN CENTERED GOOGLE FORMS STYLE) */}
          <TabsContent value="settings" className="pt-4">
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-body-base font-bold text-foreground">
                  {t("ui.responseSettings")}
                </h2>
                <div className="flex items-center gap-2">
                  {editingFormId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEdit}
                      className="h-9 text-body-sm"
                    >
                      <Undo2 className="size-3.5" />
                      {t("ui.cancelEdit")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={handleSubmitForm}
                    disabled={submitting}
                    isLoading={submitting}
                    size="sm"
                    className="h-9 text-body-sm"
                  >
                    {editingFormId ? (
                      <>
                        <Check className="size-3.5" />
                        {t("ui.saveChanges")}
                      </>
                    ) : (
                      <>
                        <ArrowUpRight className="size-3.5" />
                        {t("ui.publish")}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {presetsEnabled && (
                <PresetSettingsLoader
                  onApplySettings={(s) => setSettings((prev) => ({ ...prev, ...s }))}
                />
              )}

              <div className="divide-y divide-border border-t border-border">
                {/* Display Mode */}
                <div className="py-5 space-y-2">
                  <Label htmlFor="form-display-mode" className="text-body-sm font-semibold">
                    Tampilan formulir
                  </Label>
                  <Select
                    value={settings.displayMode}
                    onValueChange={(displayMode: FormDisplayMode) => setSettings({ ...settings, displayMode })}
                  >
                    <SelectTrigger id="form-display-mode" className="h-9 w-full sm:w-80 text-body-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="question">Satu pertanyaan per halaman</SelectItem>
                      <SelectItem value="section">Mengalir, satu bagian per halaman</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-body-xs text-muted-foreground">
                    Setiap bagian memulai halaman baru. Tanpa bagian, semua pertanyaan tampil dalam satu halaman.
                  </p>
                </div>

                {/* Status & Schedule */}
                <div className="py-5 space-y-4">
                  <h3 className="font-heading text-body-sm font-semibold text-foreground">
                    {t("ui.statusSchedule")}
                  </h3>

                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="builder-setting-accepting" className="text-body-sm text-foreground cursor-pointer">
                      {t("ui.acceptResponses")}
                    </Label>
                    <Switch
                      id="builder-setting-accepting"
                      checked={settings.acceptingResponses}
                      onCheckedChange={(checked) => setSettings({ ...settings, acceptingResponses: Boolean(checked) })}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="builder-open-at" className="text-body-sm font-semibold">
                        {t("ui.openSchedule")}
                      </Label>
                      <Input
                        id="builder-open-at"
                        type="datetime-local"
                        value={settings.openAt}
                        onChange={(e) => setSettings({ ...settings, openAt: e.target.value })}
                        className="h-9 w-full text-body-sm"
                      />
                      <p className="text-body-xs text-muted-foreground">{t("ui.alwaysOpen")}</p>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="builder-close-at" className="text-body-sm font-semibold">
                        {t("ui.closeSchedule")}
                      </Label>
                      <Input
                        id="builder-close-at"
                        type="datetime-local"
                        value={settings.closeAt}
                        onChange={(e) => setSettings({ ...settings, closeAt: e.target.value })}
                        className="h-9 w-full text-body-sm"
                      />
                      <p className="text-body-xs text-muted-foreground">{t("ui.alwaysOpen")}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="builder-closed-msg" className="text-body-sm font-semibold">
                      {t("ui.closedMessage")}
                    </Label>
                    <Textarea
                      id="builder-closed-msg"
                      rows={2}
                      value={settings.closedMessage}
                      onChange={(e) => setSettings({ ...settings, closedMessage: e.target.value })}
                      placeholder={defaults("closedMessageDefault")}
                      className="w-full text-body-sm min-h-[44px]"
                    />
                  </div>
                </div>

                {/* Email & Auth */}
                <div className="py-5 space-y-4">
                  <h3 className="font-heading text-body-sm font-semibold text-foreground">
                    {t("ui.emailAuth")}
                  </h3>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-body-sm font-semibold">{t("ui.collectEmail")}</Label>
                      <Select
                        value={settings.collectEmail}
                        onValueChange={(val: any) => setSettings({ ...settings, collectEmail: val })}
                      >
                        <SelectTrigger className="h-9 w-full text-body-sm">
                          <SelectValue placeholder={t("ui.emailPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("ui.noCollection")}</SelectItem>
                          <SelectItem value="input">{t("ui.manualEntry")}</SelectItem>
                          <SelectItem value="verified">{t("ui.verifiedAccount")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-body-sm font-semibold">{t("ui.sendCopy")}</Label>
                      <Select
                        value={settings.sendResponseCopy}
                        onValueChange={(val: any) => setSettings({ ...settings, sendResponseCopy: val })}
                      >
                        <SelectTrigger className="h-9 w-full text-body-sm">
                          <SelectValue placeholder={t("ui.copyPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="off">{t("ui.copyOff")}</SelectItem>
                          <SelectItem value="requested">{t("ui.copyRequest")}</SelectItem>
                          <SelectItem value="always">{t("ui.copyAlways")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="builder-setting-allow-edit" className="text-body-sm text-foreground cursor-pointer">
                      {t("ui.allowEdit")}
                    </Label>
                    <Switch
                      id="builder-setting-allow-edit"
                      checked={settings.allowResponseEditing}
                      onCheckedChange={(checked) => setSettings({ ...settings, allowResponseEditing: Boolean(checked) })}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="builder-setting-limit-one" className="text-body-sm text-foreground cursor-pointer">
                      {t("ui.limitOne")}
                    </Label>
                    <Switch
                      id="builder-setting-limit-one"
                      checked={settings.limitToOneResponse}
                      onCheckedChange={(checked) => setSettings({ ...settings, limitToOneResponse: Boolean(checked) })}
                    />
                  </div>
                </div>

                {/* File Limits & Confirmation Message */}
                <div className="py-5 space-y-4">
                  <h3 className="font-heading text-body-sm font-semibold text-foreground">
                    {t("ui.fileLimits")}
                  </h3>

                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold">{t("ui.totalFileLimit")}</Label>
                    <Select
                      value={settings.maxFileSizeLimit}
                      onValueChange={(val: any) => setSettings({ ...settings, maxFileSizeLimit: val })}
                    >
                      <SelectTrigger className="h-9 w-full sm:w-64 text-body-sm">
                        <SelectValue placeholder={t("ui.fileSizeLimit")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1GB">1 GB</SelectItem>
                        <SelectItem value="10GB">10 GB</SelectItem>
                        <SelectItem value="100GB">100 GB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="builder-success-msg" className="text-body-sm font-semibold">
                      {t("ui.submitConfirmation")}
                    </Label>
                    <Input
                      id="builder-success-msg"
                      type="text"
                      value={settings.customSuccessMessage}
                      onChange={(e) => setSettings({ ...settings, customSuccessMessage: e.target.value })}
                      placeholder={defaults("successMessageDefault")}
                      className="h-9 w-full text-body-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* TAB 4: PUBLISHED FORMS */}
          <TabsContent value="forms" className="pt-4">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative min-w-[140px] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    aria-label="Cari formulir"
                    placeholder="Cari formulir..."
                    value={formsQuery}
                    onChange={(e) => setFormsQuery(e.target.value)}
                    className="h-9 pl-9 text-body-sm"
                  />
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={fetchForms}
                      disabled={loadingForms}
                      aria-label={t("ui.reload")}
                      className="h-9 w-9 shrink-0"
                    >
                      <RefreshCw className={`size-4 ${loadingForms ? "animate-spin" : ""}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("ui.reload")}</TooltipContent>
                </Tooltip>
              </div>

              {loadingForms ? (
                <FormListSkeleton />
              ) : formsLoadError ? (
                <div role="alert" className="rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-body-sm text-status-error">
                  Gagal memuat formulir. Muat ulang untuk mencoba lagi.
                </div>
              ) : forms.length === 0 ? (
                <AdminEmptyState
                  icon={FileText}
                  title={t("ui.noForms")}
                  description={t("ui.noFormsHelp")}
                />
              ) : filteredForms.length === 0 ? (
                <AdminEmptyState
                  icon={Search}
                  title="Tidak ada formulir yang cocok"
                />
              ) : (
                <div className="divide-y divide-border border-y border-border">
                  {filteredForms.map((f) => {
                    const isDeleting = deletingId === f.id;
                    const shortPath = `/f/${f.slug}`;
                    const fullPath = `/forms/${f.id}`;
                    return (
                      <article
                        key={f.id}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/20 px-2"
                      >
                        <div className="min-w-0 flex-1 basis-48 space-y-1">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(f)}
                            className="text-left break-words font-heading text-body-sm font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
                          >
                            {f.title}
                          </button>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-body-xs text-muted-foreground">
                            <span>{t(`ui.${f.category}`)}</span>
                            <span>{t("ui.responseCount", { count: f.totalResponses || 0 })}</span>
                            <span className="font-mono">{shortPath}</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button asChild size="sm" variant="outline" className="h-9 text-body-sm">
                            <Link href={`/admin/forms/${f.id}`}>
                              <BarChart3 className="size-3.5" />
                              {t("ui.viewResponses")}
                            </Link>
                          </Button>

                          <DropdownMenu>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t("ui.moreActions")}
                                    disabled={isDeleting}
                                    className="h-9 w-9"
                                  >
                                    {isDeleting ? (
                                      <RefreshCw className="size-4 animate-spin" />
                                    ) : (
                                      <MoreVertical className="size-4" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                              </TooltipTrigger>
                              <TooltipContent>{t("ui.moreActions")}</TooltipContent>
                            </Tooltip>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onSelect={() => handleStartEdit(f)}>
                                <Edit3 className="size-4" />
                                {t("ui.editForm")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handleCopyLink(shortPath)}>
                                <Copy className="size-4" />
                                {t("ui.copyShortLink")}
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <a href={shortPath} target="_blank" rel="noreferrer">
                                  <ExternalLink className="size-4" />
                                  {t("ui.openShortLink", { path: shortPath })}
                                </a>
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handleCopyLink(fullPath)}>
                                <Copy className="size-4" />
                                {t("ui.copyFullLink")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => setConfirmDeleteFormId(f.id)}
                              >
                                <Trash2 className="size-4" />
                                {t("ui.deleteForm")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Controlled Preset Dialogs */}
        {presetsEnabled && (
          <FormPresetsDialogs
            category={category}
            questions={questions}
            settings={settings}
            saveOpen={savePresetOpen}
            onSaveOpenChange={setSavePresetOpen}
            loadOpen={loadPresetOpen}
            onLoadOpenChange={setLoadPresetOpen}
            onApplyQuestions={(qs) => {
              setQuestions(qs);
              setActiveQIndex(0);
            }}
            onApplySettings={(s) => setSettings((prev) => ({ ...prev, ...s }))}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={Boolean(confirmDeleteFormId)}
          onOpenChange={(open) => {
            if (deletingId === null && !open) setConfirmDeleteFormId(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("ui.deletePublishedTitle")}</DialogTitle>
              <DialogDescription>{t("ui.deletePublishedHelp")}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                disabled={deletingId !== null}
                onClick={() => setConfirmDeleteFormId(null)}
              >
                {t("ui.cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={deletingId !== null}
                isLoading={deletingId !== null}
                onClick={() => {
                  if (confirmDeleteFormId) executeDeleteForm(confirmDeleteFormId);
                }}
              >
                {t("ui.deleteForm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Generic Alert Dialog */}
        <Dialog
          open={Boolean(alertDialogInfo)}
          onOpenChange={(open) => {
            if (!open) setAlertDialogInfo(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{alertDialogInfo?.title || t("ui.systemNotice")}</DialogTitle>
              <DialogDescription>{alertDialogInfo?.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setAlertDialogInfo(null)}>{t("ui.close")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Lightbox Image Zoom Dialog */}
        <Dialog
          open={Boolean(zoomImageUri)}
          onOpenChange={(open) => {
            if (!open) setZoomImageUri(null);
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{zoomImageUri?.title || t("ui.imagePreview")}</DialogTitle>
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

        {/* Confirm 12-Type Preset Replacement Dialog */}
        <Dialog
          open={confirmPresetDialogOpen}
          onOpenChange={setConfirmPresetDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("ui.preset12Title")}</DialogTitle>
              <DialogDescription>{t("ui.loadPresetWarning")}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setConfirmPresetDialogOpen(false)}
              >
                {t("ui.cancel")}
              </Button>
              <Button onClick={apply12TypePreset}>
                {t("ui.loadPresetConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
