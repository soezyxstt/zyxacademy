"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useTranslations } from "@/lib/i18n/client";
import { saveCourseMaterial } from "@/app/(admin)/admin/(academic)/courses/actions";
import { BatchUploadDialog } from "@/components/admin/course-detail/batch-upload-dialog";
import { uploadAdminPdfFile } from "@/lib/storage/admin-upload-client";
import {
  type MaterialLevel1Category,
  type CourseMaterialSubcategory,
  type MaterialRoleQualifier,
} from "@/lib/course-materials";
import {
  detectMetadataFromFilename,
  buildCanonicalDocumentTitle,
  generateFileName,
  formatBytes,
} from "@/lib/course-batch-upload";
import {
  FileText,
  Upload,
  Loader2,
  Layers,
  X,
  AlertCircle,
  Check,
} from "lucide-react";

const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024;

type Chapter = {
  id: string;
  courseId?: string;
  title: string;
  orderIndex: number;
};

type IntentType = "materi" | "scl" | "ujian" | "latihan" | "ebook";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
  chapters: Chapter[];
  existingTitles?: string[];
};

export function AdminUploadDocumentDialog({
  open,
  onOpenChange,
  courseId,
  courseTitle,
  chapters,
  existingTitles = [],
}: Props) {
  const router = useRouter();
  const t = useTranslations("adminAcademic");
  const [loading, setLoading] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);

  // Intent and Role State
  const [intent, setIntent] = useState<IntentType>("materi");
  const [type, setType] = useState<MaterialLevel1Category>("materi");
  const [subcategory, setSubcategory] = useState<CourseMaterialSubcategory>("materi_dosen");
  const [docRole, setDocRole] = useState<"soal" | "pembahasan">("soal");

  // Specific Modifiers
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [qualifier, setQualifier] = useState<MaterialRoleQualifier>("utama");
  const [partNumber, setPartNumber] = useState<string>("1");
  const [year, setYear] = useState<string>("");
  const [session, setSession] = useState<string>("");
  const [customTopic, setCustomTopic] = useState<string>("");

  // Title Override
  const [isManualTitle, setIsManualTitle] = useState(false);
  const [manualTitle, setManualTitle] = useState("");

  // File
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const sortedChapters = useMemo(() => {
    return [...chapters].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [chapters]);

  // Set default single chapter if available
  useEffect(() => {
    if (!selectedChapterId && sortedChapters.length > 0) {
      setSelectedChapterId(sortedChapters[0].id);
    }
  }, [sortedChapters, selectedChapterId]);

  const resetForm = () => {
    setIntent("materi");
    setType("materi");
    setSubcategory("materi_dosen");
    setDocRole("soal");
    setSelectedChapterId(sortedChapters[0]?.id ?? "");
    setSelectedChapters(new Set());
    setQualifier("utama");
    setPartNumber("1");
    setYear("");
    setSession("");
    setCustomTopic("");
    setIsManualTitle(false);
    setManualTitle("");
    setSelectedFile(null);
  };

  // Sync category and subcategory when intent / docRole changes
  const handleIntentChange = (newIntent: IntentType) => {
    setIntent(newIntent);
    setIsManualTitle(false);
    if (newIntent === "materi") {
      setType("materi");
      setSubcategory("materi_dosen");
      if (selectedChapterId) {
        setSelectedChapters(new Set([selectedChapterId]));
      }
    } else if (newIntent === "scl") {
      setType("materi");
      setSubcategory("scl");
      if (selectedChapterId) {
        setSelectedChapters(new Set([selectedChapterId]));
      }
    } else if (newIntent === "ujian") {
      setType(docRole === "pembahasan" ? "pembahasan_soal" : "soal");
      setSubcategory("uts");
      // Default to UTS chapters if none selected
      const half = Math.ceil(sortedChapters.length / 2);
      setSelectedChapters(new Set(sortedChapters.slice(0, half).map((c) => c.id)));
    } else if (newIntent === "latihan") {
      setType(docRole === "pembahasan" ? "pembahasan_soal" : "soal");
      setSubcategory("kuis");
    } else if (newIntent === "ebook") {
      setType("materi");
      setSubcategory("ebook");
      setSelectedChapters(new Set(sortedChapters.map((c) => c.id)));
    }
  };

  const handleDocRoleChange = (newRole: "soal" | "pembahasan") => {
    setDocRole(newRole);
    setType(newRole === "pembahasan" ? "pembahasan_soal" : "soal");
  };

  const handleFile = (file: File | null) => {
    setSelectedFile(file);
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error(t("documents.upload.pdfOnly"));
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      toast.error(t("documents.upload.maxSize"));
      setSelectedFile(null);
      return;
    }

    // Heuristic detection from filename
    const meta = detectMetadataFromFilename(file.name, sortedChapters);

    // 1. Detect Intent & Subcategory
    if (meta.category === "materi") {
      if (meta.subcategory === "scl") {
        setIntent("scl");
        setType("materi");
        setSubcategory("scl");
      } else if (meta.subcategory === "ebook") {
        setIntent("ebook");
        setType("materi");
        setSubcategory("ebook");
      } else {
        setIntent("materi");
        setType("materi");
        setSubcategory("materi_dosen");
      }
    } else {
      const isPembahasan = meta.category === "pembahasan_soal";
      setDocRole(isPembahasan ? "pembahasan" : "soal");
      setType(meta.category);

      if (meta.subcategory === "uts" || meta.subcategory === "uas" || meta.subcategory === "up") {
        setIntent("ujian");
        setSubcategory(meta.subcategory);
      } else {
        setIntent("latihan");
        setSubcategory(meta.subcategory || "kuis");
      }
    }

    // 2. Modifiers
    if (meta.year) setYear(String(meta.year));
    if (meta.session) setSession(meta.session);
    if (meta.partNumber) {
      setPartNumber(String(meta.partNumber));
      setQualifier("bagian");
    } else if (meta.roleQualifier) {
      setQualifier(meta.roleQualifier);
    } else {
      setQualifier("utama");
    }

    if (meta.customTopic) setCustomTopic(meta.customTopic);

    // 3. Chapters
    if (meta.chapterIds.length > 0) {
      setSelectedChapters(new Set(meta.chapterIds));
      if (meta.chapterIds.length === 1) {
        setSelectedChapterId(meta.chapterIds[0]);
      }
    }
  };

  const primaryChapter = useMemo(() => {
    if (intent === "materi" || intent === "scl") {
      return sortedChapters.find((c) => c.id === selectedChapterId) ?? null;
    }
    if (selectedChapters.size === 1) {
      const id = Array.from(selectedChapters)[0];
      return sortedChapters.find((c) => c.id === id) ?? null;
    }
    return null;
  }, [intent, selectedChapterId, selectedChapters, sortedChapters]);

  const autoCanonicalTitle = useMemo(() => {
    const parsedYear = year.trim() ? parseInt(year.trim(), 10) : null;
    const parsedPart = partNumber.trim() ? parseInt(partNumber.trim(), 10) : null;

    return buildCanonicalDocumentTitle({
      category: type,
      subcategory,
      chapter: primaryChapter ? { orderIndex: primaryChapter.orderIndex, title: primaryChapter.title } : null,
      chapterOrderIndex: primaryChapter?.orderIndex ?? null,
      chapterTitle: primaryChapter?.title ?? null,
      year: isNaN(parsedYear!) ? null : parsedYear,
      session: session.trim() || null,
      roleQualifier: intent === "materi" ? qualifier : (intent === "scl" ? "kustom" : null),
      partNumber: isNaN(parsedPart!) ? null : parsedPart,
      customTopic: customTopic.trim() || null,
      rawFilename: selectedFile?.name ?? null,
    });
  }, [
    type,
    subcategory,
    primaryChapter,
    year,
    session,
    intent,
    qualifier,
    partNumber,
    customTopic,
    selectedFile?.name,
  ]);

  const effectiveTitle = isManualTitle ? manualTitle.trim() : autoCanonicalTitle;

  const existingTitleSet = useMemo(() => {
    return new Set(existingTitles.map((t) => t.toLowerCase().trim()));
  }, [existingTitles]);

  const isDuplicate = effectiveTitle ? existingTitleSet.has(effectiveTitle.toLowerCase()) : false;

  const toggleChapter = (chapterId: string) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const selectUtsChapters = () => {
    const half = Math.ceil(sortedChapters.length / 2);
    setSelectedChapters(new Set(sortedChapters.slice(0, half).map((c) => c.id)));
  };

  const selectUasChapters = () => {
    const half = Math.ceil(sortedChapters.length / 2);
    setSelectedChapters(new Set(sortedChapters.slice(half).map((c) => c.id)));
  };

  const selectAllChapters = () => {
    setSelectedChapters(new Set(sortedChapters.map((c) => c.id)));
  };

  const clearChapters = () => {
    setSelectedChapters(new Set());
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
      toast.error(t("documents.upload.selectFile"));
      return;
    }

    if (!effectiveTitle) {
      toast.error(t("documents.upload.titleRequired"));
      return;
    }

    // Chapter validation
    let targetChapterIds: string[] = [];
    if (intent === "materi" || intent === "scl") {
      if (!selectedChapterId) {
        toast.error(t("documents.upload.selectChapter"));
        return;
      }
      targetChapterIds = [selectedChapterId];
    } else {
      targetChapterIds = Array.from(selectedChapters);
      if (targetChapterIds.length === 0) {
        toast.error(t("documents.upload.selectChapters"));
        return;
      }
    }

    const parsedYear = year.trim() ? parseInt(year.trim(), 10) : null;
    if (intent === "ujian" && !parsedYear) {
      toast.error(t("documents.upload.yearRequired"));
      return;
    }

    setLoading(true);
    try {
      const cleanTopicForFilename = effectiveTitle.replace(/^Bab\s*\d+\s*[:\.-]?\s*/i, "");

      const standardFilename = generateFileName({
        courseCode: courseId,
        category: type,
        subcategory,
        chapterIndex: primaryChapter?.orderIndex ?? null,
        year: isNaN(parsedYear!) ? null : parsedYear,
        title: cleanTopicForFilename,
      });

      const uploadData = await uploadAdminPdfFile(selectedFile, {
        courseId,
        filename: standardFilename,
      });

      const res = await saveCourseMaterial(
        courseId,
        effectiveTitle,
        type,
        targetChapterIds,
        uploadData.key,
        subcategory,
        parsedYear
      );

      if (res.success) {
        toast.success(t("documents.upload.saved"));
        resetForm();
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(t("documents.upload.saveError"));
      }
    } catch (err) {
      console.error(err);
      toast.error(t("documents.upload.uploadError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-5 font-sans">
          <DialogHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <DialogTitle className="font-heading text-h5 text-foreground">
                {t("documents.upload.title")}
              </DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-body-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onOpenChange(false);
                  setBatchOpen(true);
                }}
              >
                <Layers className="size-3.5" />
                {t("documents.upload.batch")}
              </Button>
            </div>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {t("documents.upload.description", { course: courseTitle })}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpload} className="space-y-3.5 pt-1">
            {/* File Dropzone */}
            {!selectedFile ? (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80 hover:bg-muted/20"
                }`}
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Upload className="size-4" />
                </div>
                <div>
                  <p className="text-body-sm font-semibold text-foreground">
                    {t("documents.upload.dropzone")}
                  </p>
                  <p className="text-body-xs text-muted-foreground">
                    {t("documents.upload.formatLimit")}
                  </p>
                </div>
                <input
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                  disabled={loading}
                />
              </label>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3 shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-status-success/10 text-status-success">
                    <FileText className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-semibold text-foreground" title={selectedFile.name}>
                      {selectedFile.name}
                    </p>
                    <p className="text-body-xs text-muted-foreground">
                      {formatBytes(selectedFile.size)}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => setSelectedFile(null)}
                  disabled={loading}
                  title={t("documents.upload.replaceFile")}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            )}

            {/* Intent Selector */}
            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold text-foreground">
                {t("documents.upload.documentType")}
              </Label>
              <div className="grid grid-cols-5 gap-1.5 rounded-lg border border-border/70 bg-muted/20 p-1">
                {(
                  [
                    { id: "materi", label: t("documents.upload.types.material") },
                    { id: "scl", label: t("documents.upload.types.scl") },
                    { id: "ujian", label: t("documents.upload.types.exam") },
                    { id: "latihan", label: t("documents.upload.types.practice") },
                    { id: "ebook", label: t("documents.upload.types.ebook") },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleIntentChange(tab.id)}
                    className={`rounded-md py-1.5 text-center text-body-sm transition-colors ${
                      intent === tab.id
                        ? "bg-card text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Controls Per Intent */}
            {intent === "materi" && (
              <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      {t("documents.upload.selectChapterLabel")}
                    </Label>
                    <Select
                      value={selectedChapterId}
                      onValueChange={(val) => {
                        setSelectedChapterId(val);
                        setSelectedChapters(new Set([val]));
                      }}
                      disabled={loading}
                    >
                      <SelectTrigger className="h-9 text-body-sm rounded-lg">
                        <SelectValue placeholder={t("documents.upload.selectChapterLabel")} />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedChapters.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>
                            {t("documents.upload.chapterWithNumber", { number: ch.orderIndex })}: {ch.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      {t("documents.upload.materialQualifier")}
                    </Label>
                    <Select
                      value={qualifier}
                      onValueChange={(val) => setQualifier(val as MaterialRoleQualifier)}
                      disabled={loading}
                    >
                      <SelectTrigger className="h-9 text-body-sm rounded-lg">
                        <SelectValue placeholder={t("documents.upload.selectQualifier")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="utama">{t("documents.upload.qualifiers.mainTheory")}</SelectItem>
                        <SelectItem value="bagian">{t("documents.upload.qualifiers.multiPart")}</SelectItem>
                        <SelectItem value="aplikasi">{t("documents.upload.qualifiers.application")}</SelectItem>
                        <SelectItem value="problem">{t("documents.upload.qualifiers.problem")}</SelectItem>
                        <SelectItem value="kustom">{t("documents.upload.qualifiers.custom")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {qualifier === "bagian" && (
                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      {t("documents.upload.partNumber")}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={partNumber}
                      onChange={(e) => setPartNumber(e.target.value)}
                      placeholder="1"
                      className="h-8 text-body-sm rounded-lg w-28"
                    />
                  </div>
                )}

                {(qualifier === "aplikasi" || qualifier === "problem" || qualifier === "kustom") && (
                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      {t("documents.upload.extraTopic")} <span className="font-normal text-muted-foreground text-body-xs">({t("documents.upload.optional")})</span>
                    </Label>
                    <Input
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      placeholder={t("documents.upload.exampleSpringModel")}
                      className="h-8 text-body-sm rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}

            {intent === "scl" && (
              <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      Pilih Bab
                    </Label>
                    <Select
                      value={selectedChapterId}
                      onValueChange={(val) => {
                        setSelectedChapterId(val);
                        setSelectedChapters(new Set([val]));
                      }}
                      disabled={loading}
                    >
                      <SelectTrigger className="h-9 text-body-sm rounded-lg">
                        <SelectValue placeholder={t("documents.upload.selectChapterLabel")} />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedChapters.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>
                            Bab {ch.orderIndex}: {ch.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      {t("documents.upload.sclTitle")}
                    </Label>
                    <Input
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      placeholder={t("documents.upload.exampleModule")}
                      className="h-9 text-body-sm rounded-lg"
                    />
                  </div>
                </div>
              </div>
            )}

            {intent === "ujian" && (
              <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      {t("documents.upload.exam")}
                    </Label>
                    <Select
                      value={subcategory}
                      onValueChange={(val) => setSubcategory(val as CourseMaterialSubcategory)}
                      disabled={loading}
                    >
                      <SelectTrigger className="h-9 text-body-sm rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uts">{t("documents.upload.uts")}</SelectItem>
                        <SelectItem value="uas">{t("documents.upload.uas")}</SelectItem>
                        <SelectItem value="up">UP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      {t("documents.upload.type")}
                    </Label>
                    <Select
                      value={docRole}
                      onValueChange={(val) => handleDocRoleChange(val as "soal" | "pembahasan")}
                      disabled={loading}
                    >
                      <SelectTrigger className="h-9 text-body-sm rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="soal">{t("documents.upload.question")}</SelectItem>
                        <SelectItem value="pembahasan">{t("documents.upload.solution")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      {t("documents.upload.year")}
                    </Label>
                    <Input
                      type="number"
                      min={1990}
                      max={2040}
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      placeholder="2024"
                      className="h-9 text-body-sm rounded-lg"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      {t("documents.upload.session")} <span className="font-normal text-muted-foreground text-body-xs">({t("documents.upload.optional")})</span>
                    </Label>
                    <Input
                      value={session}
                      onChange={(e) => setSession(e.target.value)}
                      placeholder={t("documents.upload.sessionExample")}
                      className="h-9 text-body-sm rounded-lg"
                    />
                  </div>
                </div>

                {/* Chapter Presets for Exam */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t("documents.upload.chapterCoverage", { count: selectedChapters.size })}
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-body-xs text-brand-primary"
                        onClick={selectUtsChapters}
                      >
                        {t("documents.upload.utsSet")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-body-xs text-brand-primary"
                        onClick={selectUasChapters}
                      >
                        {t("documents.upload.uasSet")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-body-xs text-brand-primary"
                        onClick={selectAllChapters}
                      >
                        {t("documents.upload.all")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-body-xs text-muted-foreground"
                        onClick={clearChapters}
                      >
                        {t("documents.upload.clear")}
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-32 overflow-y-auto pr-1">
                    {sortedChapters.map((ch) => {
                      const isChecked = selectedChapters.has(ch.id);
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => toggleChapter(ch.id)}
                          className={`flex items-center gap-1.5 p-1.5 rounded-md border text-left text-body-xs transition-colors ${
                            isChecked
                              ? "border-primary bg-primary/10 text-foreground font-medium"
                              : "border-border/60 hover:bg-muted/30 text-muted-foreground"
                          }`}
                        >
                          <span className={`size-3.5 rounded flex items-center justify-center border text-[9px] ${
                            isChecked ? "bg-primary border-primary text-primary-foreground" : "border-border"
                          }`}>
                            {isChecked && <Check className="size-2.5" />}
                          </span>
                          <span className="truncate">{t("documents.upload.chapterWithNumber", { number: ch.orderIndex })}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {intent === "latihan" && (
              <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      {t("documents.upload.subtype")}
                    </Label>
                    <Select
                      value={subcategory}
                      onValueChange={(val) => setSubcategory(val as CourseMaterialSubcategory)}
                      disabled={loading}
                    >
                      <SelectTrigger className="h-9 text-body-sm rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kuis">{t("documents.upload.practiceTypes.quiz")}</SelectItem>
                        <SelectItem value="ltm">LTM</SelectItem>
                        <SelectItem value="kbf">KBF</SelectItem>
                        <SelectItem value="tutorial">{t("documents.upload.practiceTypes.tutorial")}</SelectItem>
                        <SelectItem value="modul">{t("documents.upload.practiceTypes.module")}</SelectItem>
                        <SelectItem value="lainnya">{t("documents.upload.practiceTypes.other")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      {t("documents.upload.type")}
                    </Label>
                    <Select
                      value={docRole}
                      onValueChange={(val) => handleDocRoleChange(val as "soal" | "pembahasan")}
                      disabled={loading}
                    >
                      <SelectTrigger className="h-9 text-body-sm rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="soal">{t("documents.upload.question")}</SelectItem>
                        <SelectItem value="pembahasan">{t("documents.upload.solution")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      {t("documents.upload.year")} <span className="font-normal text-muted-foreground text-body-xs">({t("documents.upload.optional")})</span>
                    </Label>
                    <Input
                      type="number"
                      min={1990}
                      max={2040}
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      placeholder="2024"
                      className="h-9 text-body-sm rounded-lg"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-body-sm font-semibold text-foreground">
                      {t("documents.upload.numberOrTopic")}
                    </Label>
                    <Input
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      placeholder="1"
                      className="h-9 text-body-sm rounded-lg"
                    />
                  </div>
                </div>

                {/* Chapter Selection */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t("documents.upload.linkChapters", { count: selectedChapters.size })}
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-body-xs text-brand-primary"
                        onClick={selectAllChapters}
                      >
                        {t("documents.upload.allChapters")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-body-xs text-muted-foreground"
                        onClick={clearChapters}
                      >
                        {t("documents.upload.clear")}
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-32 overflow-y-auto pr-1">
                    {sortedChapters.map((ch) => {
                      const isChecked = selectedChapters.has(ch.id);
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => toggleChapter(ch.id)}
                          className={`flex items-center gap-1.5 p-1.5 rounded-md border text-left text-body-xs transition-colors ${
                            isChecked
                              ? "border-primary bg-primary/10 text-foreground font-medium"
                              : "border-border/60 hover:bg-muted/30 text-muted-foreground"
                          }`}
                        >
                          <span className={`size-3.5 rounded flex items-center justify-center border text-[9px] ${
                            isChecked ? "bg-primary border-primary text-primary-foreground" : "border-border"
                          }`}>
                            {isChecked && <Check className="size-2.5" />}
                          </span>
                          <span className="truncate">{t("documents.upload.chapterWithNumber", { number: ch.orderIndex })}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {intent === "ebook" && (
              <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
                <div className="space-y-1">
                  <Label className="text-body-sm font-semibold text-foreground">
                    {t("documents.upload.bookTitleOrAuthor")}
                  </Label>
                  <Input
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    placeholder={t("documents.upload.exampleBook")}
                    className="h-9 text-body-sm rounded-lg"
                  />
                </div>
              </div>
            )}

            {/* Live Canonical Title Preview Box */}
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/25 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("documents.upload.canonicalTitle")}
                </Label>
                <button
                  type="button"
                  onClick={() => {
                    if (!isManualTitle) {
                      setManualTitle(autoCanonicalTitle);
                    }
                    setIsManualTitle(!isManualTitle);
                  }}
                  className="text-body-xs text-brand-primary hover:underline cursor-pointer"
                >
                  {isManualTitle ? t("documents.upload.useAutomaticTitle") : t("documents.upload.editTitleManually")}
                </button>
              </div>

              {isManualTitle ? (
                <Input
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder={t("documents.upload.enterTitle")}
                  className="h-8 text-body-sm rounded-lg"
                />
              ) : (
                <p className="text-body-sm font-semibold text-foreground break-words min-h-[1.5rem]">
                  {autoCanonicalTitle || "-"}
                </p>
              )}

              {/* Duplicate collision alert */}
              {isDuplicate && (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-body-xs text-amber-700 dark:text-amber-400">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{t("documents.upload.duplicateTitle")}</span>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
                className="text-body-sm rounded-lg"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={loading || !effectiveTitle || !selectedFile}
                className="gap-1.5 text-body-sm font-semibold rounded-lg"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {t("documents.upload.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BatchUploadDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        courseId={courseId}
        courseTitle={courseTitle}
        chapters={chapters}
      />
    </>
  );
}
