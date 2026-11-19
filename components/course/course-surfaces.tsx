import { cn } from "@/lib/utils";

/** Gutter-aligned course section. Callers supply their own vertical spacing. */
export function studentSectionClass(className?: string) {
  return cn(
    "min-w-0",
    className,
  );
}

/** Interactive / hoverable / link card (course catalog, interactive tiles, list rows) */
export function studentInteractiveCardClass(className?: string) {
  return cn(
    "group relative flex flex-col rounded-xl border border-border/70 bg-card p-(--panel-padding)",
    "transition-all duration-200",
    "hover:border-brand-primary/45 hover:bg-muted/30",
    className,
  );
}

/** List row / interactive link card */
export function courseListRowClass(className?: string) {
  return cn(
    "group flex items-start gap-3 rounded-xl border border-border/70 bg-card px-(--panel-padding) py-(--row-padding)",
    "transition-all duration-200",
    "hover:border-primary/40 hover:bg-muted/30",
    className,
  );
}

/** Static card (quiz grid, overview tiles inner) */
export function courseCardClass(className?: string) {
  return cn(
    "rounded-xl border border-border/70 bg-card p-(--panel-padding) transition-colors hover:border-brand-primary/35 hover:bg-muted/30",
    className,
  );
}
