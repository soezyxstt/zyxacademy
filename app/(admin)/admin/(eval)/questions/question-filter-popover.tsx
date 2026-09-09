"use client";

import type { ReactNode } from "react";
import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface QuestionFilterPopoverProps {
  activeCount: number;
  children: ReactNode;
  onReset: () => void;
}

export function QuestionFilterPopover({ activeCount, children, onReset }: QuestionFilterPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-2 rounded-lg px-3 text-body-sm"
          aria-label={activeCount > 0 ? `Filter soal, ${activeCount} aktif` : "Filter soal"}
        >
          <ListFilter className="size-4" />
          <span>Filter</span>
          {activeCount > 0 && (
            <span className="min-w-5 rounded-md bg-brand-primary px-1.5 py-0.5 text-center text-body-2xs font-semibold text-white">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-xl p-3"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-body-sm font-bold text-foreground">Filter soal</h2>
          {activeCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg px-2 text-body-xs text-muted-foreground"
              onClick={onReset}
            >
              Reset
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export function QuestionFilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-body-xs font-semibold text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
