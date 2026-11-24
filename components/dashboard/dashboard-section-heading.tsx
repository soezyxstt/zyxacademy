import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Compact 16 px section heading shared by Student and Tutor sections. */
export function DashboardSectionHeading({
  icon: Icon,
  title,
  meta,
  actions,
  divider = false,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  divider?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2",
        divider && "border-b border-border/40 pb-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 className="flex min-w-0 items-center gap-2 font-heading text-body-base font-bold text-foreground">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          <span className="min-w-0 break-words">{title}</span>
        </h2>
        {meta}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

/** Compact count/status metadata placed beside a dashboard section heading. */
export function DashboardSectionCount({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warning" | "success" }) {
  if (tone === "muted") {
    return (
      <span className="shrink-0 text-body-xs font-medium tabular-nums text-muted-foreground">
        {children}
      </span>
    );
  }
  const dotClass = tone === "warning" ? "bg-status-warning" : "bg-status-success";
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-body-xs font-semibold tabular-nums text-foreground">
      <span className={`size-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
      <span>{children}</span>
    </span>
  );
}

/** Low-height inline empty state for dashboard sections. */
export function DashboardInlineEmpty({ icon: Icon, children }: { icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 py-2 text-body-sm text-muted-foreground">
      <Icon className="size-4 shrink-0 text-status-success" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
