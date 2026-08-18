"use client";

import { useMemo, useState } from "react";
import { ListFilter, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/search-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  draft: "Draft",
  published: "Terbit",
  withdrawn: "Ditarik",
};

function rowText(row: MaterialBundleRow, courseLabels: Record<string, string>, authorLabels: Record<string, string>) {
  return [
    row.id,
    row.bundleId,
    row.courseId ? courseLabels[row.courseId] : "",
    row.requestedBy ? authorLabels[row.requestedBy] : "",
    row.status,
  ].join(" ").toLowerCase();
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

  const courseOptions = useMemo(() => [...new Set(rows.map((row) => row.courseId).filter((value): value is string => Boolean(value)))].sort((left, right) => (courseLabels[left] ?? left).localeCompare(courseLabels[right] ?? right)), [courseLabels, rows]);
  const authorOptions = useMemo(() => [...new Set(rows.map((row) => row.requestedBy).filter((value): value is string => Boolean(value)))].sort((left, right) => (authorLabels[left] ?? left).localeCompare(authorLabels[right] ?? right)), [authorLabels, rows]);
  const statusOptions = useMemo(() => [...new Set(rows.map((row) => row.status))].sort(), [rows]);
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
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <SearchBar value={query} onSearch={setQuery} onClear={() => setQuery("")} placeholder={`Cari ${label.toLowerCase()}, mata kuliah, atau pembuat`} aria-label={`Cari ${label}`} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ListFilter className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
            <Select value={courseFilter} onValueChange={setCourseFilter}>
              <SelectTrigger className="w-[190px]" aria-label="Filter mata kuliah"><SelectValue placeholder="Semua mata kuliah" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua mata kuliah</SelectItem>
                {courseOptions.map((courseId) => <SelectItem key={courseId} value={courseId}>{courseLabels[courseId] ?? courseId}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={authorFilter} onValueChange={setAuthorFilter}>
              <SelectTrigger className="w-[170px]" aria-label="Filter pembuat"><SelectValue placeholder="Semua pembuat" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua pembuat</SelectItem>
                {authorOptions.map((authorId) => <SelectItem key={authorId} value={authorId}>{authorLabels[authorId] ?? "Admin"}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]" aria-label="Filter status"><SelectValue placeholder="Semua status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                {statusOptions.map((status) => <SelectItem key={status} value={status}>{statusLabels[status] ?? status}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-body-sm text-muted-foreground">Menampilkan {visibleRows.length} dari {rows.length} {label.toLowerCase()}</p>
          <div className="flex flex-wrap gap-2">
            {hasFilters && <Button type="button" size="sm" variant="ghost" onClick={resetFilters}>Reset filter</Button>}
            <Button type="button" size="sm" variant="outline" onClick={onUpload} disabled={loading}><Upload className="size-4" />Upload ZIP</Button>
          </div>
        </div>
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
