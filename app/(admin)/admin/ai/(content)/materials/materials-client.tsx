"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn, cleanSummary } from "@/lib/utils";
import {
  Plus,
  BookText,
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCw,
  Play,
  Loader2,
  AlertTriangle,
  Check,
  CheckCircle2,
  Info,
  Sparkles,
  ExternalLink,
  FileText,
  Layers,
  Settings,
  FileUp,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { saveChapter } from "@/app/(admin)/admin/(academic)/courses/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";

interface Instance {
  id: string;
  title: string;
  courseId: string;
  sourceType: string;
  summary: string;
  keywords: unknown;
  pineconeSyncStatus: string;
  lastSyncError: string | null;
  createdAt: string;
}

interface Course {
  id: string;
  title: string;
}

interface AssessmentMTD {
  id: string;
  title: string;
  courseId: string;
  version: number;
  status: string;
  createdAt: string;
}

interface WebMaterial {
  id: string;
  title: string;
  courseId: string;
  chapterId: string;
  slug: string;
  canonicalMarkdown: string;
  status: string;
  createdAt: string;
}

interface Chapter {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
}

interface Props {
  instances: Instance[];
  assessments: AssessmentMTD[];
  webMaterials: WebMaterial[];
  courses: Course[];
  chapters: Chapter[];
  courseMap: Record<string, string>;
  prefillCourseId?: string;
}

interface Warning {
  id: string;
  type: "latex" | "glossary" | "density";
  title: string;
  desc: string;
  target?: string;
}

type IngestionState = "source" | "analyzing" | "reviewing" | "ready";

export function MaterialInstancesClient({ instances, assessments, webMaterials, courses, chapters, courseMap, prefillCourseId }: Props) {
  const router = useRouter();
  const [activeDashboardTab, setActiveDashboardTab] = useState<"learning" | "assessment" | "website">("learning");
  const [documentType, setDocumentType] = useState<"learning" | "assessment">("learning");
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ingestionState, setIngestionState] = useState<IngestionState>("source");
  const [showReport, setShowReport] = useState(false);
  const [inputMethod, setInputMethod] = useState<"upload" | "paste">("upload");

  // PDF upload state
  const [pdfKey, setPdfKey] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfUploadState, setPdfUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");

  const [localChapters, setLocalChapters] = useState(chapters);
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [creatingChapter, setCreatingChapter] = useState(false);

  const [form, setForm] = useState({
    courseId: prefillCourseId && courses.some((c) => c.id === prefillCourseId)
      ? prefillCourseId
      : "",
    title: "",
    sourceType: "markdown" as "markdown" | "json" | "pdf_extraction",
    rawText: "",
    summary: "",
    learningObjectives: "",
    keywords: "",
  });

  const [stats, setStats] = useState({
    words: 0,
    headings: 0,
    formulas: 0,
    chapters: 0,
    conceptsCount: 0,
    formulasCount: 0,
    definitionsCount: 0,
    misconceptionsCount: 0,
  });

  interface ExtractedKO {
    id: string;
    title: string;
    type: string;
    bloomLevel: string;
  }

  const [extractedKOs, setExtractedKOs] = useState<ExtractedKO[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const displayedInstances = useMemo(() => {
    if (!prefillCourseId) return instances;
    return instances.filter((i) => i.courseId === prefillCourseId);
  }, [instances, prefillCourseId]);

  const displayedAssessments = useMemo(() => {
    if (!prefillCourseId) return assessments;
    return assessments.filter((a) => a.courseId === prefillCourseId);
  }, [assessments, prefillCourseId]);

  const displayedWebMaterials = useMemo(() => {
    if (!prefillCourseId) return webMaterials;
    return webMaterials.filter((wm) => wm.courseId === prefillCourseId);
  }, [webMaterials, prefillCourseId]);

  const courseChapters = localChapters.filter((c) => c.courseId === form.courseId);

  const handleCourseChange = (courseId: string) => {
    setForm((f) => ({ ...f, courseId }));
    setSelectedChapters(new Set());
  };

  const handleChapterToggle = (chapterId: string) => {
    const chapter = localChapters.find((c) => c.id === chapterId);
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
        if (!form.title && chapter) {
          setForm((f) => ({ ...f, title: chapter.title }));
        }
      }
      return next;
    });
  };

  const handleCreateChapter = async () => {
    const title = newChapterTitle.trim();
    if (!title) {
      toast.error("Nama bab tidak boleh kosong");
      return;
    }
    if (!form.courseId) return;

    setCreatingChapter(true);
    try {
      const maxOrder = courseChapters.reduce((max, c) => Math.max(max, c.orderIndex), 0);
      const res = await saveChapter(null, form.courseId, title, maxOrder + 1);
      if (res.success && res.chapter) {
        const ch = res.chapter;
        setLocalChapters((prev) => [...prev, ch]);
        setSelectedChapters((prev) => new Set(prev).add(ch.id));
        setNewChapterTitle("");
        if (!form.title) {
          setForm((f) => ({ ...f, title: ch.title }));
        }
        toast.success(`Bab "${title}" berhasil ditambahkan`);
      } else {
        toast.error(res.error || "Gagal menambahkan bab");
      }
    } catch {
      toast.error("Gagal menambahkan bab");
    } finally {
      setCreatingChapter(false);
    }
  };

  // Immediately upload a PDF to R2 on file select
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      toast.error("Hanya berkas PDF yang diterima.");
      return;
    }

    setPdfUploadState("uploading");
    setPdfFileName(file.name);
    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/admin/upload-pdf", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Gagal mengunggah PDF: " + (data.error ?? "Unknown error"));
        setPdfUploadState("error");
        return;
      }
      setPdfKey(data.key);
      setPdfUploadState("done");
      toast.success(`PDF '${file.name}' berhasil diunggah ke arsip.`);
    } catch {
      toast.error("Terjadi kesalahan saat mengunggah PDF.");
      setPdfUploadState("error");
    }
  };

  const handleMdFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".md")) {
      toast.error("Hanya berkas Markdown (.md) yang diterima untuk dokumen kanonik.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setForm((f) => ({
        ...f,
        title: f.title || file.name.replace(/\.[^/.]+$/, ""),
        rawText: (event.target?.result as string) || "",
      }));
      toast.success(`Berkas '${file.name}' berhasil dimuat.`);
    };
    reader.readAsText(file);
  };


  async function handlePublishAssessment() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/material-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: form.courseId,
          title: form.title,
          sourceType: form.sourceType,
          rawText: form.rawText,
          summary: "Assessment Document",
          type: "assessment",
          pdfKey: pdfKey ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          "Gagal mengunggah dokumen asesmen: " + (data.error?.message || JSON.stringify(data.error))
        );
        return;
      }
      toast.success(data.message || "Dokumen Asesmen berhasil diunggah.");
      setShowForm(false);
      router.refresh();
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  // Simulated parse analysis process
  const handleStartAnalysis = () => {
    if (!form.courseId || !form.title || !form.rawText) {
      toast.error("Silakan lengkapi Kursus, Judul, dan Teks Materi terlebih dahulu.");
      return;
    }

    if (documentType === "assessment") {
      handlePublishAssessment();
      return;
    }

    setIngestionState("analyzing");

    // Parse raw text for statistics
    const words = form.rawText.split(/\s+/).filter(Boolean).length;
    const headings = (form.rawText.match(/^#+\s+.+$/gm) || []).length;

    // Non-overlapping LaTeX formulas calculation
    const doubleDollarMatches = form.rawText.match(/\$\$[\s\S]*?\$\$/g) || [];
    const blockFormulasCount = doubleDollarMatches.length;
    const textWithoutBlocks = form.rawText.replace(/\$\$[\s\S]*?\$\$/g, "");
    const inlineFormulaMatches = textWithoutBlocks.match(/\$[^\$\n]+?\$/g) || [];
    const inlineFormulasCount = inlineFormulaMatches.length;
    const formulas = blockFormulasCount + inlineFormulasCount;

    const chaptersCount = (form.rawText.match(/^##\s+.+$/gm) || []).length || 1;

    // Parse Knowledge Objects (container blocks)
    const blockRegex =
      /:::(concept|formula|definition|misconception|example|exercise|summary|objective)(?:\s+({[^}]+}))?/g;
    const extractedKOsList: ExtractedKO[] = [];
    const blockMatches = Array.from(form.rawText.matchAll(blockRegex));

    const getBloomLevel = (type: string) => {
      switch (type) {
        case "definition":
          return "remember";
        case "concept":
        case "concept_overview":
        case "summary":
          return "understand";
        case "formula":
        case "example":
        case "exercise":
          return "apply";
        case "misconception":
          return "analyze";
        case "objective":
          return "remember";
        default:
          return "understand";
      }
    };

    blockMatches.forEach((m, idx) => {
      const type = m[1];
      const attrStr = m[2] || "";
      const titleMatch = attrStr.match(/title=["']([^"']+)["']/);
      const title = titleMatch ? titleMatch[1] : `${type.charAt(0).toUpperCase() + type.slice(1)} ${idx + 1}`;
      const normalizedType = type === "concept" ? "concept_overview" : type;
      extractedKOsList.push({
        id: `ko-extracted-${idx}`,
        title,
        type: normalizedType,
        bloomLevel: getBloomLevel(normalizedType),
      });
    });

    const conceptsCount = extractedKOsList.filter((k) => k.type === "concept_overview").length;
    const formulasCount = extractedKOsList.filter((k) => k.type === "formula").length;
    const definitionsCount = extractedKOsList.filter((k) => k.type === "definition").length;
    const misconceptionsCount = extractedKOsList.filter((k) => k.type === "misconception").length;

    // Check for LaTeX validation issues (unmatched dollar signs)
    const singleDollars = (form.rawText.match(/(?<!\$)\$(?!\$)/g) || []).length;
    const parsedWarnings: Warning[] = [];

    if (singleDollars % 2 !== 0) {
      parsedWarnings.push({
        id: "latex-inline",
        type: "latex",
        title: "Sintaks LaTeX Tidak Seimbang (Inline)",
        desc: "Ditemukan jumlah pembatas '$' ganjil. Hal ini menandakan adanya persamaan matematika inline yang belum ditutup.",
        target: "$",
      });
    }

    // Check for glossary references missing definitions
    const glossaryMatches = Array.from(form.rawText.matchAll(/\[\[(.*?)\]\]/g)).map((m) => m[1]);
    const keywordsList = form.keywords
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    glossaryMatches.forEach((term, idx) => {
      if (!keywordsList.includes(term.toLowerCase())) {
        parsedWarnings.push({
          id: `glossary-${idx}`,
          type: "glossary",
          title: `Referensi Glosarium Belum Terdaftar: "${term}"`,
          desc: `Istilah dirujuk menggunakan kurung siku ganda [[${term}]] tetapi belum didaftarkan sebagai Kata Kunci.`,
          target: term,
        });
      }
    });

    // Check for concept density warnings
    if (words > 1000 && headings === 0) {
      parsedWarnings.push({
        id: "low-density",
        type: "density",
        title: "Struktur Kepadatan Materi Rendah",
        desc: "Materi ini memiliki teks yang panjang (>1000 kata) tetapi tidak memiliki pembagian subbab (H2/H3). Disarankan menambahkan heading subbab.",
      });
    }

    // Auto-generate summary, objectives, and keywords if not provided
    const cleanedText = cleanSummary(form.rawText);
    const autoSummary = form.summary || (cleanedText.length > 0 ? cleanedText.slice(0, 180) + "..." : "");

    const lines = form.rawText.split("\n");
    const objectivesLines = lines
      .filter(
        (line) =>
          line.toLowerCase().includes("siswa dapat") || line.toLowerCase().includes("tujuan")
      )
      .map((line) => line.replace(/^[-*\s\d.]+/, "").trim())
      .slice(0, 5);
    const autoObjectives =
      form.learningObjectives ||
      (objectivesLines.length > 0
        ? objectivesLines.join("\n")
        : `Memahami teori utama ${form.title}\nMampu menyelesaikan latihan analisis terkait`);

    const autoKeywords =
      form.keywords ||
      form.title
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 5)
        .join(", ");

    setTimeout(() => {
      setForm((prev) => ({
        ...prev,
        summary: autoSummary,
        learningObjectives: autoObjectives,
        keywords: autoKeywords,
      }));
      setStats({
        words,
        headings,
        formulas,
        chapters: chaptersCount,
        conceptsCount,
        formulasCount,
        definitionsCount,
        misconceptionsCount,
      });
      setExtractedKOs(extractedKOsList);
      setWarnings(parsedWarnings);
      setIngestionState("reviewing");
      toast.success("Analisis dokumen selesai. Objek pengetahuan dan metrik berhasil dihitung.");
    }, 1500);
  };

  // Curation Fix Methods
  const fixGlossaryWarning = (id: string, term: string) => {
    setForm((prev) => {
      const existing = prev.keywords
        ? prev.keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
        : [];
      if (!existing.map((e) => e.toLowerCase()).includes(term.toLowerCase())) {
        existing.push(term);
      }
      return { ...prev, keywords: existing.join(", ") };
    });
    setWarnings((prev) => prev.filter((w) => w.id !== id));
    toast.success(`Istilah "${term}" berhasil ditambahkan ke Kata Kunci.`);
  };

  const fixAllGlossaryWarnings = () => {
    const glossaryWarnings = warnings.filter(w => w.type === "glossary" && w.target);
    if (glossaryWarnings.length === 0) return;

    setForm((prev) => {
      const existing = prev.keywords
        ? prev.keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
        : [];

      let addedCount = 0;
      glossaryWarnings.forEach(warn => {
        const term = warn.target!;
        if (!existing.map((e) => e.toLowerCase()).includes(term.toLowerCase())) {
          existing.push(term);
          addedCount++;
        }
      });

      return { ...prev, keywords: existing.join(", ") };
    });

    const glossaryWarningIds = new Set(glossaryWarnings.map(w => w.id));
    setWarnings((prev) => prev.filter((w) => !glossaryWarningIds.has(w.id)));
    toast.success(`${glossaryWarnings.length} istilah berhasil ditambahkan ke Kata Kunci.`);
  };

  const fixLaTeXWarning = (id: string) => {
    setForm((prev) => ({ ...prev, rawText: prev.rawText + "$" }));
    setWarnings((prev) => prev.filter((w) => w.id !== id));
    toast.success("Simbol pembatas math inline berhasil diseimbangkan.");
  };

  const fixDensityWarning = (id: string) => {
    setForm((prev) => ({
      ...prev,
      rawText: `## Bab 1: Pendahuluan & Konsep Utama\n\n${prev.rawText}`,
    }));
    setWarnings((prev) => prev.filter((w) => w.id !== id));
    toast.success("Struktur subbab otomatis ditambahkan di awal dokumen.");
  };

  const handleCancelWorkspace = () => {
    setIngestionState("source");
    setStats({
      words: 0,
      headings: 0,
      formulas: 0,
      chapters: 0,
      conceptsCount: 0,
      formulasCount: 0,
      definitionsCount: 0,
      misconceptionsCount: 0,
    });
    setExtractedKOs([]);
    setWarnings([]);
    setPdfKey(null);
    setPdfFileName(null);
    setPdfUploadState("idle");
    setShowForm(false);
  };

  // Save Draft (Title prepended with [DRAF])
  async function handleSaveDraft() {
    setSubmitting(true);
    const finalTitle = form.title.startsWith("[DRAF]") ? form.title : `[DRAF] ${form.title}`;

    try {
      const res = await fetch("/api/admin/material-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: form.courseId,
          title: finalTitle,
          sourceType: form.sourceType,
          rawText: form.rawText,
          summary: form.summary,
          learningObjectives: form.learningObjectives
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          keywords: form.keywords
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          chapterIds: Array.from(selectedChapters),
          type: "learning",
          pdfKey: pdfKey ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Gagal menyimpan draf: " + JSON.stringify(data.error));
        return;
      }
      toast.success(`Draf "${finalTitle}" berhasil disimpan.`);
      setShowForm(false);
      router.refresh();
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  // Publish Material (Title cleaned, initiates sync)
  async function handlePublish() {
    setSubmitting(true);
    const finalTitle = form.title.replace(/^\[DRAF\]\s*/, "");

    try {
      const res = await fetch("/api/admin/material-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: form.courseId,
          title: finalTitle,
          sourceType: form.sourceType,
          rawText: form.rawText,
          summary: form.summary,
          learningObjectives: form.learningObjectives
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          keywords: form.keywords
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          chapterIds: Array.from(selectedChapters),
          type: "learning",
          pdfKey: pdfKey ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Gagal mempublikasikan materi: " + JSON.stringify(data.error));
        return;
      }
      toast.success(
        `Materi "${finalTitle}" berhasil dipublikasikan. ${data.sectionsCreated} seksi dan ${data.chunksCreated} chunk diindeks ke basis pengetahuan.`
      );
      setShowForm(false);
      router.refresh();
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  // Dynamic metrics calculations
  const babAccuracy = Math.max(
    20,
    100 -
      (warnings.some((w) => w.type === "density") ? 30 : 0) -
      (stats.headings === 0 ? 50 : 0) -
      (stats.words > 5000 && stats.headings < 5 ? 15 : 0)
  );

  const hasLatexWarning = warnings.some((w) => w.type === "latex");
  const latexAccuracy =
    stats.formulas === 0 ? 100 : Math.max(30, 100 - (hasLatexWarning ? 35 : 0));

  const glossaryWarningCount = warnings.filter((w) => w.type === "glossary").length;
  const glossaryAccuracy = Math.max(
    30,
    100 - glossaryWarningCount * 12 - (!form.keywords ? 10 : 0)
  );

  const unrecognized =
    warnings.length === 0 ? 0 : Math.min(25, Math.max(1, warnings.length * 2));
  const ignored = Math.min(10, Math.max(0, Math.round(stats.words / 8000)));
  const parsedSuccessfully = 100 - unrecognized - ignored;

  return (
    <div>
      {/* Tab Switcher (Visible only when not in ingestion workspace) */}
      {!showForm && (
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4 text-left">
          <div className="rounded-xl border border-border bg-card p-1 flex gap-1">
            <button
              onClick={() => setActiveDashboardTab("learning")}
              className={cn(
                "rounded-lg font-semibold text-xs h-9 px-4 transition-colors cursor-pointer",
                activeDashboardTab === "learning"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Materi Belajar ({displayedInstances.length})
            </button>
            <button
              onClick={() => setActiveDashboardTab("website")}
              className={cn(
                "rounded-lg font-semibold text-xs h-9 px-4 transition-colors cursor-pointer",
                activeDashboardTab === "website"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Materi Website (Kurikulum) ({displayedWebMaterials.length})
            </button>
            <button
              onClick={() => setActiveDashboardTab("assessment")}
              className={cn(
                "rounded-lg font-semibold text-xs h-9 px-4 transition-colors cursor-pointer",
                activeDashboardTab === "assessment"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Dokumen Asesmen ({displayedAssessments.length})
            </button>
          </div>

          <Button
            className="rounded-lg gap-2 cursor-pointer font-semibold"
            onClick={() => {
              setDocumentType(activeDashboardTab === "website" ? "learning" : activeDashboardTab);
              setShowForm(true);
            }}
          >
            <Plus className="size-4" />
            {activeDashboardTab === "assessment" ? "Tambah Asesmen" : "Tambah Materi"}
          </Button>
        </div>
      )}

      {!showForm && prefillCourseId && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-3 text-body-sm text-foreground text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-muted-foreground">Filter Kelas:</span>
            <span className="rounded-md bg-brand-primary/10 px-2.5 py-0.5 text-body-xs font-bold text-brand-primary uppercase tracking-wider border border-brand-primary/20">
              {courseMap[prefillCourseId] || prefillCourseId}
            </span>
          </div>
          <Link
            href="/admin/ai/materials"
            className="text-body-xs font-bold text-brand-primary hover:underline transition-colors"
          >
            Tampilkan Semua
          </Link>
        </div>
      )}

      {showForm && (
        <div className="mb-8 rounded-xl border border-border bg-card p-6 shadow-sm space-y-6 text-left">
          {/* Header Workspace */}
          <div className="flex items-center justify-between border-b border-border pb-4 flex-wrap gap-2">
            <div>
              <h2 className="font-heading text-h5 font-semibold text-foreground">
                {documentType === "learning"
                  ? "Material Ingestion Workspace"
                  : "Assessment Ingestion Workspace"}
              </h2>
              <p className="text-body-sm text-muted-foreground mt-0.5">
                {documentType === "learning"
                  ? "Unggah PDF asli sebagai arsip dan Markdown kanonik sebagai basis KO & RAG."
                  : "Unggah PDF asli sebagai arsip dan Markdown kanonik untuk klasifikasi soal."}
              </p>
            </div>
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {ingestionState === "source" && "1. Sumber Dokumen"}
              {ingestionState === "analyzing" && "2. Menganalisis..."}
              {ingestionState === "reviewing" && "3. Kurasi & Pratinjau"}
              {ingestionState === "ready" && "4. Siap Rilis"}
            </span>
          </div>

          {/* SECTION 1: SOURCE UPLOAD SECTION */}
          {ingestionState === "source" && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 text-left">
                {/* Document Type Selection */}
                <div>
                  <label className="text-body-sm font-semibold text-foreground mb-1 block">
                    Tipe Dokumen
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDocumentType("learning")}
                      className={cn(
                        "flex-1 rounded-md border text-body-sm font-semibold py-2 px-3 text-center transition-colors cursor-pointer",
                        documentType === "learning"
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:bg-muted/10 text-muted-foreground"
                      )}
                    >
                      Materi Belajar (Learning)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocumentType("assessment")}
                      className={cn(
                        "flex-1 rounded-md border text-body-sm font-semibold py-2 px-3 text-center transition-colors cursor-pointer",
                        documentType === "assessment"
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:bg-muted/10 text-muted-foreground"
                      )}
                    >
                      Dokumen Asesmen (Assessment)
                    </button>
                  </div>
                </div>

                {/* Course Selector */}
                <div>
                  <label className="text-body-sm font-semibold text-foreground mb-1 block">Kursus</label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-body-sm focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50"
                    value={form.courseId}
                    onChange={(e) => handleCourseChange(e.target.value)}
                    required
                  >
                    <option value="">Pilih kursus...</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Chapter Selector (Learning only) */}
                {documentType === "learning" && form.courseId && (
                  <div className="border border-border/80 rounded-xl p-4 bg-muted/5 space-y-3 col-span-2 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground">
                        KAITKAN DENGAN BAB (PILIH MINIMAL SATU)
                      </span>
                    </div>

                    {courseChapters.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {courseChapters.map((chapter) => (
                          <label
                            key={chapter.id}
                            className={cn(
                              "flex items-start gap-2.5 p-2 rounded-lg border text-xs font-semibold cursor-pointer select-none transition-all duration-155",
                              selectedChapters.has(chapter.id)
                                ? "border-primary bg-primary/5 text-foreground"
                                : "border-border hover:bg-muted/10 text-muted-foreground"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selectedChapters.has(chapter.id)}
                              onChange={() => handleChapterToggle(chapter.id)}
                              className="mt-0.5 rounded border-border"
                            />
                            <span>
                              Bab {chapter.orderIndex}: {chapter.title}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Inline chapter creation */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-body-sm focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50"
                        placeholder="Tambah bab baru..."
                        value={newChapterTitle}
                        onChange={(e) => setNewChapterTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreateChapter();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCreateChapter}
                        disabled={creatingChapter || !newChapterTitle.trim()}
                      >
                        {creatingChapter ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Plus className="size-3.5" />
                        )}
                        Tambah
                      </Button>
                    </div>
                  </div>
                )}

              </div>

              {/* Title Field */}
              <div className="text-left">
                <label className="text-body-sm font-semibold text-foreground mb-1 block">
                  {documentType === "learning" ? "Judul Materi" : "Judul Dokumen Asesmen"}
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-body-sm focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50"
                  placeholder={
                    documentType === "learning"
                      ? "Contoh: Limit dan Kekontinuan; Bab 3"
                      : "Contoh: Ujian Tengah Semester 2025"
                  }
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>

              {/* ── DUAL DOCUMENT UPLOAD SECTION ── */}
              <div className="space-y-3 text-left">
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-body-sm font-semibold text-foreground">Dokumen</label>
                  <span className="text-xs text-muted-foreground">
                    ; diperlukan dua berkas: PDF arsip + Markdown kanonik
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* ── ZONE 1: PDF (Archival) ── */}
                  <div className="border border-border rounded-xl p-4 bg-card/40 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <FileText className="size-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-body-sm font-bold text-foreground">Dokumen Asli (PDF)</p>
                        <p className="text-xs text-muted-foreground leading-snug">
                          Disimpan di R2 sebagai arsip. Tidak diproses ke KO.
                        </p>
                      </div>
                    </div>

                    {pdfUploadState === "idle" || pdfUploadState === "error" ? (
                      <div
                        onClick={() => document.getElementById("pdf-upload-input")?.click()}
                        className={cn(
                          "border-2 border-dashed rounded-lg p-5 flex flex-col items-center justify-center text-center gap-1.5 cursor-pointer transition-colors",
                          pdfUploadState === "error"
                            ? "border-destructive/50 bg-destructive/5 hover:bg-destructive/10"
                            : "border-border bg-muted/20 hover:bg-muted/30"
                        )}
                      >
                        <FileUp className="size-5 text-muted-foreground" />
                        <span className="text-body-sm font-medium text-foreground">
                          {pdfUploadState === "error" ? "Coba Lagi; Pilih PDF" : "Pilih Berkas PDF"}
                        </span>
                        <span className="text-xs text-muted-foreground">Opsional · Maks. 50 MB</span>
                        <input
                          id="pdf-upload-input"
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={handlePdfUpload}
                          className="hidden"
                        />
                      </div>
                    ) : pdfUploadState === "uploading" ? (
                      <div className="border border-border rounded-lg p-4 flex items-center gap-3 bg-muted/20">
                        <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{pdfFileName}</p>
                          <p className="text-xs text-muted-foreground">Mengunggah ke R2...</p>
                        </div>
                      </div>
                    ) : (
                      /* done */
                      <div className="border border-status-success/30 rounded-lg p-3 flex items-center gap-3 bg-status-success/8">
                        <CheckCircle2 className="size-4 text-status-success shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{pdfFileName}</p>
                          <p className="text-xs text-status-success">Berhasil diunggah ke arsip</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPdfKey(null);
                            setPdfFileName(null);
                            setPdfUploadState("idle");
                          }}
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                          title="Hapus pilihan PDF"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── ZONE 2: Canonical Markdown (Required) ── */}
                  <div className="border border-primary/30 rounded-xl p-4 bg-primary/5 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Sparkles className="size-3.5 text-primary" />
                      </div>
                      <div>
                        <p className="text-body-sm font-bold text-foreground">
                          Dokumen Kanonik (Markdown)
                        </p>
                        <p className="text-xs text-muted-foreground leading-snug">
                          Sumber KO & RAG. Diproses LLM saat publikasi.
                        </p>
                      </div>
                    </div>

                    {/* Toggle: upload file vs paste */}
                    <div className="flex gap-1 border border-border rounded-md p-0.5 bg-background">
                      <button
                        type="button"
                        onClick={() => setInputMethod("upload")}
                        className={cn(
                          "flex-1 rounded text-xs font-semibold py-1.5 transition-colors cursor-pointer",
                          inputMethod === "upload"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        Unggah Berkas
                      </button>
                      <button
                        type="button"
                        onClick={() => setInputMethod("paste")}
                        className={cn(
                          "flex-1 rounded text-xs font-semibold py-1.5 transition-colors cursor-pointer",
                          inputMethod === "paste"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        Tempel Teks
                      </button>
                    </div>

                    {inputMethod === "upload" && (
                      <div className="space-y-2">
                        {!form.rawText ? (
                          <div
                            onClick={() => document.getElementById("md-upload-input")?.click()}
                            className="border-2 border-dashed border-border rounded-lg p-5 flex flex-col items-center justify-center text-center gap-1.5 cursor-pointer bg-muted/20 hover:bg-muted/30 transition-colors"
                          >
                            <Plus className="size-5 text-muted-foreground" />
                            <span className="text-body-sm font-medium text-foreground">
                              Pilih Berkas Markdown (.md)
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Klik untuk menelusuri berkas lokal.
                            </span>
                            <input
                              id="md-upload-input"
                              type="file"
                              accept=".md"
                              onChange={handleMdFileUpload}
                              className="hidden"
                            />
                          </div>
                        ) : (
                          <div className="border border-status-success/30 rounded-lg p-3 flex items-center gap-3 bg-status-success/8">
                            <CheckCircle2 className="size-4 text-status-success shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground">
                                {form.rawText.split(/\s+/).filter(Boolean).length} kata dimuat
                              </p>
                              <p className="text-xs text-status-success">Konten kanonik siap dianalisis</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setForm((f) => ({ ...f, rawText: "" }));
                                setInputMethod("upload");
                              }}
                              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                              title="Hapus konten"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        )}

                      </div>
                    )}

                    {inputMethod === "paste" && (
                      <textarea
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-body-sm min-h-[120px] font-mono text-sm focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50"
                        placeholder="Tempel teks Markdown Anda di sini..."
                        value={form.rawText}
                        onChange={(e) => setForm((f) => ({ ...f, rawText: e.target.value }))}
                      />
                    )}
                  </div>
                </div>

                {/* Info callout explaining the two-doc model */}
                <div className="flex gap-2 p-3 bg-muted/30 border border-border rounded-lg text-xs text-muted-foreground">
                  <Info className="size-4 shrink-0 mt-0.5 text-primary" />
                  <span>
                    <strong className="text-foreground">Cara kerja dual-document:</strong> PDF disimpan sebagai arsip sumber asli dan tidak diproses. Markdown kanonik adalah satu-satunya input yang dianalisis LLM, diindeks ke Pinecone (RAG), dan menghasilkan Knowledge Objects.
                  </span>
                </div>
              </div>

              {/* Optional Fields (Learning only) */}
              {documentType === "learning" && (
                <div className="grid gap-4 sm:grid-cols-2 border-t border-border/60 pt-4 text-left">
                  <div>
                    <label className="text-body-sm font-medium text-foreground mb-1 block">
                      Tujuan Pembelajaran (Opsional, Satu Per Baris)
                    </label>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-body-sm min-h-[60px] focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50"
                      placeholder="Mampu menyelesaikan limit pecahan..."
                      value={form.learningObjectives}
                      onChange={(e) => setForm((f) => ({ ...f, learningObjectives: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-body-sm font-medium text-foreground mb-1 block">
                      Keywords / Kata Kunci (Opsional, Pisahkan Dengan Koma)
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-body-sm focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50"
                      placeholder="limit, aljabar, kekontinuan"
                      value={form.keywords}
                      onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  className="rounded-lg gap-2 cursor-pointer font-semibold"
                  disabled={
                    !form.courseId ||
                    !form.title ||
                    !form.rawText ||
                    (documentType === "learning" && selectedChapters.size === 0) ||
                    submitting
                  }
                  onClick={handleStartAnalysis}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <Play className="size-4" />
                      {documentType === "learning" ? "Analisis Dokumen" : "Proses Asesmen"}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg cursor-pointer font-semibold"
                  onClick={handleCancelWorkspace}
                  disabled={submitting}
                >
                  Batal
                </Button>
              </div>
            </div>
          )}

          {/* SECTION 2: LOADING ANALYZING OVERLAY */}
          {ingestionState === "analyzing" && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <Loader2 className="size-8 text-primary animate-spin" />
              <div className="space-y-1">
                <p className="font-heading text-body-lg font-semibold text-foreground">
                  Sedang Menganalisis Dokumen
                </p>
                <p className="text-body-sm text-muted-foreground max-w-sm">
                  Mengekstrak Bab, Struktur Rumus LaTeX, dan Objek Pengetahuan dari dokumen kanonik...
                </p>
              </div>
              <div className="w-full max-w-xs h-2 bg-muted rounded-md overflow-hidden relative border border-border/20">
                <div
                  className="absolute inset-y-0 left-0 bg-primary rounded-md animate-[progress-bar_1.5s_ease-in-out_infinite]"
                  style={{ width: "60%" }}
                />
              </div>
            </div>
          )}

          {/* SECTIONS 3-5: CURATION & VERIFICATION (Reviewing & Ready) */}
          {(ingestionState === "reviewing" || ingestionState === "ready") && (
            <div className="space-y-6">
              {/* Parse Result Summary Header */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Metric Box */}
                <div className="border border-border p-4 bg-muted/10 rounded-xl space-y-2.5">
                  <p className="font-sans text-body-sm font-semibold text-foreground flex items-center gap-1.5">
                    <FileText className="size-4 text-primary" />
                    Metrik Dokumen
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-body-sm">
                    <div>
                      Jumlah Kata: <span className="font-semibold text-foreground">{stats.words}</span>
                    </div>
                    <div>
                      Jumlah Heading:{" "}
                      <span className="font-semibold text-foreground">{stats.headings}</span>
                    </div>
                    <div>
                      Rumus LaTeX:{" "}
                      <span className="font-semibold text-foreground">{stats.formulas}</span>
                    </div>
                    <div>
                      Jumlah Bab:{" "}
                      <span className="font-semibold text-foreground">{stats.chapters}</span>
                    </div>
                  </div>
                  {pdfKey && (
                    <div className="flex items-center gap-1.5 pt-1 text-xs text-status-success border-t border-border/40 mt-1">
                      <CheckCircle2 className="size-3.5" />
                      <span>PDF arsip terlampir</span>
                    </div>
                  )}
                </div>

                {/* KO summary extraction */}
                <div className="border border-border p-4 bg-muted/10 rounded-xl space-y-2.5">
                  <p className="font-sans text-body-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="size-4 text-primary" />
                    Ekstraksi Objek Pengetahuan (KO)
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="bg-card px-2.5 py-1 rounded-md border border-border font-medium">
                      Concept: {stats.conceptsCount}
                    </span>
                    <span className="bg-card px-2.5 py-1 rounded-md border border-border font-medium">
                      Formula: {stats.formulasCount}
                    </span>
                    <span className="bg-card px-2.5 py-1 rounded-md border border-border font-medium">
                      Definition: {stats.definitionsCount}
                    </span>
                    <span className="bg-card px-2.5 py-1 rounded-md border border-border font-medium">
                      Misconception: {stats.misconceptionsCount}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-md gap-1.5 text-xs h-8 cursor-pointer"
                    onClick={() => setShowReport(true)}
                  >
                    <ExternalLink className="size-3" />
                    Lihat Laporan Ekstraksi
                  </Button>
                </div>
              </div>

              {/* Confidence & Coverage Section */}
              <div className="border border-border p-5 rounded-xl bg-card space-y-4">
                <p className="font-sans text-body-sm font-semibold text-foreground">
                  Tingkat Akurasi & Coverage Ekstraksi
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Progress Bars */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs font-medium mb-1">
                        <span>Akurasi Struktur Bab</span>
                        <span
                          className={
                            babAccuracy < 70
                              ? "text-status-error"
                              : babAccuracy < 90
                              ? "text-status-warning"
                              : "text-status-success"
                          }
                        >
                          {babAccuracy}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-md overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-md transition-all duration-500",
                            babAccuracy < 70
                              ? "bg-status-error"
                              : babAccuracy < 90
                              ? "bg-status-warning"
                              : "bg-status-success"
                          )}
                          style={{ width: `${babAccuracy}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-medium mb-1">
                        <span>Akurasi Rumus LaTeX</span>
                        <span
                          className={
                            latexAccuracy < 70
                              ? "text-status-error"
                              : latexAccuracy < 90
                              ? "text-status-warning"
                              : "text-status-success"
                          }
                        >
                          {latexAccuracy}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-md overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-md transition-all duration-500",
                            latexAccuracy < 70
                              ? "bg-status-error"
                              : latexAccuracy < 90
                              ? "bg-status-warning"
                              : "bg-status-success"
                          )}
                          style={{ width: `${latexAccuracy}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-medium mb-1">
                        <span>Akurasi Ekstraksi Glosarium</span>
                        <span
                          className={
                            glossaryAccuracy < 70
                              ? "text-status-error"
                              : glossaryAccuracy < 90
                              ? "text-status-warning"
                              : "text-status-success"
                          }
                        >
                          {glossaryAccuracy}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-md overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-md transition-all duration-500",
                            glossaryAccuracy < 70
                              ? "bg-status-error"
                              : glossaryAccuracy < 90
                              ? "bg-status-warning"
                              : "bg-status-success"
                          )}
                          style={{ width: `${glossaryAccuracy}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Coverage stats */}
                  <div className="flex items-center justify-around border-l border-border pl-6 flex-wrap gap-4 text-center">
                    <div>
                      <p
                        className={cn(
                          "text-h4 font-heading font-bold transition-colors duration-500",
                          parsedSuccessfully < 70
                            ? "text-status-error"
                            : parsedSuccessfully < 90
                            ? "text-status-warning"
                            : "text-status-success"
                        )}
                      >
                        {parsedSuccessfully}%
                      </p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        Parsed Successfully
                      </p>
                    </div>
                    <div>
                      <p
                        className={cn(
                          "text-h4 font-heading font-bold transition-colors duration-500",
                          unrecognized > 15
                            ? "text-status-error"
                            : unrecognized > 5
                            ? "text-status-warning"
                            : "text-status-success"
                        )}
                      >
                        {unrecognized}%
                      </p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        Unrecognized
                      </p>
                    </div>
                    <div>
                      <p className="text-h4 font-heading font-bold text-muted-foreground">
                        {ignored}%
                      </p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Ignored</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: REVIEW WARNINGS PANEL */}
              {warnings.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-sans text-body-sm font-semibold text-status-error flex items-center gap-1.5 animate-pulse">
                      <AlertTriangle className="size-4" />
                      Peringatan Analisis Dokumen ({warnings.length} Masalah)
                    </p>
                    {warnings.some(w => w.type === "glossary" && w.target) && (
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        className="rounded-md text-xs h-8 px-3 cursor-pointer bg-status-error/10 text-status-error border border-status-error/30 hover:bg-status-error/20 hover:text-status-error transition-colors"
                        onClick={fixAllGlossaryWarnings}
                      >
                        Tambahkan Semua ke Keywords
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-3">
                    {warnings.map((warn) => (
                      <div
                        key={warn.id}
                        className="bg-status-error/10 border border-status-error/20 rounded-lg p-4 flex items-start justify-between gap-4 text-status-error"
                      >
                        <div className="space-y-1">
                          <p className="font-semibold text-body-sm">{warn.title}</p>
                          <p className="text-xs text-status-error/80 leading-relaxed">{warn.desc}</p>
                        </div>
                        <div className="shrink-0 pt-0.5">
                          {warn.type === "glossary" && warn.target && (
                            <Button
                              size="sm"
                              type="button"
                              variant="destructive"
                              className="rounded-md text-xs h-8 px-3 cursor-pointer"
                              onClick={() => fixGlossaryWarning(warn.id, warn.target!)}
                            >
                              Tambahkan ke Keywords
                            </Button>
                          )}
                          {warn.type === "latex" && (
                            <Button
                              size="sm"
                              type="button"
                              variant="destructive"
                              className="rounded-md text-xs h-8 px-3 cursor-pointer"
                              onClick={() => fixLaTeXWarning(warn.id)}
                            >
                              Tutup Delimiter
                            </Button>
                          )}
                          {warn.type === "density" && (
                            <Button
                              size="sm"
                              type="button"
                              variant="destructive"
                              className="rounded-md text-xs h-8 px-3 cursor-pointer"
                              onClick={() => fixDensityWarning(warn.id)}
                            >
                              Tambah Subbab Utama
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION 4: MARKDOWN EDITOR + PREVIEW */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-sans text-body-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="size-4 text-primary" />
                    Penyunting & Pratinjau Materi Pelajaran
                  </p>
                  <span className="text-xs text-muted-foreground font-mono">
                    Simbol matematika didukung ($ untuk inline, $$ untuk blok)
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Markdown Editor */}
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Raw Markdown (Kanonik)
                    </label>
                    <textarea
                      className="w-full rounded-md border border-input bg-background p-3 text-body-sm font-mono leading-relaxed min-h-[360px] h-full focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50"
                      value={form.rawText}
                      onChange={(e) => setForm((f) => ({ ...f, rawText: e.target.value }))}
                    />
                  </div>

                  {/* HTML/KaTeX Preview */}
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Visual Live Preview
                    </label>
                    <div className="border border-border rounded-md p-4 bg-background overflow-y-auto min-h-[360px] max-h-[500px]">
                      {form.rawText ? (
                        <MarkdownRenderer content={form.rawText} />
                      ) : (
                        <p className="text-muted-foreground text-body-sm italic select-none">
                          Belum ada konten pratinjau.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 5: PUBLICATION PANEL & CHECKLIST */}
              <div className="border-t border-border pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Checklist metrics */}
                <div className="space-y-1.5">
                  <h4 className="text-body-sm font-semibold text-foreground">
                    Daftar Pemeriksaan Publikasi:
                  </h4>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-status-success" />
                      <span>Dokumen kanonik telah dianalisis.</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-status-success" />
                      <span>
                        Peringatan kritis LaTeX & Glosarium telah diselesaikan ({warnings.length}{" "}
                        tersisa).
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {pdfKey ? (
                        <Check className="size-3.5 text-status-success" />
                      ) : (
                        <Info className="size-3.5 text-muted-foreground" />
                      )}
                      <span>{pdfKey ? "PDF arsip terlampir." : "PDF arsip tidak dilampirkan (opsional)."}</span>
                    </div>
                  </div>
                </div>

                {/* Submitting Actions */}
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-lg font-semibold cursor-pointer"
                    disabled={submitting}
                    onClick={handleSaveDraft}
                  >
                    Simpan Draf
                  </Button>
                  <Button
                    type="button"
                    className="rounded-lg font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                    disabled={submitting || warnings.length > 0}
                    onClick={handlePublish}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Memproses...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-4" />
                        Publikasikan Materi
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={handleCancelWorkspace}
                    disabled={submitting}
                  >
                    Batal
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Listing Content (Visible only when not in ingestion workspace) */}
      {!showForm &&
        (activeDashboardTab === "learning" ? (
          displayedInstances.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-body-sm bg-card rounded-xl border border-border">
              Belum ada materi belajar. Klik &quot;Tambah Materi&quot; untuk mulai.
            </div>
          ) : (
            <div className="space-y-4">
              {displayedInstances.map((inst) => (
                <InstanceRow key={inst.id} instance={inst} courseMap={courseMap} />
              ))}
            </div>
          )
        ) : activeDashboardTab === "website" ? (
          displayedWebMaterials.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-body-sm bg-card rounded-xl border border-border">
              Belum ada materi website (kurikulum). Unggah bundle mata kuliah untuk mengisi.
            </div>
          ) : (
            <div className="space-y-4">
              {displayedWebMaterials.map((wm) => (
                <WebMaterialRow key={wm.id} webMaterial={wm} courseMap={courseMap} chapters={chapters} />
              ))}
            </div>
          )
        ) : displayedAssessments.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-body-sm bg-card rounded-xl border border-border">
            Belum ada dokumen asesmen. Klik &quot;Tambah Asesmen&quot; untuk mulai.
          </div>
        ) : (
          <div className="space-y-4">
            {displayedAssessments.map((ass) => (
              <AssessmentRow key={ass.id} assessment={ass} courseMap={courseMap} />
            ))}
          </div>
        ))}

      {/* DIALOG: VIEW EXTRACTION REPORT */}
      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="rounded-xl max-w-2xl max-h-[85vh] overflow-y-auto border border-border">
          <DialogHeader>
            <DialogTitle className="font-heading text-h6 font-semibold flex items-center gap-2">
              <Layers className="size-5 text-primary" />
              Laporan Ekstraksi Objek Pengetahuan (KO)
            </DialogTitle>
            <DialogDescription className="text-body-sm leading-relaxed mt-1">
              Visualisasi struktur dekomposisi teks materi pelajaran menjadi modul konsep pembelajaran
              Zyx Academy.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            <div className="border border-border rounded-lg overflow-hidden text-body-sm text-left">
              <div className="grid grid-cols-3 bg-muted px-4 py-2 font-semibold text-foreground border-b border-border">
                <div>Konsep / Title</div>
                <div>Kategori (Type)</div>
                <div>Taksonomi Bloom</div>
              </div>
              <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                {extractedKOs.length > 0 ? (
                  extractedKOs.map((ko, index) => (
                    <div
                      key={ko.id}
                      className={cn(
                        "grid grid-cols-3 px-4 py-2 text-body-sm",
                        index % 2 === 0 ? "bg-card" : "bg-muted/10"
                      )}
                    >
                      <div className="font-medium text-foreground">{ko.title}</div>
                      <div>{ko.type}</div>
                      <div className="font-mono text-xs">{ko.bloomLevel}</div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground space-y-2">
                    <p className="font-semibold text-body-sm">
                      Tidak ada kontainer KO kustom terdeteksi.
                    </p>
                    <p className="text-xs max-w-md mx-auto leading-relaxed">
                      Sistem akan mengekstrak objek secara otomatis saat materi diterbitkan. Anda juga
                      dapat menambahkannya secara manual di dalam dokumen menggunakan kontainer seperti:
                    </p>
                    <pre className="text-left bg-muted/50 p-3 rounded-md text-[10px] font-mono max-w-sm mx-auto overflow-x-auto border border-border/60">
                      {`:::concept {title="Konsep Limit"}\nDefinisi dan konten...\n:::\n\n:::formula {title="Rumus Limit"}\nLimit fungsi f(x)...\n:::`}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 bg-muted/20 border border-border rounded-lg text-xs leading-relaxed text-muted-foreground flex gap-2">
              <Info className="size-4 shrink-0 mt-0.5 text-primary" />
              <span>
                Sistem RAG memetakan objek di atas untuk merakit konten penjelasan kuis, kartu
                pengulangan jeda (flashcard), dan basis pengetahuan untuk Zyra. Kurasi di atas bersifat
                internal untuk menjaga keandalan pengajaran.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              className="rounded-lg cursor-pointer"
              onClick={() => setShowReport(false)}
            >
              Selesai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InstanceRow({
  instance,
  courseMap,
}: {
  instance: Instance;
  courseMap: Record<string, string>;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const keywords = Array.isArray(instance.keywords) ? (instance.keywords as string[]) : [];

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/material-instances?id=${instance.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Materi berhasil dihapus.");
        setIsDeleteDialogOpen(false);
        router.refresh();
      } else {
        const err = await res.json();
        toast.error("Gagal menghapus materi: " + (err.error ?? "Unknown error"));
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRetry() {
    setIsRetrying(true);
    try {
      const res = await fetch(`/api/admin/material-instances/${instance.id}/retry`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message ?? "Proses sinkronisasi ulang dimulai.");
        router.refresh();
      } else {
        const err = await res.json();
        toast.error("Gagal sinkronisasi ulang: " + (err.error ?? "Unknown error"));
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setIsRetrying(false);
    }
  }

  const isDraft = instance.title.startsWith("[DRAF]");
  const cleanTitle = instance.title.replace(/^\[DRAF\]\s*/, "");

  // Sync status color mapping
  const borderLeftColor = 
    instance.pineconeSyncStatus === "synced" 
      ? "border-l-status-success" 
      : instance.pineconeSyncStatus === "pending"
        ? "border-l-status-warning"
        : instance.pineconeSyncStatus === "failed"
          ? "border-l-status-error"
          : "border-l-muted-foreground";

  return (
    <div className={cn(
      "bg-card border border-border border-l-4 rounded-xl p-5 shadow-xs transition-all duration-200 text-left hover:shadow-sm relative overflow-hidden",
      borderLeftColor,
      expanded && "ring-1 ring-primary/20 shadow-sm"
    )}>
      <div className="flex items-start gap-4">
        <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
          <BookText className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {isDraft && (
              <span className="rounded bg-status-warning/15 text-status-warning border border-status-warning/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                Draf
              </span>
            )}
            <h3 className="font-heading font-semibold text-foreground text-body-md tracking-tight leading-snug">
              {cleanTitle}
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mb-3">
            <span className="font-medium text-foreground">
              {courseMap[instance.courseId] ?? instance.courseId}
            </span>
            <span>·</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono border border-border text-muted-foreground uppercase">
              {instance.sourceType}
            </span>

            {/* Ingest Sync Badge */}
            {instance.pineconeSyncStatus === "synced" && (
              <span className="rounded bg-status-success/15 text-status-success border border-status-success/20 px-1.5 py-0.5 text-[10px] font-medium flex items-center gap-1">
                <Check className="size-3" /> Tersinkronisasi
              </span>
            )}
            {instance.pineconeSyncStatus === "pending" && (
              <span className="rounded bg-status-warning/15 text-status-warning border border-status-warning/20 px-1.5 py-0.5 text-[10px] font-medium flex items-center gap-1 animate-pulse">
                <Loader2 className="size-3 animate-spin" /> Menyinkronkan...
              </span>
            )}
            {instance.pineconeSyncStatus === "failed" && (
              <span
                className="rounded bg-status-error/15 text-status-error border border-status-error/20 px-1.5 py-0.5 text-[10px] font-medium flex items-center gap-1 cursor-help"
                title={instance.lastSyncError ?? "Gagal menyinkronkan ke basis data"}
              >
                <AlertTriangle className="size-3" /> Gagal Sinkronisasi
              </span>
            )}
          </div>

          <p className="text-body-sm text-muted-foreground leading-relaxed line-clamp-2">{cleanSummary(instance.summary)}</p>
          
          {keywords.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-3 pt-3 border-t border-border/50">
              {keywords.slice(0, 8).map((k) => (
                <span
                  key={k}
                  className="rounded bg-muted/50 hover:bg-muted border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground font-semibold transition-colors"
                >
                  #{k}
                </span>
              ))}
              {keywords.length > 8 && (
                <span className="text-[10px] text-muted-foreground self-center ml-1 font-semibold">
                  +{keywords.length - 8} kata kunci
                </span>
              )}
            </div>
          )}

          {/* Action Buttons (Always visible) */}
          <div className="flex gap-2 flex-wrap pt-4">
            <Link href={`/admin/ai/materials/${instance.id}`}>
              <Button size="sm" variant="outline" className="rounded-lg gap-2 cursor-pointer bg-background hover:bg-muted font-medium">
                <Settings className="size-3.5" />
                Kelola Bab &amp; KO
              </Button>
            </Link>

            {instance.pineconeSyncStatus === "failed" && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg gap-2 bg-background hover:bg-muted font-medium"
                onClick={handleRetry}
                disabled={isRetrying}
              >
                <RefreshCw className={cn("size-3.5", isRetrying && "animate-spin")} />
                {isRetrying ? "Sinkron Ulang..." : "Sinkron Ulang"}
              </Button>
            )}

            <Button
              size="sm"
              variant="destructive"
              className="rounded-lg gap-2 font-medium cursor-pointer"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={isDeleting}
            >
              <Trash2 className="size-3.5" />
              Hapus Materi
            </Button>
          </div>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
          aria-label="Toggle details"
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-3.5 text-left bg-muted/10 -mx-5 -mb-5 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <span className="font-semibold text-foreground">ID Materi:</span>{" "}
              <span className="font-mono text-muted-foreground select-all">{instance.id}</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">Dibuat Pada:</span>{" "}
              <span className="text-muted-foreground">
                {new Date(instance.createdAt).toLocaleString("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
          </div>

          {instance.lastSyncError && (
            <div className="p-3 bg-status-error/5 border border-status-error/10 rounded-lg text-xs font-mono text-status-error space-y-1">
              <span className="font-bold block uppercase tracking-wider text-[10px]">Catatan Kesalahan (Error Log):</span>
              <p className="break-all">{instance.lastSyncError}</p>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Deletion Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="rounded-xl border border-border">
          <DialogHeader>
            <DialogTitle>Hapus Materi Pelajaran?</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus materi &quot;{cleanTitle}&quot;? Tindakan ini akan
              menghapus materi secara permanen dari basis data utama dan membersihkan seluruh
              representasi vektor terkait.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              className="rounded-lg"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Menghapus..." : "Hapus Permanen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssessmentRow({
  assessment,
  courseMap,
}: {
  assessment: AssessmentMTD;
  courseMap: Record<string, string>;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/material-instances?id=${assessment.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Dokumen asesmen berhasil dihapus.");
        setIsDeleteDialogOpen(false);
        router.refresh();
      } else {
        const err = await res.json();
        toast.error("Gagal menghapus: " + (err.error ?? "Unknown error"));
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className={cn(
      "bg-card border border-border border-l-4 border-l-brand-primary rounded-xl p-5 shadow-xs transition-all duration-200 text-left hover:shadow-sm relative overflow-hidden",
      expanded && "ring-1 ring-primary/20 shadow-sm"
    )}>
      <div className="flex items-start gap-4">
        <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
          <FileText className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-semibold text-foreground text-body-md tracking-tight leading-snug mb-1">
            {assessment.title}
          </h3>

          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {courseMap[assessment.courseId] ?? assessment.courseId}
            </span>
            <span>·</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono border border-border text-muted-foreground">
              v{assessment.version}
            </span>
            <span className="rounded bg-status-success/15 text-status-success border border-status-success/20 px-1.5 py-0.5 text-[10px] font-medium">
              Asesmen Canonical
            </span>
          </div>
          
          <p className="text-body-sm text-muted-foreground mt-2.5">
            Status:{" "}
            <span className="font-medium text-foreground bg-muted px-2 py-0.5 rounded border border-border/80 text-xs">
              {assessment.status}
            </span>
          </p>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
          aria-label="Toggle details"
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-3.5 text-left bg-muted/10 -mx-5 -mb-5 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <span className="font-semibold text-foreground">ID Asesmen:</span>{" "}
              <span className="font-mono text-muted-foreground select-all">{assessment.id}</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">Dibuat Pada:</span>{" "}
              <span className="text-muted-foreground">
                {new Date(assessment.createdAt).toLocaleString("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap pt-2">
            <Button
              size="sm"
              variant="destructive"
              className="rounded-lg gap-2 font-medium"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={isDeleting}
            >
              <Trash2 className="size-3.5" />
              Hapus Dokumen
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation Deletion Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="rounded-xl border border-border">
          <DialogHeader>
            <DialogTitle>Hapus Dokumen Asesmen?</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus dokumen asesmen &quot;{assessment.title}&quot;?
              Tindakan ini akan menghapus dokumen secara permanen dan menyinkronkan profil asesmen
              kursus terkait.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              className="rounded-lg"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Menghapus..." : "Hapus Permanen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WebMaterialRow({
  webMaterial,
  courseMap,
  chapters,
}: {
  webMaterial: WebMaterial;
  courseMap: Record<string, string>;
  chapters: Chapter[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const chapter = chapters.find((c) => c.id === webMaterial.chapterId);
  const courseTitle = courseMap[webMaterial.courseId] ?? webMaterial.courseId;

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/material-instances?id=${webMaterial.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Materi website berhasil dihapus.");
        setIsDeleteDialogOpen(false);
        router.refresh();
      } else {
        const err = await res.json();
        toast.error("Gagal menghapus materi website: " + (err.error ?? "Unknown error"));
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className={cn(
      "bg-card border border-border border-l-4 border-l-primary rounded-xl p-5 shadow-xs transition-all duration-200 text-left hover:shadow-sm relative overflow-hidden",
      expanded && "ring-1 ring-primary/20 shadow-sm"
    )}>
      <div className="flex items-start gap-4">
        <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
          <BookText className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-semibold text-foreground text-body-md tracking-tight leading-snug mb-1">
            {webMaterial.title}
          </h3>

          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mb-3">
            <span className="font-medium text-foreground">
              {courseTitle}
            </span>
            <span>·</span>
            <span className="text-muted-foreground">
              {chapter ? chapter.title : `Bab ID: ${webMaterial.chapterId}`}
            </span>
            <span>·</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono border border-border text-muted-foreground uppercase">
              {webMaterial.status}
            </span>
          </div>

          <div className="flex gap-2 flex-wrap pt-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg gap-2 cursor-pointer bg-background hover:bg-muted font-medium"
              onClick={() => setIsPreviewOpen(true)}
            >
              <FileText className="size-3.5" />
              Pratinjau Materi
            </Button>

            <Button
              size="sm"
              variant="destructive"
              className="rounded-lg gap-2 font-medium cursor-pointer"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={isDeleting}
            >
              <Trash2 className="size-3.5" />
              Hapus Materi
            </Button>
          </div>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
          aria-label="Toggle details"
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-3.5 text-left bg-muted/10 -mx-5 -mb-5 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <span className="font-semibold text-foreground">ID Materi:</span>{" "}
              <span className="font-mono text-muted-foreground select-all">{webMaterial.id}</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">Slug:</span>{" "}
              <span className="text-muted-foreground font-mono">{webMaterial.slug}</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">Dibuat Pada:</span>{" "}
              <span className="text-muted-foreground">
                {new Date(webMaterial.createdAt).toLocaleString("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="rounded-xl max-w-4xl max-h-[85vh] overflow-y-auto border border-border">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="font-heading text-h5 font-semibold flex items-center gap-2">
              <BookText className="size-6 text-primary" />
              {webMaterial.title}
            </DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground mt-1">
              Pratinjau konten dokumen kurikulum website untuk mata kuliah {courseTitle} ({chapter ? chapter.title : webMaterial.chapterId}).
            </DialogDescription>
          </DialogHeader>

          <div className="my-6 prose dark:prose-invert max-w-none text-left">
            <MarkdownRenderer content={webMaterial.canonicalMarkdown} />
          </div>

          <DialogFooter className="border-t border-border pt-4">
            <Button
              type="button"
              className="rounded-lg cursor-pointer"
              onClick={() => setIsPreviewOpen(false)}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Deletion Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="rounded-xl border border-border">
          <DialogHeader>
            <DialogTitle>Hapus Materi Website?</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus materi website &quot;{webMaterial.title}&quot;?
              Tindakan ini akan menghapus materi secara permanen dari basis data utama.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              className="rounded-lg"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Menghapus..." : "Hapus Permanen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
