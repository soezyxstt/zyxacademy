"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import {
  Plus,
  FileText,
  Loader2,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";

interface Source {
  id: string;
  title: string;
  courseId: string;
  origin: "uploaded" | "generated";
  category: "tutorial" | "quiz" | "uts" | "uas" | "tryout";
  year: number;
  semester: number | null;
  ingestionStatus: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  questionCount: number;
  chapterCount: number;
}

interface Course {
  id: string;
  title: string;
}

interface Props {
  sources: Source[];
  courses: Course[];
  courseMap: Record<string, string>;
}

export function AssessmentsClient({ sources, courses, courseMap }: Props) {
  const router = useRouter();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Deletion states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/assessments/${deletingId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Dokumen asesmen berhasil dihapus.");
        setIsDeleteDialogOpen(false);
        setDeletingId(null);
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
  };

  // Filter states
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form states
  const [form, setForm] = useState({
    courseId: "",
    title: "",
    rawText: "",
    pdfKey: "",
  });

  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfUploadState, setPdfUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");

  // Filtered sources
  const filteredSources = useMemo(() => {
    return sources.filter((source) => {
      const matchCourse = filterCourse === "all" || source.courseId === filterCourse;
      const matchCategory = filterCategory === "all" || source.category === filterCategory;
      const matchStatus = filterStatus === "all" || source.ingestionStatus === filterStatus;
      return matchCourse && matchCategory && matchStatus;
    });
  }, [sources, filterCourse, filterCategory, filterStatus]);

  // Handle PDF upload
  const handlePdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFileName(file.name);
    setPdfUploadState("uploading");

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("courseId", form.courseId);

      const res = await fetch("/api/admin/upload-pdf", { method: "POST", body: fd });
      if (!res.ok) {
        throw new Error("Gagal mengunggah file ke R2.");
      }
      const data = await res.json();
      setForm((prev) => ({ ...prev, pdfKey: data.key }));
      setPdfUploadState("done");
      toast.success("PDF berhasil diunggah.");
    } catch (error) {
      console.error(error);
      setPdfUploadState("error");
      toast.error("Gagal mengunggah PDF.");
    }
  };

  // Handle Ingest Submit
  const handleIngestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseId || !form.title || !form.rawText) {
      toast.error("Silakan isi semua field wajib (Mata Kuliah, Judul, Konten Markdown).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/material-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: form.courseId,
          title: form.title,
          sourceType: "markdown",
          rawText: form.rawText,
          summary: "Assessment historical source file uploaded.",
          learningObjectives: [],
          keywords: [],
          chapterIds: [],
          type: "assessment",
          pdfKey: form.pdfKey || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error("Gagal menyimpan dokumen asesmen: " + (data.error || "Error tidak diketahui"));
        return;
      }

      toast.success("Dokumen Asesmen berhasil diunggah. Klasifikasi soal berjalan di latar belakang.");
      setShowUploadModal(false);
      // Reset form
      setForm({ courseId: "", title: "", rawText: "", pdfKey: "" });
      setPdfFileName(null);
      setPdfUploadState("idle");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-48">
            <Select value={filterCourse} onValueChange={setFilterCourse}>
              <SelectTrigger>
                <SelectValue placeholder="Semua Mata Kuliah" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Mata Kuliah</SelectItem>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-40">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Semua Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                <SelectItem value="uts">UTS</SelectItem>
                <SelectItem value="uas">UAS</SelectItem>
                <SelectItem value="quiz">Quiz</SelectItem>
                <SelectItem value="tutorial">Tutorial</SelectItem>
                <SelectItem value="tryout">Tryout</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-40">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={() => setShowUploadModal(true)} className="flex items-center gap-2">
          <Plus size={16} />
          Upload Asesmen
        </Button>
      </div>

      {/* Table Surface */}
      <AdminTable>
        <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <AdminTableHead>
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">Nama Ujian / Judul</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">Mata Kuliah</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">Kategori</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">Tahun / Sem</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">Status Ingest</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-body-sm text-center">Soal</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-body-sm text-center">Bab</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">Tanggal</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </AdminTableHead>
          <tbody>
            {filteredSources.length === 0 ? (
              <tr>
                <td colSpan={9} className="h-32 text-center text-body-sm text-muted-foreground px-4 py-3">
                  Tidak ada data asesmen historis yang ditemukan.
                </td>
              </tr>
            ) : (
              filteredSources.map((source) => (
                <tr key={source.id} className="group border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors duration-150">
                  <td className="font-medium text-foreground px-4 py-3 align-middle">
                    <Link
                      href={`/admin/assessments/${source.id}`}
                      className="hover:underline flex items-center gap-2"
                    >
                      <FileText size={16} className="text-muted-foreground" />
                      {source.title}
                    </Link>
                  </td>
                  <td className="text-body-sm text-muted-foreground px-4 py-3 align-middle">
                    {courseMap[source.courseId] || "Mata Kuliah Tidak Diketahui"}
                  </td>
                  <td className="text-body-sm px-4 py-3 align-middle">
                    <Badge variant="outline" className="uppercase text-[10px] font-semibold tracking-wider">
                      {source.category}
                    </Badge>
                  </td>
                  <td className="text-body-sm text-muted-foreground px-4 py-3 align-middle">
                    {source.year} {source.semester ? `· Sem ${source.semester}` : ""}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-2">
                      {source.ingestionStatus === "completed" && (
                        <Badge className="bg-status-success/10 text-status-success hover:bg-status-success/20 flex items-center gap-1 border-0">
                          <CheckCircle2 size={12} />
                          Completed
                        </Badge>
                      )}
                      {source.ingestionStatus === "processing" && (
                        <Badge className="bg-status-warning/10 text-status-warning hover:bg-status-warning/20 flex items-center gap-1 border-0">
                          <Clock className="animate-spin" size={12} />
                          Processing
                        </Badge>
                      )}
                      {source.ingestionStatus === "pending" && (
                        <Badge className="bg-muted text-muted-foreground flex items-center gap-1 border-0">
                          <Clock size={12} />
                          Pending
                        </Badge>
                      )}
                      {source.ingestionStatus === "failed" && (
                        <Badge className="bg-status-error/10 text-status-error hover:bg-status-error/20 flex items-center gap-1 border-0">
                          <XCircle size={12} />
                          Failed
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="text-center font-semibold text-body-sm px-4 py-3 align-middle">
                    {source.questionCount}
                  </td>
                  <td className="text-center font-semibold text-body-sm px-4 py-3 align-middle">
                    {source.chapterCount}
                  </td>
                  <td className="text-body-sm text-muted-foreground px-4 py-3 align-middle">
                    {new Date(source.createdAt).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 align-middle text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/assessments/${source.id}`} className="text-muted-foreground hover:text-foreground inline-block">
                        <ExternalLink size={16} />
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-status-error hover:bg-status-error/10 cursor-pointer"
                        onClick={() => {
                          setDeletingId(source.id);
                          setIsDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </AdminTable>

      {/* Upload/Add Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-h6">Unggah Asesmen Historis</DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground">
              Unggah berkas asesmen canonical markdown. Konsep dan metadata soal akan diekstrak menggunakan AI.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleIngestSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-body-sm font-medium text-foreground">Mata Kuliah Target *</label>
                <Select
                  value={form.courseId}
                  onValueChange={(val) => setForm((prev) => ({ ...prev, courseId: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih mata kuliah" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-body-sm font-medium text-foreground">Judul Dokumen *</label>
                <Input
                  required
                  placeholder="Contoh: UTS MA1101 Kalkulus I 2023"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-body-sm font-medium text-foreground flex items-center justify-between">
                <span>Original PDF File (Optional untuk Provenance)</span>
                {pdfFileName && <span className="text-[11px] text-status-success">{pdfFileName}</span>}
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  type="file"
                  accept=".pdf"
                  onChange={handlePdfFileChange}
                  className="file:bg-muted file:text-foreground file:border-0 file:rounded-md file:px-2 file:py-1 cursor-pointer"
                />
                {pdfUploadState === "uploading" && <Loader2 size={16} className="animate-spin text-status-warning" />}
                {pdfUploadState === "done" && <CheckCircle2 size={16} className="text-status-success" />}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-body-sm font-medium text-foreground">
                Canonical Markdown Content *
              </label>
              <textarea
                required
                rows={10}
                placeholder="---&#10;category: uts&#10;year: 2023&#10;semester: 1&#10;chapters:&#10;  - Bab 1: Limit Fungsi&#10;---&#10;&#10;## Question 1&#10;..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-body-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.rawText}
                onChange={(e) => setForm((prev) => ({ ...prev, rawText: e.target.value }))}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowUploadModal(false)}>
                Batal
              </Button>
              <Button type="submit" isLoading={submitting} disabled={pdfUploadState === "uploading"}>
                Proses Ingest
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Confirmation Deletion Dialog */}
      <AdminConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (!open) setDeletingId(null);
        }}
        title="Hapus Dokumen Asesmen?"
        description="Apakah Anda yakin ingin menghapus dokumen asesmen/bank soal ini? Tindakan ini akan menghapus dokumen secara permanen dan menyinkronkan profil asesmen kursus terkait."
        confirmLabel="Hapus Permanen"
        loading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
