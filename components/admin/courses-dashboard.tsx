"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveCourse, deleteCourse, getCourseChapters, saveChapter, deleteChapter } from "@/app/(admin)/admin/(academic)/courses/actions";
import { Edit, Trash2, Check, X, Layers, Plus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

const CATEGORY_OPTIONS = [
  "TPB",
  "Rekayasa Umum",
  "Matematika",
  "Fisika",
  "Astronomi",
  "Kimia",
  "Aktuaria",
  "Mikrobiologi",
  "Biologi",
  "Rekayasa Hayati",
  "Rekayasa Pertanian",
  "Rekayasa Kehutanan",
  "Teknologi Pasca Panen",
  "Sains dan Teknologi Farmasi",
  "Farmasi Klinik dan Komunitas",
  "Teknik Pertambangan",
  "Teknik Perminyakan",
  "Teknik Geofisika",
  "Teknik Metalurgi",
  "Teknik Geologi",
  "Meteorologi",
  "Oseanografi",
  "Teknik Geodesi dan Geomatika",
  "Teknik Kimia",
  "Teknik Fisika",
  "Teknik Industri",
  "Teknik Pangan",
  "Manajemen Rekayasa",
  "Teknik Bioenergi dan Kemurgi",
  "Teknik Industri (Kampus Cirebon)",
  "Teknik Elektro",
  "Teknik Informatika",
  "Teknik Tenaga Listrik",
  "Teknik Telekomunikasi",
  "Sistem dan Teknologi Informasi",
  "Teknik Biomedis",
  "Teknik Mesin",
  "Teknik Dirgantara",
  "Teknik Material",
  "Teknik Sipil",
  "Teknik Lingkungan",
  "Teknik Kelautan",
  "Rekayasa Infrastruktur Lingkungan",
  "Teknik dan Pengelolaan Sumber Daya Air",
  "Arsitektur",
  "Perencanaan Wilayah dan Kota",
  "Perencanaan Wilayah dan Kota (Kampus Cirebon)",
  "Seni Rupa",
  "Kriya (Kampus Cirebon)",
  "Kriya",
  "Desain Interior",
  "Desain Komunikasi Visual",
  "Desain Produk",
  "Manajemen",
  "Kewirausahaan",
] as const;

type Course = {
  id: string;
  title: string;
  category: string;
  description?: string | null;
};

type Props = {
  initialCourses: Course[];
};

export function CoursesDashboard({ initialCourses }: Props) {
  const router = useRouter();
  const [courses, _setCourses] = useState<Course[]>(initialCourses);
  const [newCourse, setNewCourse] = useState<Partial<Course>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [editVals, setEditVals] = useState<Partial<Course>>({});
  const [loading, setLoading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Chapters Management States
  const [chaptersModalOpen, setChaptersModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [chaptersList, setChaptersList] = useState<any[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chapterActionLoading, setChapterActionLoading] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [chapterForm, setChapterForm] = useState({ title: "", orderIndex: 1, description: "" });
  const [newChapterForm, setNewChapterForm] = useState({ title: "", description: "" });

  const loadChapters = async (courseId: string) => {
    setChaptersLoading(true);
    try {
      const data = await getCourseChapters(courseId);
      setChaptersList(data);
    } catch (err) {
      console.error(err);
      toast.error("Gagal memuat daftar bab");
    } finally {
      setChaptersLoading(false);
    }
  };

  const openChaptersModal = (course: Course) => {
    setSelectedCourse(course);
    setEditingChapterId(null);
    setNewChapterForm({ title: "", description: "" });
    setChaptersModalOpen(true);
    loadChapters(course.id);
  };

  const handleSaveChapter = async (chapterId: string | null) => {
    if (!selectedCourse) return;
    setChapterActionLoading(true);

    const isEdit = !!chapterId;
    const title = isEdit ? chapterForm.title : newChapterForm.title;
    const desc = isEdit ? chapterForm.description : newChapterForm.description;
    const orderIndex = isEdit ? chapterForm.orderIndex : chaptersList.length + 1;

    const res = await saveChapter(chapterId, selectedCourse.id, title, orderIndex, desc);
    setChapterActionLoading(false);

    if (res.success) {
      toast.success(isEdit ? "Bab diperbarui" : "Bab ditambahkan");
      if (isEdit) {
        setEditingChapterId(null);
      } else {
        setNewChapterForm({ title: "", description: "" });
      }
      loadChapters(selectedCourse.id);
    } else {
      toast.error(res.error || "Gagal menyimpan bab");
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!selectedCourse) return;
    if (!confirm("Apakah Anda yakin ingin menghapus bab ini?")) return;
    
    setChapterActionLoading(true);
    const res = await deleteChapter(chapterId);
    setChapterActionLoading(false);

    if (res.success) {
      toast.success("Bab dihapus");
      loadChapters(selectedCourse.id);
    } else {
      toast.error(res.error || "Gagal menghapus bab");
    }
  };

  const startEditChapter = (chapter: any) => {
    setEditingChapterId(chapter.id);
    setChapterForm({
      title: chapter.title,
      orderIndex: chapter.orderIndex,
      description: chapter.description || "",
    });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourse.id || !newCourse.title || !newCourse.category) {
      toast.error("Semua field wajib diisi");
      return;
    }
    setLoading(true);
    const res = await saveCourse(
      newCourse.id,
      newCourse.title,
      newCourse.category,
      newCourse.description ?? null,
      true
    );
    setLoading(false);
    if (res.success) {
      toast.success("Mata kuliah berhasil ditambahkan");
      setNewCourse({});
      router.refresh();
    } else {
      toast.error(res.error ?? "Gagal menambahkan");
    }
  };

  const startEdit = (c: Course) => {
    setEditId(c.id);
    setEditVals({ title: c.title, category: c.category, description: c.description ?? "" });
  };

  const handleEditSave = async (id: string) => {
    if (!editVals.title || !editVals.category) {
      toast.error("Judul dan kategori wajib");
      return;
    }
    setLoading(true);
    const res = await saveCourse(
      id,
      editVals.title,
      editVals.category,
      editVals.description ?? null,
      false
    );
    setLoading(false);
    if (res.success) {
      toast.success("Mata kuliah diperbarui");
      setEditId(null);
      router.refresh();
    } else {
      toast.error(res.error ?? "Gagal memperbarui");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId) return;
    setLoading(true);
    const res = await deleteCourse(pendingDeleteId);
    setLoading(false);
    setPendingDeleteId(null);
    if (res.success) {
      toast.success("Mata kuliah dihapus");
      router.refresh();
    } else {
      toast.error(res.error ?? "Gagal menghapus");
    }
  };

  return (
    <div className="space-y-8">
      {/* Add New Course Form */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="font-heading text-h5 font-semibold text-foreground mb-4">
          Tambah Mata Kuliah Baru
        </h2>
        <form onSubmit={handleAdd} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="ID (slug)"
            value={newCourse.id ?? ""}
            onChange={(e) => setNewCourse((prev) => ({ ...prev, id: e.target.value }))}
            disabled={loading}
          />
          <Input
            placeholder="Judul"
            value={newCourse.title ?? ""}
            onChange={(e) => setNewCourse((prev) => ({ ...prev, title: e.target.value }))}
            disabled={loading}
          />
          <Select
            value={newCourse.category ?? ""}
            onValueChange={(v) => setNewCourse((prev) => ({ ...prev, category: v }))}
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Program Studi" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Deskripsi (opsional)"
            value={newCourse.description ?? ""}
            onChange={(e) => setNewCourse((prev) => ({ ...prev, description: e.target.value }))}
            disabled={loading}
          />
          <Button type="submit" disabled={loading} className="col-span-full md:col-span-1 self-end">
            {loading ? "Menyimpan…" : "Tambah"}
          </Button>
        </form>
      </div>

      {/* Existing Courses List */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm overflow-x-auto">
        <table className="w-full table-auto">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left text-body-sm font-medium">ID</th>
              <th className="px-4 py-2 text-left text-body-sm font-medium">Judul</th>
              <th className="px-4 py-2 text-left text-body-sm font-medium">Program Studi</th>
              <th className="px-4 py-2 text-left text-body-sm font-medium">Deskripsi</th>
              <th className="px-4 py-2 text-center text-body-sm font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="border-b border-border/30">
                <td className="px-4 py-2 text-body-sm text-foreground">{c.id}</td>
                <td className="px-4 py-2">
                  {editId === c.id ? (
                    <Input
                      value={editVals.title ?? ""}
                      onChange={(e) => setEditVals((p) => ({ ...p, title: e.target.value }))}
                      disabled={loading}
                    />
                  ) : (
                    <span className="text-body-sm text-foreground">{c.title}</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {editId === c.id ? (
                    <Select
                      value={editVals.category ?? ""}
                      onValueChange={(v) => setEditVals((p) => ({ ...p, category: v }))}
                      disabled={loading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Program Studi" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-body-sm text-foreground">{c.category}</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {editId === c.id ? (
                    <Input
                      value={editVals.description ?? ""}
                      onChange={(e) => setEditVals((p) => ({ ...p, description: e.target.value }))}
                      disabled={loading}
                    />
                  ) : (
                    <span className="text-body-sm text-muted-foreground">{c.description}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-center">
                  {editId === c.id ? (
                    <div className="flex items-center justify-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEditSave(c.id)} disabled={loading}>
                        <Check className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)} disabled={loading}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(c)} disabled={loading}>
                        <Edit className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPendingDeleteId(c.id)} disabled={loading}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openChaptersModal(c)} disabled={loading} title="Kelola Bab">
                        <Layers className="size-4 text-brand-primary" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!pendingDeleteId} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Mata Kuliah</DialogTitle>
            <DialogDescription>
              Anda yakin ingin menghapus mata kuliah ini? Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={loading}>
                Batal
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={loading}>
              {loading ? "Menghapus..." : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chapters Management Dialog */}
      <Dialog open={chaptersModalOpen} onOpenChange={setChaptersModalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="size-5 text-brand-primary" />
              Kelola Bab: {selectedCourse?.title}
            </DialogTitle>
            <DialogDescription>
              Tambahkan bab baru, ubah urutan, atau edit judul bab untuk menyusun struktur pembelajaran.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 my-4">
            {/* Chapters List */}
            <div className="space-y-2">
              <h3 className="font-heading text-body-sm font-bold text-foreground">Daftar Bab Aktif</h3>
              
              {chaptersLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin mr-2" />
                  Memuat bab...
                </div>
              ) : chaptersList.length === 0 ? (
                <div className="text-center py-6 text-body-sm text-muted-foreground border border-dashed border-border rounded-lg">
                  Belum ada bab yang ditambahkan.
                </div>
              ) : (
                <div className="border border-border rounded-lg divide-y divide-border/60">
                  {chaptersList.map((chapter) => (
                    <div key={chapter.id} className="p-3 flex items-start justify-between gap-4 bg-muted/10 hover:bg-muted/20">
                      {editingChapterId === chapter.id ? (
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-[60px_1fr_2fr] gap-2 items-center">
                          <Input
                            type="number"
                            value={chapterForm.orderIndex}
                            onChange={(e) => setChapterForm(p => ({ ...p, orderIndex: parseInt(e.target.value) || 1 }))}
                            disabled={chapterActionLoading}
                            placeholder="No"
                            title="Urutan"
                          />
                          <Input
                            value={chapterForm.title}
                            onChange={(e) => setChapterForm(p => ({ ...p, title: e.target.value }))}
                            disabled={chapterActionLoading}
                            placeholder="Judul Bab"
                          />
                          <Input
                            value={chapterForm.description}
                            onChange={(e) => setChapterForm(p => ({ ...p, description: e.target.value }))}
                            disabled={chapterActionLoading}
                            placeholder="Deskripsi (opsional)"
                          />
                        </div>
                      ) : (
                        <div className="min-w-0 flex-1">
                          <p className="text-body-sm font-semibold text-foreground flex items-center gap-2">
                            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold">
                              {chapter.orderIndex}
                            </span>
                            {chapter.title}
                          </p>
                          {chapter.description && (
                            <p className="text-body-xs text-muted-foreground mt-0.5 ml-7">{chapter.description}</p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 shrink-0">
                        {editingChapterId === chapter.id ? (
                          <>
                            <Button size="xs" variant="ghost" onClick={() => handleSaveChapter(chapter.id)} disabled={chapterActionLoading} title="Simpan">
                              <Check className="size-4 text-status-success" />
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => setEditingChapterId(null)} disabled={chapterActionLoading} title="Batal">
                              <X className="size-4 text-muted-foreground" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="xs" variant="ghost" onClick={() => startEditChapter(chapter)} disabled={chapterActionLoading} title="Edit">
                              <Edit className="size-4" />
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => handleDeleteChapter(chapter.id)} disabled={chapterActionLoading} title="Hapus">
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Chapter Form */}
            <div className="border border-border/80 rounded-xl p-4 bg-muted/5">
              <h3 className="font-heading text-body-sm font-bold text-foreground mb-3 flex items-center gap-1.5">
                <Plus className="size-4 text-brand-secondary" />
                Tambah Bab Baru
              </h3>
              <div className="grid gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground">JUDUL BAB</label>
                    <Input
                      placeholder="Contoh: Limit dan Kekontinuan"
                      value={newChapterForm.title}
                      onChange={(e) => setNewChapterForm(p => ({ ...p, title: e.target.value }))}
                      disabled={chapterActionLoading}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground">DESKRIPSI (OPSIONAL)</label>
                    <Input
                      placeholder="Contoh: Konsep dasar limit fungsi satu variabel"
                      value={newChapterForm.description}
                      onChange={(e) => setNewChapterForm(p => ({ ...p, description: e.target.value }))}
                      disabled={chapterActionLoading}
                    />
                  </div>
                </div>
                <Button 
                  size="sm"
                  className="w-fit self-end mt-2 rounded-lg font-semibold bg-gradient-to-r from-brand-secondary to-brand-secondary/90 text-white" 
                  onClick={() => handleSaveChapter(null)}
                  disabled={chapterActionLoading || !newChapterForm.title.trim()}
                >
                  {chapterActionLoading ? "Menambahkan..." : "Tambah Bab"}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Tutup</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
