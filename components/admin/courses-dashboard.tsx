"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";
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
import { CoursePricingFields, pricingCategoryLabel, pricingFields, pricingFromFields } from "@/components/admin/course-pricing-fields";
import type { CoursePricing } from "@/lib/student/course-pricing";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type CourseWithStats = {
  id: string;
  title: string;
  category: string;
  description?: string | null;
  pricing?: CoursePricing;
  chapterCount: number;
  materialCount: number;
  quizCount: number;
};

type Props = {
  initialCourses: CourseWithStats[];
};

export function CoursesDashboard({ initialCourses }: Props) {
  const t = useTranslations("adminAcademic");
  const router = useRouter();
  const courses = initialCourses;
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");

  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<string>("");
  const [newDescription, setNewDescription] = useState("");
  const [newPricing, setNewPricing] = useState(() => pricingFields());
  const [createLoading, setCreateLoading] = useState(false);

  // Edit Modal State
  const [editingCourse, setEditingCourse] = useState<CourseWithStats | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPricing, setEditPricing] = useState(() => pricingFields());
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
      toast.error(t("courses.validation.id"));
      return;
    }
    if (!cleanTitle) {
      toast.error(t("courses.validation.title"));
      return;
    }
    if (!newCategory) {
      toast.error(t("courses.validation.category"));
      return;
    }

    let pricing: CoursePricing;
    try { pricing = pricingFromFields(newPricing); } catch { toast.error("Pastikan waktu mulai dan akhir WIB valid, dan waktu akhir setelah waktu mulai."); return; }
    setCreateLoading(true);
    const res = await saveCourse(
      cleanId,
      cleanTitle,
      newCategory,
      newDescription.trim() || null,
      true,
      pricing
    );
    setCreateLoading(false);

    if (res.success) {
      toast.success(t("courses.success.create", { title: cleanTitle }));
      setCreateModalOpen(false);
      setNewId("");
      setNewTitle("");
      setNewCategory("");
      setNewDescription("");
      setNewPricing(pricingFields());
      router.refresh();
    } else {
      toast.error(res.error || t("courses.errors.create"));
    }
  };

  const startEditCourse = (c: CourseWithStats, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingCourse(c);
    setEditTitle(c.title);
    setEditCategory(c.category);
    setEditDescription(c.description || "");
    setEditPricing(pricingFields(c.pricing));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse || !editTitle.trim() || !editCategory) {
      toast.error(t("courses.validation.required"));
      return;
    }

    let pricing: CoursePricing;
    try { pricing = pricingFromFields(editPricing); } catch { toast.error("Pastikan waktu mulai dan akhir WIB valid, dan waktu akhir setelah waktu mulai."); return; }
    setEditLoading(true);
    const res = await saveCourse(
      editingCourse.id,
      editTitle.trim(),
      editCategory,
      editDescription.trim() || null,
      false,
      pricing
    );
    setEditLoading(false);

    if (res.success) {
      toast.success(t("courses.success.update"));
      setEditingCourse(null);
      router.refresh();
    } else {
      toast.error(res.error || t("courses.errors.update"));
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
      toast.success(t("courses.success.delete"));
      router.refresh();
    } else {
      toast.error(t("courses.errors.delete"));
    }
  };

  return (
    <div className="space-y-4">
      {/* Search, Filter, and View Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[140px]">
          <SearchBar
            size="sm"
            placeholder={t("courses.search")}
            value={search}
            onSearch={setSearch}
            onClear={() => setSearch("")}
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px] sm:w-[170px] shrink-0 h-9 rounded-lg">
            <SelectValue placeholder={t("courses.allWithCount", { count: courses.length })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("courses.allWithCount", { count: courses.length })}</SelectItem>
            {uniqueCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* View mode toggle */}
        <div className="flex shrink-0 items-center gap-0.5 bg-muted/50 p-0.5 rounded-lg border border-border/50">
          <Button
            type="button"
            size="icon"
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            className="size-7 rounded-md"
            onClick={() => setViewMode("grid")}
            aria-pressed={viewMode === "grid"}
            aria-label={t("courses.cardView")}
            title={t("courses.cardView")}
          >
            <LayoutGrid className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={viewMode === "table" ? "secondary" : "ghost"}
            className="size-7 rounded-md"
            onClick={() => setViewMode("table")}
            aria-pressed={viewMode === "table"}
            aria-label={t("courses.tableView")}
            title={t("courses.tableView")}
          >
            <List className="size-3.5" />
          </Button>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setCreateModalOpen(true)}
                size="icon"
                className="size-9 shrink-0 rounded-lg"
                aria-label={t("courses.add")}
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{t("courses.add")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Course Items Display */}
      {filteredCourses.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl bg-card">
          <BookOpen className="size-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="font-heading text-body-sm font-semibold text-foreground">
            {t("courses.empty.title")}
          </p>
          <p className="text-body-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {search || categoryFilter !== "all"
              ? t("courses.empty.filtered")
              : t("courses.empty.first")}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredCourses.map((c) => (
            <div
              key={c.id}
              className="group rounded-xl border border-border bg-card p-3 hover:border-brand-primary/50 transition-colors flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Badge
                    variant="outline"
                    className="font-mono text-body-xs font-bold rounded-md bg-muted/40 uppercase tracking-wider px-2 py-0.5"
                  >
                    {c.id}
                  </Badge>
                    <Badge variant="secondary" className="text-body-xs rounded-md font-medium px-2 py-0.5">
                    {c.category}
                  </Badge>
                </div>

                <div>
                  <h3 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors">
                    {c.title}
                  </h3>
                  <span className="text-body-xs text-muted-foreground">{pricingCategoryLabel(c.pricing)}</span>
                </div>

                {/* Counters */}
                <div className="grid grid-cols-3 gap-1.5 py-1.5 border-y border-border/50 text-center">
                  <div className="p-1">
                    <p className="text-body-xs font-bold text-foreground">{c.chapterCount}</p>
                    <p className="text-body-2xs text-muted-foreground">{t("courses.chapterCount")}</p>
                  </div>
                  <div className="p-1">
                    <p className="text-body-xs font-bold text-foreground">{c.materialCount}</p>
                    <p className="text-body-2xs text-muted-foreground">PDF</p>
                  </div>
                  <div className="p-1">
                    <p className="text-body-xs font-bold text-foreground">{c.quizCount}</p>
                    <p className="text-body-2xs text-muted-foreground">{t("courses.quizCount")}</p>
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={(e) => startEditCourse(c, e)}
                    aria-label={t("courses.edit")}
                    title={t("courses.edit")}
                  >
                    <Edit2 className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => startDeleteCourse(c, e)}
                    aria-label={t("courses.delete")}
                    title={t("courses.delete")}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                <Link href={`/admin/courses/${c.id}`}>
                  <Button size="sm" className="gap-1.5 rounded-lg text-body-sm font-medium h-8 px-2.5">
                    <span>{t("courses.manage")}</span>
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
                <th className="px-3.5 py-2.5">{t("courses.name")}</th>
                <th className="px-3.5 py-2.5">{t("courses.category")}</th>
                <th className="px-3.5 py-2.5 text-center">{t("courses.syllabus")}</th>
                <th className="px-3.5 py-2.5 text-center">{t("courses.pdfMaterials")}</th>
                <th className="px-3.5 py-2.5 text-center">{t("courses.quizCount")}</th>
                <th className="px-3.5 py-2.5 text-right">{t("courses.actions")}</th>
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
                    <span className="text-body-xs text-muted-foreground">{pricingCategoryLabel(c.pricing)}</span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Badge variant="secondary" className="rounded-md text-body-2xs font-medium px-1.5 py-0.5">
                      {c.category}
                    </Badge>
                  </td>
                  <td className="px-3.5 py-2.5 text-center font-medium text-foreground">
                    {t("courses.chaptersWithCount", { count: c.chapterCount })}
                  </td>
                  <td className="px-3.5 py-2.5 text-center font-medium text-foreground">
                    {c.materialCount} PDF
                  </td>
                  <td className="px-3.5 py-2.5 text-center font-medium text-foreground">
                    {t("courses.quizzesWithCount", { count: c.quizCount })}
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                        onClick={(e) => startEditCourse(c, e)}
                        aria-label={t("courses.edit")}
                        title={t("courses.edit")}
                      >
                        <Edit2 className="size-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => startDeleteCourse(c, e)}
                        aria-label={t("courses.delete")}
                        title={t("courses.delete")}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                      <Link href={`/admin/courses/${c.id}`}>
                        <Button size="sm" className="gap-1 rounded-lg text-body-sm font-medium h-8 px-2.5">
                          <span>{t("courses.manage")}</span>
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
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("courses.addTitle")}</DialogTitle>

          </DialogHeader>

          <form onSubmit={handleCreateCourse} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">{t("courses.idLabel")}</Label>
              <Input
                placeholder={t("courses.idPlaceholder")}
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                disabled={createLoading}
                className="rounded-lg font-mono"
              />
              <p className="text-body-xs text-muted-foreground">
                {t("courses.idHint")}
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">{t("courses.name")}</Label>
              <Input
                placeholder={t("courses.namePlaceholder")}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={createLoading}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">{t("courses.category")}</Label>
              <Select value={newCategory} onValueChange={setNewCategory} disabled={createLoading}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue placeholder={t("courses.categoryPlaceholder")} />
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

            <CoursePricingFields id="create" value={newPricing} onChange={setNewPricing} disabled={createLoading} />
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">{t("courses.descriptionOptional")}</Label>
              <Textarea
                rows={3}
                placeholder={t("courses.descriptionPlaceholder")}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                disabled={createLoading}
                className="rounded-lg"
              />
            </div>

            <DialogFooter className="pt-2">
              <DialogClose asChild>
                <Button variant="outline" size="sm" disabled={createLoading} className="rounded-lg">
                  {t("common.cancel")}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                size="sm"
                disabled={createLoading || !newId.trim() || !newTitle.trim() || !newCategory}
                isLoading={createLoading}
                className="rounded-lg"
              >
                {t("courses.add")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Course Dialog */}
      <Dialog open={!!editingCourse} onOpenChange={(open) => !open && setEditingCourse(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("courses.editTitle", { id: editingCourse?.id ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("courses.editDescription")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">{t("courses.name")}</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={editLoading}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">{t("courses.category")}</Label>
              <Select value={editCategory} onValueChange={setEditCategory} disabled={editLoading}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue placeholder={t("courses.categoryPlaceholder")} />
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

            <CoursePricingFields id="edit" value={editPricing} onChange={setEditPricing} disabled={editLoading} />
            <div className="space-y-1">
              <Label className="text-body-sm font-semibold text-foreground">{t("courses.descriptionOptional")}</Label>
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
                  {t("common.cancel")}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                size="sm"
                disabled={editLoading || !editTitle.trim() || !editCategory}
                isLoading={editLoading}
                className="rounded-lg"
              >
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Course Dialog */}
      <Dialog
        open={!!deletingCourse}
        onOpenChange={(open) => {
          if (!deleteLoading && !open) setDeletingCourse(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("courses.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t.rich("courses.deleteDescription", {
                title: deletingCourse?.title ?? "",
                id: deletingCourse?.id ?? "",
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={deleteLoading} className="rounded-lg">
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={deleteLoading}
              isLoading={deleteLoading}
              className="rounded-lg"
            >
              {t("courses.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
