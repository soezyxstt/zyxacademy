"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, CheckCircle2, ChevronRight, FileCode, FileText, Filter, LayoutGrid, List, MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchBar } from "@/components/ui/search-bar";
import { cn } from "@/lib/utils";
import type { CourseMaterial, DocCategory } from "@/lib/student-course-fixtures";
import { getSubcategoryLabel, type CourseMaterialSubcategory } from "@/lib/course-materials";
import { materialMatchesDocumentFilters, type DocumentFilterState } from "@/lib/document-filters";

type Chapter = { id: string; title: string; orderIndex: number };
type DocumentListClientProps = { courseId: string; materials: CourseMaterial[]; chapters: Chapter[] };

const categoryLabel: Record<string, string> = {
  materi: "Materi",
  soal: "Soal",
  solusi: "Pembahasan",
  diktat: "Diktat",
};
const categories: DocCategory[] = ["materi", "soal", "solusi", "diktat"];
const emptyFilters = (): DocumentFilterState => ({ categories: new Set(), subcategories: new Set(), chapters: new Set(), years: new Set() });

function DocumentHeaderIcon({ kind, docCategory }: { kind?: string; docCategory?: DocCategory }) {
  if (kind === "pdf") {
    return <FileText className="size-4 shrink-0 text-[#ea4335]" aria-hidden />;
  }
  if (docCategory === "soal") {
    return <FileCode className="size-4 shrink-0 text-amber-500" aria-hidden />;
  }
  if (docCategory === "solusi") {
    return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden />;
  }
  if (docCategory === "diktat") {
    return <BookOpen className="size-4 shrink-0 text-indigo-500" aria-hidden />;
  }
  return <FileText className="size-4 shrink-0 text-blue-500" aria-hidden />;
}

function DocumentPlaceholder({
  kind,
  docCategory,
  isLoading,
}: {
  kind?: string;
  docCategory?: DocCategory;
  isLoading?: boolean;
}) {
  let badgeText = "DOC";
  let badgeColor = "bg-blue-500";

  if (kind === "pdf") {
    badgeText = "PDF";
    badgeColor = "bg-[#ea4335]";
  } else if (docCategory === "soal") {
    badgeText = "SOAL";
    badgeColor = "bg-amber-500";
  } else if (docCategory === "solusi") {
    badgeText = "SOLUSI";
    badgeColor = "bg-emerald-500";
  } else if (docCategory === "diktat") {
    badgeText = "DIKTAT";
    badgeColor = "bg-indigo-500";
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
      {/* Clean centered badge placeholder (loading or fallback) */}
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
            isLoading={hasThumbnail && !imageLoaded}
          />
        </div>
      )}

      {/* Crisp document thumbnail image */}
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

function FilterGroup({ label, options, selected, onToggle }: { label: string; options: Array<{ value: string; label: string; count?: number }>; selected: Set<string>; onToggle: (value: string) => void }) {
  if (options.length === 0) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-body-xs font-semibold text-muted-foreground">{label}</legend>
      <div className="grid max-h-36 gap-1 overflow-y-auto pr-1">
        {options.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-body-sm hover:bg-muted/60">
            <Checkbox checked={selected.has(option.value)} onCheckedChange={() => onToggle(option.value)} />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {typeof option.count === "number" ? <span className="text-body-xs text-muted-foreground">{option.count}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DocumentListClient({ courseId, materials, chapters }: DocumentListClientProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<DocumentFilterState>(emptyFilters);
  const years = useMemo(() => Array.from(new Set(materials.flatMap((material) => typeof material.year === "number" ? [material.year] : []))).sort((a, b) => b - a), [materials]);
  const subcategories = useMemo(() => {
    const values = new Set<string>();
    for (const material of materials) if (material.subcategory) values.add(material.subcategory);
    return Array.from(values).sort((left, right) => (getSubcategoryLabel(left) ?? left).localeCompare(getSubcategoryLabel(right) ?? right, "id"));
  }, [materials]);
  const filteredMaterials = useMemo(() => materials.filter((material) => materialMatchesDocumentFilters(material, filters, searchQuery)), [filters, materials, searchQuery]);
  const activeFilterCount = filters.categories.size + filters.subcategories.size + filters.chapters.size + filters.years.size;
  const toggleFilter = (group: keyof DocumentFilterState, value: string) => setFilters((current) => {
    const next = new Set(current[group]);
    if (next.has(value)) next.delete(value); else next.add(value);
    return { ...current, [group]: next };
  });

  return (
    <div className="space-y-3 font-sans">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar size="sm" variant="bordered" value={searchQuery} onSearch={setSearchQuery} onClear={() => setSearchQuery("")} placeholder="Cari dokumen..." containerClassName="min-w-[140px] flex-1 sm:max-w-sm" />
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 rounded-md text-body-sm"><Filter className="size-3.5" aria-hidden />Filter{activeFilterCount > 0 ? <Badge className="ml-0.5 rounded-md px-1.5 py-0 text-body-xs">{activeFilterCount}</Badge> : null}</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] space-y-4 p-3">
            <div className="flex items-center justify-between"><p className="font-heading text-body-sm font-bold">Filter dokumen</p>{activeFilterCount > 0 ? <Button type="button" variant="ghost" size="sm" onClick={() => setFilters(emptyFilters())} className="h-7 px-2 text-body-xs">Reset</Button> : null}</div>
            <FilterGroup label="Tipe" selected={filters.categories} onToggle={(value) => toggleFilter("categories", value)} options={categories.map((value) => ({ value, label: categoryLabel[value], count: materials.filter((material) => (material.docCategory ?? "materi") === value).length }))} />
            <FilterGroup label="Subkategori" selected={filters.subcategories} onToggle={(value) => toggleFilter("subcategories", value)} options={subcategories.map((value) => ({ value, label: getSubcategoryLabel(value as CourseMaterialSubcategory) ?? value }))} />
            <FilterGroup label="Bab" selected={filters.chapters} onToggle={(value) => toggleFilter("chapters", value)} options={chapters.map((chapter) => ({ value: chapter.id, label: `Bab ${chapter.orderIndex}: ${chapter.title}` }))} />
            <FilterGroup label="Tahun" selected={filters.years} onToggle={(value) => toggleFilter("years", value)} options={years.map((year) => ({ value: String(year), label: String(year) }))} />
          </PopoverContent>
        </Popover>
        <div className="ml-auto flex shrink-0 items-center rounded-md border border-border bg-muted/30 p-0.5">
          <Button type="button" size="icon" variant={viewMode === "grid" ? "secondary" : "ghost"} className="size-8 rounded-md" onClick={() => setViewMode("grid")} aria-label="Tampilan grid"><LayoutGrid className="size-4" /></Button>
          <Button type="button" size="icon" variant={viewMode === "list" ? "secondary" : "ghost"} className="size-8 rounded-md" onClick={() => setViewMode("list")} aria-label="Tampilan daftar"><List className="size-4" /></Button>
        </div>
      </div>
      {activeFilterCount > 0 ? <div className="flex items-center gap-2 text-body-xs text-muted-foreground"><span>{activeFilterCount} filter aktif</span><Button type="button" variant="link" size="sm" onClick={() => setFilters(emptyFilters())} className="h-auto p-0 text-body-xs">Reset</Button></div> : null}

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredMaterials.map((material) => {
            return (
              <Link
                key={material.id}
                href={`/courses/${courseId}/material/${material.id}`}
                className="group flex flex-col min-w-0 overflow-hidden rounded-xl border border-border/50 bg-card transition-all duration-150 hover:border-border/90 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {/* Header (Google Drive style: icon, title, subtitle, status) */}
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <DocumentHeaderIcon kind={material.kind} docCategory={material.docCategory} />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-body-sm font-medium text-foreground group-hover:text-primary leading-tight"
                      title={material.title}
                    >
                      {material.title}
                    </p>
                    <p className="mt-0.5 truncate text-body-xs text-muted-foreground leading-none">
                      {categoryLabel[material.docCategory ?? "materi"]}
                      {material.year ? ` · ${material.year}` : ""}
                      {material.fileSize ? ` · ${material.fileSize}` : ""}
                    </p>
                  </div>
                  {material.completed ? (
                    <CheckCircle2 className="size-4 shrink-0 text-status-success" aria-label="Selesai dipelajari" />
                  ) : (
                    <MoreVertical className="size-3.5 shrink-0 text-muted-foreground/35 transition-colors group-hover:text-muted-foreground/70" aria-hidden />
                  )}
                </div>

                {/* Body (Preview or Placeholder) */}
                <div className="border-t border-border/40">
                  <DocumentPreview material={material} />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <ul className="divide-y divide-border/50 rounded-xl border border-border/50 bg-card overflow-hidden">
          {filteredMaterials.map((material) => {
            return (
              <li key={material.id}>
                <Link
                  href={`/courses/${courseId}/material/${material.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_140px_80px_auto]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <DocumentHeaderIcon kind={material.kind} docCategory={material.docCategory} />
                    <span className="truncate text-body-sm font-medium leading-snug" title={material.title}>
                      {material.title}
                    </span>
                    {material.completed ? <CheckCircle2 className="size-3.5 shrink-0 text-status-success" /> : null}
                  </div>
                  <span className="hidden truncate text-body-xs text-muted-foreground md:block">
                    {categoryLabel[material.docCategory ?? "materi"]}
                  </span>
                  <span className="hidden text-body-xs text-muted-foreground md:block">
                    {material.year ?? "-"}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground/60" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {filteredMaterials.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border/60 bg-muted/15 px-4 py-10 text-center">
          <FileText className="size-6 text-muted-foreground" aria-hidden />
          <h2 className="mt-3 font-heading text-body-sm font-bold">Dokumen tidak ditemukan</h2>
          <p className="mt-1 text-body-xs text-muted-foreground">Ubah pencarian atau reset filter yang aktif.</p>
          <Button type="button" variant="outline" size="sm" className="mt-4 rounded-md text-body-sm" onClick={() => { setFilters(emptyFilters()); setSearchQuery(""); }}>
            Reset pencarian
          </Button>
        </div>
      ) : null}
    </div>
  );
}
