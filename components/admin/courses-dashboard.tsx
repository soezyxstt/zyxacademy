"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";
import { toast } from "@/components/ui/toast";
import { hapticMedium, hapticSelection } from "@/lib/native/haptics";
import { Button } from "@/components/ui/button";
import { AdminIconAction } from "@/components/admin/icon-action";
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
  MoreHorizontal,
} from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { SearchBar } from "@/components/ui/search-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    <div className="@container/courses min-w-0 space-y-(--related-gap)">
      {/* Search, Filter, and View Controls */}
      <div className="flex flex-wrap items-center gap-2 max-sm:[&:has(>[data-search-expanded=true])>:not([data-search-expanded=true]):not([data-active-filter])]:hidden">
        <SearchBar
          collapsible
          size="sm"
          containerClassName="min-w-[140px]"
          placeholder={t("courses.search")}
          value={search}
          onSearch={setSearch}
          onClear={() => setSearch("")}
        />

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger
            variant="inline"
            aria-label={t("courses.category")}
            data-active-filter={categoryFilter === "all" ? undefined : ""}
            className="max-w-44 shrink-0"
          >
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

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-muted/40">
            <AdminIconAction
              label={t("courses.cardView")}
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              onClick={() => { if (viewMode !== "grid") { void hapticSelection(); setViewMode("grid"); } }}
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid className="size-4" />
            </AdminIconAction>
            <AdminIconAction
              label={t("courses.tableView")}
              variant={viewMode === "table" ? "secondary" : "ghost"}
              onClick={() => { if (viewMode !== "table") { void hapticSelection(); setViewMode("table"); } }}
              aria-pressed={viewMode === "table"}
            >
              <List className="size-4" />
            </AdminIconAction>
          </div>
          <AdminIconAction label={t("courses.add")} onClick={() => setCreateModalOpen(true)}>
            <Plus className="size-4" />
          </AdminIconAction>
        </div>
      </div>

      {/* Course Items Display */}
      {filteredCourses.length === 0 ? (
        <AdminEmptyState
          icon={BookOpen}
          title={t("courses.empty.title")}
          description={search || categoryFilter !== "all" ? t("courses.empty.filtered") : t("courses.empty.first")}
        />
      ) : viewMode === "grid" ? (
        /* Grid View */
        <div className="grid grid-cols-1 gap-x-(--related-gap) divide-y divide-border/60 border-y border-border/60 @min-[32rem]/courses:grid-cols-2 @min-[32rem]/courses:divide-y-0 @min-[49rem]/courses:grid-cols-3">
          {filteredCourses.map((c) => (
            <div
              key={c.id}
              className="flex min-w-0 items-start justify-between gap-2 py-(--row-padding) @min-[32rem]/courses:border-b @min-[32rem]/courses:border-border/60"
            >
              <div className="min-w-0 space-y-1">
                <h3 className="wrap-break-word font-heading text-body-sm font-bold">
                  <Link href={`/admin/courses/${c.id}`} onClick={() => void hapticMedium()} className="text-foreground hover:underline">
                    {c.title}
                  </Link>
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 break-words font-mono text-body-xs font-bold text-foreground">{c.id}</span>
                  <Badge variant="secondary" className="min-w-0 whitespace-normal break-words rounded-md px-1.5 py-0.5 text-body-xs font-medium">
                    {c.category}
                  </Badge>
                  <span className="text-body-xs text-muted-foreground">{pricingCategoryLabel(c.pricing)}</span>
                </div>
                <p className="text-body-xs text-muted-foreground">
                  {t("courses.chaptersWithCount", { count: c.chapterCount })} · {c.materialCount} PDF · {t("courses.quizzesWithCount", { count: c.quizCount })}
                </p>
              </div>
              <DropdownMenu>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon-lg"
                          variant="ghost"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={t("courses.actions")}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{t("courses.actions")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem asChild>
                    <Link href={`/admin/courses/${c.id}`} onClick={() => void hapticMedium()}>
                      <ArrowRight className="size-4 text-muted-foreground" />
                      <span>{t("courses.manage")}</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={(e) => startEditCourse(c, e as unknown as React.MouseEvent)}>
                    <Edit2 className="size-4 text-muted-foreground" />
                    <span>{t("courses.edit")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => startDeleteCourse(c, e as unknown as React.MouseEvent)}
                    className="text-status-error focus:text-status-error"
                  >
                    <Trash2 className="size-4" />
                    <span>{t("courses.delete")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      ) : (
        /* Table View (vertical list on mobile, full table on md+) */
        <>
          <div className="divide-y divide-border/60 border-y border-border/60 md:hidden">
            {filteredCourses.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 py-(--row-padding)">
                <div className="min-w-0 flex-1 space-y-1">
                  <Link href={`/admin/courses/${c.id}`} onClick={() => void hapticMedium()} className="block wrap-break-word font-heading text-body-sm font-bold text-foreground hover:underline">
                    {c.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-body-xs font-bold text-foreground">{c.id}</span>
                    <Badge variant="secondary" className="rounded-md text-body-2xs font-medium px-1.5 py-0.5">
                      {c.category}
                    </Badge>
                    <span className="text-body-xs text-muted-foreground">{pricingCategoryLabel(c.pricing)}</span>
                  </div>
                  <p className="text-body-xs text-muted-foreground">
                    {t("courses.chaptersWithCount", { count: c.chapterCount })} · {c.materialCount} PDF · {t("courses.quizzesWithCount", { count: c.quizCount })}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label={t("courses.actions")}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/courses/${c.id}`} onClick={() => void hapticMedium()}>
                        <ArrowRight className="size-4 text-muted-foreground" />
                        <span>{t("courses.manage")}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => startEditCourse(c, e as unknown as React.MouseEvent)}>
                      <Edit2 className="size-4 text-muted-foreground" />
                      <span>{t("courses.edit")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(e) => startDeleteCourse(c, e as unknown as React.MouseEvent)}
                      className="text-status-error focus:text-status-error"
                    >
                      <Trash2 className="size-4" />
                      <span>{t("courses.delete")}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>

          <AdminTable className="hidden md:block">
            <table className="w-full text-left text-body-xs">
            <AdminTableHead>
              <tr>
                <th className="px-3.5 py-2.5">ID</th>
                <th className="px-3.5 py-2.5">{t("courses.name")}</th>
                <th className="px-3.5 py-2.5">{t("courses.category")}</th>
                <th className="px-3.5 py-2.5 text-center">{t("courses.syllabus")}</th>
                <th className="px-3.5 py-2.5 text-center">{t("courses.pdfMaterials")}</th>
                <th className="px-3.5 py-2.5 text-center">{t("courses.quizCount")}</th>
                <th className="px-3.5 py-2.5 text-right">{t("courses.actions")}</th>
              </tr>
            </AdminTableHead>
            <tbody className="divide-y divide-border/60">
              {filteredCourses.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-2.5 font-mono font-bold text-foreground">
                    {c.id}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Link href={`/admin/courses/${c.id}`} onClick={() => void hapticMedium()} className="font-semibold text-foreground hover:text-primary">
                      {c.title}
                    </Link>
                    <span className="block text-body-xs text-muted-foreground">{pricingCategoryLabel(c.pricing)}</span>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                          aria-label={t("courses.actions")}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/courses/${c.id}`} onClick={() => void hapticMedium()}>
                            <ArrowRight className="size-4 text-muted-foreground" />
                            <span>{t("courses.manage")}</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => startEditCourse(c, e as unknown as React.MouseEvent)}>
                          <Edit2 className="size-4 text-muted-foreground" />
                          <span>{t("courses.edit")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={(e) => startDeleteCourse(c, e as unknown as React.MouseEvent)}
                          className="text-status-error focus:text-status-error"
                        >
                          <Trash2 className="size-4" />
                          <span>{t("courses.delete")}</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </AdminTable>
        </>
      )}

      {/* Create Course Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("courses.addTitle")}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateCourse} className="space-y-(--compact-gap)">
            <div className="space-y-1">
              <Label htmlFor="course-new-id" className="text-body-sm font-semibold text-foreground">{t("courses.idLabel")}</Label>
              <Input
                id="course-new-id"
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
              <Label htmlFor="course-new-title" className="text-body-sm font-semibold text-foreground">{t("courses.name")}</Label>
              <Input
                id="course-new-title"
                placeholder={t("courses.namePlaceholder")}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={createLoading}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="course-new-category" className="text-body-sm font-semibold text-foreground">{t("courses.category")}</Label>
              <Select value={newCategory} onValueChange={setNewCategory} disabled={createLoading}>
                <SelectTrigger id="course-new-category" className="h-9 bg-muted/35">
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
              <Label htmlFor="course-new-description" className="text-body-sm font-semibold text-foreground">{t("courses.descriptionOptional")}</Label>
              <Textarea
                id="course-new-description"
                rows={3}
                placeholder={t("courses.descriptionPlaceholder")}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                disabled={createLoading}
                className="rounded-lg"
              />
            </div>

            <DialogFooter className="flex-row flex-wrap justify-end pt-2">
              <DialogClose asChild>
                <Button variant="ghost" size="lg" disabled={createLoading} className="rounded-lg">
                  {t("common.cancel")}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                size="lg"
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

          <form onSubmit={handleSaveEdit} className="space-y-(--compact-gap)">
            <div className="space-y-1">
              <Label htmlFor="course-edit-title" className="text-body-sm font-semibold text-foreground">{t("courses.name")}</Label>
              <Input
                id="course-edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={editLoading}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="course-edit-category" className="text-body-sm font-semibold text-foreground">{t("courses.category")}</Label>
              <Select value={editCategory} onValueChange={setEditCategory} disabled={editLoading}>
                <SelectTrigger id="course-edit-category" className="h-9 bg-muted/35">
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
              <Label htmlFor="course-edit-description" className="text-body-sm font-semibold text-foreground">{t("courses.descriptionOptional")}</Label>
              <Textarea
                id="course-edit-description"
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={editLoading}
                className="rounded-lg"
              />
            </div>

            <DialogFooter className="flex-row flex-wrap justify-end pt-2">
              <DialogClose asChild>
                <Button variant="ghost" size="lg" disabled={editLoading} className="rounded-lg">
                  {t("common.cancel")}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                size="lg"
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

      <AdminConfirmDialog
        open={!!deletingCourse}
        onOpenChange={(open) => {
          if (!deleteLoading && !open) setDeletingCourse(null);
        }}
        title={t("courses.deleteTitle")}
        description={t.rich("courses.deleteDescription", {
          title: deletingCourse?.title ?? "",
          id: deletingCourse?.id ?? "",
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
        confirmLabel={t("courses.delete")}
        cancelLabel={t("common.cancel")}
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
