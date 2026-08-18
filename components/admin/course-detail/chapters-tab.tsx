"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

type Props = {
  courseId: string;
  courseTitle: string;
  initialChapters: Chapter[];
};

export function ChaptersTab({ courseId, courseTitle: _courseTitle, initialChapters }: Props) {
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

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
      <form onSubmit={handleAddChapter} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <Input
          placeholder="Judul bab baru..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          disabled={addingChapter}
          className="h-9 text-body-xs rounded-lg sm:w-1/3"
        />
        <Input
          placeholder="Deskripsi bab (opsional)..."
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          disabled={addingChapter}
          className="h-9 text-body-xs rounded-lg flex-1"
        />
        <Button
          type="submit"
          size="sm"
          disabled={addingChapter || !newTitle.trim()}
          className="gap-1.5 rounded-lg font-semibold h-9 shrink-0"
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
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Gunakan formulir di atas untuk menambahkan bab pertama mata kuliah ini.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden divide-y divide-border/50">
            {chapters.map((ch, idx) => (
              <div
                key={ch.id}
                className="flex items-center justify-between p-2.5 sm:px-3.5 sm:py-2.5 hover:bg-muted/10 transition-colors gap-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-primary/10 text-brand-primary font-heading font-bold text-body-xs">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                    <p className="text-body-xs font-semibold text-foreground truncate">
                      {ch.title}
                    </p>
                    {ch.description && (
                      <span className="text-[11px] text-muted-foreground truncate max-w-md hidden sm:inline">
                        · {ch.description}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1 shrink-0">
                  {/* Reorder Buttons */}
                  <div className="flex items-center gap-0.5 bg-muted/40 p-0.5 rounded-md border border-border/40">
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

                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 rounded-md"
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
              </div>
            ))}
          </div>
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
