"use client";

import { useState, useTransition } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityFilters } from "./activity-filters";
import { ActivityTable } from "./activity-table";
import {
  getTutorActivityLogsAction,
  type TutorActivityFilterInput,
  type TutorActivityFilterOptions,
  type TutorActivityItem,
  type TutorActivityQueryResult,
} from "../actions";

interface TutorActivityClientProps {
  initialResult: TutorActivityQueryResult;
  options: TutorActivityFilterOptions;
}

export function TutorActivityClient({
  initialResult,
  options,
}: TutorActivityClientProps) {
  const [filters, setFilters] = useState<TutorActivityFilterInput>({
    limit: initialResult.limit,
  });
  const [items, setItems] = useState<TutorActivityItem[]>(initialResult.items);
  const [nextCursor, setNextCursor] = useState<{ createdAt: string; id: string } | null>(
    initialResult.nextCursor,
  );
  const [hasNextPage, setHasNextPage] = useState<boolean>(initialResult.hasNextPage);
  const [cursorHistory, setCursorHistory] = useState<Array<{ createdAt: string | number | Date; id: string } | null>>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchLogs = (nextFilters: TutorActivityFilterInput) => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await getTutorActivityLogsAction(nextFilters);
        setItems(res.items);
        setNextCursor(res.nextCursor);
        setHasNextPage(res.hasNextPage);
      } catch (err) {
        console.error("Gagal memuat log aktivitas tutor:", err);
        setErrorMessage("Gagal memuat catatan aktivitas tutor. Silakan coba lagi.");
      }
    });
  };

  const handleFilterChange = (nextFilters: TutorActivityFilterInput) => {
    const cleanFilters = {
      ...nextFilters,
      cursor: null,
    };
    setFilters(cleanFilters);
    setCursorHistory([]);
    fetchLogs(cleanFilters);
  };

  const handleReset = () => {
    const resetFilters: TutorActivityFilterInput = {
      limit: 25,
      cursor: null,
    };
    setFilters(resetFilters);
    setCursorHistory([]);
    fetchLogs(resetFilters);
  };

  const handleNextPage = () => {
    if (!nextCursor || isPending) return;
    const currentCursor = filters.cursor ?? null;
    const nextFilters: TutorActivityFilterInput = {
      ...filters,
      cursor: nextCursor,
    };
    setCursorHistory((prev) => [...prev, currentCursor]);
    setFilters(nextFilters);
    fetchLogs(nextFilters);
  };

  const handlePrevPage = () => {
    if (cursorHistory.length === 0 || isPending) return;
    const newHistory = [...cursorHistory];
    const prevCursor = newHistory.pop() ?? null;
    const prevFilters: TutorActivityFilterInput = {
      ...filters,
      cursor: prevCursor,
    };
    setCursorHistory(newHistory);
    setFilters(prevFilters);
    fetchLogs(prevFilters);
  };

  const handleRetry = () => {
    fetchLogs(filters);
  };

  return (
    <div className="space-y-4 w-full">
      <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <ActivityFilters
          filters={filters}
          options={options}
          onFilterChange={handleFilterChange}
          onReset={handleReset}
          isPending={isPending}
        />
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-status-error/30 bg-status-error/10 p-3.5 flex items-center justify-between gap-3 text-body-sm text-foreground shadow-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="size-4 text-status-error shrink-0" aria-hidden />
            <span className="truncate">{errorMessage}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={isPending}
            className="h-8 gap-1 text-body-xs shrink-0"
          >
            <RotateCcw className="size-3" aria-hidden />
            <span>Coba lagi</span>
          </Button>
        </div>
      )}

      <div className="relative">
        {isPending && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-xs z-10 rounded-xl flex items-center justify-center pointer-events-none">
            <span className="text-body-xs font-semibold text-muted-foreground bg-card px-3 py-1.5 rounded-lg border border-border shadow-xs">
              Memuat data...
            </span>
          </div>
        )}
        <ActivityTable
          items={items}
          hasNextPage={hasNextPage}
          hasPrevPage={cursorHistory.length > 0}
          onNextPage={handleNextPage}
          onPrevPage={handlePrevPage}
          isPending={isPending}
          limit={filters.limit ?? 25}
        />
      </div>
    </div>
  );
}
