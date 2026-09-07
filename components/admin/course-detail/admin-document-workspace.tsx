"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  Eye,
  FileText,
  Globe,
  Loader2,
  Menu,
  PanelRight,
  PanelRightClose,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  ExternalLink,
} from "lucide-react";
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
import { toast } from "@/components/ui/toast";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { MaterialViewer } from "@/components/course/material-viewer";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import {
  deleteCourseMaterial,
  updateCourseMaterial,
  updateDocumentStatusAction,
  updateArticleContentAction,
} from "@/app/(admin)/admin/(academic)/courses/actions";
import {
  LEVEL1_CATEGORIES,
  getSubcategoriesForLevel1,
  type MaterialLevel1Category,
  type CourseMaterialSubcategory,
} from "@/lib/course-materials";
import { standardizeDocumentTitle } from "@/lib/course-batch-upload";
import type { CourseMaterial } from "@/lib/student-course-fixtures";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import type { AdminMaterialSource } from "@/lib/admin/course-material-preview";
import { cn } from "@/lib/utils";

type Chapter = {
  id: string;
  courseId?: string;
  title: string;
  orderIndex: number;
  legacyChapterId?: string | null;
};

type Props = {
  courseSlug: string;
  courseTitle: string;
  courseId: string;
  materialId: string;
  source: AdminMaterialSource;
  material: CourseMaterial;
  article?: PublicArticleReadModel | null;
  chapters: Chapter[];
  initialMode?: "preview" | "edit";
};

export function AdminDocumentWorkspace({
  courseSlug,
  courseTitle,
  courseId,
  materialId,
  source,
  material,
  article,
  chapters,
  initialMode = "preview",
}: Props) {
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<"preview" | "edit">(initialMode);
  const [status, setStatus] = useState<"draft" | "published">(
    material.status === "draft" ? "draft" : "published"
  );
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  // PDF Form State
  const [pdfTitle, setPdfTitle] = useState(material.title);
  const [pdfType, setPdfType] = useState<MaterialLevel1Category>(
    material.docCategory === "solusi"
      ? "pembahasan_soal"
      : material.docCategory === "soal"
      ? "soal"
      : "materi"
  );
  const [pdfSubcategory, setPdfSubcategory] = useState<CourseMaterialSubcategory>(
    (material.subcategory as CourseMaterialSubcategory) || "ppt_dosen"
  );
  const [pdfYear, setPdfYear] = useState<string>(
    material.year ? String(material.year) : ""
  );
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(
    new Set(material.chapterIds || (material.chapterId ? [material.chapterId] : []))
  );

  // Article / Diktat Editor State
  const [articleTitle, setArticleTitle] = useState(material.title);
  const [articleMarkdown, setArticleMarkdown] = useState(material.body || "");
  const [articleBabId, setArticleBabId] = useState<string>(() => {
    const rawId = material.chapterId || "";
    if (!rawId) return "";
    if (chapters.some((c) => c.id === rawId)) return rawId;
    const matched = chapters.find((c) => c.legacyChapterId === rawId);
    return matched ? matched.id : rawId;
  });

  // TOC sidebar and mobile sheet states for preview mode
  const [isTocOpen, setIsTocOpen] = useState(true);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  const documentsHref = `/admin/courses/${encodeURIComponent(courseSlug)}/documents`;
  const reviewHref = `/admin/courses/${encodeURIComponent(courseSlug)}/review?tab=product`;
  const isCanonical = source === "canonical-article" || source === "canonical-diktat";
  const isPdf = source === "legacy-pdf" || material.kind === "pdf";
  const isArticleOrDiktat =
    source === "canonical-article" ||
    source === "canonical-diktat" ||
    source === "legacy-article" ||
    material.kind === "article";

  const handleModeChange = (mode: "preview" | "edit") => {
    setActiveMode(mode);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (mode === "edit") {
        url.searchParams.set("mode", "edit");
      } else {
        url.searchParams.delete("mode");
      }
      window.history.replaceState(null, "", url.toString());
    }
  };

  const availablePdfSubcategories = getSubcategoriesForLevel1(pdfType);

  // Toggle Publish / Draft
  const handleToggleStatus = async () => {
    const nextStatus = status === "published" ? "draft" : "published";
    setStatusUpdating(true);
    try {
      const res = await updateDocumentStatusAction({
        materialId: material.id || materialId,
        source,
        status: nextStatus,
      });
      if (res.success) {
        setStatus(nextStatus);
        toast.success(
          nextStatus === "published"
            ? "Dokumen berhasil dipublikasikan."
            : "Dokumen dikembalikan ke status draf."
        );
        router.refresh();
      } else {
        toast.error(res.error || "Gagal mengubah status dokumen.");
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setStatusUpdating(false);
    }
  };

  // Delete Document
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await deleteCourseMaterial(materialId);
      if (res.success) {
        toast.success("Dokumen berhasil dihapus.");
        router.push(documentsHref);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menghapus dokumen.");
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  // Save PDF Metadata
  const handleSavePdf = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = standardizeDocumentTitle(pdfTitle.trim());
    if (!cleanTitle) {
      toast.error("Judul dokumen wajib diisi.");
      return;
    }
    if (selectedChapters.size === 0) {
      toast.error("Pilih minimal satu bab terkait.");
      return;
    }

    const parsedYear = pdfYear.trim() ? parseInt(pdfYear.trim(), 10) : null;
    if (pdfYear.trim() && (isNaN(parsedYear!) || parsedYear! < 1900 || parsedYear! > 2100)) {
      toast.error("Format tahun tidak valid.");
      return;
    }

    setSaving(true);
    try {
      const res = await updateCourseMaterial(materialId, {
        title: cleanTitle,
        type: pdfType,
        subcategory: pdfSubcategory,
        year: parsedYear,
        chapterIds: Array.from(selectedChapters),
      });

      if (res.success) {
        setPdfTitle(cleanTitle);
        toast.success("Metadata dokumen berhasil diperbarui.");
        router.refresh();
      } else {
        toast.error(res.error || "Gagal memperbarui metadata.");
      }
    } catch {
      toast.error("Terjadi kesalahan saat menyimpan.");
    } finally {
      setSaving(false);
    }
  };

  // Save Article / Diktat Content
  const handleSaveArticle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanTitle = standardizeDocumentTitle(articleTitle.trim());
    if (!cleanTitle) {
      toast.error("Judul dokumen wajib diisi.");
      return;
    }

    setSaving(true);
    try {
      const res = await updateArticleContentAction({
        id: material.id || materialId,
        source,
        title: cleanTitle,
        contentMarkdown: articleMarkdown,
        babId: articleBabId || null,
      });

      if (res.success) {
        setArticleTitle(cleanTitle);
        toast.success("Konten dokumen berhasil disimpan.");
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menyimpan konten.");
      }
    } catch {
      toast.error("Terjadi kesalahan saat menyimpan.");
    } finally {
      setSaving(false);
    }
  };

  const toggleChapter = (chapterId: string) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const handleSelectAllChapters = () => {
    if (selectedChapters.size === chapters.length) {
      setSelectedChapters(new Set());
    } else {
      setSelectedChapters(new Set(chapters.map((c) => c.id)));
    }
  };

  const displayTitle = isPdf ? pdfTitle : articleTitle;

  return (
    <div className="-mt-8 -mb-8 -mx-4 sm:-mx-6 lg:-mx-8 flex flex-col min-h-[calc(100vh+4rem)] bg-background font-sans">
      {/* Top Workspace Bar */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 backdrop-blur-xs px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1 rounded-lg text-body-sm shrink-0">
            <Link href={documentsHref}>
              <ArrowLeft className="size-4" />
              <span>Dokumen</span>
            </Link>
          </Button>

          <div className="h-4 w-px bg-border shrink-0" />

          <div className="min-w-0 flex items-center gap-2">
            <h1 className="truncate font-heading text-body-sm font-semibold text-foreground max-w-[200px] sm:max-w-xs md:max-w-md" title={displayTitle}>
              {displayTitle}
            </h1>
            {isArticleOrDiktat ? (
              <Badge
                variant={status === "published" ? "default" : "secondary"}
                className={cn(
                  "rounded-md px-1.5 py-0 text-body-2xs uppercase tracking-wider font-semibold shrink-0",
                  status === "published"
                    ? "bg-status-success/15 text-status-success border-status-success/30"
                    : "bg-muted text-muted-foreground border-border"
                )}
              >
                {status === "published" ? "Published" : "Draft"}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status Toggle Button (for articles and diktats) */}
          {isArticleOrDiktat ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={statusUpdating}
              onClick={handleToggleStatus}
              className="h-8 gap-1.5 rounded-lg text-body-xs font-medium"
            >
              {statusUpdating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : status === "published" ? (
                <>
                  <FileText className="size-3.5 text-muted-foreground" />
                  <span>Jadikan Draf</span>
                </>
              ) : (
                <>
                  <Globe className="size-3.5 text-status-success" />
                  <span>Publikasikan</span>
                </>
              )}
            </Button>
          ) : null}

          {/* External PDF Link */}
          {material.url ? (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
              title="Buka berkas di tab baru"
            >
              <a href={material.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
              </a>
            </Button>
          ) : null}

          {/* Kelola Lifecycle (for canonical article/diktat) */}
          {isCanonical ? (
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-body-xs font-medium">
              <Link href={reviewHref}>
                <BookOpenCheck className="size-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Kelola Lifecycle</span>
              </Link>
            </Button>
          ) : null}

          {/* TOC Toggles in Header (for preview mode) */}
          {activeMode === "preview" && (isArticleOrDiktat || article) ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsMobileSheetOpen(true)}
                className="h-8 gap-1 rounded-lg text-body-xs font-medium md:hidden"
                title="Daftar Isi"
              >
                <Menu className="size-3.5" />
                <span>Daftar Isi</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsTocOpen((prev) => !prev)}
                className="h-8 gap-1.5 rounded-lg text-body-xs font-medium hidden md:inline-flex"
                title={isTocOpen ? "Sembunyikan Menu" : "Buka Menu"}
              >
                {isTocOpen ? (
                  <PanelRightClose className="size-3.5" />
                ) : (
                  <PanelRight className="size-3.5" />
                )}
                <span>{isTocOpen ? "Sembunyikan Menu" : "Buka Menu"}</span>
              </Button>
            </>
          ) : null}

          {/* Mode Switcher: Pratinjau vs Edit */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
            <Button
              type="button"
              variant={activeMode === "preview" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handleModeChange("preview")}
              className="h-7 gap-1 px-2.5 rounded-md text-body-xs font-medium"
            >
              <Eye className="size-3.5" />
              <span>Pratinjau</span>
            </Button>
            <Button
              type="button"
              variant={activeMode === "edit" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handleModeChange("edit")}
              className="h-7 gap-1 px-2.5 rounded-md text-body-xs font-medium"
            >
              <Pencil className="size-3.5" />
              <span>Edit</span>
            </Button>
          </div>

          {/* Quick Save Button in Header (for articles and diktats in edit mode) */}
          {activeMode === "edit" && !isPdf ? (
            <Button
              type="button"
              onClick={handleSaveArticle}
              disabled={saving || !articleTitle.trim()}
              className="h-8 gap-1.5 rounded-lg text-body-xs font-semibold"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              <span>Simpan</span>
            </Button>
          ) : null}

          {/* Delete Button */}
          {isPdf ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-lg"
              onClick={() => setDeleteConfirmOpen(true)}
              title="Hapus Dokumen"
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 min-h-0">
        {activeMode === "preview" ? (
          /* Preview Mode */
          article ? (
            <StructuredArticleReader
              article={article}
              course={{ id: courseId, title: courseTitle }}
              mode="admin-preview"
              backHref={documentsHref}
              isTocOpen={isTocOpen}
              onToggleToc={() => setIsTocOpen((prev) => !prev)}
              isMobileSheetOpen={isMobileSheetOpen}
              onToggleMobileSheet={setIsMobileSheetOpen}
            />
          ) : (
            <MaterialViewer
              material={material}
              chapterId={material.chapterId}
              course={{ title: courseTitle }}
              mode="admin-preview"
              backHref={documentsHref}
              hideHeader={true}
            />
          )
        ) : (
          /* Edit Mode */
          isPdf ? (
            /* Split Edit Layout for PDF Documents */
            <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[calc(100vh-53px)]">
              {/* Left Panel: Full PDF Preview */}
              <div className="lg:col-span-7 xl:col-span-8 bg-muted/20 border-r border-border min-h-[500px] lg:min-h-full flex flex-col">
                <div className="flex items-center justify-between border-b border-border/70 bg-card/60 px-4 py-2 text-body-xs text-muted-foreground">
                  <span className="font-medium">Pratinjau Berkas PDF</span>
                  {material.url ? (
                    <a
                      href={material.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <span>Tab Baru</span>
                      <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
                <div className="flex-1 w-full min-h-0 bg-muted/10">
                  {material.url ? (
                    <iframe
                      src={material.url}
                      title={pdfTitle}
                      className="size-full border-0 min-h-[600px] lg:min-h-full"
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
                      <FileText className="size-10 opacity-40 mb-2" />
                      <p className="text-body-sm font-medium">Tautan berkas PDF tidak tersedia.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Panel: Metadata Form */}
              <div className="lg:col-span-5 xl:col-span-4 p-5 lg:p-6 overflow-y-auto space-y-5 bg-card">
                <div>
                  <h2 className="font-heading text-body-base font-bold text-foreground">
                    Pengaturan Dokumen
                  </h2>
                  <p className="text-body-xs text-muted-foreground mt-0.5">
                    Perbarui judul tampilan, kategori, dan kaitan bab tanpa mengunggah ulang berkas.
                  </p>
                </div>

                <form onSubmit={handleSavePdf} className="space-y-4">
                  {/* Judul Dokumen */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-body-sm font-semibold text-foreground">
                        Judul Tampilan
                      </Label>
                      {pdfTitle.trim() ? (
                        <button
                          type="button"
                          onClick={() => setPdfTitle(standardizeDocumentTitle(pdfTitle))}
                          className="inline-flex items-center gap-1 text-body-xs text-brand-primary hover:underline cursor-pointer"
                        >
                          <Sparkles className="size-3" />
                          Rapikan Format
                        </button>
                      ) : null}
                    </div>
                    <Input
                      value={pdfTitle}
                      onChange={(e) => setPdfTitle(e.target.value)}
                      disabled={saving}
                      className="h-9 text-body-sm rounded-lg"
                      placeholder="Judul dokumen..."
                    />
                  </div>

                  {/* Kategori & Sub-kategori */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-body-sm font-semibold text-foreground">
                        Kategori
                      </Label>
                      <Select
                        value={pdfType}
                        onValueChange={(v: MaterialLevel1Category) => {
                          setPdfType(v);
                          const subcats = getSubcategoriesForLevel1(v);
                          if (subcats.length > 0 && !subcats.some((s) => s.value === pdfSubcategory)) {
                            setPdfSubcategory(subcats[0].value);
                          }
                        }}
                        disabled={saving}
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

                    <div className="space-y-1.5">
                      <Label className="text-body-sm font-semibold text-foreground">
                        Sub-kategori
                      </Label>
                      <Select
                        value={pdfSubcategory}
                        onValueChange={(v: CourseMaterialSubcategory) => setPdfSubcategory(v)}
                        disabled={saving}
                      >
                        <SelectTrigger className="h-9 text-body-sm rounded-lg">
                          <SelectValue placeholder="Pilih Sub-kategori" />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePdfSubcategories.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Tahun */}
                  <div className="space-y-1.5">
                    <Label className="text-body-sm font-semibold text-foreground">
                      Tahun <span className="font-normal text-muted-foreground text-body-xs">(opsional)</span>
                    </Label>
                    <Input
                      type="number"
                      min={1900}
                      max={2100}
                      placeholder="2024"
                      value={pdfYear}
                      onChange={(e) => setPdfYear(e.target.value)}
                      disabled={saving}
                      className="h-9 text-body-sm rounded-lg"
                    />
                  </div>

                  {/* Chapter Selector */}
                  <div className="space-y-2 rounded-xl border border-border/80 bg-muted/15 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Kaitan Bab ({selectedChapters.size} dipilih)
                      </span>
                      {chapters.length > 0 && (
                        <button
                          type="button"
                          onClick={handleSelectAllChapters}
                          className="text-body-xs text-brand-primary font-medium hover:underline cursor-pointer"
                        >
                          {selectedChapters.size === chapters.length ? "Batalkan Semua" : "Pilih Semua Bab"}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto pr-1">
                      {chapters.map((ch) => {
                        const isChecked = selectedChapters.has(ch.id);
                        return (
                          <label
                            key={ch.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-body-xs cursor-pointer select-none transition-colors ${
                              isChecked
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border/60 hover:bg-muted/30 text-muted-foreground"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleChapter(ch.id)}
                              disabled={saving}
                              className="rounded border-border"
                            />
                            <span className="truncate">
                              Bab {ch.orderIndex}: {ch.title}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleModeChange("preview")}
                      className="rounded-lg text-body-sm"
                    >
                      Kembali ke Pratinjau
                    </Button>
                    <Button
                      type="submit"
                      disabled={saving || !pdfTitle.trim() || selectedChapters.size === 0}
                      className="gap-1.5 rounded-lg text-body-sm font-semibold"
                    >
                      {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      Simpan Perubahan
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            /* Wide Editor Layout for Artikel / Diktat */
            <div className="max-w-5xl mx-auto p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-h5 font-bold text-foreground">
                    Edit Konten Dokumen
                  </h2>
                  <p className="text-body-xs text-muted-foreground mt-0.5">
                    Sunting judul, bab, dan konten markdown dokumen ini.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleModeChange("preview")}
                    className="rounded-lg text-body-sm"
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveArticle}
                    disabled={saving || !articleTitle.trim()}
                    className="gap-1.5 rounded-lg text-body-sm font-semibold"
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Simpan Perubahan
                  </Button>
                </div>
              </div>

              <form onSubmit={handleSaveArticle} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Judul Dokumen */}
                  <div className="md:col-span-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-body-sm font-semibold text-foreground">
                        Judul Dokumen
                      </Label>
                      {articleTitle.trim() ? (
                        <button
                          type="button"
                          onClick={() => setArticleTitle(standardizeDocumentTitle(articleTitle))}
                          className="inline-flex items-center gap-1 text-body-xs text-brand-primary hover:underline cursor-pointer"
                        >
                          <Sparkles className="size-3" />
                          Rapikan Format
                        </button>
                      ) : null}
                    </div>
                    <Input
                      value={articleTitle}
                      onChange={(e) => setArticleTitle(e.target.value)}
                      disabled={saving}
                      className="h-9 text-body-sm rounded-lg"
                      placeholder="Judul artikel atau diktat..."
                    />
                  </div>

                  {/* Pilihan Bab */}
                  <div className="space-y-1.5">
                    <Label className="text-body-sm font-semibold text-foreground">
                      Bab Terkait
                    </Label>
                    <Select
                      value={articleBabId}
                      onValueChange={setArticleBabId}
                      disabled={saving}
                    >
                      <SelectTrigger className="h-9 text-body-sm rounded-lg">
                        <SelectValue placeholder="Pilih Bab" />
                      </SelectTrigger>
                      <SelectContent>
                        {chapters.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>
                            Bab {ch.orderIndex}: {ch.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Markdown Content Editor */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-body-sm font-semibold text-foreground">
                      Isi Markdown
                    </Label>
                    <span className="text-body-xs text-muted-foreground">
                      Format Markdown didukung
                    </span>
                  </div>
                  <Textarea
                    value={articleMarkdown}
                    onChange={(e) => setArticleMarkdown(e.target.value)}
                    disabled={saving}
                    rows={22}
                    className="font-mono text-body-sm leading-relaxed rounded-xl p-4 resize-y min-h-[450px]"
                    placeholder="Tulis konten dokumen dalam markdown..."
                  />
                </div>
              </form>
            </div>
          )
        )}
      </main>

      <AdminConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Hapus Dokumen"
        description={`Dokumen "${displayTitle}" akan dihapus secara permanen.`}
        confirmLabel="Hapus"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
