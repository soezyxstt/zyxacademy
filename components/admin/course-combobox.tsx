"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, GraduationCap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface CourseOption {
  id: string;
  title: string;
}

export interface CourseComboboxProps {
  courses: CourseOption[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  allLabel?: string;
}

export function CourseCombobox({
  courses,
  value,
  onValueChange,
  className,
  placeholder = "Pilih mata kuliah",
  allLabel = "Semua Mata Kuliah",
}: CourseComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filteredCourses = React.useMemo(() => {
    if (!search.trim()) return courses;
    const q = search.toLowerCase().trim();
    return courses.filter((c) => c.title.toLowerCase().includes(q));
  }, [courses, search]);

  const selectedTitle = React.useMemo(() => {
    if (value === "all" || !value) return allLabel;
    const match = courses.find((c) => c.id === value);
    return match ? match.title : placeholder;
  }, [courses, value, allLabel, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls="course-combobox-list"
          className={cn(
            "flex h-9 w-[190px] sm:w-[220px] items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-1.5 text-body-xs font-medium text-foreground shadow-2xs hover:bg-muted/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none shrink-0 transition-colors text-left",
            className
          )}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <GraduationCap className="size-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{selectedTitle}</span>
          </div>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[240px] sm:w-[280px] p-1.5 shadow-md border-border bg-popover text-popover-foreground rounded-lg"
      >
        <div className="flex items-center gap-2 px-2 pb-1.5 pt-1 border-b border-border/60">
          <Search className="size-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari mata kuliah..."
            className="w-full bg-transparent text-body-xs outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        <div id="course-combobox-list" role="listbox" className="max-h-60 overflow-y-auto py-1 space-y-0.5">
          {/* Option: Semua Mata Kuliah */}
          {(!search || allLabel.toLowerCase().includes(search.toLowerCase())) && (
            <button
              type="button"
              onClick={() => {
                onValueChange("all");
                setOpen(false);
                setSearch("");
              }}
              className={cn(
                "relative flex w-full cursor-pointer select-none items-center justify-between rounded-md px-2.5 py-1.5 text-body-xs text-left outline-none transition-colors",
                value === "all" || !value
                  ? "bg-brand-primary/10 text-brand-primary font-semibold"
                  : "hover:bg-muted text-foreground"
              )}
            >
              <span className="truncate">{allLabel}</span>
              {(value === "all" || !value) && (
                <Check className="size-3.5 text-brand-primary shrink-0 ml-2" />
              )}
            </button>
          )}

          {/* Filtered Courses List */}
          {filteredCourses.map((c) => {
            const isSelected = value === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onValueChange(c.id);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center justify-between rounded-md px-2.5 py-1.5 text-body-xs text-left outline-none transition-colors",
                  isSelected
                    ? "bg-brand-primary/10 text-brand-primary font-semibold"
                    : "hover:bg-muted text-foreground"
                )}
              >
                <span className="truncate">{c.title}</span>
                {isSelected && (
                  <Check className="size-3.5 text-brand-primary shrink-0 ml-2" />
                )}
              </button>
            );
          })}

          {filteredCourses.length === 0 && search.trim() !== "" && (
            <div className="py-4 text-center text-body-xs text-muted-foreground">
              Mata kuliah tidak ditemukan.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
