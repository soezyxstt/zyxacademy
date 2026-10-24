"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/client";
import { RotateCcw, Search } from "lucide-react";
import type {
  TutorActivityFilterInput,
  TutorActivityFilterOptions,
  TutorActivityOutcomeFilter,
} from "../dal";

interface ActivityFiltersProps {
  filters: TutorActivityFilterInput;
  options: TutorActivityFilterOptions;
  onFilterChange: (nextFilters: TutorActivityFilterInput) => void;
  onReset: () => void;
  isPending?: boolean;
}

export function ActivityFilters({
  filters,
  options,
  onFilterChange,
  onReset,
  isPending = false,
}: ActivityFiltersProps) {
  const t = useTranslations("adminOps");
  const [localCorrelationId, setLocalCorrelationId] = useState(
    filters.correlationId ?? "",
  );

  // Synchronize local input state if external filter changes (such as Reset)
  useEffect(() => {
    setLocalCorrelationId(filters.correlationId ?? "");
  }, [filters.correlationId]);

  // Debounced update for correlation ID
  useEffect(() => {
    const currentParam = filters.correlationId ?? "";
    const trimmed = localCorrelationId.trim();

    if (trimmed === currentParam) return;

    const timer = setTimeout(() => {
      onFilterChange({
        ...filters,
        correlationId: trimmed.length > 0 ? trimmed : undefined,
        cursor: null,
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [localCorrelationId, filters, onFilterChange]);

  const handleCorrelationKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = localCorrelationId.trim();
      onFilterChange({
        ...filters,
        correlationId: trimmed.length > 0 ? trimmed : undefined,
        cursor: null,
      });
    }
  };

  const hasActiveFilters = Boolean(
    filters.actorId ||
      filters.courseId ||
      filters.entityType ||
      filters.action ||
      (filters.outcome && filters.outcome !== "all") ||
      filters.correlationId ||
      filters.startDate ||
      filters.endDate ||
      (filters.limit && filters.limit !== 25),
  );

  const handleTutorChange = (val: string) => {
    onFilterChange({
      ...filters,
      actorId: val === "all" ? undefined : val,
      cursor: null,
    });
  };

  const handleCourseChange = (val: string) => {
    onFilterChange({
      ...filters,
      courseId: val === "all" ? undefined : val,
      cursor: null,
    });
  };

  const handleEntityTypeChange = (val: string) => {
    onFilterChange({
      ...filters,
      entityType: val === "all" ? undefined : val,
      cursor: null,
    });
  };

  const handleActionChange = (val: string) => {
    onFilterChange({
      ...filters,
      action: val === "all" ? undefined : val,
      cursor: null,
    });
  };

  const handleOutcomeChange = (val: string) => {
    onFilterChange({
      ...filters,
      outcome: val === "all" ? undefined : (val as TutorActivityOutcomeFilter),
      cursor: null,
    });
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({
      ...filters,
      startDate: e.target.value || undefined,
      cursor: null,
    });
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({
      ...filters,
      endDate: e.target.value || undefined,
      cursor: null,
    });
  };

  const handleLimitChange = (val: string) => {
    onFilterChange({
      ...filters,
      limit: Number(val) || 25,
      cursor: null,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 w-full">
      {/* Correlation ID Input with Debounce & Enter Submit */}
      <div className="relative min-w-[140px] max-w-[200px] flex-1">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder={t("tutorActivityUI.correlationId")}
          value={localCorrelationId}
          onChange={(e) => setLocalCorrelationId(e.target.value)}
          onKeyDown={handleCorrelationKeyDown}
          className="h-9 pl-8 text-body-sm bg-background w-full"
        />
      </div>

      {/* Tutor Select */}
      <div className="min-w-[140px] shrink-0">
        <Select
          value={filters.actorId ?? "all"}
          onValueChange={handleTutorChange}
        >
          <SelectTrigger className="h-9 text-body-sm bg-background">
            <SelectValue placeholder={t("tutorActivityUI.allTutors")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tutorActivityUI.allTutors")}</SelectItem>
            {options.tutors.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Course Select */}
      <div className="min-w-[140px] shrink-0">
        <Select
          value={filters.courseId ?? "all"}
          onValueChange={handleCourseChange}
        >
          <SelectTrigger className="h-9 text-body-sm bg-background">
            <SelectValue placeholder={t("tutorActivityUI.allCourses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tutorActivityUI.allCourses")}</SelectItem>
            {options.courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code ? `${c.code}, ${c.title}` : c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Entity Type Select */}
      <div className="min-w-[130px] shrink-0">
        <Select
          value={filters.entityType ?? "all"}
          onValueChange={handleEntityTypeChange}
        >
          <SelectTrigger className="h-9 text-body-sm bg-background">
            <SelectValue placeholder={t("tutorActivityUI.allEntities")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tutorActivityUI.allEntities")}</SelectItem>
            {options.entityTypes.map((et) => (
              <SelectItem key={et} value={et}>
                {et}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Action Select */}
      <div className="min-w-[130px] shrink-0">
        <Select
          value={filters.action ?? "all"}
          onValueChange={handleActionChange}
        >
          <SelectTrigger className="h-9 text-body-sm bg-background">
            <SelectValue placeholder={t("tutorActivityUI.allActions")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tutorActivityUI.allActions")}</SelectItem>
            {options.actions.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Outcome Select */}
      <div className="min-w-[130px] shrink-0">
        <Select
          value={filters.outcome ?? "all"}
          onValueChange={handleOutcomeChange}
        >
          <SelectTrigger className="h-9 text-body-sm bg-background">
            <SelectValue placeholder={t("tutorActivityUI.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tutorActivityUI.allStatuses")}</SelectItem>
            <SelectItem value="success">{t("tutorActivityUI.success")}</SelectItem>
            <SelectItem value="rejected">{t("tutorActivityUI.rejected")}</SelectItem>
            <SelectItem value="failed">{t("tutorActivityUI.failed")}</SelectItem>
            <SelectItem value="unclassified">{t("tutorActivityUI.unclassified")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Date Range Inputs */}
      <div className="flex items-center gap-1 min-w-[240px] flex-1 max-w-[280px]">
        <Input
          type="date"
          aria-label={t("tutorActivityUI.startDate")}
          value={filters.startDate ?? ""}
          onChange={handleStartDateChange}
          className="h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        />
        <span className="text-body-xs text-muted-foreground shrink-0">{t("tutorActivityUI.to")}</span>
        <Input
          type="date"
          aria-label={t("tutorActivityUI.endDate")}
          value={filters.endDate ?? ""}
          onChange={handleEndDateChange}
          className="h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        />
      </div>

      {/* Page Limit Select */}
      <div className="w-[85px] shrink-0">
        <Select
          value={String(filters.limit ?? 25)}
          onValueChange={handleLimitChange}
        >
          <SelectTrigger className="h-9 text-body-sm bg-background">
            <SelectValue placeholder="25" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">{t("tutorActivityUI.perPage", { count: 25 })}</SelectItem>
            <SelectItem value="50">{t("tutorActivityUI.perPage", { count: 50 })}</SelectItem>
            <SelectItem value="100">{t("tutorActivityUI.perPage", { count: 100 })}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reset Filter Button */}
      {hasActiveFilters && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReset}
          disabled={isPending}
          className="h-9 gap-1 text-body-sm text-muted-foreground hover:text-foreground shrink-0"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          <span>{t("tutorActivityUI.reset")}</span>
        </Button>
      )}
    </div>
  );
}
