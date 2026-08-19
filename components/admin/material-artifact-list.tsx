"use client";

import { useMemo, useState } from "react";
import { Upload, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/search-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AdminTable } from "@/components/admin/table";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { MaterialArtifactCard, type MaterialBundleRow } from "@/components/admin/material-workflow-ui";

type Props = {
  rows: MaterialBundleRow[];
  kind: "idea" | "product";
  courseLabels?: Record<string, string>;
  authorLabels?: Record<string, string>;
  onInspect: (id: string) => void;
  onUpload: () => void;
  loading?: boolean;
};

const statusLabels: Record<string, string> = {
  validated: "Menunggu review",
  approved: "Disetujui",
  rejected: "Ditolak",
  staged: "Staged",
  published: "Published",
  archived: "Diarsipkan",
};

function rowText(row: MaterialBundleRow, courseLabels: Record<string, string>, authorLabels: Record<string, string>): string {
  return [
    row.id,
    row.bundleId,
    row.courseId,
    courseLabels[row.courseId ?? ""] ?? "",
    authorLabels[row.requestedBy ?? ""] ?? "",
    statusLabels[row.status] ?? row.status,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function MaterialArtifactList({
  rows,
  kind,
  courseLabels = {},
  authorLabels = {},
  onInspect,
  onUpload,
  loading = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const courseOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.courseId).filter(Boolean) as string[])), [rows]);
  const authorOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.requestedBy).filter(Boolean) as string[])), [rows]);
  const statusOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.status))), [rows]);
  const needle = query.trim().toLowerCase();
  const visibleRows = rows.filter((row) => (
    (courseFilter === "all" || row.courseId === courseFilter) &&
    (authorFilter === "all" || row.requestedBy === authorFilter) &&
    (statusFilter === "all" || row.status === statusFilter) &&
    (!needle || rowText(row, courseLabels, authorLabels).includes(needle))
  ));
  const hasFilters = Boolean(needle || courseFilter !== "all" || authorFilter !== "all" || statusFilter !== "all");
  const label = kind === "idea" ? "Source Pack + Idea" : "Product";

  function resetFilters() {
    setQuery("");
    setCourseFilter("all");
    setAuthorFilter("all");
    setStatusFilter("all");
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <SearchBar
          size="sm"
          value={query}
          onSearch={setQuery}
          onClear={() => setQuery("")}
          placeholder={`Cari ${label.toLowerCase()}...`}
          aria-label={`Cari ${label}`}
          containerClassName="flex-1 min-w-0"
        />
        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger className="w-[140px] sm:w-[160px] h-9 text-body-xs rounded-lg shrink-0" aria-label="Filter mata kuliah">
            <SelectValue placeholder="Semua mata kuliah" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua mata kuliah</SelectItem>
            {courseOptions.map((courseId) => <SelectItem key={courseId} value={courseId}>{courseLabels[courseId] ?? courseId}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={authorFilter} onValueChange={setAuthorFilter}>
          <SelectTrigger className="w-[130px] sm:w-[150px] h-9 text-body-xs rounded-lg shrink-0" aria-label="Filter pembuat">
            <SelectValue placeholder="Semua pembuat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua pembuat</SelectItem>
            {authorOptions.map((authorId) => <SelectItem key={authorId} value={authorId}>{authorLabels[authorId] ?? "Admin"}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px] sm:w-[140px] h-9 text-body-xs rounded-lg shrink-0" aria-label="Filter status">
            <SelectValue placeholder="Semua status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            {statusOptions.map((status) => <SelectItem key={status} value={status}>{statusLabels[status] ?? status}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="sm" variant="ghost" className="size-9 p-0 rounded-lg shrink-0 text-muted-foreground hover:text-foreground" onClick={resetFilters} aria-label="Reset filter">
                  <RotateCcw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset filter</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="size-9 p-0 rounded-lg shrink-0" onClick={onUpload} disabled={loading} aria-label="Upload ZIP">
                <Upload className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Upload ZIP</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <AdminTable className="divide-y divide-border">
        {visibleRows.length === 0 ? (
          <div className="p-4">
            <AdminEmptyState compact title={rows.length === 0 ? `Belum ada ${label.toLowerCase()}.` : "Tidak ada hasil yang cocok."} description={rows.length === 0 ? "Gunakan tombol Upload ZIP untuk memasukkan hasil generasi MCP." : "Coba ubah kata pencarian atau reset filter."} />
          </div>
        ) : visibleRows.map((item) => (
          <MaterialArtifactCard
            key={item.id}
            row={item}
            kind={kind}
            courseLabel={item.courseId ? courseLabels[item.courseId] : undefined}
            authorLabel={item.requestedBy ? authorLabels[item.requestedBy] : undefined}
            onInspect={() => onInspect(item.id)}
            loading={loading}
          />
        ))}
      </AdminTable>
    </section>
  );
}
