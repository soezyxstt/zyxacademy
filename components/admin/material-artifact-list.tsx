"use client";

import { useEffect, useMemo, useState } from "react";
import { Upload, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/search-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AdminTable } from "@/components/admin/table";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { MaterialArtifactCard, type MaterialBundleRow } from "@/components/admin/material-workflow-ui";
import { useTranslations } from "@/lib/i18n/client";

import type { LockedCourseInfo } from "@/lib/admin/course-identity";

type Props = {
  rows: MaterialBundleRow[];
  kind: "idea" | "product";
  courseLabels?: Record<string, string>;
  chapterLabels?: Record<string, string>;
  authorLabels?: Record<string, string>;
  onInspect: (id: string) => void;
  onUpload: () => void;
  loading?: boolean;
  lockedCourse?: LockedCourseInfo;
};

const statusLabels: Record<string, string> = {
  validated: "Menunggu review",
  approved: "Disetujui",
  rejected: "Ditolak",
  staged: "Staged",
  published: "Terbit",
  withdrawn: "Ditarik",
  discarding: "Penghapusan tertunda",
  archived: "Diarsipkan",
};

function rowText(
  row: MaterialBundleRow,
  courseLabels: Record<string, string>,
  authorLabels: Record<string, string>,
  chapterLabels: Record<string, string>,
): string {
  return [
    row.id,
    row.bundleId,
    row.courseId,
    row.chapterId,
    row.chapterLabel,
    row.bundleTitle,
    chapterLabels[row.chapterId ?? ""] ?? "",
    courseLabels[row.courseId ?? ""] ?? "",
    authorLabels[row.requestedBy ?? ""] ?? "",
    statusLabels[row.status] ?? row.status,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function MaterialArtifactList({
  rows,
  kind,
  courseLabels = {},
  chapterLabels = {},
  authorLabels = {},
  onInspect,
  onUpload,
  loading = false,
  lockedCourse,
}: Props) {
  const t = useTranslations("adminAcademic");
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [chapterFilter, setChapterFilter] = useState("all");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const courseOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.courseId).filter(Boolean) as string[])), [rows]);
  const chapterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.chapterId) {
        const label = chapterLabels[row.chapterId] ?? row.chapterLabel ?? row.chapterId;
        map.set(row.chapterId, label);
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [rows, chapterLabels]);
  const authorOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.requestedBy).filter(Boolean) as string[])), [rows]);
  const statusOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.status))), [rows]);

  const isSelectedChapterAvailable = chapterOptions.some((ch) => ch.id === chapterFilter);
  const effectiveChapterFilter = chapterFilter !== "all" && isSelectedChapterAvailable ? chapterFilter : "all";

  useEffect(() => {
    if (chapterFilter !== "all" && !isSelectedChapterAvailable) {
      setChapterFilter("all");
    }
  }, [chapterFilter, isSelectedChapterAvailable]);

  const needle = query.trim().toLowerCase();
  const visibleRows = rows.filter((row) => (
    (courseFilter === "all" || row.courseId === courseFilter) &&
    (effectiveChapterFilter === "all" || row.chapterId === effectiveChapterFilter) &&
    (authorFilter === "all" || row.requestedBy === authorFilter) &&
    (statusFilter === "all" || row.status === statusFilter) &&
    (!needle || rowText(row, courseLabels, authorLabels, chapterLabels).includes(needle))
  ));
  const hasFilters = Boolean(needle || courseFilter !== "all" || effectiveChapterFilter !== "all" || authorFilter !== "all" || statusFilter !== "all");
  const label = kind === "idea" ? t("materials.ideaTab") : t("materials.productTab");

  function resetFilters() {
    setQuery("");
    setCourseFilter("all");
    setChapterFilter("all");
    setAuthorFilter("all");
    setStatusFilter("all");
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          size="sm"
          value={query}
          onSearch={setQuery}
          onClear={() => setQuery("")}
          placeholder={t("materials.searchPlaceholder", { label })}
          aria-label={t("materials.searchAriaLabel", { label })}
          containerClassName="flex-1 min-w-[140px]"
        />
        {!lockedCourse && (
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-[140px] sm:w-[160px] h-9 text-body-sm rounded-lg shrink-0" aria-label={t("materials.filterCourse")}>
              <SelectValue placeholder={t("materials.allCourses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("materials.allCourses")}</SelectItem>
              {courseOptions.map((courseId) => <SelectItem key={courseId} value={courseId}>{courseLabels[courseId] ?? courseId}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {(chapterOptions.length > 0 || chapterFilter !== "all") && (
          <Select value={effectiveChapterFilter} onValueChange={setChapterFilter}>
            <SelectTrigger className="w-[140px] sm:w-[170px] h-9 text-body-sm rounded-lg shrink-0" aria-label={t("materials.filterChapter")}>
              <SelectValue placeholder={t("materials.allChapters")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("materials.allChapters")}</SelectItem>
              {chapterOptions.map((ch) => <SelectItem key={ch.id} value={ch.id}>{ch.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={authorFilter} onValueChange={setAuthorFilter}>
          <SelectTrigger className="w-[130px] sm:w-[150px] h-9 text-body-sm rounded-lg shrink-0" aria-label={t("materials.filterAuthor")}>
            <SelectValue placeholder={t("materials.allAuthors")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("materials.allAuthors")}</SelectItem>
            {authorOptions.map((authorId) => <SelectItem key={authorId} value={authorId}>{authorLabels[authorId] ?? t("materials.unknownAdmin")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px] sm:w-[140px] h-9 text-body-sm rounded-lg shrink-0" aria-label={t("materials.filterStatus")}>
            <SelectValue placeholder={t("materials.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("materials.allStatuses")}</SelectItem>
            {statusOptions.map((status) => <SelectItem key={status} value={status}>{t(`materials.status.${status}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="sm" variant="ghost" className="size-9 p-0 rounded-lg shrink-0 text-muted-foreground hover:text-foreground" onClick={resetFilters} aria-label={t("materials.resetFilters")}>
                  <RotateCcw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("materials.resetFilters")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="size-9 p-0 rounded-lg shrink-0" onClick={onUpload} disabled={loading} aria-label={t("materials.uploadZip")}>
                <Upload className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("materials.uploadZip")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <AdminTable className="divide-y divide-border">
        {visibleRows.length === 0 ? (
          <div className="p-4">
            <AdminEmptyState compact title={rows.length === 0 ? t("materials.emptyTitle", { label }) : t("materials.noMatchingResults")} description={rows.length === 0 ? t("materials.emptyDescription") : t("materials.filteredDescription")} />
          </div>
        ) : visibleRows.map((item) => (
          <MaterialArtifactCard
            key={item.id}
            row={item}
            kind={kind}
            courseLabel={item.courseId ? courseLabels[item.courseId] : undefined}
            chapterLabel={item.chapterId ? (chapterLabels[item.chapterId] ?? item.chapterLabel ?? undefined) : item.chapterLabel ?? undefined}
            authorLabel={item.requestedBy ? authorLabels[item.requestedBy] : undefined}
            onInspect={() => onInspect(item.id)}
            loading={loading}
            showCourse={!lockedCourse}
          />
        ))}
      </AdminTable>
    </section>
  );
}
