"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileCode,
  FileText,
  Filter,
  GraduationCap,
  LayoutGrid,
  List,
  MoreVertical,
  X,
} from "lucide-react";
import { Dialog as DialogNs } from "radix-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchBar } from "@/components/ui/search-bar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { cn } from "@/lib/utils";
import type { CourseMaterial, DocCategory } from "@/lib/student-course-fixtures";
import { getSubcategoryLabel, type CourseMaterialSubcategory } from "@/lib/course-materials";
import { materialMatchesDocumentFilters, type DocumentFilterState } from "@/lib/document-filters";

type Chapter = { id: string; title: string; orderIndex: number };
type TabKey = "materi" | "diktat" | "pdf" | "bank_soal";

type DocumentListClientProps = {
  courseId: string;
  materials: CourseMaterial[];
  chapters: Chapter[];
  defaultTab?: string;
};

const tabConfig: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: "materi", label: "Materi", icon: FileText },
  { key: "diktat", label: "Diktat", icon: BookOpen },
  { key: "pdf", label: "PDF", icon: FileText },
  { key: "bank_soal", label: "Bank Soal", icon: ClipboardList },
];

const categoryLabel: Record<string, string> = {
  materi: "Materi",
  soal: "Soal",
  solusi: "Pembahasan",
  diktat: "Diktat",
};

const emptyFilters = (): DocumentFilterState => ({
  categories: new Set(),
  subcategories: new Set(),
  chapters: new Set(),
  years: new Set(),
});

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
  let badgeText = "DOC";
  let badgeColor = "bg-blue-500";

  if (kind === "quiz" || subcategory === "kuis") {
    badgeText = "KUIS";
    badgeColor = "bg-amber-500";
  } else if (kind === "tryout" || subcategory === "tryout") {
    badgeText = "TRYOUT";
    badgeColor = "bg-purple-600";
  } else if (docCategory === "solusi") {
    badgeText = "SOLUSI";
    badgeColor = "bg-emerald-500";
  } else if (docCategory === "soal") {
    badgeText = "SOAL";
    badgeColor = "bg-amber-500";
  } else if (docCategory === "diktat") {
    badgeText = "DIKTAT";
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

  const hasThumbnail = Boolean(material.thumbnailUrl) && !imageError;

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
              src={material.thumbnailUrl!}
              alt={`Pratinjau ${material.title}`}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className={cn(
                "object-contain object-center transition-all duration-200 group-hover:scale-[1.015]",
                imageLoaded ? "opacity-100" : "opacity-0"
              )}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </div>
        </div>
      )}
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
  if (isPageNav) {
    return (
      <Link href={itemHref} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelectPdf(material)}
      className={cn(className, "text-left cursor-pointer w-full")}
    >
      {children}
    </button>
  );
}

function PdfViewerModal({
  material,
  onClose,
}: {
  material: CourseMaterial | null;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  if (!material) return null;

  const pdfUrl = material.url;

  return (
    <DialogNs.Root open={Boolean(material)} onOpenChange={(open) => !open && onClose()}>
      <DialogNs.Portal>
        {/* Backdrop overlay */}
        <DialogNs.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />

        {/* Ultra-thin bezel modal container: 0 padding on mobile, 4-6px on desktop */}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-1 md:p-1.5 pointer-events-none">
          <DialogNs.Content
            className="pointer-events-auto relative flex size-full flex-col overflow-hidden rounded-none sm:rounded-lg border-0 sm:border border-border/80 bg-background shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-150"
            aria-label={`Pratinjau dokumen ${material.title}`}
          >
            <DialogNs.Title className="sr-only">{material.title}</DialogNs.Title>
            <DialogNs.Description className="sr-only">
              Pratinjau PDF {material.title}
            </DialogNs.Description>

            {/* Ultra-slim header: 34px height (h-8.5), edge-to-edge */}
            <div className="flex h-8.5 shrink-0 items-center justify-between border-b border-border/80 bg-card px-2.5 sm:px-3">
              {/* Left: Icon, Title, Year */}
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="size-3.5 shrink-0 text-[#ea4335]" aria-hidden />
                <span
                  className="truncate text-body-xs font-semibold text-foreground max-w-[240px] sm:max-w-md md:max-w-xl"
                  title={material.title}
                >
                  {material.title}
                </span>
                {material.year ? (
                  <span className="hidden text-body-2xs text-muted-foreground sm:inline">
                    · {material.year}
                  </span>
                ) : null}
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {pdfUrl ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                    asChild
                  >
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Buka di tab baru"
                      aria-label="Buka di tab baru"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                  title="Tutup (Esc)"
                  aria-label="Tutup pratinjau"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Viewer body: 100% remaining space, 0 padding */}
            <div className="relative flex-1 w-full min-h-0 bg-muted/30">
              {pdfUrl ? (
                <>
                  {!loaded && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground pointer-events-none">
                      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span className="text-body-xs">Memuat PDF...</span>
                    </div>
                  )}
                  <iframe
                    key={material.id}
                    src={pdfUrl}
                    title={material.title}
                    className="size-full border-0"
                    onLoad={() => setLoaded(true)}
                  />
                </>
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
                  <FileText className="size-8 opacity-50" />
                  <p className="text-body-sm font-medium">Tautan berkas PDF belum tersedia.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 rounded-md text-body-xs"
                    onClick={onClose}
                  >
                    Tutup
                  </Button>
                </div>
              )}
            </div>
          </DialogNs.Content>
        </div>
      </DialogNs.Portal>
    </DialogNs.Root>
  );
}

export function DocumentListClient({
  courseId,
  materials,
  chapters,
  defaultTab = "materi",
}: DocumentListClientProps) {
  const initialDefaultTab = normalizeTabKey(defaultTab);
  const [urlTab, setUrlTab] = useUrlTab("tab", initialDefaultTab);
  const activeTab: TabKey = normalizeTabKey(urlTab);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<DocumentFilterState>(emptyFilters);
  const [selectedPdf, setSelectedPdf] = useState<CourseMaterial | null>(null);

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
      {/* Unified Toolbar: Tab Strip, SearchBar, Filter Popover, Grid/List Toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={activeTab} onValueChange={(value) => handleTabChange(normalizeTabKey(value))}>
          <TabsList aria-label="Kategori materi belajar">
            {tabConfig.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.key} value={tab.key}>
                  <Icon className="size-3.5 shrink-0" />
                  <span>{tab.label}</span>
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
          placeholder={`Cari ${tabConfig.find((t) => t.key === activeTab)?.label.toLowerCase()}...`}
          containerClassName="min-w-[140px] flex-1 sm:max-w-xs"
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
                Filter
                {activeFilterCount > 0 ? (
                  <Badge className="ml-0.5 rounded-md px-1.5 py-0 text-body-xs">
                    {activeFilterCount}
                  </Badge>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] space-y-4 p-3">
              <div className="flex items-center justify-between">
                <p className="font-heading text-body-sm font-bold">Filter dokumen</p>
                {activeFilterCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilters(emptyFilters())}
                    className="h-7 px-2 text-body-xs"
                  >
                    Reset
                  </Button>
                ) : null}
              </div>
              {subcategories.length > 0 && (
                <FilterGroup
                  label="Subkategori"
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
                  label="Bab"
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
                  label="Tahun"
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
        <div className="ml-auto flex shrink-0 items-center rounded-md border border-border bg-muted/30 p-0.5">
          <Button
            type="button"
            size="icon"
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            className="size-8 rounded-md"
            onClick={() => setViewMode("grid")}
            aria-label="Tampilan grid"
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            className="size-8 rounded-md"
            onClick={() => setViewMode("list")}
            aria-label="Tampilan daftar"
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>

      {/* Active Filter Indicator */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 text-body-xs text-muted-foreground">
          <span>{activeFilterCount} filter aktif</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => setFilters(emptyFilters())}
            className="h-auto p-0 text-body-xs"
          >
            Reset
          </Button>
        </div>
      )}

      {/* Grid View Mode */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filteredMaterials.map((material) => {
            const itemHref = material.href ?? `/courses/${courseId}/material/${material.id}`;
            const isPageNav = isPageNavigationMaterial(material);
            const subLabel =
              material.subcategory
                ? getSubcategoryLabel(material.subcategory as any) ?? material.subcategory
                : categoryLabel[material.docCategory ?? "materi"];

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
                    <p
                      className="truncate text-body-sm font-medium text-foreground group-hover:text-primary leading-tight"
                      title={material.title}
                    >
                      {material.title}
                    </p>
                    <p className="mt-0.5 truncate text-body-xs text-muted-foreground leading-none">
                      {subLabel}
                      {material.year ? ` · ${material.year}` : ""}
                      {material.fileSize ? ` · ${material.fileSize}` : ""}
                    </p>
                  </div>
                  {material.completed ? (
                    <CheckCircle2
                      className="size-4 shrink-0 text-status-success"
                      aria-label="Selesai dipelajari"
                    />
                  ) : (
                    <MoreVertical
                      className="size-3.5 shrink-0 text-muted-foreground/35 transition-colors group-hover:text-muted-foreground/70"
                      aria-hidden
                    />
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
        /* List View Mode */
        <ul className="divide-y divide-border/50 rounded-xl border border-border/50 bg-card overflow-hidden">
          {filteredMaterials.map((material) => {
            const itemHref = material.href ?? `/courses/${courseId}/material/${material.id}`;
            const isPageNav = isPageNavigationMaterial(material);
            const subLabel =
              material.subcategory
                ? getSubcategoryLabel(material.subcategory as any) ?? material.subcategory
                : categoryLabel[material.docCategory ?? "materi"];

            return (
              <li key={material.id}>
                <DocumentItemWrapper
                  material={material}
                  itemHref={itemHref}
                  isPageNav={isPageNav}
                  onSelectPdf={setSelectedPdf}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_160px_100px_auto]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <DocumentHeaderIcon
                      kind={material.kind}
                      docCategory={material.docCategory}
                      subcategory={material.subcategory}
                    />
                    <span
                      className="truncate text-body-sm font-medium leading-snug"
                      title={material.title}
                    >
                      {material.title}
                    </span>
                    {material.completed ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-status-success" />
                    ) : null}
                  </div>
                  <span className="hidden truncate text-body-xs text-muted-foreground md:block">
                    {subLabel}
                  </span>
                  <span className="hidden text-body-xs text-muted-foreground md:block">
                    {material.fileSize ?? (material.year ? String(material.year) : "-")}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground/60" />
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
            Belum ada berkas {tabConfig.find((t) => t.key === activeTab)?.label.toLowerCase()}
          </h2>
          <p className="mt-1 text-body-xs text-muted-foreground">
            {activeTab === "materi" && "Artikel materi belajar untuk kelas ini belum tersedia."}
            {activeTab === "diktat" && "Diktat resmi untuk kelas ini belum tersedia."}
            {activeTab === "pdf" && "Belum ada materi kuliah PDF yang diunggah untuk kelas ini."}
            {activeTab === "bank_soal" &&
              "Belum ada bank soal, kuis, atau tryout untuk kelas ini."}
          </p>
        </div>
      ) : filteredMaterials.length === 0 ? (
        /* Empty State when search or filter returns no results */
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border/60 bg-muted/15 px-4 py-10 text-center">
          <FileText className="size-6 text-muted-foreground" aria-hidden />
          <h2 className="mt-3 font-heading text-body-sm font-bold">Dokumen tidak ditemukan</h2>
          <p className="mt-1 text-body-xs text-muted-foreground">
            Ubah kata kunci pencarian atau reset filter yang sedang aktif.
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
            Reset pencarian
          </Button>
        </div>
      ) : null}

      <PdfViewerModal
        material={selectedPdf}
        onClose={() => setSelectedPdf(null)}
      />
    </div>
  );
}
