import type { ComponentType, ReactNode } from "react";

/** Compact 16 px section heading shared by Student dashboard sections. */
export function DashboardSectionHeading({
  icon: Icon,
  title,
  meta,
  actions,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border/40 pb-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="flex min-w-0 items-center gap-2 font-heading text-body-base font-bold text-foreground">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          <span className="min-w-0 break-words">{title}</span>
        </h2>
        {meta}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Small count/status pill placed beside a dashboard section heading. */
export function DashboardSectionCount({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warning" | "success" }) {
  const toneClass =
    tone === "warning"
      ? "bg-status-warning/15 text-status-warning"
      : tone === "success"
        ? "bg-status-success/15 text-status-success"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`shrink-0 rounded-md px-2 py-0.5 text-body-xs font-semibold tabular-nums ${toneClass}`}>{children}</span>
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
