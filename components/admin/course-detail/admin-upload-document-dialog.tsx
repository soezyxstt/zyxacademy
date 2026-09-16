"use client";

import { useState } from "react";
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
import {
  saveCourseMaterial,
  standardizeDocumentTitleAction,
} from "@/app/(admin)/admin/(academic)/courses/actions";
import { BatchUploadDialog } from "@/components/admin/course-detail/batch-upload-dialog";
import {
  LEVEL1_CATEGORIES,
  getSubcategoriesForLevel1,
  type MaterialLevel1Category,
  type CourseMaterialSubcategory,
} from "@/lib/course-materials";
import {
  detectMetadataFromFilename,
  generateFileName,
  standardizeDocumentTitle,
  formatBytes,
} from "@/lib/course-batch-upload";
import {
  FileText,
  Upload,
  Loader2,
  Sparkles,
  Layers,
  X,
  Check,
} from "lucide-react";

const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024;

type Chapter = {
  id: string;
  courseId?: string;
  title: string;
  orderIndex: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
  chapters: Chapter[];
};

export function AdminUploadDocumentDialog({
  open,
  onOpenChange,
  courseId,
  courseTitle,
  chapters,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MaterialLevel1Category>("materi");
  const [subcategory, setSubcategory] = useState<CourseMaterialSubcategory>("materi_dosen");
  const [year, setYear] = useState<string>("");
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isFormattingWithAi, setIsFormattingWithAi] = useState(false);

  const availableSubcategories = getSubcategoriesForLevel1(type);

  const resetForm = () => {
    setTitle("");
    setType("materi");
    setSubcategory("materi_dosen");
    setYear("");
    setSelectedChapters(new Set());
    setSelectedFile(null);
    setIsFormattingWithAi(false);
  };

  const handleFile = async (file: File | null) => {
    setSelectedFile(file);
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Hanya berkas PDF yang diperbolehkan.");
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      toast.error("Ukuran berkas PDF maksimal 50 MB.");
      setSelectedFile(null);
      return;
    }

    // 1. Auto-detect metadata cepat berbasis heuristik lokal
    const metadata = detectMetadataFromFilename(file.name, chapters);
    const standardTitle = standardizeDocumentTitle(metadata.title || file.name);
    setTitle(standardTitle);
    setType(metadata.category);
    if (metadata.subcategory) setSubcategory(metadata.subcategory);
    if (metadata.year) setYear(String(metadata.year));
    if (metadata.chapterIds.length > 0) {
      setSelectedChapters(new Set(metadata.chapterIds));
    }

    // 2. Refine dengan Gemini AI di background untuk menyelaraskan pergeseran bab (Bab 0 vs Bab 1)
    setIsFormattingWithAi(true);
    try {
      const result = await standardizeDocumentTitleAction({
        filename: file.name,
        courseId,
        chapters,
        currentValues: {
          title: standardTitle,
          category: metadata.category,
          subcategory: metadata.subcategory,
          year: metadata.year,
        },
      });

      if (result) {
        if (result.title) setTitle(result.title);
        if (result.category) setType(result.category);
        if (result.subcategory) setSubcategory(result.subcategory);
        if (result.year) setYear(String(result.year));
        if (result.chapterIds && result.chapterIds.length > 0) {
          setSelectedChapters(new Set(result.chapterIds));
        }
      }
    } catch (err) {
      console.warn("AI background format fallback to heuristic:", err);
    } finally {
      setIsFormattingWithAi(false);
    }
  };

  const handleFormatTitle = async () => {
    const targetName = selectedFile ? selectedFile.name : title.trim();
    if (!targetName) return;

    setIsFormattingWithAi(true);
    try {
      const result = await standardizeDocumentTitleAction({
        filename: targetName,
        courseId,
        chapters,
        currentValues: {
          title: title.trim(),
          category: type,
          subcategory,
          year: year ? parseInt(year, 10) : null,
        },
      });

      if (result) {
        if (result.title) setTitle(result.title);
        if (result.category) setType(result.category);
        if (result.subcategory) setSubcategory(result.subcategory);
        if (result.year) setYear(String(result.year));
        if (result.chapterIds && result.chapterIds.length > 0) {
          setSelectedChapters(new Set(result.chapterIds));
        }
        toast.success("Format judul dan bab berhasil dirapikan dengan AI.");
      }
    } catch (err) {
      console.error("AI format failed, fallback to local:", err);
      setTitle(standardizeDocumentTitle(title));
      toast.error("Gagal menggunakan AI, menggunakan format kapitalisasi standar.");
    } finally {
      setIsFormattingWithAi(false);
    }
  };

  const toggleChapter = (chapterId: string) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const handleSelectAllChapters = () => {
    if (selectedChapters.size === chapters.length) {
      setSelectedChapters(new Set());
    } else {
      setSelectedChapters(new Set(chapters.map((c) => c.id)));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = standardizeDocumentTitle(title.trim());

    if (!cleanTitle) {
      toast.error("Judul dokumen wajib diisi.");
      return;
    }
    if (selectedChapters.size === 0) {
      toast.error("Pilih minimal satu bab terkait.");
      return;
    }
    if (!selectedFile) {
      toast.error("Silakan pilih berkas PDF yang akan diunggah.");
      return;
    }

    const parsedYear = year.trim() ? parseInt(year.trim(), 10) : null;
    if (year.trim() && (isNaN(parsedYear!) || parsedYear! < 1900 || parsedYear! > 2100)) {
      toast.error("Format tahun tidak valid (contoh: 2024).");
      return;
    }

    setLoading(true);
    try {
      const primaryChap =
        selectedChapters.size === 1
          ? chapters.find((c) => selectedChapters.has(c.id))
          : null;

      const standardFilename = generateFileName({
        courseCode: courseId,
        category: type,
        subcategory,
        chapterIndex: primaryChap?.orderIndex ?? null,
        year: isNaN(parsedYear!) ? null : parsedYear,
        title: cleanTitle,
      });

      const uploadForm = new FormData();
      uploadForm.append("file", selectedFile);
      uploadForm.append("courseId", courseId);
      uploadForm.append("filename", standardFilename);

      const uploadResponse = await fetch("/api/admin/upload-pdf", {
        method: "POST",
        body: uploadForm,
      });
      const uploadData = await uploadResponse.json().catch(() => null);

      if (!uploadResponse.ok || typeof uploadData?.key !== "string") {
        toast.error(uploadData?.error || "Gagal mengunggah berkas PDF.");
        return;
      }

      const res = await saveCourseMaterial(
        courseId,
        cleanTitle,
        type,
        Array.from(selectedChapters),
        uploadData.key,
        subcategory,
        parsedYear
      );

      if (res.success) {
        toast.success("Dokumen PDF berhasil diunggah.");
        resetForm();
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menyimpan data materi.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan saat mengunggah berkas.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6 font-sans">
          <DialogHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <DialogTitle className="font-heading text-h5 font-bold text-foreground">
                Unggah Dokumen PDF
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
                Unggah Batch
              </Button>
            </div>
            <DialogDescription className="text-body-sm text-muted-foreground">
              Tambahkan materi belajar, soal, atau pembahasan soal untuk {courseTitle}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpload} className="space-y-4 pt-2">
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
                className={`flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80 hover:bg-muted/20"
                }`}
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
                  <Upload className="size-5" />
                </div>
                <div>
                  <p className="text-body-sm font-semibold text-foreground">
                    Pilih berkas PDF atau tarik ke sini
                  </p>
                  <p className="mt-0.5 text-body-xs text-muted-foreground">
                    Format .pdf maksimal 50 MB
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
              <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3.5 shadow-2xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-status-success/10 text-status-success">
                    <FileText className="size-5" />
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
                  className="size-8 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => setSelectedFile(null)}
                  disabled={loading}
                  title="Ganti berkas"
                >
                  <X className="size-4" />
                </Button>
              </div>
            )}

            {/* Judul Dokumen */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-body-sm font-semibold text-foreground">
                  Judul Tampilan
                </Label>
                {title.trim() || selectedFile ? (
                  <button
                    type="button"
                    onClick={handleFormatTitle}
                    disabled={isFormattingWithAi || loading}
                    className="inline-flex items-center gap-1 text-body-xs text-brand-primary hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Rapikan display name dan sinkronkan bab dengan Gemini AI"
                  >
                    {isFormattingWithAi ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Sparkles className="size-3" />
                    )}
                    <span>{isFormattingWithAi ? "Menganalisis..." : "Rapikan dengan AI"}</span>
                  </button>
                ) : null}
              </div>
              <Input
                placeholder="Contoh: Pertaksamaan dan Fungsi Pertemuan 1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
                className="h-9 text-body-sm rounded-lg"
              />
            </div>

            {/* Kategori, Sub-kategori, Tahun */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-body-sm font-semibold text-foreground">
                  Kategori
                </Label>
                <Select
                  value={type}
                  onValueChange={(v: MaterialLevel1Category) => {
                    setType(v);
                    const subcats = getSubcategoriesForLevel1(v);
                    if (subcats.length > 0 && !subcats.some((s) => s.value === subcategory)) {
                      setSubcategory(subcats[0].value);
                    }
                  }}
                  disabled={loading}
                >
                  <SelectTrigger className="h-9 text-body-sm rounded-lg">
                    <SelectValue placeholder="Pilih Kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL1_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-body-sm font-semibold text-foreground">
                  Sub-kategori
                </Label>
                <Select
                  value={subcategory}
                  onValueChange={(v: CourseMaterialSubcategory) => setSubcategory(v)}
                  disabled={loading}
                >
                  <SelectTrigger className="h-9 text-body-sm rounded-lg">
                    <SelectValue placeholder="Pilih Sub-kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSubcategories.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-body-sm font-semibold text-foreground">
                  Tahun <span className="font-normal text-muted-foreground text-body-xs">(opsional)</span>
                </Label>
                <Input
                  placeholder="2024"
                  type="number"
                  min={1900}
                  max={2100}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  disabled={loading}
                  className="h-9 text-body-sm rounded-lg"
                />
              </div>
            </div>

            {/* Chapter Selection */}
            <div className="space-y-2 rounded-xl border border-border/80 bg-muted/15 p-3">
              <div className="flex items-center justify-between">
                <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Kaitkan dengan Bab ({selectedChapters.size} dipilih)
                </span>
                {chapters.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllChapters}
                    className="text-body-xs text-brand-primary font-medium hover:underline cursor-pointer"
                  >
                    {selectedChapters.size === chapters.length ? "Batalkan Semua" : "Pilih Semua Bab"}
                  </button>
                )}
              </div>

              {chapters.length === 0 ? (
                <p className="text-body-xs text-status-warning py-1">
                  Mata kuliah ini belum memiliki bab. Silakan tambahkan bab di menu Bab.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
                  {chapters.map((ch) => {
                    const isChecked = selectedChapters.has(ch.id);
                    return (
                      <label
                        key={ch.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-body-xs cursor-pointer select-none transition-colors ${
                          isChecked
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border/60 hover:bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleChapter(ch.id)}
                          disabled={loading}
                          className="rounded border-border"
                        />
                        <span className="truncate">
                          Bab {ch.orderIndex}: {ch.title}
                        </span>
                      </label>
                    );
                  })}
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
                Batal
              </Button>
              <Button
                type="submit"
                disabled={loading || !title.trim() || selectedChapters.size === 0 || !selectedFile}
                className="gap-1.5 text-body-sm font-semibold rounded-lg"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Unggah Dokumen
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
