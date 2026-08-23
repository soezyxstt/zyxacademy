"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveCourseMaterial, deleteCourseMaterial } from "@/app/(admin)/admin/(academic)/courses/actions";
import { Trash2, Plus, Loader2, FileText, ExternalLink } from "lucide-react";
import {
  LEVEL1_CATEGORIES,
  getSubcategoriesForLevel1,
  LEVEL1_LABELS,
  getSubcategoryLabel,
  type MaterialLevel1Category,
  type CourseMaterialSubcategory,
} from "@/lib/course-materials";

const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024;

type Course = {
  id: string;
  title: string;
};

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
  courses: Course[];
  chapters: Chapter[];
  initialMaterials: UploadedMaterial[];
};

export function PDFMaterialsTab({ courses, chapters, initialMaterials }: Props) {
  const router = useRouter();
  const [materials, _setMaterials] = useState<UploadedMaterial[]>(initialMaterials);
  const [loading, setLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  // Form states
  const [form, setForm] = useState({
    courseId: "",
    title: "",
    type: "materi" as MaterialLevel1Category,
    subcategory: "ppt_dosen" as CourseMaterialSubcategory,
    year: "",
  });
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const availableSubcategories = getSubcategoriesForLevel1(form.type);

  // Filter chapters based on selected course
  const courseChapters = useMemo(() => {
    return chapters.filter((c) => c.courseId === form.courseId);
  }, [chapters, form.courseId]);

  // Reset chapters when course shifts
  const handleCourseChange = (courseId: string) => {
    setForm((prev) => ({ ...prev, courseId }));
    setSelectedChapters(new Set());
  };

  const handleTypeChange = (newType: MaterialLevel1Category) => {
    const subcats = getSubcategoriesForLevel1(newType);
    setForm((prev) => ({
      ...prev,
      type: newType,
      subcategory: subcats.length > 0 && !subcats.some((s) => s.value === prev.subcategory)
        ? subcats[0].value
        : prev.subcategory,
    }));
  };

  const handleChapterToggle = (chapterId: string) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  };

  const handleSelectAllChapters = () => {
    if (selectedChapters.size === courseChapters.length) {
      setSelectedChapters(new Set());
    } else {
      setSelectedChapters(new Set(courseChapters.map((c) => c.id)));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseId || !form.title.trim() || !form.type || selectedChapters.size === 0 || !selectedFile) {
      toast.error("Silakan lengkapi semua field, pilih minimal satu bab, dan unggah file PDF.");
      return;
    }

    if (selectedFile.size > MAX_PDF_SIZE_BYTES) {
      toast.error("Ukuran PDF maksimal 50 MB.");
      return;
    }

    const parsedYear = form.year.trim() ? parseInt(form.year.trim(), 10) : null;
    if (form.year.trim() && (isNaN(parsedYear!) || parsedYear! < 1900 || parsedYear! > 2100)) {
      toast.error("Format tahun tidak valid (contoh: 2024).");
      return;
    }

    setLoading(true);
    try {
      const file = selectedFile;
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("courseId", form.courseId);

      const uploadResponse = await fetch("/api/admin/upload-pdf", {
        method: "POST",
        body: uploadForm,
      });
      const uploadData = await uploadResponse.json().catch(() => null);

      if (!uploadResponse.ok || typeof uploadData?.key !== "string") {
        toast.error(uploadData?.error || "Gagal mengunggah PDF");
        return;
      }

      const res = await saveCourseMaterial(
        form.courseId,
        form.title.trim(),
        form.type,
        Array.from(selectedChapters),
        uploadData.key,
        form.subcategory,
        parsedYear
      );

      if (res.success) {
        toast.success("Materi PDF berhasil diunggah");
        setForm((prev) => ({ ...prev, title: "", year: "" }));
        setSelectedChapters(new Set());
        setSelectedFile(null);
        const fileInput = document.getElementById("pdf-file-input") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menyimpan materi");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal mengunggah berkas");
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
        toast.success("Materi berhasil dihapus");
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menghapus materi");
      }
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan jaringan");
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
    <div className="space-y-4 font-sans">
      {/* Upload Form */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <h3 className="font-heading text-body-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <FileText className="size-4 text-brand-secondary" />
          Unggah Dokumen PDF Baru
        </h3>

        <form onSubmit={handleUpload} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Course Selector */}
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Mata Kuliah</Label>
              <Select value={form.courseId} onValueChange={handleCourseChange} disabled={loading}>
                <SelectTrigger className="h-9 text-body-sm rounded-lg">
                  <SelectValue placeholder="Pilih Mata Kuliah" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title} ({c.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Judul Dokumen</Label>
              <Input
                placeholder="Contoh: Soal UTS Fisika IA"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                disabled={loading}
                className="h-9 text-body-sm rounded-lg"
              />
            </div>

            {/* Level 1 Type Selector */}
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Kategori</Label>
              <Select
                value={form.type}
                onValueChange={(v: MaterialLevel1Category) => handleTypeChange(v)}
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

            {/* Level 2 Subcategory Selector */}
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Sub-kategori</Label>
              <Select
                value={form.subcategory}
                onValueChange={(v: CourseMaterialSubcategory) => setForm((prev) => ({ ...prev, subcategory: v }))}
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

            {/* Year Input */}
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">
                Tahun <span className="text-muted-foreground font-normal text-body-xs">(opsional)</span>
              </Label>
              <Input
                placeholder="2024"
                type="number"
                min={1900}
                max={2100}
                value={form.year}
                onChange={(e) => setForm((prev) => ({ ...prev, year: e.target.value }))}
                disabled={loading}
                className="h-9 text-body-sm rounded-lg"
              />
            </div>
          </div>

          {/* Chapter Selector (Conditional on courseId selected) */}
          {form.courseId && (
            <div className="border border-border/70 rounded-xl p-3 bg-muted/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-body-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Kaitkan dengan Bab ({selectedChapters.size} dipilih)
                </span>
                {courseChapters.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllChapters}
                    className="text-body-xs text-brand-primary font-medium hover:underline cursor-pointer"
                  >
                    {selectedChapters.size === courseChapters.length ? "Batalkan Semua" : "Pilih Semua Bab"}
                  </button>
                )}
              </div>
              
              {courseChapters.length === 0 ? (
                <p className="text-body-xs text-status-warning py-1">
                  Mata kuliah ini belum memiliki bab. Silakan tambahkan bab terlebih dahulu di direktori mata kuliah.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {courseChapters.map((chapter) => (
                    <label
                      key={chapter.id}
                      className={`flex items-start gap-2 p-2 rounded-lg border text-body-xs cursor-pointer select-none transition-colors ${
                        selectedChapters.has(chapter.id)
                          ? "border-brand-primary bg-brand-primary/10 text-foreground"
                          : "border-border/60 hover:bg-muted/20 text-muted-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedChapters.has(chapter.id)}
                        onChange={() => handleChapterToggle(chapter.id)}
                        disabled={loading}
                        className="mt-0.5 rounded border-border"
                      />
                      <span className="truncate">
                        Bab {chapter.orderIndex}: {chapter.title}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* File Input and Submit */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-1">
            <div className="space-y-1 flex-1 max-w-md">
              <Label className="text-body-sm font-semibold text-foreground">Berkas PDF</Label>
              <Input
                id="pdf-file-input"
                type="file"
                accept="application/pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                disabled={loading}
                className="cursor-pointer file:rounded-md file:bg-muted file:border-0 file:px-2.5 file:py-0.5 file:text-body-xs file:font-semibold h-9 rounded-lg text-body-xs"
              />
            </div>

            <Button
              type="submit"
              size="sm"
              className="rounded-lg font-semibold h-9"
              disabled={loading || !form.courseId || !form.title.trim() || selectedChapters.size === 0 || !selectedFile}
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Mengunggah...
                </>
              ) : (
                <>
                  <Plus className="size-3.5 mr-1.5" />
                  Unggah PDF
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Materials List */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-2xs overflow-x-auto">
        <h3 className="font-heading text-body-sm font-bold text-foreground mb-3">
          Daftar PDF Terunggah ({materials.length})
        </h3>
        
        {materials.length === 0 ? (
          <div className="text-center py-8 text-body-xs text-muted-foreground border border-dashed border-border rounded-xl">
            Belum ada berkas PDF yang diunggah.
          </div>
        ) : (
          <table className="w-full text-left text-body-xs">
            <thead className="bg-muted text-body-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Judul</th>
                <th className="px-3 py-2">Mata Kuliah</th>
                <th className="px-3 py-2">Kategori</th>
                <th className="px-3 py-2">Sub-kategori</th>
                <th className="px-3 py-2">Tahun</th>
                <th className="px-3 py-2">Kaitan Bab</th>
                <th className="px-3 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {materials.map((m) => {
                const courseTitle = courses.find((c) => c.id === m.courseId)?.title || m.courseId;
                const fileUrl = m.fileUrl.startsWith("http")
                  ? m.fileUrl
                  : `/api/storage/file/${m.fileUrl}`;

                const categoryLabel = LEVEL1_LABELS[m.type] || m.type;
                const subcategoryLabel = getSubcategoryLabel(m.subcategory);

                return (
                  <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 font-semibold text-foreground">{m.title}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{courseTitle}</td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant={m.type === "soal" || m.type === "contoh_soal" ? "secondary" : m.type === "pembahasan_soal" ? "outline" : "default"}
                        className="text-[10px] px-1.5 py-0.5 rounded-md"
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
                          disabled={deleteLoadingId !== null}
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
      </div>
    </div>
  );
}
