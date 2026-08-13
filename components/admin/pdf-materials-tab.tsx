"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveCourseMaterial, deleteCourseMaterial } from "@/app/(admin)/admin/(academic)/courses/actions";
import { Trash2, Plus, Loader2, FileText } from "lucide-react";

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
  type: "materi_kelas" | "contoh_soal";
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
    type: "materi_kelas" as "materi_kelas" | "contoh_soal",
  });
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Filter chapters based on selected course
  const courseChapters = useMemo(() => {
    return chapters.filter((c) => c.courseId === form.courseId);
  }, [chapters, form.courseId]);

  // Reset chapters when course shifts
  const handleCourseChange = (courseId: string) => {
    setForm((prev) => ({ ...prev, courseId }));
    setSelectedChapters(new Set());
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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseId || !form.title || !form.type || selectedChapters.size === 0 || !selectedFile) {
      toast.error("Silakan lengkapi semua field, pilih minimal satu bab, dan unggah file PDF.");
      return;
    }

    if (selectedFile.size > MAX_PDF_SIZE_BYTES) {
      toast.error("Ukuran PDF maksimal 50 MB.");
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
        form.title,
        form.type,
        Array.from(selectedChapters),
        uploadData.key
      );

      if (res.success) {
        toast.success("Materi PDF berhasil diunggah");
        setForm((prev) => ({ ...prev, title: "" }));
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
    <div className="space-y-8 font-sans">
      {/* Upload Form */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="font-heading text-h5 font-semibold text-foreground mb-4 flex items-center gap-2">
          <FileText className="size-5 text-brand-secondary" />
          Unggah Dokumen PDF Baru
        </h2>
        <div className="mb-5 p-4 rounded-xl border border-status-warning/20 bg-status-warning/10 text-status-warning text-left flex items-start gap-2.5">
          <span className="text-lg shrink-0 mt-0.5">⚠️</span>
          <div className="space-y-1">
            <p className="font-bold text-body-sm text-foreground">Catatan Penting Ingestion</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Unggah PDF di tab ini hanya ditujukan untuk bahan bacaan langsung atau unduhan manual mahasiswa (Layer 1).
              Untuk memproses materi pelajaran menjadi basis pengetahuan AI (RAG, Ringkasan, Flashcard, &amp; Bank Soal), silakan unggah berkas Markdown di menu <Link href="/admin/ai/materials" className="text-primary font-semibold hover:underline">Materi AI</Link>.
            </p>
          </div>
        </div>
        <form onSubmit={handleUpload} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Course Selector */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">MATA KULIAH</label>
              <Select value={form.courseId} onValueChange={handleCourseChange} disabled={loading}>
                <SelectTrigger>
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

            {/* Type Selector */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">JENIS DOKUMEN</label>
              <Select
                value={form.type}
                onValueChange={(v: any) => setForm((prev) => ({ ...prev, type: v }))}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Jenis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="materi_kelas">Materi Kelas (PDF)</SelectItem>
                  <SelectItem value="contoh_soal">Contoh Soal (PDF)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">JUDUL DOKUMEN</label>
              <Input
                placeholder="Contoh: Soal UTS Fisika IA 2024"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                disabled={loading}
              />
            </div>
          </div>

          {/* Chapter Selector (Conditional on courseId selected) */}
          {form.courseId && (
            <div className="border border-border/80 rounded-xl p-4 bg-muted/5 space-y-3">
              <span className="text-[11px] font-bold text-muted-foreground block">
                KAITKAN DENGAN BAB (PILIH MINIMAL SATU)
              </span>
              
              {courseChapters.length === 0 ? (
                <p className="text-body-xs text-status-warning flex items-center gap-1.5 py-1">
                  Mata kuliah ini belum memiliki bab. Silakan tambahkan bab terlebih dahulu di Tab Kelola Mata Kuliah.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {courseChapters.map((chapter) => (
                    <label
                      key={chapter.id}
                      className={`flex items-start gap-2.5 p-2 rounded-lg border text-body-xs font-semibold cursor-pointer select-none transition-all duration-150 ${
                        selectedChapters.has(chapter.id)
                          ? "border-brand-primary bg-brand-primary/5 text-foreground"
                          : "border-border/60 hover:bg-muted/10 text-muted-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedChapters.has(chapter.id)}
                        onChange={() => handleChapterToggle(chapter.id)}
                        disabled={loading}
                        className="mt-0.5 rounded border-border"
                      />
                      <span>
                        Bab {chapter.orderIndex}: {chapter.title}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* File Input */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground">BERKAS PDF</label>
            <Input
              id="pdf-file-input"
              type="file"
              accept="application/pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              disabled={loading}
              className="cursor-pointer file:rounded-md file:bg-muted file:border-0 file:px-3 file:py-1 file:text-body-xs file:font-semibold"
            />
            <p className="text-body-xs text-muted-foreground">Format PDF, maksimal 50 MB.</p>
          </div>

          <Button
            type="submit"
            className="rounded-lg font-semibold bg-gradient-to-r from-brand-secondary to-brand-secondary/90 text-white"
            disabled={loading || !form.courseId || !form.title.trim() || selectedChapters.size === 0 || !selectedFile}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" />
                Mengunggah...
              </>
            ) : (
              <>
                <Plus className="size-4 mr-1.5" />
                Unggah PDF
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Materials List */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm overflow-x-auto">
        <h3 className="font-heading text-body-sm font-bold text-foreground mb-4">
          Daftar PDF Terunggah ({materials.length})
        </h3>
        
        {materials.length === 0 ? (
          <div className="text-center py-12 text-body-sm text-muted-foreground">
            Belum ada berkas PDF yang diunggah.
          </div>
        ) : (
          <table className="w-full table-auto">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left text-body-sm font-semibold">Judul</th>
                <th className="px-4 py-2 text-left text-body-sm font-semibold">Mata Kuliah</th>
                <th className="px-4 py-2 text-left text-body-sm font-semibold">Jenis</th>
                <th className="px-4 py-2 text-left text-body-sm font-semibold">Kaitan Bab</th>
                <th className="px-4 py-2 text-center text-body-sm font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => {
                const courseTitle = courses.find((c) => c.id === m.courseId)?.title || m.courseId;
                return (
                  <tr key={m.id} className="border-b border-border/30">
                    <td className="px-4 py-2.5 text-body-sm font-semibold text-foreground">{m.title}</td>
                    <td className="px-4 py-2.5 text-body-sm text-muted-foreground">{courseTitle}</td>
                    <td className="px-4 py-2.5 text-body-sm">
                      <Badge variant={m.type === "contoh_soal" ? "secondary" : "outline"}>
                        {m.type === "contoh_soal" ? "Contoh Soal" : "Materi Kelas"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-body-xs text-muted-foreground max-w-xs truncate" title={getChapterLabels(m.chapterIds)}>
                      {getChapterLabels(m.chapterIds)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(m.id)}
                        disabled={deleteLoadingId !== null}
                      >
                        {deleteLoadingId === m.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4 text-destructive" />
                        )}
                      </Button>
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
