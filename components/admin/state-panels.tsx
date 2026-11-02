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
  if (compact) {
    return (
      <p className={cn("py-6 text-center text-body-sm text-muted-foreground", className)}>
        {title ?? description}
      </p>
    );
  }
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-12 text-center", className)}>
      {Icon && <Icon className="size-8 text-muted-foreground/60" aria-hidden />}
      {title && <p className="font-semibold text-foreground">{title}</p>}
      {description && <p className="max-w-sm text-body-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export { AdminErrorState } from "@/components/admin/admin-error-state-client";
export type { AdminErrorStateProps } from "@/components/admin/admin-error-state-client";
