import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminEmptyStateProps = {
  title?: ReactNode;
  description?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function AdminEmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  compact = false,
  className,
}: AdminEmptyStateProps) {
  return (
    <div className={cn(
      "flex gap-(--compact-gap)",
      compact ? "items-start py-4" : "flex-col items-center px-4 py-8 text-center",
      className,
    )}>
      <Icon className={cn("shrink-0 text-muted-foreground", compact ? "mt-0.5 size-4" : "size-6")} aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <p className="text-body-sm font-semibold text-foreground">{title}</p>}
        {description && <p className="max-w-sm text-body-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export { AdminErrorState } from "@/components/admin/admin-error-state-client";
export type { AdminErrorStateProps } from "@/components/admin/admin-error-state-client";
