"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, BookOpen, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { saveTutorMaterialAction, deleteTutorMaterialAction } from "@/app/actions/tutor-management";
import { cleanSummary } from "@/lib/utils";

interface MaterialChunk {
  chunkText: string;
  orderIndex: number;
}

interface MaterialSection {
  title: string | null;
  orderIndex: number;
  chunks: MaterialChunk[];
}

interface MaterialInstance {
  id: string;
  courseId: string;
  title: string;
  summary: string;
  createdAt: Date;
  sections?: MaterialSection[];
}

interface Props {
  courseId: string;
  initialMaterials: MaterialInstance[];
}

function reconstructMarkdown(material: MaterialInstance): string {
  if (!material.sections) return "";
  return material.sections
    .map((s) => {
      const sectionTitle = s.title ? `## ${s.title}\n\n` : "";
      const content = (s.chunks || []).map((c) => c.chunkText).join("\n\n");
      return sectionTitle + content;
    })
    .join("\n\n");
}

export function MaterialsClient({ courseId, initialMaterials }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [isOpen, setIsOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<MaterialInstance | null>(null);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [rawText, setRawText] = useState("");

  const [deleteId, setDeleteId] = useState<string | null>(null);

  function handleOpenAdd() {
    setEditingMaterial(null);
    setTitle("");
    setSummary("");
    setRawText("");
    setIsOpen(true);
  }

  function handleOpenEdit(m: MaterialInstance) {
    setEditingMaterial(m);
    setTitle(m.title);
    setSummary(m.summary);
    setRawText(reconstructMarkdown(m));
    setIsOpen(true);
  }

  async function handleSave() {
    if (!title.trim() || !summary.trim() || !rawText.trim()) {
      toast.error("Semua field wajib diisi.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await saveTutorMaterialAction(
          courseId,
          editingMaterial ? editingMaterial.id : null,
          title,
          summary,
          rawText
        );
        if (res.success) {
          toast.success(editingMaterial ? "Materi berhasil diperbarui!" : "Materi baru berhasil ditambahkan!");
          setIsOpen(false);
          router.refresh();
        }
      } catch (err: any) {
        toast.error(err.message || "Gagal menyimpan materi.");
      }
    });
  }

  async function handleDelete() {
    if (!deleteId) return;

    startTransition(async () => {
      try {
        const res = await deleteTutorMaterialAction(courseId, deleteId);
        if (res.success) {
          toast.success("Materi berhasil dihapus.");
          setDeleteId(null);
          router.refresh();
        }
      } catch (err: any) {
        toast.error(err.message || "Gagal menghapus materi.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Action Row */}
      <div className="flex justify-between items-center">
        <h2 className="font-heading text-body-base font-semibold text-foreground">Daftar Modul ({initialMaterials.length})</h2>
        <Button onClick={handleOpenAdd} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-2">
          <Plus className="size-4" />
          Tambah Materi
        </Button>
      </div>

      {/* Grid List */}
      {initialMaterials.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border bg-card/50 rounded-2xl">
          <BookOpen className="size-12 text-muted-foreground/50 mx-auto mb-3" />
          <h3 className="font-heading text-body-base font-bold text-foreground">Belum Ada Materi</h3>
          <p className="text-body-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Materi belajar yang ditambahkan akan muncul di sini dan langsung dapat diakses oleh siswa.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {initialMaterials.map((m) => (
            <Card key={m.id} className="bg-card border-border shadow-sm rounded-2xl flex flex-col justify-between overflow-hidden">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                    <FileText className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="font-heading text-body-base font-bold text-foreground truncate">{m.title}</CardTitle>
                    <p className="text-body-xs text-muted-foreground mt-0.5">
                      Dibuat pada: {new Date(m.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4 flex-1">
                <p className="text-body-sm text-muted-foreground line-clamp-3 leading-relaxed">{cleanSummary(m.summary)}</p>
              </CardContent>
              <div className="px-5 py-3.5 bg-muted/20 border-t border-border flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => handleOpenEdit(m)} className="rounded-md border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted gap-1">
                  <Edit2 className="size-3.5" />
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDeleteId(m.id)} className="rounded-md border-border/80 text-status-error hover:bg-status-error/10 hover:text-status-error gap-1">
                  <Trash2 className="size-3.5" />
                  Hapus
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {editingMaterial ? "Edit Materi Belajar" : "Tambah Materi Belajar"}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              Tulis materi dengan format Markdown. Judul level 2 (##) akan otomatis membagi materi menjadi beberapa halaman.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4 font-sans">
            <div className="grid gap-2">
              <Label htmlFor="title" className="text-body-sm font-semibold">Judul Materi</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Bab 1: Limit Fungsi Aljabar"
                className="rounded-lg border-input bg-background focus-visible:ring-brand-primary"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="summary" className="text-body-sm font-semibold">Ringkasan Singkat</Label>
              <Input
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Deskripsi singkat modul untuk halaman katalog siswa..."
                className="rounded-lg border-input bg-background focus-visible:ring-brand-primary"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="content" className="text-body-sm font-semibold">Isi Materi (Markdown)</Label>
              <Textarea
                id="content"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={12}
                placeholder="## Judul Subbab&#10;Isi materi dan penjelasan disini...&#10;&#10;## Subbab Kedua&#10;Gunakan LaTeX untuk rumus matematika: $$f(x) = x^2$$"
                className="rounded-lg border-input bg-background font-mono text-body-xs leading-relaxed focus-visible:ring-brand-primary"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isPending} className="rounded-md border-border/80">
              Batal
            </Button>
            <Button onClick={handleSave} isLoading={isPending} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-1.5">
              Simpan Bab
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">Hapus Materi?</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              Apakah Anda yakin ingin menghapus materi ini? Tindakan ini bersifat permanen dan materi tidak akan dapat diakses oleh siswa lagi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={isPending} className="rounded-md border-border/80">
              Batal
            </Button>
            <Button onClick={handleDelete} isLoading={isPending} className="bg-status-error hover:bg-status-error/90 text-white rounded-md font-semibold gap-1.5">
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
