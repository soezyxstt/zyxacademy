"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveCourseMaterial,
  deleteCourseMaterial,
} from "@/app/(admin)/admin/(academic)/courses/actions";
import { BatchUploadDialog } from "@/components/admin/course-detail/batch-upload-dialog";
import { uploadAdminPdfFile } from "@/lib/storage/admin-upload-client";
import {
  AlertCircle,
  FileText,
  Upload,
  SendHorizontal,
  Trash2,
  ExternalLink,
  Loader2,
  Layers,
  RotateCcw,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FormattedDate } from "@/components/ui/formatted-date";
import {
  LEVEL1_CATEGORIES,
  getSubcategoriesForLevel1,
  LEVEL1_LABELS,
  getSubcategoryLabel,
  type MaterialLevel1Category,
  type CourseMaterialSubcategory,
} from "@/lib/course-materials";
import {
  detectMetadataFromFilename,
  generateFileName,
} from "@/lib/course-batch-upload";

const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024;

type Chapter = {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
};

type UploadedMaterial = {
  id: string;
  courseId: string;
  title: string;
  type: string;
  subcategory?: string | null;
  year?: number | null;
  fileUrl: string;
  chapterIds: any;
  createdAt: Date;
};

type Props = {
  courseId: string;
  courseTitle: string;
  chapters: Chapter[];
  initialMaterials: UploadedMaterial[];
  showList?: boolean;
};

export function MaterialsTab({
  courseId,
  courseTitle,
  chapters,
  initialMaterials,
  showList = true,
}: Props) {
  const router = useRouter();
  const [materials] = useState<UploadedMaterial[]>(initialMaterials);
  const [loading, setLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MaterialLevel1Category>("materi");
  const [subcategory, setSubcategory] = useState<CourseMaterialSubcategory>("materi_dosen");
  const [year, setYear] = useState<string>("");
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customFilename, setCustomFilename] = useState<string>("");
  const [isCustomFilenameEdited, setIsCustomFilenameEdited] = useState(false);

  const availableSubcategories = getSubcategoriesForLevel1(type);

  const computeStandardFilename = (
    currentTitle = title,
    currentType = type,
    currentSub = subcategory,
    currentYear = year,
    currentChapters = selectedChapters,
    file = selectedFile
  ) => {
    if (!file) return "";
    const primaryChap = currentChapters.size === 1
      ? chapters.find((c) => currentChapters.has(c.id))
      : null;
    const parsedYear = currentYear.trim() ? parseInt(currentYear.trim(), 10) : null;
    return generateFileName({
      courseCode: courseId,
      category: currentType,
      subcategory: currentSub,
      chapterIndex: primaryChap?.orderIndex ?? null,
      year: isNaN(parsedYear!) ? null : parsedYear,
      title: currentTitle.trim() || file.name,
    });
  };

  const handleTypeChange = (newType: MaterialLevel1Category) => {
    setType(newType);
    const subcats = getSubcategoriesForLevel1(newType);
    let nextSub = subcategory;
    if (subcats.length > 0 && !subcats.some((s) => s.value === subcategory)) {
      nextSub = subcats[0].value;
      setSubcategory(nextSub);
    }
    if (!isCustomFilenameEdited && selectedFile) {
      setCustomFilename(computeStandardFilename(title, newType, nextSub, year, selectedChapters));
    }
  };

  const handleSubcategoryChange = (newSub: CourseMaterialSubcategory) => {
    setSubcategory(newSub);
    if (!isCustomFilenameEdited && selectedFile) {
      setCustomFilename(computeStandardFilename(title, type, newSub, year, selectedChapters));
    }
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (!isCustomFilenameEdited && selectedFile) {
      setCustomFilename(computeStandardFilename(newTitle, type, subcategory, year, selectedChapters));
    }
  };

  const handleYearChange = (newYear: string) => {
    setYear(newYear);
    if (!isCustomFilenameEdited && selectedFile) {
      setCustomFilename(computeStandardFilename(title, type, subcategory, newYear, selectedChapters));
    }
  };

  const toggleChapter = (chapterId: string) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      if (!isCustomFilenameEdited && selectedFile) {
        setCustomFilename(computeStandardFilename(title, type, subcategory, year, next));
      }
      return next;
    });
  };

  const handleSelectAllChapters = () => {
    let next: Set<string>;
    if (selectedChapters.size === chapters.length) {
      next = new Set();
    } else {
      next = new Set(chapters.map((c) => c.id));
    }
    setSelectedChapters(next);
    if (!isCustomFilenameEdited && selectedFile) {
      setCustomFilename(computeStandardFilename(title, type, subcategory, year, next));
    }
  };

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file);
    if (!file) {
      setCustomFilename("");
      setIsCustomFilenameEdited(false);
      return;
    }

    const metadata = detectMetadataFromFilename(file.name, chapters);
    const nextTitle = title.trim() ? title : metadata.title;
    const nextType = metadata.category;
    const nextSub = metadata.subcategory ?? subcategory;
    const nextYear = metadata.year ? String(metadata.year) : year;
    const nextChapters =
      metadata.chapterIds.length > 0 && selectedChapters.size === 0
        ? new Set(metadata.chapterIds)
        : selectedChapters;

    setTitle(nextTitle);
    setType(nextType);
    setSubcategory(nextSub);
    if (metadata.year && !year) {
      setYear(String(metadata.year));
    }
    if (metadata.chapterIds.length > 0 && selectedChapters.size === 0) {
      setSelectedChapters(nextChapters);
    }

    const generated = computeStandardFilename(
      nextTitle,
      nextType,
      nextSub,
      nextYear,
      nextChapters,
      file
    );
    setCustomFilename(generated);
    setIsCustomFilenameEdited(false);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Judul dokumen wajib diisi.");
      return;
    }
    if (selectedChapters.size === 0) {
      toast.error("Pilih minimal satu bab yang terkait dengan dokumen ini.");
      return;
    }
    if (!selectedFile) {
      toast.error("Silakan pilih berkas PDF yang akan diunggah.");
      return;
    }
    if (selectedFile.size > MAX_PDF_SIZE_BYTES) {
      toast.error("Ukuran berkas PDF maksimal 50 MB.");
      return;
    }

    const parsedYear = year.trim() ? parseInt(year.trim(), 10) : null;
    if (year.trim() && (isNaN(parsedYear!) || parsedYear! < 1900 || parsedYear! > 2100)) {
      toast.error("Format tahun tidak valid (contoh: 2024).");
      return;
    }

    setLoading(true);
    try {
      const uploadData = await uploadAdminPdfFile(selectedFile, {
        courseId,
        filename: customFilename.trim() || undefined,
      });

      const res = await saveCourseMaterial(
        courseId,
        title.trim(),
        type,
        Array.from(selectedChapters),
        uploadData.key,
        subcategory,
        parsedYear
      );

      if (res.success) {
        toast.success("Dokumen PDF berhasil diunggah.");
        setTitle("");
        setYear("");
        setSelectedChapters(new Set());
        setSelectedFile(null);
        setCustomFilename("");
        setIsCustomFilenameEdited(false);
        const fileInput = document.getElementById("course-pdf-input") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menyimpan data materi.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Terjadi kesalahan jaringan saat mengunggah.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus materi ini?")) return;
    setDeleteLoadingId(id);
    try {
      const res = await deleteCourseMaterial(id);
      if (res.success) {
        toast.success("Materi berhasil dihapus.");
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menghapus materi.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Gagal menghapus materi.");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const getChapterLabels = (chapterIds: any) => {
    const ids: string[] = Array.isArray(chapterIds)
      ? chapterIds
      : typeof chapterIds === "string"
      ? JSON.parse(chapterIds)
      : [];

    return ids
      .map((id) => {
        const chap = chapters.find((c) => c.id === id);
        return chap ? `Bab ${chap.orderIndex}: ${chap.title}` : "Bab tidak diketahui";
      })
      .join(", ");
  };

  return (
    <div className="space-y-4">
      {/* Direct PDF Upload Form */}
      <div id="legacy-pdf-management" className="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h3 className="font-heading text-body-sm font-semibold text-foreground flex items-center gap-2">
            <Upload className="size-4 text-brand-secondary" />
            Unggah PDF
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg text-body-sm"
            onClick={() => setBatchOpen(true)}
          >
            <Layers className="size-3.5" />
            Unggah Batch
          </Button>
        </div>

        <div className="mb-3 flex items-center gap-2 rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-body-xs text-foreground">
          <AlertCircle className="size-3.5 text-status-warning shrink-0" />
          <div className="min-w-0">
            <span className="font-semibold text-status-warning">Format Standar Zyx:</span>{" "}
            <code className="font-mono text-[11px] bg-background/80 px-1 py-0.5 rounded border border-status-warning/30 text-foreground">
              {courseId.toLowerCase()}_[bab]_[kategori]_[topik]_[role]_[tahun].pdf
            </code>
            <span className="text-muted-foreground ml-1">
              Nama berkas disusun otomatis.
            </span>
          </div>
        </div>

        <form onSubmit={handleUpload} className="space-y-3">
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="space-y-1.5 min-w-[140px] flex-1">
              <Label htmlFor="material-title" className="text-body-sm font-semibold text-foreground h-5 flex items-center">
                Judul Dokumen
              </Label>
              <Input
                id="material-title"
                placeholder="Contoh: Slide Perkuliahan Pertemuan 1"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                disabled={loading}
                className="h-9 text-body-sm rounded-lg"
              />
            </div>

            <div className="space-y-1.5 w-full sm:w-36 shrink-0">
              <Label htmlFor="material-category" className="text-body-sm font-semibold text-foreground h-5 flex items-center">
                Kategori
              </Label>
              <Select
                value={type}
                onValueChange={(v: MaterialLevel1Category) => handleTypeChange(v)}
                disabled={loading}
              >
                <SelectTrigger id="material-category" className="h-9 text-body-sm rounded-lg">
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

            <div className="space-y-1.5 w-full sm:w-40 shrink-0">
              <Label htmlFor="material-subcategory" className="text-body-sm font-semibold text-foreground h-5 flex items-center">
                Sub-kategori
              </Label>
              <Select
                value={subcategory}
                onValueChange={(v: CourseMaterialSubcategory) => handleSubcategoryChange(v)}
                disabled={loading}
              >
                <SelectTrigger id="material-subcategory" className="h-9 text-body-sm rounded-lg">
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

            <div className="space-y-1.5 w-full sm:w-32 shrink-0">
              <Label htmlFor="material-year" className="text-body-sm font-semibold text-foreground h-5 flex items-center gap-1 whitespace-nowrap">
                Tahun <span className="text-muted-foreground font-normal text-body-xs">(opsional)</span>
              </Label>
              <Input
                id="material-year"
                placeholder="2024"
                type="number"
                min={1900}
                max={2100}
                value={year}
                onChange={(e) => handleYearChange(e.target.value)}
                disabled={loading}
                className="h-9 text-body-sm rounded-lg"
              />
            </div>

            <div className="space-y-1.5 w-full sm:w-56 shrink-0">
              <Label htmlFor="course-pdf-input" className="text-body-sm font-semibold text-foreground h-5 flex items-center">
                Berkas PDF
              </Label>
              <Input
                id="course-pdf-input"
                type="file"
                accept="application/pdf"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                disabled={loading}
                className="cursor-pointer file:mr-2 file:rounded-md file:bg-muted file:border-0 file:px-2 file:py-0.5 file:text-body-xs file:font-semibold file:text-foreground h-9 rounded-lg text-body-xs flex items-center"
              />
            </div>

            <div className="shrink-0 self-end">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="submit"
                      size="icon"
                      disabled={loading || !title.trim() || selectedChapters.size === 0 || !selectedFile}
                      className="size-9 rounded-lg font-semibold shrink-0"
                      aria-label="Unggah Dokumen PDF"
                    >
                      {loading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <SendHorizontal className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Unggah Dokumen PDF
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Standardized Filename Review & Override */}
          {selectedFile && (
            <div className="border-t border-border pt-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="material-filename" className="text-body-sm font-semibold text-foreground">
                  Nama Berkas Terstandar (Disimpan ke Storage)
                </Label>
                {isCustomFilenameEdited && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomFilenameEdited(false);
                      setCustomFilename(computeStandardFilename());
                    }}
                    className="flex items-center gap-1 text-body-xs text-brand-primary hover:underline cursor-pointer"
                  >
                    <RotateCcw className="size-3" />
                    Reset ke Default
                  </button>
                )}
              </div>
              <Input
                id="material-filename"
                value={customFilename}
                onChange={(e) => {
                  setCustomFilename(e.target.value);
                  setIsCustomFilenameEdited(true);
                }}
                disabled={loading}
                className="h-8 font-mono text-body-sm rounded-lg bg-background"
                placeholder="nama_file_standar.pdf"
              />
              <p className="text-body-xs text-muted-foreground">
                Otomatis disusun mengikuti hierarki: kode MK, bab, kategori, deskripsi, role, dan tahun di akhir. Anda dapat mengedit nama ini sebelum mengunggah.
              </p>
            </div>
          )}

          {/* Chapter Selector */}
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-body-xs font-bold text-muted-foreground uppercase tracking-wider">
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
                Mata kuliah ini belum memiliki bab. Silakan tambahkan bab terlebih dahulu di tab <strong>Bab</strong>.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                {chapters.map((ch) => {
                  const isChecked = selectedChapters.has(ch.id);
                  return (
                    <label
                      key={ch.id}
                      className={`flex items-start gap-2 p-2 rounded-lg border text-body-sm cursor-pointer select-none transition-colors ${
                        isChecked
                          ? "border-brand-primary bg-brand-primary/10 text-foreground"
                          : "border-border/60 hover:bg-muted/20 text-muted-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleChapter(ch.id)}
                        disabled={loading}
                        className="mt-0.5 rounded border-border"
                      />
                      <span className="min-w-0">
                        Bab {ch.orderIndex}: {ch.title}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Materials List */}
      {showList && <div className="rounded-xl border border-border bg-card p-3 overflow-x-auto">
        <h3 className="font-heading text-body-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <FileText className="size-4 text-brand-primary" />
          Daftar PDF Terunggah ({materials.length})
        </h3>

        {materials.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <FileText className="size-6 text-muted-foreground/40 mx-auto mb-1.5" />
            <p className="text-body-xs font-medium text-foreground">Belum ada dokumen PDF terunggah</p>
            <p className="text-body-xs text-muted-foreground mt-0.5">
              Gunakan formulir di atas untuk mengunggah materi, soal, atau pembahasan soal PDF.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[760px] text-left text-body-xs">
            <thead className="bg-muted text-body-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Judul Dokumen</th>
                <th className="px-3 py-2">Kategori</th>
                <th className="px-3 py-2">Sub-kategori</th>
                <th className="px-3 py-2">Tahun</th>
                <th className="px-3 py-2">Kaitan Bab</th>
                <th className="px-3 py-2">Diunggah</th>
                <th className="px-3 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {materials.map((m) => {
                const fileUrl = m.fileUrl.startsWith("http")
                  ? m.fileUrl
                  : `/api/storage/file/${m.fileUrl}`;

                const categoryLabel = LEVEL1_LABELS[m.type] || m.type;
                const subcategoryLabel = getSubcategoryLabel(m.subcategory);

                return (
                  <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 font-semibold text-foreground max-w-xs">
                      <span className="truncate block" title={m.title}>
                        {m.title}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant={m.type === "soal" || m.type === "contoh_soal" ? "secondary" : m.type === "pembahasan_soal" ? "outline" : "default"}
                        className="rounded-md text-[10px] px-1.5 py-0.5"
                      >
                        {categoryLabel}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      {subcategoryLabel ? (
                        <span className="font-medium text-foreground bg-muted/60 px-1.5 py-0.5 rounded-md text-[10px]">
                          {subcategoryLabel}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap text-body-xs font-mono">
                      {m.year ? m.year : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-xs truncate" title={getChapterLabels(m.chapterIds)}>
                      {getChapterLabels(m.chapterIds)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap text-body-xs">
                      <FormattedDate date={m.createdAt} options={{ day: "numeric", month: "short", year: "numeric" }} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-muted/40 hover:bg-muted text-body-sm font-medium text-foreground transition-colors"
                        >
                          <ExternalLink className="size-3" />
                          <span>PDF</span>
                        </a>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 rounded-md text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(m.id)}
                          disabled={deleteLoadingId === m.id}
                          title="Hapus Dokumen"
                        >
                          {deleteLoadingId === m.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>}

      <BatchUploadDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        courseId={courseId}
        courseTitle={courseTitle}
        chapters={chapters}
      />
    </div>
  );
}
