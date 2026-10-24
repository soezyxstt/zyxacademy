"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  ExternalLink,
  Eye,
  FileCode,
  FileText,
  Filter,
  GraduationCap,
  LayoutGrid,
  List,
  LockKeyhole,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchBar } from "@/components/ui/search-bar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { AdminUploadDocumentDialog } from "@/components/admin/course-detail/admin-upload-document-dialog";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { PdfViewerModal } from "@/components/course/pdf-viewer-modal";
import { updateMaterialProgress } from "@/app/(student)/dashboard/actions";
import { getViewablePdfUrl, isMobileOrTablet } from "@/lib/pdf-utils";
import { deleteCourseMaterial } from "@/app/(admin)/admin/(academic)/courses/actions";
import { toast } from "@/components/ui/toast";
import { useUrlTab } from "@/hooks/use-url-tab";
import { cn } from "@/lib/utils";
import type { CourseMaterial, DocCategory } from "@/lib/student-course-fixtures";
import { getSubcategoryLabel, type CourseMaterialSubcategory } from "@/lib/course-materials";
import { materialMatchesDocumentFilters, type DocumentFilterState } from "@/lib/document-filters";
import { useTranslations } from "@/lib/i18n/client";

type Chapter = {
  id: string;
  title: string;
  orderIndex: number;
  canonicalId?: string | null;
  legacyChapterId?: string | null;
};
type TabKey = "materi" | "diktat" | "pdf" | "bank_soal";

type DocumentListClientProps = {
  courseId: string;
  courseSlug?: string;
  courseTitle?: string;
  materials: CourseMaterial[];
  chapters: Chapter[];
  defaultTab?: string;
  forcePageNavigation?: boolean;
  isAdmin?: boolean;
  accessTier?: "free" | "standard";
  lockedMaterialCount?: number;
};

const tabConfig: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: "materi", label: "material" , icon: FileText },
  { key: "diktat", label: "handbook", icon: BookOpen },
  { key: "pdf", label: "pdf", icon: FileText },
  { key: "bank_soal", label: "questionBank", icon: ClipboardList },
];

const categoryLabel: Record<string, string> = {
  materi: "material",
  soal: "questions",
  solusi: "explanation",
  diktat: "handbook",
};

const MAX_THUMBNAIL_RETRIES = 8;

function displayFileSizeLabel(value: string, t: (key: string) => string): string {
  const labels: Record<string, string> = {
    "PDF Diktat": "diktatPdf",
    "Rangkuman Materi": "materialSummary",
    "Pembahasan Soal": "questionExplanation",
    "Lembar Soal": "questionSheet",
    "Berkas PDF ITB": "itbPdfFile",
    "PDF File": "pdfFile",
    "Disusun otomatis": "autoPrepared",
  };
  const key = labels[value.trim()];
  return key ? t(`documents.fileLabels.${key}`) : value;
}

const emptyFilters = (): DocumentFilterState => ({
  categories: new Set(),
  subcategories: new Set(),
  chapters: new Set(),
  years: new Set(),
});

function parseMaterialTitle(rawTitle: string, courseTitle?: string) {
  let cleaned = rawTitle.trim();
  if (courseTitle && cleaned.toLowerCase().startsWith(courseTitle.toLowerCase())) {
    cleaned = cleaned.slice(courseTitle.length).replace(/^[\s:,-]+/, "").trim();
  }
  const babMatch = cleaned.match(/^(Bab\s+\d+)[:\s,-]+(.*)$/i);
  if (babMatch) {
    return {
      babBadge: babMatch[1],
      title: babMatch[2].trim() || cleaned,
    };
  }
  return {
    babBadge: null,
    title: cleaned,
  };
}

function normalizeTabKey(tab?: string | null): TabKey {
  if (tab === "diktat") return "diktat";
  if (tab === "pdf") return "pdf";
  if (tab === "bank_soal" || tab === "bank-soal") return "bank_soal";
  return "materi";
}

function resolveTabGroup(material: CourseMaterial): TabKey {
  if (material.tabGroup) return material.tabGroup;
  if (material.docCategory === "diktat") return "diktat";
  if (
    material.docCategory === "soal" ||
    material.docCategory === "solusi" ||
    material.kind === "quiz" ||
    material.kind === "tryout"
  ) {
    return "bank_soal";
  }
  if (material.kind === "pdf") return "pdf";
  return "materi";
}

function DocumentHeaderIcon({
  kind,
  docCategory,
  subcategory,
}: {
  kind?: string;
  docCategory?: DocCategory;
  subcategory?: string | null;
}) {
  if (kind === "quiz" || subcategory === "kuis") {
    return <ClipboardList className="size-4 shrink-0 text-amber-500" aria-hidden />;
  }
  if (kind === "tryout" || subcategory === "tryout") {
    return <GraduationCap className="size-4 shrink-0 text-purple-500" aria-hidden />;
  }
  if (docCategory === "solusi") {
    return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden />;
  }
  if (docCategory === "soal") {
    return <FileCode className="size-4 shrink-0 text-amber-500" aria-hidden />;
  }
  if (docCategory === "diktat") {
    return <BookOpen className="size-4 shrink-0 text-indigo-500" aria-hidden />;
  }
  if (kind === "pdf") {
    return <FileText className="size-4 shrink-0 text-[#ea4335]" aria-hidden />;
  }
  return <FileText className="size-4 shrink-0 text-blue-500" aria-hidden />;
}

function DocumentPlaceholder({
  kind,
  docCategory,
  subcategory,
  isLoading,
}: {
  kind?: string;
  docCategory?: DocCategory;
  subcategory?: string | null;
  isLoading?: boolean;
}) {
  const t = useTranslations("learning");
  let badgeText = "DOC";
  let badgeColor = "bg-blue-500";

  if (kind === "quiz" || subcategory === "kuis") {
    badgeText = t("documents.badges.quiz");
    badgeColor = "bg-amber-500";
  } else if (kind === "tryout" || subcategory === "tryout") {
    badgeText = t("documents.badges.tryout");
    badgeColor = "bg-purple-600";
  } else if (docCategory === "solusi") {
    badgeText = t("documents.badges.solution");
    badgeColor = "bg-emerald-500";
  } else if (docCategory === "soal") {
    badgeText = t("documents.badges.question");
    badgeColor = "bg-amber-500";
  } else if (docCategory === "diktat") {
    badgeText = t("documents.badges.handbook");
    badgeColor = "bg-indigo-500";
  } else if (kind === "pdf") {
    badgeText = "PDF";
    badgeColor = "bg-[#ea4335]";
  }

  return (
    <div className="flex size-full items-center justify-center p-4">
      <div
        className={cn(
          "flex h-11 min-w-14 items-center justify-center rounded-lg px-3 shadow-xs transition-opacity",
          badgeColor,
          isLoading && "animate-pulse opacity-80"
        )}
      >
        <span className="font-heading text-body-xs font-bold tracking-wider text-white">
          {badgeText}
        </span>
      </div>
    </div>
  );
}

function DocumentPreview({ material }: { material: CourseMaterial }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baseThumbnailUrl = material.thumbnailUrl ?? "";
  const isRetryableThumbnail = baseThumbnailUrl.includes("/thumbnail");
  const thumbnailSrc =
    baseThumbnailUrl && retryAttempt > 0
      ? `${baseThumbnailUrl}${baseThumbnailUrl.includes("?") ? "&" : "?"}retry=${retryAttempt}`
      : baseThumbnailUrl;
  const hasThumbnail = Boolean(baseThumbnailUrl) && !imageError;

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    setRetryAttempt(0);
  }, [baseThumbnailUrl]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const handleThumbnailError = () => {
    if (!isRetryableThumbnail || retryAttempt >= MAX_THUMBNAIL_RETRIES) {
      setImageError(true);
      return;
    }

    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    const delayMs = Math.min(750 * 2 ** retryAttempt, 5000);
    retryTimerRef.current = setTimeout(() => {
      setImageLoaded(false);
      setRetryAttempt((current) => current + 1);
    }, delayMs);
  };

  return (
    <div className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden bg-muted/15 select-none sm:aspect-[4/3]">
      {(!hasThumbnail || !imageLoaded) && (
        <div
          className={cn(
            "absolute inset-0 z-0 flex items-center justify-center transition-opacity duration-200",
            imageLoaded && "pointer-events-none opacity-0"
          )}
        >
          <DocumentPlaceholder
            kind={material.kind}
            docCategory={material.docCategory}
            subcategory={material.subcategory}
            isLoading={hasThumbnail && !imageLoaded}
          />
        </div>
      )}

      {hasThumbnail && (
        <div className="relative z-10 size-full p-2.5">
          <div className="relative size-full overflow-hidden rounded-xs bg-white shadow-xs ring-1 ring-black/5 dark:ring-white/10">
            <Image
              key={thumbnailSrc}
              src={thumbnailSrc}
              alt={`Pratinjau ${material.title}`}
              fill
              unoptimized={isRetryableThumbnail}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className={cn(
                "object-contain object-center transition-all duration-200 group-hover:scale-[1.015]",
                imageLoaded ? "opacity-100" : "opacity-0"
              )}
              onLoad={() => setImageLoaded(true)}
              onError={handleThumbnailError}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CompactDocumentRowThumbnail({ material }: { material: CourseMaterial }) {
  const baseThumbnailUrl = material.thumbnailUrl ?? "";
  if (!baseThumbnailUrl) {
    return (
      <div className="flex size-full items-center justify-center bg-muted/40 text-muted-foreground">
        <DocumentHeaderIcon
          kind={material.kind}
          docCategory={material.docCategory}
          subcategory={material.subcategory}
        />
      </div>
    );
  }
  return (
    <div className="relative size-full overflow-hidden bg-white dark:bg-zinc-900">
      <Image
        src={baseThumbnailUrl}
        alt={material.title}
        fill
        sizes="(max-width: 640px) 96px, 128px"
        className="object-cover object-top"
      />
    </div>
  );
}

function FilterGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Array<{ value: string; label: string; count?: number }>;
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-body-xs font-semibold text-muted-foreground">{label}</legend>
      <div className="grid max-h-36 gap-1 overflow-y-auto pr-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-body-sm hover:bg-muted/60"
          >
            <Checkbox
              checked={selected.has(option.value)}
              onCheckedChange={() => onToggle(option.value)}
            />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {typeof option.count === "number" ? (
              <span className="text-body-xs text-muted-foreground">{option.count}</span>
            ) : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function isPageNavigationMaterial(material: CourseMaterial): boolean {
  // Articles and Diktats keep navigating to the dedicated material reader page
  if (material.kind === "article") return true;
  if (material.docCategory === "diktat" || material.tabGroup === "diktat") return true;
  // Interactive quizzes and tryouts have their own interactive test pages
  if (material.kind === "quiz" || material.kind === "tryout") return true;
  return false;
}

function DocumentItemWrapper({
  material,
  itemHref,
  isPageNav,
  onSelectPdf,
  children,
  className,
}: {
  material: CourseMaterial;
  itemHref: string;
  isPageNav: boolean;
  onSelectPdf: (m: CourseMaterial) => void;
  children: React.ReactNode;
  className: string;
}) {
  const isPdf = material.kind === "pdf" && Boolean(material.url);
  const viewPdfUrl = isPdf ? getViewablePdfUrl(material.url) : null;

  const handleMobilePdf = (e: React.MouseEvent) => {
    if (material.locked) return false;
    if (isPdf && viewPdfUrl && isMobileOrTablet()) {
      e.preventDefault();
      updateMaterialProgress(material.id, "in_progress").catch(() => {});
      window.open(viewPdfUrl, "_blank", "noopener,noreferrer");
      return true;
    }
    return false;
  };

  if (isPageNav) {
    return (
      <Link href={itemHref} className={className} onClick={handleMobilePdf}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        if (!handleMobilePdf(e)) {
          onSelectPdf(material);
        }
      }}
      className={cn(className, "text-left cursor-pointer w-full")}
    >
      {children}
    </button>
  );
}

export function DocumentListClient({
  courseId,
  courseSlug,
  courseTitle,
  materials,
  chapters,
  defaultTab = "materi",
  forcePageNavigation = false,
  isAdmin = false,
  accessTier,
  lockedMaterialCount = 0,
}: DocumentListClientProps) {
  const t = useTranslations("learning");
  const router = useRouter();
  const initialDefaultTab = normalizeTabKey(defaultTab);
  const [urlTab, setUrlTab] = useUrlTab("tab", initialDefaultTab);
  const activeTab: TabKey = normalizeTabKey(urlTab);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<DocumentFilterState>(emptyFilters);
  const [selectedPdf, setSelectedPdf] = useState<CourseMaterial | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CourseMaterial | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await deleteCourseMaterial(deleteTarget.id);
      if (res.success) {
        toast.success(t("documents.deleted"));
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(t("documents.deleteFailed"));
      }
    } catch {
      toast.error(t("documents.networkError"));
    } finally {
      setIsDeleting(false);
    }
  };

  // Sync filter and search state when tab changes (including browser back/forward)
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      prevTabRef.current = activeTab;
      setFilters(emptyFilters());
      setSearchQuery("");
    }
  }, [activeTab]);

  // Filter materials for current active tab
  const tabMaterials = useMemo(() => {
    return materials.filter((m) => resolveTabGroup(m) === activeTab);
  }, [materials, activeTab]);

  // Contextual options for active tab
  const years = useMemo(() => {
    const ySet = new Set<number>();
    for (const m of tabMaterials) {
      if (typeof m.year === "number") ySet.add(m.year);
    }
    return Array.from(ySet).sort((a, b) => b - a);
  }, [tabMaterials]);

  const subcategories = useMemo(() => {
    const values = new Set<string>();
    for (const m of tabMaterials) {
      if (m.subcategory) values.add(m.subcategory);
    }
    return Array.from(values).sort((a, b) =>
      (getSubcategoryLabel(a) ?? a).localeCompare(getSubcategoryLabel(b) ?? b, "id")
    );
  }, [tabMaterials]);

  const filteredMaterials = useMemo(() => {
    return tabMaterials.filter((material) =>
      materialMatchesDocumentFilters(material, filters, searchQuery)
    );
  }, [tabMaterials, filters, searchQuery]);

  const activeFilterCount =
    filters.categories.size +
    filters.subcategories.size +
    filters.chapters.size +
    filters.years.size;

  const allowDownload = isAdmin || accessTier === "standard";

  const toggleFilter = (group: keyof DocumentFilterState, value: string) => {
    setFilters((current) => {
      const next = new Set(current[group]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...current, [group]: next };
    });
  };

  const handleTabChange = (tab: TabKey) => {
    setUrlTab(tab);
    setFilters(emptyFilters());
    setSearchQuery("");
  };

  return (
    <div className="space-y-3 font-sans">
      {accessTier === "free" && lockedMaterialCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-primary/25 bg-brand-primary/5 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-body-xs text-muted-foreground">
            <LockKeyhole className="size-4 shrink-0 text-brand-primary" aria-hidden />
            <span>{t("documents.lockedMaterialNotice")}</span>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 shrink-0 rounded-md text-body-sm">
            <Link href="/plans">{t("documents.activateAccess")}</Link>
          </Button>
        </div>
      ) : null}
      {/* Unified Toolbar: Tab Strip, SearchBar, Filter Popover, Grid/List Toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={activeTab} onValueChange={(value) => handleTabChange(normalizeTabKey(value))}>
          <TabsList aria-label={t("documents.categoryLabel")}>
            {tabConfig.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.key} value={tab.key}>
                  <Icon className="size-3.5 shrink-0" />
                  <span>{t(`documents.categories.${tab.label}`)}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {/* Search Bar */}
        <SearchBar
          size="sm"
          variant="bordered"
          value={searchQuery}
          onSearch={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder={t("documents.searchPlaceholder", { category: t(`documents.categories.${tabConfig.find((tab) => tab.key === activeTab)?.label ?? "material"}`).toLowerCase() })}
          containerClassName="min-w-[140px] flex-1"
        />

        {/* Filter Popover */}
        {(subcategories.length > 0 || chapters.length > 0 || years.length > 0) && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-1.5 rounded-md text-body-sm"
              >
                <Filter className="size-3.5" aria-hidden />
                {t("documents.filter")}
                {activeFilterCount > 0 ? (
                  <Badge className="ml-0.5 rounded-md px-1.5 py-0 text-body-xs">
                    {activeFilterCount}
                  </Badge>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] space-y-4 p-3">
              <div className="flex items-center justify-between">
                <p className="font-heading text-body-sm font-bold">{t("documents.filterTitle")}</p>
                {activeFilterCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilters(emptyFilters())}
                    className="h-7 px-2 text-body-xs"
                  >
                    {t("documents.reset")}
                  </Button>
                ) : null}
              </div>
              {subcategories.length > 0 && (
                <FilterGroup
                  label={t("documents.subcategory")}
                  selected={filters.subcategories}
                  onToggle={(value) => toggleFilter("subcategories", value)}
                  options={subcategories.map((value) => ({
                    value,
                    label: getSubcategoryLabel(value as CourseMaterialSubcategory) ?? value,
                    count: tabMaterials.filter((m) => m.subcategory === value).length,
                  }))}
                />
              )}
              {chapters.length > 0 && (
                <FilterGroup
                  label={t("documents.chapter")}
                  selected={filters.chapters}
                  onToggle={(value) => toggleFilter("chapters", value)}
                  options={chapters.map((chapter) => ({
                    value: chapter.id,
                    label: `Bab ${chapter.orderIndex}: ${chapter.title}`,
                  }))}
                />
              )}
              {years.length > 0 && (
                <FilterGroup
                  label={t("documents.year")}
                  selected={filters.years}
                  onToggle={(value) => toggleFilter("years", value)}
                  options={years.map((year) => ({
                    value: String(year),
                    label: String(year),
                    count: tabMaterials.filter((m) => m.year === year).length,
                  }))}
                />
              )}
            </PopoverContent>
          </Popover>
        )}

        {/* View Mode Toggle */}
        <div className="flex shrink-0 items-center rounded-md border border-border bg-muted/30 p-0.5">
          <Button
            type="button"
            size="icon"
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            className="size-8 rounded-md"
            onClick={() => setViewMode("grid")}
            aria-label={t("documents.gridView")}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            className="size-8 rounded-md"
            onClick={() => setViewMode("list")}
            aria-label={t("documents.listView")}
          >
            <List className="size-4" />
          </Button>
        </div>

        {/* Upload Button at the far right for Admin */}
        {isAdmin ? (
          <Button
            type="button"
            size="icon"
            variant="default"
            className="size-9 rounded-lg shrink-0 cursor-pointer shadow-xs"
            onClick={() => setUploadOpen(true)}
            aria-label={t("documents.uploadPdf")}
            title={t("documents.uploadPdf")}
          >
            <Plus className="size-4" />
          </Button>
        ) : null}
      </div>

      {/* Active Filter Indicator */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 text-body-xs text-muted-foreground">
          <span>{t("documents.activeFilters", { count: activeFilterCount })}</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => setFilters(emptyFilters())}
            className="h-auto p-0 text-body-xs"
          >
            {t("documents.reset")}
          </Button>
        </div>
      )}

      {/* Grid View Mode */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filteredMaterials.map((material) => {
            const itemHref = material.href ?? `/courses/${courseId}/material/${material.id}`;
            const isPageNav = forcePageNavigation || isPageNavigationMaterial(material);
            const subLabel =
              material.subcategory
                ? getSubcategoryLabel(material.subcategory as any) ?? material.subcategory
                : categoryLabel[material.docCategory ?? "materi"];
            const { babBadge, title: cleanTitle } = parseMaterialTitle(material.title, courseTitle);

            return (
              <DocumentItemWrapper
                key={material.id}
                material={material}
                itemHref={itemHref}
                isPageNav={isPageNav}
                onSelectPdf={setSelectedPdf}
                className="group flex flex-col min-w-0 overflow-hidden rounded-xl border border-border/50 bg-card transition-all duration-150 hover:border-border/90 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary text-left"
              >
                {/* Header */}
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <DocumentHeaderIcon
                    kind={material.kind}
                    docCategory={material.docCategory}
                    subcategory={material.subcategory}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {babBadge && (
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-body-2xs font-semibold text-foreground/80 ring-1 ring-border">
                          {babBadge}
                        </span>
                      )}
                      <p
                        className="truncate text-body-sm font-medium text-foreground group-hover:text-primary leading-tight"
                        title={material.title}
                      >
                        {cleanTitle}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-body-xs text-muted-foreground leading-none">
                      {subLabel}
                      {material.year ? ` · ${material.year}` : ""}
                      {material.fileSize && !/^diktat(\s+resmi|\s+canonical)?$/i.test(material.fileSize.trim()) ? ` · ${displayFileSizeLabel(material.fileSize, t)}` : ""}
                    </p>
                  </div>
                  {isAdmin ? (
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {material.status ? (
                        <Badge
                          variant={material.status === "published" ? "default" : "secondary"}
                          className={cn(
                            "rounded-md px-1.5 py-0 text-[10px] uppercase font-semibold",
                            material.status === "published"
                              ? "bg-status-success/15 text-status-success border-status-success/30"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {material.status === "published" ? t("documents.status.published") : t("documents.status.draft")}
                        </Badge>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                            aria-label={t("documents.documentActions")}
                          >
                            <MoreVertical className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem asChild>
                            <Link href={`${itemHref}?mode=edit`}>
                              <Pencil className="size-3.5 mr-2" />
                              Edit Dokumen
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={itemHref}>
                              <Eye className="size-3.5 mr-2" />
                              Pratinjau
                            </Link>
                          </DropdownMenuItem>
                          {material.url ? (
                            <DropdownMenuItem asChild>
                              <a href={material.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="size-3.5 mr-2" />
                                Buka Berkas PDF
                              </a>
                            </DropdownMenuItem>
                          ) : null}
                          {material.source === "legacy-pdf" ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(material)}
                              >
                                <Trash2 className="size-3.5 mr-2" />
                                Hapus Dokumen
                              </DropdownMenuItem>
                            </>
                          ) : null}
                          {material.source === "canonical-article" || material.source === "canonical-diktat" ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/courses/${encodeURIComponent(courseSlug || courseId)}/review?tab=product`}>
                                  <BookOpenCheck className="size-3.5 mr-2" />
                                  Kelola Review
                                </Link>
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {material.locked ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-body-2xs font-semibold text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
                          <LockKeyhole className="size-2.5" />
                          Terkunci
                        </span>
                      ) : material.completed ? (
                        <CheckCircle2
                          className="size-4 shrink-0 text-status-success"
                          aria-label={t("documents.markAsRead")}
                        />
                      ) : null}
                      {material.url && allowDownload && !material.locked ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                          asChild
                          title={t("documents.downloadPdf")}
                          aria-label={`Unduh PDF ${material.title}`}
                        >
                          <a href={material.url} download target="_blank" rel="noopener noreferrer">
                            <Download className="size-3.5" />
                          </a>
                        </Button>
                      ) : (
                        !material.completed && !material.locked && (
                          <MoreVertical
                            className="size-3.5 shrink-0 text-muted-foreground/35 transition-colors group-hover:text-muted-foreground/70"
                            aria-hidden
                          />
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Body (Preview or Placeholder) */}
                <div className="border-t border-border/40">
                  <DocumentPreview material={material} />
                </div>
              </DocumentItemWrapper>
            );
          })}
        </div>
      ) : (
        /* List View Mode with Compact Thumbnails */
        <ul className="divide-y divide-border/50 rounded-xl border border-border/50 bg-card overflow-hidden">
          {filteredMaterials.map((material) => {
            const itemHref = material.href ?? `/courses/${courseId}/material/${material.id}`;
            const isPageNav = forcePageNavigation || isPageNavigationMaterial(material);
            const subLabel =
              material.subcategory
                ? getSubcategoryLabel(material.subcategory as any) ?? material.subcategory
                : categoryLabel[material.docCategory ?? "materi"];
            const { babBadge, title: cleanTitle } = parseMaterialTitle(material.title, courseTitle);

            return (
              <li key={material.id}>
                <DocumentItemWrapper
                  material={material}
                  itemHref={itemHref}
                  isPageNav={isPageNav}
                  onSelectPdf={setSelectedPdf}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_160px_100px_auto]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative aspect-[16/10] w-24 sm:w-32 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/20">
                      <CompactDocumentRowThumbnail material={material} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {babBadge && (
                          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-body-2xs font-semibold text-foreground/80 ring-1 ring-border">
                            {babBadge}
                          </span>
                        )}
                        <span
                          className="truncate text-body-sm font-medium leading-snug"
                          title={material.title}
                        >
                          {cleanTitle}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-body-xs text-muted-foreground md:hidden">
                        {subLabel}
                        {material.year ? ` · ${material.year}` : ""}
                        {material.fileSize && !/^diktat(\s+resmi|\s+canonical)?$/i.test(material.fileSize.trim()) ? ` · ${displayFileSizeLabel(material.fileSize, t)}` : ""}
                      </p>
                    </div>
                    {material.locked ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-body-2xs font-semibold text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
                        <LockKeyhole className="size-2.5" />
                        Terkunci
                      </span>
                    ) : material.completed ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-status-success" />
                    ) : null}
                  </div>
                  <span className="hidden truncate text-body-xs text-muted-foreground md:block">
                    {subLabel}
                  </span>
                  <span className="hidden text-body-xs text-muted-foreground md:block">
                    {[
                      material.year ? String(material.year) : null,
                      material.fileSize && !/^diktat(\s+resmi|\s+canonical)?$/i.test(material.fileSize.trim())
                        ? displayFileSizeLabel(material.fileSize, t)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "-"}
                  </span>
                  {isAdmin ? (
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {material.status ? (
                        <Badge
                          variant={material.status === "published" ? "default" : "secondary"}
                          className={cn(
                            "rounded-md px-1.5 py-0 text-[10px] uppercase font-semibold",
                            material.status === "published"
                              ? "bg-status-success/15 text-status-success border-status-success/30"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {material.status === "published" ? t("documents.status.published") : t("documents.status.draft")}
                        </Badge>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                            aria-label={t("documents.documentActions")}
                          >
                            <MoreVertical className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem asChild>
                            <Link href={`${itemHref}?mode=edit`}>
                              <Pencil className="size-3.5 mr-2" />
                              Edit Dokumen
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={itemHref}>
                              <Eye className="size-3.5 mr-2" />
                              Pratinjau
                            </Link>
                          </DropdownMenuItem>
                          {material.url ? (
                            <DropdownMenuItem asChild>
                              <a href={material.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="size-3.5 mr-2" />
                                Buka Berkas PDF
                              </a>
                            </DropdownMenuItem>
                          ) : null}
                          {material.source === "legacy-pdf" ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(material)}
                              >
                                <Trash2 className="size-3.5 mr-2" />
                                Hapus Dokumen
                              </DropdownMenuItem>
                            </>
                          ) : null}
                          {material.source === "canonical-article" || material.source === "canonical-diktat" ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/courses/${encodeURIComponent(courseSlug || courseId)}/review?tab=product`}>
                                  <BookOpenCheck className="size-3.5 mr-2" />
                                  Kelola Review
                                </Link>
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {material.url && allowDownload ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                          asChild
                          title={t("documents.downloadPdf")}
                          aria-label={`Unduh PDF ${material.title}`}
                        >
                          <a href={material.url} download target="_blank" rel="noopener noreferrer">
                            <Download className="size-3.5" />
                          </a>
                        </Button>
                      ) : null}
                      <ChevronRight className="size-4 text-muted-foreground/60" />
                    </div>
                  )}
                </DocumentItemWrapper>
              </li>
            );
          })}
        </ul>
      )}

      {/* Empty State when tab has no items */}
      {tabMaterials.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border/60 bg-muted/15 px-4 py-10 text-center">
          {(() => {
            const ActiveIcon = tabConfig.find((t) => t.key === activeTab)?.icon ?? FileText;
            return <ActiveIcon className="size-6 text-muted-foreground" aria-hidden />;
          })()}
          <h2 className="mt-3 font-heading text-body-sm font-bold">
            {t("documents.emptyForCategory", { category: t(`documents.categories.${tabConfig.find((tab) => tab.key === activeTab)?.label ?? "material"}`).toLowerCase() })}
          </h2>
          <p className="mt-1 text-body-xs text-muted-foreground">
            {t(`documents.empty.${activeTab}`)}
          </p>
        </div>
      ) : filteredMaterials.length === 0 ? (
        /* Empty State when search or filter returns no results */
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border/60 bg-muted/15 px-4 py-10 text-center">
          <FileText className="size-6 text-muted-foreground" aria-hidden />
          <h2 className="mt-3 font-heading text-body-sm font-bold">{t("documents.noResultsTitle")}</h2>
          <p className="mt-1 text-body-xs text-muted-foreground">
            {t("documents.noResultsDescription")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 rounded-md text-body-sm"
            onClick={() => {
              setFilters(emptyFilters());
              setSearchQuery("");
            }}
          >
            {t("documents.resetSearch")}
          </Button>
        </div>
      ) : null}

      <PdfViewerModal
        material={selectedPdf}
        onClose={() => setSelectedPdf(null)}
        allowDownload={allowDownload}
      />

      {/* Upload Dialog for Admin */}
      {isAdmin ? (
        <AdminUploadDocumentDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          courseId={courseId}
          courseTitle={courseTitle || t("courseCatalog.genericCourse")}
          chapters={chapters}
          existingTitles={materials.map((m) => m.title)}
        />
      ) : null}

      {/* Delete Confirm Dialog for Admin */}
      {isAdmin && deleteTarget ? (
        <AdminConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={t("documents.deleteTitle")}
          description={t("documents.deleteDescription", { title: deleteTarget.title })}
          confirmLabel={t("documents.delete")}
          loading={isDeleting}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}
    </div>
  );
}
