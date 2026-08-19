"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import {
  saveChapter,
  deleteChapter,
  reorderChapters,
} from "@/app/(admin)/admin/(academic)/courses/actions";
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
  BookOpen,
  FileText,
  Library,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

type Chapter = {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
  description?: string | null;
  status?: string | null;
};

type UploadedMaterial = {
  id: string;
  chapterIds: any;
};

type QuestionItem = {
  id: string;
  chapterId?: string | null;
};

type Props = {
  courseId: string;
  courseTitle: string;
  initialChapters: Chapter[];
  materials?: UploadedMaterial[];
  questions?: QuestionItem[];
};

export function ChaptersTab({
  courseId,
  courseTitle: _courseTitle,
  initialChapters,
  materials = [],
  questions = [],
}: Props) {
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    setChapters(initialChapters);
  }, [initialChapters]);

  // New Chapter Form
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [addingChapter, setAddingChapter] = useState(false);

  // Edit Chapter Modal
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editOrder, setEditOrder] = useState(1);
  const [editDescription, setEditDescription] = useState("");

  // Delete Confirmation
  const [deletingChapter, setDeletingChapter] = useState<Chapter | null>(null);

  const handleAddChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error("Judul bab wajib diisi.");
      return;
    }

    setAddingChapter(true);
    const nextOrder = chapters.length + 1;
    const res = await saveChapter(null, courseId, newTitle.trim(), nextOrder, newDescription.trim() || null);
    setAddingChapter(false);

    if (res.success) {
      toast.success("Bab baru berhasil ditambahkan.");
      setNewTitle("");
      setNewDescription("");
      router.refresh();
    } else {
      toast.error(res.error || "Gagal menambahkan bab.");
    }
  };

  const startEditChapter = (ch: Chapter) => {
    setEditingChapter(ch);
    setEditTitle(ch.title);
    setEditOrder(ch.orderIndex);
    setEditDescription(ch.description || "");
  };

  const handleSaveEdit = async () => {
    if (!editingChapter || !editTitle.trim()) {
      toast.error("Judul bab wajib diisi.");
      return;
    }

    setLoading(true);
    const res = await saveChapter(
      editingChapter.id,
      courseId,
      editTitle.trim(),
      editOrder,
      editDescription.trim() || null
    );
    setLoading(false);

    if (res.success) {
      toast.success("Perubahan bab disimpan.");
      setEditingChapter(null);
      router.refresh();
    } else {
      toast.error(res.error || "Gagal menyimpan perubahan bab.");
    }
  };

  const handleDeleteChapter = async () => {
    if (!deletingChapter) return;
    setLoading(true);
    const res = await deleteChapter(deletingChapter.id);
    setLoading(false);
    setDeletingChapter(null);

    if (res.success) {
      toast.success("Bab berhasil dihapus.");
      router.refresh();
    } else {
      toast.error(res.error || "Gagal menghapus bab.");
    }
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= chapters.length) return;

    const newOrder = [...chapters];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);

    setChapters(newOrder);
    setActionLoadingId(moved.id);

    const reorderRes = await reorderChapters(courseId, newOrder.map((c) => c.id));
    setActionLoadingId(null);

    if (reorderRes.success) {
      toast.success("Urutan bab diperbarui.");
      router.refresh();
    } else {
      toast.error("Gagal memperbarui urutan bab.");
      setChapters(initialChapters);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add New Chapter Inline Form */}
      <form onSubmit={handleAddChapter} className="flex items-center gap-2">
        <Input
          placeholder="Judul bab baru..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          disabled={addingChapter}
          className="h-9 w-64 shrink-0 rounded-lg text-body-sm sm:w-72"
        />
        <Input
          placeholder="Deskripsi bab (opsional)..."
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          disabled={addingChapter}
          className="h-9 min-w-0 flex-1 rounded-lg text-body-sm"
        />
        <Button
          type="submit"
          size="sm"
          disabled={addingChapter || !newTitle.trim()}
          className="h-9 shrink-0 gap-1.5 rounded-lg text-body-sm font-semibold"
        >
          {addingChapter ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Menambahkan...
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              Tambah Bab
            </>
          )}
        </Button>
      </form>

      {/* Chapters List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-body-sm font-semibold text-foreground flex items-center gap-2">
            <Layers className="size-4 text-brand-primary" />
            Daftar Silabus & Bab ({chapters.length})
          </h3>
        </div>

        {chapters.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl bg-card">
            <BookOpen className="size-6 text-muted-foreground/40 mx-auto mb-1.5" />
            <p className="text-body-xs font-medium text-foreground">Belum ada bab yang terdaftar</p>
            <p className="text-body-xs text-muted-foreground mt-0.5">
              Gunakan formulir di atas untuk menambahkan bab pertama mata kuliah ini.
            </p>
          </div>
        ) : (
          <AdminTable>
            <table className="w-full text-left text-body-xs">
              <AdminTableHead>
                <tr>
                  <th className="px-3.5 py-2 w-20 text-center">Urutan</th>
                  <th className="px-3.5 py-2">Judul Silabus &amp; Bab</th>
                  <th className="px-3.5 py-2 w-56">Konten Terkait</th>
                  <th className="px-3.5 py-2 w-24 text-center">Posisi</th>
                  <th className="px-3.5 py-2 w-20 text-right">Aksi</th>
                </tr>
              </AdminTableHead>
              <tbody className="divide-y divide-border/50">
                {chapters.map((ch, idx) => {
                  const linkedMaterials = materials.filter((m) => {
                    const ids = Array.isArray(m.chapterIds)
                      ? m.chapterIds
                      : typeof m.chapterIds === "string"
                      ? JSON.parse(m.chapterIds || "[]")
                      : [];
                    return ids.includes(ch.id);
                  }).length;

                  const linkedQuestions = questions.filter((q) => q.chapterId === ch.id).length;

                  return (
                    <tr key={ch.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3.5 py-2.5 text-center">
                        <Badge
                          variant="outline"
                          className="font-mono font-bold text-body-xs px-2 py-0.5 rounded-md bg-muted/40"
                        >
                          Bab {ch.orderIndex}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-foreground text-body-sm">
                            {ch.title}
                          </p>
                          {ch.description && (
                            <p className="text-body-xs text-muted-foreground line-clamp-1">
                              {ch.description}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {linkedMaterials > 0 && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] gap-1 px-1.5 py-0.5 rounded-md font-medium"
                            >
                              <FileText className="size-3 text-brand-secondary" />
                              <span>{linkedMaterials} Dokumen</span>
                            </Badge>
                          )}
                          {linkedQuestions > 0 && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] gap-1 px-1.5 py-0.5 rounded-md font-medium"
                            >
                              <Library className="size-3 text-brand-primary" />
                              <span>{linkedQuestions} Soal</span>
                            </Badge>
                          )}
                          {linkedMaterials === 0 && linkedQuestions === 0 && (
                            <span className="text-muted-foreground/60 text-body-xs">
                              0 materi terkait
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <div className="inline-flex items-center gap-0.5 bg-muted/40 p-0.5 rounded-md border border-border/40">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-6 rounded"
                            disabled={idx === 0 || actionLoadingId === ch.id}
                            onClick={() => handleMove(idx, "up")}
                            title="Pindah ke Atas"
                          >
                            <ArrowUp className="size-3" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-6 rounded"
                            disabled={idx === chapters.length - 1 || actionLoadingId === ch.id}
                            onClick={() => handleMove(idx, "down")}
                            title="Pindah ke Bawah"
                          >
                            <ArrowDown className="size-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7 rounded-md hover:bg-muted"
                            onClick={() => startEditChapter(ch)}
                            title="Edit Bab"
                          >
                            <Edit2 className="size-3" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7 rounded-md text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeletingChapter(ch)}
                            title="Hapus Bab"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AdminTable>
        )}
      </div>

      {/* Edit Chapter Modal */}
      <Dialog open={!!editingChapter} onOpenChange={(open) => !open && setEditingChapter(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Bab</DialogTitle>
            <DialogDescription>
              Perbarui judul, urutan, atau deskripsi bab pembelajaran.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Judul Bab</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={loading}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Nomor Urutan</Label>
              <Input
                type="number"
                min={1}
                value={editOrder}
                onChange={(e) => setEditOrder(parseInt(e.target.value) || 1)}
                disabled={loading}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Deskripsi (Opsional)</Label>
              <Textarea
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={loading}
                className="rounded-lg"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={loading} className="rounded-lg">
                Batal
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleSaveEdit}
              disabled={loading || !editTitle.trim()}
              className="rounded-lg"
            >
              {loading ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Chapter Dialog */}
      <Dialog open={!!deletingChapter} onOpenChange={(open) => !open && setDeletingChapter(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Bab Pembelajaran</DialogTitle>
            <DialogDescription>
              Anda yakin ingin menghapus bab <strong>{deletingChapter?.title}</strong>? Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={loading} className="rounded-lg">
                Batal
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteChapter}
              disabled={loading}
              className="rounded-lg"
            >
              {loading ? "Menghapus..." : "Hapus Bab"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
