"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  saveCourse,
  deleteCourse,
} from "@/app/(admin)/admin/(academic)/courses/actions";
import { allowedCategories } from "@/app/(admin)/admin/(academic)/courses/constants";
import {
  Plus,
  ArrowRight,
  Edit2,
  Trash2,
  LayoutGrid,
  List,
  BookOpen,
} from "lucide-react";
import { SearchBar } from "@/components/ui/search-bar";

export type CourseWithStats = {
  id: string;
  title: string;
  category: string;
  description?: string | null;
  chapterCount: number;
  materialCount: number;
  quizCount: number;
};

type Props = {
  initialCourses: CourseWithStats[];
};

export function CoursesDashboard({ initialCourses }: Props) {
  const router = useRouter();
  const [courses] = useState<CourseWithStats[]>(initialCourses);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<string>("");
  const [newDescription, setNewDescription] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Edit Modal State
  const [editingCourse, setEditingCourse] = useState<CourseWithStats | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Delete Dialog State
  const [deletingCourse, setDeletingCourse] = useState<CourseWithStats | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Filter courses
  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      const matchSearch =
        !search ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.id.toLowerCase().includes(search.toLowerCase()) ||
        (c.description && c.description.toLowerCase().includes(search.toLowerCase()));
      const matchCat = categoryFilter === "all" || c.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [courses, search, categoryFilter]);

  // Unique categories list
  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(courses.map((c) => c.category))).filter(Boolean);
  }, [courses]);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newId.trim().toLowerCase();
    const cleanTitle = newTitle.trim();

    if (!cleanId || !/^[a-z0-9-]+$/.test(cleanId)) {
      toast.error("ID Mata Kuliah harus alfanumerik huruf kecil dan tanda strip (contoh: ma1101).");
      return;
    }
    if (!cleanTitle) {
      toast.error("Nama mata kuliah wajib diisi.");
      return;
    }
    if (!newCategory) {
      toast.error("Program studi / kategori wajib dipilih.");
      return;
    }

    setCreateLoading(true);
    const res = await saveCourse(
      cleanId,
      cleanTitle,
      newCategory,
      newDescription.trim() || null,
      true
    );
    setCreateLoading(false);

    if (res.success) {
      toast.success(`Mata kuliah ${cleanTitle} berhasil ditambahkan.`);
      setCreateModalOpen(false);
      setNewId("");
      setNewTitle("");
      setNewCategory("");
      setNewDescription("");
      router.refresh();
    } else {
      toast.error(res.error || "Gagal menambahkan mata kuliah.");
    }
  };

  const startEditCourse = (c: CourseWithStats, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingCourse(c);
    setEditTitle(c.title);
    setEditCategory(c.category);
    setEditDescription(c.description || "");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse || !editTitle.trim() || !editCategory) {
      toast.error("Semua field wajib diisi.");
      return;
    }

    setEditLoading(true);
    const res = await saveCourse(
      editingCourse.id,
      editTitle.trim(),
      editCategory,
      editDescription.trim() || null,
      false
    );
    setEditLoading(false);

    if (res.success) {
      toast.success("Informasi mata kuliah diperbarui.");
      setEditingCourse(null);
      router.refresh();
    } else {
      toast.error(res.error || "Gagal memperbarui mata kuliah.");
    }
  };

  const startDeleteCourse = (c: CourseWithStats, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDeletingCourse(c);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCourse) return;
    setDeleteLoading(true);
    const res = await deleteCourse(deletingCourse.id);
    setDeleteLoading(false);
    setDeletingCourse(null);

    if (res.success) {
      toast.success("Mata kuliah berhasil dihapus.");
      router.refresh();
    } else {
      toast.error(res.error || "Gagal menghapus mata kuliah.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Search, Filter, and View Controls */}
      <div className="rounded-xl border border-border bg-card p-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex-1 max-w-md">
            <SearchBar
              size="sm"
              placeholder="Cari mata kuliah atau kode slug..."
              value={search}
              onSearch={setSearch}
              onClear={() => setSearch("")}
            />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[200px] h-9 text-body-xs rounded-lg">
              <SelectValue placeholder="Semua Program Studi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Program Studi ({courses.length})</SelectItem>
              {uniqueCategories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2">
          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 bg-muted/50 p-0.5 rounded-lg border border-border/50">
            <Button
              type="button"
              size="icon"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              className="size-7 rounded-md"
              onClick={() => setViewMode("grid")}
              title="Tampilan Kartu"
            >
              <LayoutGrid className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={viewMode === "table" ? "secondary" : "ghost"}
              className="size-7 rounded-md"
              onClick={() => setViewMode("table")}
              title="Tampilan Tabel"
            >
              <List className="size-3.5" />
            </Button>
          </div>

          <Button
            onClick={() => setCreateModalOpen(true)}
            size="sm"
            className="gap-1.5 rounded-lg text-body-xs font-semibold h-9"
          >
            <Plus className="size-3.5" />
            Tambah Mata Kuliah
          </Button>
        </div>
      </div>

      {/* Course Items Display */}
      {filteredCourses.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl bg-card">
          <BookOpen className="size-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="font-heading text-body-sm font-semibold text-foreground">
            Tidak ada mata kuliah ditemukan
          </p>
          <p className="text-body-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {search || categoryFilter !== "all"
              ? "Coba sesuaikan kata kunci pencarian atau filter program studi Anda."
              : "Belum ada mata kuliah yang terdaftar di Zyx Academy. Klik tombol 'Tambah Mata Kuliah' untuk memulai."}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredCourses.map((c) => (
            <div
              key={c.id}
              className="group rounded-xl border border-border/80 bg-card p-4 shadow-2xs hover:border-brand-primary/50 hover:shadow-xs transition-all flex flex-col justify-between"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <Badge
                    variant="outline"
                    className="font-mono text-[11px] font-bold rounded-md bg-muted/40 uppercase tracking-wider px-2 py-0.5"
                  >
                    {c.id}
                  </Badge>
                  <Badge variant="secondary" className="text-[11px] rounded-md font-medium px-2 py-0.5">
                    {c.category}
                  </Badge>
                </div>

                <div>
                  <h3 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors line-clamp-1">
                    {c.title}
                  </h3>
                  {c.description ? (
                    <p className="text-body-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {c.description}
                    </p>
                  ) : (
                    <p className="text-body-xs text-muted-foreground/50 italic mt-0.5">
                      Belum ada deskripsi mata kuliah.
                    </p>
                  )}
                </div>

                {/* Counters */}
                <div className="grid grid-cols-3 gap-1.5 py-1.5 border-y border-border/50 text-center">
                  <div className="p-1 rounded-md bg-muted/20">
                    <p className="text-body-xs font-bold text-foreground">{c.chapterCount}</p>
                    <p className="text-[10px] text-muted-foreground">Bab</p>
                  </div>
                  <div className="p-1 rounded-md bg-muted/20">
                    <p className="text-body-xs font-bold text-foreground">{c.materialCount}</p>
                    <p className="text-[10px] text-muted-foreground">PDF</p>
                  </div>
                  <div className="p-1 rounded-md bg-muted/20">
                    <p className="text-body-xs font-bold text-foreground">{c.quizCount}</p>
                    <p className="text-[10px] text-muted-foreground">Kuis</p>
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-3 mt-1 border-t border-border/40">
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={(e) => startEditCourse(c, e)}
                    title="Edit Metadata"
                  >
                    <Edit2 className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => startDeleteCourse(c, e)}
                    title="Hapus Mata Kuliah"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                <Link href={`/admin/courses/${c.id}`}>
                  <Button size="sm" className="gap-1.5 rounded-lg text-body-xs font-medium h-7 px-2.5">
                    <span>Kelola</span>
                    <ArrowRight className="size-3" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-x-auto">
          <table className="w-full text-left text-body-xs">
            <thead className="bg-muted text-body-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3.5 py-2.5">ID</th>
                <th className="px-3.5 py-2.5">Nama Mata Kuliah</th>
                <th className="px-3.5 py-2.5">Program Studi</th>
                <th className="px-3.5 py-2.5 text-center">Silabus</th>
                <th className="px-3.5 py-2.5 text-center">Materi PDF</th>
                <th className="px-3.5 py-2.5 text-center">Kuis</th>
                <th className="px-3.5 py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredCourses.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-2.5 font-mono font-bold text-foreground">
                    {c.id}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <p className="font-semibold text-foreground">{c.title}</p>
                    {c.description && (
                      <p className="text-[11px] text-muted-foreground truncate max-w-xs">
                        {c.description}
                      </p>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Badge variant="secondary" className="rounded-md text-[10px] font-medium px-1.5 py-0.5">
                      {c.category}
                    </Badge>
                  </td>
                  <td className="px-3.5 py-2.5 text-center font-medium text-foreground">
                    {c.chapterCount} Bab
                  </td>
                  <td className="px-3.5 py-2.5 text-center font-medium text-foreground">
                    {c.materialCount} PDF
                  </td>
                  <td className="px-3.5 py-2.5 text-center font-medium text-foreground">
                    {c.quizCount} Kuis
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                        onClick={(e) => startEditCourse(c, e)}
                        title="Edit Metadata"
                      >
                        <Edit2 className="size-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => startDeleteCourse(c, e)}
                        title="Hapus Mata Kuliah"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                      <Link href={`/admin/courses/${c.id}`}>
                        <Button size="sm" className="gap-1 rounded-lg text-body-xs font-medium h-7 px-2.5">
                          <span>Kelola</span>
                          <ArrowRight className="size-3" />
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Course Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Mata Kuliah Baru</DialogTitle>
            <DialogDescription>
              Daftarkan mata kuliah baru ke kurikulum Zyx Academy.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCourse} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">ID / Slug Mata Kuliah</Label>
              <Input
                placeholder="Contoh: ma1101 atau fi1101"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                disabled={createLoading}
                className="rounded-lg font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Gunakan huruf kecil dan angka tanpa spasi.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Nama Mata Kuliah</Label>
              <Input
                placeholder="Contoh: Matematika IA"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={createLoading}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Program Studi / Kategori</Label>
              <Select value={newCategory} onValueChange={setNewCategory} disabled={createLoading}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue placeholder="Pilih Program Studi" />
                </SelectTrigger>
                <SelectContent>
                  {allowedCategories.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Deskripsi (Opsional)</Label>
              <Textarea
                rows={3}
                placeholder="Ringkasan mata kuliah..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                disabled={createLoading}
                className="rounded-lg"
              />
            </div>

            <DialogFooter className="pt-2">
              <DialogClose asChild>
                <Button variant="outline" size="sm" disabled={createLoading} className="rounded-lg">
                  Batal
                </Button>
              </DialogClose>
              <Button
                type="submit"
                size="sm"
                disabled={createLoading || !newId.trim() || !newTitle.trim() || !newCategory}
                className="rounded-lg"
              >
                {createLoading ? "Menyimpan..." : "Tambah Mata Kuliah"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Course Dialog */}
      <Dialog open={!!editingCourse} onOpenChange={(open) => !open && setEditingCourse(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Mata Kuliah: {editingCourse?.id}</DialogTitle>
            <DialogDescription>
              Perbarui judul, kategori, atau deskripsi mata kuliah.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Nama Mata Kuliah</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={editLoading}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Program Studi / Kategori</Label>
              <Select value={editCategory} onValueChange={setEditCategory} disabled={editLoading}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue placeholder="Pilih Program Studi" />
                </SelectTrigger>
                <SelectContent>
                  {allowedCategories.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">Deskripsi (Opsional)</Label>
              <Textarea
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={editLoading}
                className="rounded-lg"
              />
            </div>

            <DialogFooter className="pt-2">
              <DialogClose asChild>
                <Button variant="outline" size="sm" disabled={editLoading} className="rounded-lg">
                  Batal
                </Button>
              </DialogClose>
              <Button
                type="submit"
                size="sm"
                disabled={editLoading || !editTitle.trim() || !editCategory}
                className="rounded-lg"
              >
                {editLoading ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Course Dialog */}
      <Dialog open={!!deletingCourse} onOpenChange={(open) => !open && setDeletingCourse(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Mata Kuliah</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus mata kuliah <strong>{deletingCourse?.title}</strong> ({deletingCourse?.id})? Tindakan ini permanen dan akan menghapus seluruh data bab dan materi terkait.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={deleteLoading} className="rounded-lg">
                Batal
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={deleteLoading}
              className="rounded-lg"
            >
              {deleteLoading ? "Menghapus..." : "Hapus Mata Kuliah"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
