"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";
import {
  ArrowLeft,
  BookOpenCheck,
  Eye,
  FileText,
  Globe,
  Loader2,
  Menu,
  PanelRight,
  PanelRightClose,
  Pencil,
  Save,
  Bot,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  standardizeDocumentTitleAction,
} from "@/app/(admin)/admin/(academic)/courses/actions";
import {
  LEVEL1_CATEGORIES,
  getSubcategoriesForLevel1,
  isValidSubcategory,
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
  const t = useTranslations("adminAcademic");
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
    (material.subcategory as CourseMaterialSubcategory) || "materi_dosen"
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

  const [formattingPdfAi, setFormattingPdfAi] = useState(false);
  const [formattingArticleAi, setFormattingArticleAi] = useState(false);

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
            ? t("documents.success.publish")
            : t("documents.success.unpublish")
        );
        router.refresh();
      } else {
        toast.error(t("documents.errors.status"));
      }
    } catch {
      toast.error(t("documents.errors.network"));
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
        toast.success(t("documents.success.delete"));
        router.push(documentsHref);
        router.refresh();
      } else {
        toast.error(t("documents.errors.delete"));
      }
    } catch {
      toast.error(t("documents.errors.network"));
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
      toast.error(t("documents.errors.titleRequired"));
      return;
    }
    if (selectedChapters.size === 0) {
      toast.error(t("documents.errors.chapterRequired"));
      return;
    }

    const parsedYear = pdfYear.trim() ? parseInt(pdfYear.trim(), 10) : null;
    if (pdfYear.trim() && (isNaN(parsedYear!) || parsedYear! < 1900 || parsedYear! > 2100)) {
      toast.error(t("documents.errors.invalidYear"));
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
        toast.success(t("documents.success.metadata"));
        router.refresh();
      } else {
        toast.error(t("documents.errors.metadata"));
      }
    } catch {
      toast.error(t("documents.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  // Save Article / Diktat Content
  const handleSaveArticle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanTitle = standardizeDocumentTitle(articleTitle.trim());
    if (!cleanTitle) {
      toast.error(t("documents.errors.titleRequired"));
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
        toast.success(t("documents.success.content"));
        router.refresh();
      } else {
        toast.error(t("documents.errors.content"));
      }
    } catch {
      toast.error(t("documents.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const handleFormatPdfTitle = async () => {
    if (!pdfTitle.trim()) return;
    setFormattingPdfAi(true);
    try {
      let fileName = pdfTitle;
      if (material.url) {
        try {
          const parsed = new URL(material.url, "https://local");
          const leaf = parsed.pathname.split("/").filter(Boolean).pop();
          if (leaf) fileName = decodeURIComponent(leaf);
        } catch {
          const rawLeaf = material.url.split("/").pop();
          if (rawLeaf) fileName = decodeURIComponent(rawLeaf.split("?")[0]);
        }
      }

      const result = await standardizeDocumentTitleAction({
        filename: fileName,
        courseId: courseSlug,
        chapters,
        currentValues: {
          title: pdfTitle,
          category: pdfType,
          subcategory: pdfSubcategory,
          year: pdfYear ? parseInt(pdfYear, 10) : null,
        },
      });
      if (result) {
        if (result.title) setPdfTitle(result.title);
        const targetCategory = result.category || pdfType;
        if (result.category) setPdfType(result.category);
        if (result.subcategory && isValidSubcategory(targetCategory, result.subcategory)) {
          setPdfSubcategory(result.subcategory as CourseMaterialSubcategory);
        } else if (result.category && result.category !== pdfType) {
          const validSubcats = getSubcategoriesForLevel1(result.category);
          if (validSubcats.length > 0) {
            setPdfSubcategory(validSubcats[0].value);
          }
        }
        if (result.chapterIds && result.chapterIds.length > 0) {
          setSelectedChapters(new Set(result.chapterIds));
        }
        if (result.year) setPdfYear(String(result.year));
        toast.success(t("documents.success.formatPdf"));
      }
    } catch (err) {
      console.error("AI format failed, fallback to local:", err);
      setPdfTitle(standardizeDocumentTitle(pdfTitle));
      toast.error(t("documents.errors.formatAi"));
    } finally {
      setFormattingPdfAi(false);
    }
  };

  const handleFormatArticleTitle = async () => {
    if (!articleTitle.trim()) return;
    setFormattingArticleAi(true);
    try {
      const result = await standardizeDocumentTitleAction({
        filename: articleTitle,
        courseId: courseSlug,
        chapters,
        currentValues: {
          title: articleTitle,
          category: "materi",
          subcategory: "ebook",
        },
      });
      if (result) {
        if (result.title) setArticleTitle(result.title);
        if (result.chapterIds && result.chapterIds.length > 0) {
          setArticleBabId(result.chapterIds[0]);
        }
        toast.success(t("documents.success.formatArticle"));
      }
    } catch (err) {
      console.error("AI format failed, fallback to local:", err);
      setArticleTitle(standardizeDocumentTitle(articleTitle));
      toast.error(t("documents.errors.formatAi"));
    } finally {
      setFormattingArticleAi(false);
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
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1 rounded-lg text-body-sm shrink-0">
            <Link href={documentsHref}>
              <ArrowLeft className="size-4" />
              <span>{t("documents.title")}</span>
            </Link>
          </Button>

          <div className="h-4 w-px bg-border shrink-0" />

          <div className="min-w-0 flex items-center gap-2">
            <h1 className="min-w-0 break-words font-heading text-body-sm font-semibold text-foreground">
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

        <div className="flex max-w-full flex-wrap items-center gap-2">
          {/* Status Toggle Button (for articles and diktats) */}
          {isArticleOrDiktat ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={statusUpdating}
              onClick={handleToggleStatus}
              className="h-8 gap-1.5 rounded-lg text-body-sm font-medium"
            >
              {statusUpdating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : status === "published" ? (
                <>
                  <FileText className="size-3.5 text-muted-foreground" />
                  <span>{t("documents.makeDraft")}</span>
                </>
              ) : (
                <>
                  <Globe className="size-3.5 text-status-success" />
                  <span>{t("documents.publish")}</span>
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
              title={t("documents.openNewTab")}
              aria-label={t("documents.openNewTab")}
            >
              <a href={material.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
              </a>
            </Button>
          ) : null}

          {/* Kelola Lifecycle (for canonical article/diktat) */}
          {isCanonical ? (
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-body-sm font-medium">
              <Link href={reviewHref} aria-label={t("documents.manageLifecycle")}>
                <BookOpenCheck className="size-3.5 text-muted-foreground" />
                <span>{t("documents.manageLifecycle")}</span>
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
                className="h-8 gap-1 rounded-lg text-body-sm font-medium md:hidden"
                title={t("documents.tableOfContents")}
              >
                <Menu className="size-3.5" />
                <span>{t("documents.tableOfContents")}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsTocOpen((prev) => !prev)}
                className="h-8 gap-1.5 rounded-lg text-body-sm font-medium hidden md:inline-flex"
                aria-pressed={isTocOpen}
                title={isTocOpen ? t("documents.hideMenu") : t("documents.openMenu")}
              >
                {isTocOpen ? (
                  <PanelRightClose className="size-3.5" />
                ) : (
                  <PanelRight className="size-3.5" />
                )}
                <span>{isTocOpen ? t("documents.hideMenu") : t("documents.openMenu")}</span>
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
              aria-pressed={activeMode === "preview"}
              className="h-7 gap-1 px-2.5 rounded-md text-body-sm font-medium"
            >
              <Eye className="size-3.5" />
              <span>{t("documents.preview")}</span>
            </Button>
            <Button
              type="button"
              variant={activeMode === "edit" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handleModeChange("edit")}
              aria-pressed={activeMode === "edit"}
              className="h-7 gap-1 px-2.5 rounded-md text-body-sm font-medium"
            >
              <Pencil className="size-3.5" />
              <span>{t("documents.edit")}</span>
            </Button>
          </div>

          {/* Quick Save Button in Header (for articles and diktats in edit mode) */}
          {activeMode === "edit" && !isPdf ? (
            <Button
              type="button"
              onClick={handleSaveArticle}
              disabled={saving || !articleTitle.trim()}
              className="h-8 gap-1.5 rounded-lg text-body-sm font-semibold"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              <span>{t("common.save")}</span>
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
              title={t("documents.deleteTitle")}
              aria-label={t("documents.deleteTitle")}
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
            <div className="flex-1 flex flex-col min-h-[calc(100vh-53px)]">
              <MaterialViewer
                material={material}
                chapterId={material.chapterId}
                course={{ title: courseTitle }}
                mode="admin-preview"
                backHref={documentsHref}
                hideHeader={true}
              />
            </div>
          )
        ) : (
          /* Edit Mode */
          isPdf ? (
            /* Split Edit Layout for PDF Documents */
            <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[calc(100vh-53px)]">
              {/* Left Panel: Full PDF Preview */}
              <div className="order-2 lg:order-1 lg:col-span-7 xl:col-span-8 bg-muted/20 border-r border-border min-h-[500px] lg:min-h-full flex flex-col">
                <div className="flex items-center justify-between border-b border-border/70 bg-card/60 px-4 py-2 text-body-xs text-muted-foreground">
                  <span className="font-medium">{t("documents.pdfPreview")}</span>
                  {material.url ? (
                    <a
                      href={material.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <span>{t("documents.newTab")}</span>
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
                      <p className="text-body-sm font-medium">{t("documents.pdfUnavailable")}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Panel: Metadata Form */}
              <div className="order-1 lg:order-2 lg:col-span-5 xl:col-span-4 p-4 overflow-y-auto space-y-4 bg-card">
                <div>
                  <h2 className="font-heading text-body-base font-bold text-foreground">
                    {t("documents.settings")}
                  </h2>
                </div>

                <form onSubmit={handleSavePdf} className="space-y-4">
                  {/* Judul Dokumen */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="workspace-pdf-title" className="text-body-sm font-semibold text-foreground">
                        {t("documents.displayTitle")}
                      </Label>
                      {pdfTitle.trim() ? (
                        <Button size="sm" variant="ghost"
                          type="button"
                          onClick={handleFormatPdfTitle}
                          disabled={formattingPdfAi || saving}
                          className="inline-flex items-center gap-1 text-body-sm text-brand-primary hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          title={t("documents.formatPdfTitle")}
                        >
                          {formattingPdfAi ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Bot className="size-3" />
                          )}
                          <span>{formattingPdfAi ? t("documents.analyzing") : t("documents.formatWithAi")}</span>
                        </Button>
                      ) : null}
                    </div>
                    <Input
                      id="workspace-pdf-title"
                      value={pdfTitle}
                      onChange={(e) => setPdfTitle(e.target.value)}
                      disabled={saving}
                      className="h-9 text-body-sm rounded-lg"
                      placeholder={t("documents.documentTitlePlaceholder")}
                    />
                  </div>

                  {/* Kategori & Sub-kategori */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="workspace-pdf-category" className="text-body-sm font-semibold text-foreground">
                        {t("documents.category")}
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
                        <SelectTrigger id="workspace-pdf-category" className="h-9 text-body-sm rounded-lg">
                          <SelectValue placeholder={t("documents.selectCategory")}>
                            {LEVEL1_CATEGORIES.find((category) => category.value === pdfType)?.label}
                          </SelectValue>
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
                      <Label htmlFor="workspace-pdf-subcategory" className="text-body-sm font-semibold text-foreground">
                        {t("documents.subcategory")}
                      </Label>
                      <Select
                        value={pdfSubcategory}
                        onValueChange={(v: CourseMaterialSubcategory) => setPdfSubcategory(v)}
                        disabled={saving}
                      >
                        <SelectTrigger id="workspace-pdf-subcategory" className="h-9 text-body-sm rounded-lg">
                          <SelectValue placeholder={t("documents.selectSubcategory")}>
                            {availablePdfSubcategories.find((subcategory) => subcategory.value === pdfSubcategory)?.label}
                          </SelectValue>
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
                    <Label htmlFor="workspace-pdf-year" className="text-body-sm font-semibold text-foreground">
                      {t("documents.year")} <span className="font-normal text-muted-foreground text-body-xs">({t("documents.optional")})</span>
                    </Label>
                    <Input
                      id="workspace-pdf-year"
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
                  <div className="space-y-2 border-t border-border pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t("documents.chapterLinks", { count: selectedChapters.size })}
                      </span>
                      {chapters.length > 0 && (
                        <Button size="sm" variant="ghost"
                          type="button"
                          onClick={handleSelectAllChapters}
                          className="text-body-sm text-brand-primary font-medium hover:underline cursor-pointer"
                        >
                          {selectedChapters.size === chapters.length ? t("documents.clearAll") : t("documents.selectAllChapters")}
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto pr-1">
                      {chapters.map((ch) => {
                        const isChecked = selectedChapters.has(ch.id);
                        return (
                          <label
                            key={ch.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-body-sm cursor-pointer select-none transition-colors ${
                              isChecked
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border/60 hover:bg-muted/30 text-muted-foreground"
                            }`}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleChapter(ch.id)}
                              disabled={saving}
                              className="rounded border-border"
                            />
                            <span className="min-w-0 break-words">
                              {t("documents.chapterWithNumber", { number: ch.orderIndex })}: {ch.title}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleModeChange("preview")}
                      className="rounded-lg text-body-sm"
                    >
                      {t("documents.backToPreview")}
                    </Button>
                    <Button
                      type="submit"
                      disabled={saving || !pdfTitle.trim() || selectedChapters.size === 0}
                      className="gap-1.5 rounded-lg text-body-sm font-semibold"
                    >
                      {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      {t("documents.saveChanges")}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            /* Wide Editor Layout for Artikel / Diktat */
            <div className="max-w-5xl mx-auto p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-body-base font-bold text-foreground">
                    {t("documents.editContent")}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                      <Label htmlFor="workspace-article-title" className="text-body-sm font-semibold text-foreground">
                        {t("documents.documentTitle")}
                      </Label>
                      {articleTitle.trim() ? (
                        <Button size="sm" variant="ghost"
                          type="button"
                          onClick={handleFormatArticleTitle}
                          disabled={formattingArticleAi || saving}
                          className="inline-flex items-center gap-1 text-body-sm text-brand-primary hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          title={t("documents.formatArticleTitle")}
                        >
                          {formattingArticleAi ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Bot className="size-3" />
                          )}
                          <span>{formattingArticleAi ? t("documents.analyzing") : t("documents.formatWithAi")}</span>
                        </Button>
                      ) : null}
                    </div>
                    <Input
                      id="workspace-article-title"
                      value={articleTitle}
                      onChange={(e) => setArticleTitle(e.target.value)}
                      disabled={saving}
                      className="h-9 text-body-sm rounded-lg"
                      placeholder={t("documents.articleTitlePlaceholder")}
                    />
                  </div>

                  {/* Pilihan Bab */}
                  <div className="space-y-1.5">
                    <Label htmlFor="workspace-article-chapter" className="text-body-sm font-semibold text-foreground">
                      {t("documents.relatedChapter")}
                    </Label>
                    <Select
                      value={articleBabId}
                      onValueChange={setArticleBabId}
                      disabled={saving}
                    >
                      <SelectTrigger id="workspace-article-chapter" className="h-9 text-body-sm rounded-lg">
                        <SelectValue placeholder={t("documents.selectChapter")} />
                      </SelectTrigger>
                      <SelectContent>
                        {chapters.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>
                            {t("documents.chapterWithNumber", { number: ch.orderIndex })}: {ch.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Markdown Content Editor */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="workspace-markdown" className="text-body-sm font-semibold text-foreground">
                      {t("documents.markdownContent")}
                    </Label>

                  </div>
                  <Textarea
                    id="workspace-markdown"
                    value={articleMarkdown}
                    onChange={(e) => setArticleMarkdown(e.target.value)}
                    disabled={saving}
                    rows={22}
                    className="font-mono text-body-sm leading-relaxed rounded-xl p-4 resize-y min-h-[450px]"
                    placeholder={t("documents.markdownPlaceholder")}
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
        title={t("documents.deleteTitle")}
        description={t("documents.deleteDescription", { title: displayTitle })}
        confirmLabel={t("documents.delete")}
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
