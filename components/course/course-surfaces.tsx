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

/** Flat interactive row with the course gutter and a visible keyboard focus state. */
export function courseListRowClass(className?: string) {
  return cn(
    "group flex min-w-0 items-start gap-3 rounded-lg py-(--row-padding) transition-colors",
    "hover:bg-muted/40 active:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
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
