"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Archive,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileCode,
  LayoutGrid,
  List,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CourseMaterial, DocCategory } from "@/lib/student-course-fixtures";
import {
  getSubcategoryLabel,
  MATERI_SUBCATEGORIES,
  SOAL_SUBCATEGORIES,
  type CourseMaterialSubcategory,
} from "@/lib/course-materials";

type Chapter = {
  id: string;
  title: string;
  orderIndex: number;
};

type DocumentListClientProps = {
  courseId: string;
  materials: CourseMaterial[];
  chapters: Chapter[];
};

const categoryLabel: Record<string, string> = {
  materi: "Materi",
  soal: "Soal",
  solusi: "Pembahasan Soal",
  diktat: "Diktat",
};

const categories = ["all", "materi", "soal", "solusi", "diktat"] as const;

const getCategoryStyle = (category?: DocCategory) => {
  switch (category) {
    case "soal":
      return {
        icon: FileCode,
        badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20",
        label: "Soal",
        stamp: "SOAL",
      };
    case "solusi":
      return {
        icon: CheckCircle2,
        badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
        label: "Pembahasan Soal",
        stamp: "SOLUSI",
      };
    case "diktat":
      return {
        icon: Archive,
        badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/20",
        label: "Diktat",
        stamp: "PDF DIKTAT",
      };
    default:
      return {
        icon: BookOpen,
        badgeClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20",
        label: "Materi",
        stamp: "MATERI",
      };
  }
};

function DocumentThumbnailPreview({ material }: { material: CourseMaterial }) {
  const [imageError, setImageError] = useState(false);
  const [pdfFrameError, setPdfFrameError] = useState(false);
  const config = getCategoryStyle(material.docCategory);
  const cleanSnippet = material.body
    ? material.body
        .replace(/^#+\s+[^\n]+/gm, "")
        .replace(/[*_`#~\[\]]/g, "")
        .trim()
    : null;

  const showImage = Boolean(material.thumbnailUrl) && !imageError;
  const showPdfFrame = !showImage && material.kind === "pdf" && Boolean(material.url) && !pdfFrameError;

  return (
    <div className="relative h-36 w-full bg-muted/40 dark:bg-muted/20 flex items-center justify-center p-3 overflow-hidden border-y border-border/50 select-none group-hover:bg-muted/60 transition-colors">
      <div className="w-full h-full max-w-[200px] bg-background dark:bg-card rounded-sm border border-border/70 shadow-2xs overflow-hidden group-hover:scale-[1.02] transition-transform duration-200 relative flex flex-col justify-between p-2.5">
        {showImage ? (
          <div className="relative w-full h-full">
            <Image
              src={material.thumbnailUrl!}
              alt={material.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover object-top rounded-xs"
              onError={() => setImageError(true)}
            />
          </div>
        ) : showPdfFrame ? (
          <div className="relative w-full h-full overflow-hidden bg-white dark:bg-zinc-950 rounded-xs pointer-events-none select-none">
            <iframe
              src={`${material.url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
              title={material.title}
              className="w-[300%] h-[300%] origin-top-left scale-[0.333] border-0 absolute top-0 left-0 pointer-events-none select-none"
              tabIndex={-1}
              loading="lazy"
              onError={() => setPdfFrameError(true)}
            />
          </div>
        ) : (
          <>
            {/* Top mini header on sheet */}
            <div className="flex items-center justify-between gap-1 border-b border-border/40 pb-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate">
                {config.stamp}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
                {material.kind === "pdf" ? "PDF" : "DOC"}
              </span>
            </div>

            {/* Middle content preview */}
            <div className="my-auto py-1 space-y-1.5 overflow-hidden">
              {cleanSnippet ? (
                <p className="text-[10px] leading-relaxed text-muted-foreground line-clamp-3 font-sans break-words">
                  {cleanSnippet}
                </p>
              ) : material.docCategory === "soal" ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold bg-amber-500/10 text-amber-600 px-1 py-0.5 rounded-md">Q1</span>
                    <div className="h-1.5 bg-muted rounded-xs w-4/5" />
                  </div>
                  <div className="space-y-1 pl-2">
                    <div className="h-1 bg-muted/70 rounded-xs w-3/4" />
                    <div className="h-1 bg-muted/70 rounded-xs w-2/3" />
                    <div className="h-1 bg-muted/70 rounded-xs w-4/5" />
                  </div>
                </div>
              ) : material.docCategory === "solusi" ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 px-1 py-0.5 rounded-md">SOLUSI</span>
                    <div className="h-1.5 bg-muted rounded-xs w-2/3" />
                  </div>
                  <div className="space-y-1 pl-2">
                    <div className="h-1 bg-muted/70 rounded-xs w-4/5" />
                    <div className="h-1 bg-muted/70 rounded-xs w-3/5" />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="h-2 bg-muted rounded-xs w-3/4" />
                  <div className="h-1 bg-muted/70 rounded-xs w-full" />
                  <div className="h-1 bg-muted/70 rounded-xs w-5/6" />
                  <div className="h-1 bg-muted/70 rounded-xs w-4/5" />
                  <div className="h-1 bg-muted/70 rounded-xs w-2/3" />
                </div>
              )}
            </div>

            {/* Bottom footer bar of sheet */}
            <div className="flex items-center justify-between pt-1 border-t border-border/30 text-[10px] text-muted-foreground/60 font-mono">
              <span className="truncate max-w-[120px]">{material.title}</span>
              <span>1</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function DocumentListClient({ courseId, materials, chapters }: DocumentListClientProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [activeSubcategory, setActiveSubcategory] = useState<string>("all");
  const [activeChapterId, setActiveChapterId] = useState<string>("all");
  const [activeYear, setActiveYear] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Extract available years from materials
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const m of materials) {
      if (typeof m.year === "number") {
        years.add(m.year);
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [materials]);

  // Compute available subcategories based on activeTab
  const availableSubcategories = useMemo(() => {
    if (activeTab === "materi") {
      return MATERI_SUBCATEGORIES;
    }
    if (activeTab === "soal" || activeTab === "solusi") {
      return SOAL_SUBCATEGORIES;
    }
    // "all" or "diktat": list unique subcategories present in materials
    const seen = new Set<string>();
    const list: Array<{ value: CourseMaterialSubcategory; label: string }> = [];
    for (const m of materials) {
      if (m.subcategory && !seen.has(m.subcategory)) {
        seen.add(m.subcategory);
        const label = getSubcategoryLabel(m.subcategory);
        if (label) {
          list.push({ value: m.subcategory as CourseMaterialSubcategory, label });
        }
      }
    }
    return list;
  }, [activeTab, materials]);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    setActiveSubcategory("all");
  };

  const filteredMaterials = materials.filter((material) => {
    // 1. Filter by category
    if (activeTab !== "all" && material.docCategory !== activeTab) {
      return false;
    }

    // 2. Filter by subcategory
    if (activeSubcategory !== "all" && material.subcategory !== activeSubcategory) {
      return false;
    }

    // 3. Filter by year
    if (activeYear !== "all") {
      if (String(material.year) !== activeYear) {
        return false;
      }
    }

    // 4. Filter by chapter
    if (activeChapterId !== "all") {
      const materialChapterIds: string[] = Array.isArray(material.chapterIds)
        ? material.chapterIds
        : typeof material.chapterIds === "string"
        ? JSON.parse(material.chapterIds)
        : material.chapterId
        ? [material.chapterId]
        : [];
      
      if (!materialChapterIds.includes(activeChapterId)) {
        return false;
      }
    }

    // 5. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = material.title.toLowerCase().includes(q);
      const subLabel = getSubcategoryLabel(material.subcategory)?.toLowerCase() || "";
      const matchSub = subLabel.includes(q);
      const matchYear = material.year ? String(material.year).includes(q) : false;
      if (!matchTitle && !matchSub && !matchYear) {
        return false;
      }
    }

    return true;
  });

  const categoryCounts = materials.reduce<Record<string, number>>(
    (acc, material) => {
      const key = material.docCategory || "materi";
      acc.all += 1;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { all: 0, materi: 0, soal: 0, solusi: 0, diktat: 0 }
  );

  const hasActiveFilters =
    activeTab !== "all" ||
    activeSubcategory !== "all" ||
    activeChapterId !== "all" ||
    activeYear !== "all" ||
    Boolean(searchQuery.trim());

  const resetFilters = () => {
    setActiveTab("all");
    setActiveSubcategory("all");
    setActiveChapterId("all");
    setActiveYear("all");
    setSearchQuery("");
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Level 1: Category Filter */}
          <Select value={activeTab} onValueChange={handleTabChange}>
            <SelectTrigger className="h-9 w-auto min-w-[130px] rounded-lg text-body-sm bg-background">
              <SelectValue placeholder="Semua tipe" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category === "all" ? "Semua tipe" : categoryLabel[category]} ({categoryCounts[category] || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Level 2: Subcategory Filter */}
          {availableSubcategories.length > 0 && (
            <Select value={activeSubcategory} onValueChange={setActiveSubcategory}>
              <SelectTrigger className="h-9 w-auto min-w-[130px] rounded-lg text-body-sm bg-background">
                <SelectValue placeholder="Sub-kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua sub-kategori</SelectItem>
                {availableSubcategories.map((sub) => (
                  <SelectItem key={sub.value} value={sub.value}>
                    {sub.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Chapter Filter */}
          {chapters.length > 0 && (
            <Select value={activeChapterId} onValueChange={setActiveChapterId}>
              <SelectTrigger className="h-9 w-auto min-w-[130px] max-w-[200px] sm:max-w-[240px] rounded-lg text-body-sm bg-background truncate">
                <SelectValue placeholder="Semua bab" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua bab</SelectItem>
                {chapters.map((chapter) => (
                  <SelectItem key={chapter.id} value={chapter.id}>
                    Bab {chapter.orderIndex}: {chapter.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Year Filter */}
          {availableYears.length > 0 && (
            <Select value={activeYear} onValueChange={setActiveYear}>
              <SelectTrigger className="h-9 w-auto min-w-[100px] rounded-lg text-body-sm bg-background">
                <SelectValue placeholder="Semua tahun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua tahun</SelectItem>
                {availableYears.map((yr) => (
                  <SelectItem key={yr} value={String(yr)}>
                    {yr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Inline Search Input */}
          <div className="relative min-w-[140px] flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari dokumen..."
              className="h-9 pl-8 pr-7 text-body-sm rounded-lg bg-background"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-9 text-body-xs text-muted-foreground hover:text-foreground px-2"
            >
              Reset
            </Button>
          )}
        </div>

        {/* View Mode Switcher */}
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5 self-end sm:self-auto">
          <Button
            type="button"
            size="icon"
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            className="size-8 rounded-md"
            onClick={() => setViewMode("grid")}
            aria-label="Tampilan grid"
            title="Tampilan grid"
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
            title="Tampilan daftar"
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredMaterials.map((material) => {
            const config = getCategoryStyle(material.docCategory);
            const Icon = config.icon;
            const subLabel = getSubcategoryLabel(material.subcategory);

            return (
              <Link
                key={material.id}
                href={`/courses/${courseId}/material/${material.id}`}
                className="group flex flex-col justify-between rounded-xl border border-border/70 bg-card hover:border-primary/50 hover:shadow-xs transition-all overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center gap-2.5 p-3 pb-2 bg-card min-w-0">
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", config.badgeClass)}>
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span
                      className="truncate block text-body-sm font-semibold text-foreground group-hover:text-primary transition-colors"
                      title={material.title}
                    >
                      {material.title}
                    </span>
                  </div>
                  {material.completed && (
                    <span title="Selesai dipelajari" className="shrink-0 text-emerald-500">
                      <CheckCircle2 className="size-4" />
                    </span>
                  )}
                </div>

                {/* Thumbnail Preview Area */}
                <DocumentThumbnailPreview material={material} />

                {/* Footer with Category, Subcategory, and Year */}
                <div className="flex items-center justify-between gap-1.5 p-2.5 px-3 bg-card text-body-xs text-muted-foreground border-t border-border/40">
                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                    <span className="font-medium text-foreground truncate">
                      {material.docCategory ? categoryLabel[material.docCategory] : "Materi"}
                    </span>
                    {subLabel && (
                      <span className="text-muted-foreground text-[10px] bg-muted/60 px-1.5 py-0.5 rounded-md truncate">
                        {subLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 font-mono text-[10px]">
                    {material.year && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 rounded-md">
                        {material.year}
                      </Badge>
                    )}
                    <span className="text-muted-foreground/80">
                      {material.fileSize || (material.kind === "pdf" ? "PDF" : "Artikel")}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          <ul className="divide-y divide-border/70 rounded-lg border border-border/70 bg-card/75 backdrop-blur-sm">
            {filteredMaterials.map((material) => {
              const config = getCategoryStyle(material.docCategory);
              const Icon = config.icon;
              const subLabel = getSubcategoryLabel(material.subcategory);

              return (
                <li key={material.id}>
                  <Link
                    href={`/courses/${courseId}/material/${material.id}`}
                    className="group grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/35 md:grid-cols-[1fr_140px_80px_70px_auto]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", config.badgeClass)}>
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="block truncate text-body-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {material.title}
                          </span>
                          {material.completed && (
                            <span title="Selesai dipelajari" className="shrink-0 text-emerald-500">
                              <CheckCircle2 className="size-3.5" />
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-body-xs text-muted-foreground md:hidden">
                          <span>{material.docCategory ? categoryLabel[material.docCategory] : "Materi"}</span>
                          {subLabel && <span>· {subLabel}</span>}
                          {material.year && <span>· {material.year}</span>}
                          <span>· {material.fileSize || (material.kind === "pdf" ? "PDF" : "Artikel")}</span>
                        </div>
                      </div>
                    </div>

                    {/* Category and Subcategory (Desktop) */}
                    <div className="hidden min-w-0 md:flex flex-col text-body-xs">
                      <span className="font-medium text-foreground truncate">
                        {material.docCategory ? categoryLabel[material.docCategory] : "Materi"}
                      </span>
                      {subLabel && (
                        <span className="text-[10px] text-muted-foreground truncate">{subLabel}</span>
                      )}
                    </div>

                    {/* Year (Desktop) */}
                    <span className="hidden text-body-xs font-mono text-muted-foreground md:block">
                      {material.year ? material.year : "-"}
                    </span>

                    {/* Format (Desktop) */}
                    <span className="hidden text-body-xs text-muted-foreground md:block font-mono text-right">
                      {material.fileSize || (material.kind === "pdf" ? "PDF" : "Artikel")}
                    </span>

                    <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-70 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {filteredMaterials.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/15 py-12 text-center">
          <p className="text-body-sm text-muted-foreground">Tidak ada dokumen yang cocok dengan filter yang dipilih.</p>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={resetFilters}
              className="mt-2 text-body-xs text-brand-primary"
            >
              Reset semua filter
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
