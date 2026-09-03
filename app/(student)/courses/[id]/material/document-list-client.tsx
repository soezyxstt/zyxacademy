"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Archive, BookOpen, CheckCircle2, ChevronRight, FileCode, FileText, Filter, LayoutGrid, List } from "lucide-react";
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

function categoryConfig(category?: DocCategory) {
  if (category === "soal") return { icon: FileCode, className: "bg-status-warning/12 text-status-warning" };
  if (category === "solusi") return { icon: CheckCircle2, className: "bg-status-success/12 text-status-success" };
  if (category === "diktat") return { icon: Archive, className: "bg-status-error/12 text-status-error" };
  return { icon: BookOpen, className: "bg-brand-primary/10 text-brand-primary" };
}

function DocumentPreview({ material }: { material: CourseMaterial }) {
  const [imageError, setImageError] = useState(false);
  return (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-border/60 bg-muted/25 p-3">
      {material.thumbnailUrl && !imageError ? (
        <div className="relative size-full">
          <Image src={material.thumbnailUrl} alt={`Pratinjau ${material.title}`} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-contain object-center transition-transform duration-200 group-hover:scale-[1.015]" onError={() => setImageError(true)} />
        </div>
      ) : (
        <div className="flex h-full w-[72%] max-w-44 flex-col justify-between rounded-md border border-border bg-background p-4 shadow-xs">
          <div className="flex items-center justify-between text-body-xs text-muted-foreground"><FileText className="size-4" aria-hidden /><span>{material.kind === "pdf" ? "PDF" : "DOC"}</span></div>
          <div className="space-y-2" aria-hidden><div className="h-2 w-3/4 rounded-sm bg-foreground/20" /><div className="h-1.5 w-full rounded-sm bg-foreground/10" /><div className="h-1.5 w-5/6 rounded-sm bg-foreground/10" /><div className="h-1.5 w-2/3 rounded-sm bg-foreground/10" /></div>
          <span className="truncate text-body-xs font-semibold text-foreground">{material.title}</span>
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
            const config = categoryConfig(material.docCategory); const Icon = config.icon;
            return (
              <Link key={material.id} href={`/courses/${courseId}/material/${material.id}`} className="group min-w-0 overflow-hidden rounded-lg border border-border/70 bg-card transition-colors hover:border-primary/50">
                <DocumentPreview material={material} />
                <div className="flex items-start gap-2.5 p-3">
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", config.className)}><Icon className="size-3.5" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-body-sm font-semibold text-foreground group-hover:text-primary">{material.title}</p><p className="mt-0.5 truncate text-body-xs text-muted-foreground">{categoryLabel[material.docCategory ?? "materi"]}{material.year ? ` · ${material.year}` : ""}{material.fileSize ? ` · ${material.fileSize}` : ""}</p></div>
                  {material.completed ? <CheckCircle2 className="size-4 shrink-0 text-status-success" aria-label="Selesai dipelajari" /> : null}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/70 bg-card">
          {filteredMaterials.map((material) => {
            const config = categoryConfig(material.docCategory); const Icon = config.icon;
            return <li key={material.id}><Link href={`/courses/${courseId}/material/${material.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 hover:bg-muted/35 md:grid-cols-[minmax(0,1fr)_140px_80px_auto]"><div className="flex min-w-0 items-center gap-3"><span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", config.className)}><Icon className="size-3.5" /></span><span className="truncate text-body-sm font-semibold">{material.title}</span>{material.completed ? <CheckCircle2 className="size-3.5 shrink-0 text-status-success" /> : null}</div><span className="hidden truncate text-body-xs text-muted-foreground md:block">{categoryLabel[material.docCategory ?? "materi"]}</span><span className="hidden text-body-xs text-muted-foreground md:block">{material.year ?? "-"}</span><ChevronRight className="size-4 text-muted-foreground" /></Link></li>;
          })}
        </ul>
      )}
      {filteredMaterials.length === 0 ? <div className="flex flex-col items-center rounded-lg border border-dashed border-border bg-muted/15 px-4 py-10 text-center"><FileText className="size-6 text-muted-foreground" aria-hidden /><h2 className="mt-3 font-heading text-body-sm font-bold">Dokumen tidak ditemukan</h2><p className="mt-1 text-body-xs text-muted-foreground">Ubah pencarian atau reset filter yang aktif.</p><Button type="button" variant="outline" size="sm" className="mt-4 rounded-md" onClick={() => { setFilters(emptyFilters()); setSearchQuery(""); }}>Reset pencarian</Button></div> : null}
    </div>
  );
}
