import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

const sizeClasses = {
  h5: "text-body-base",
  h6: "text-body-sm",
  base: "text-body-base",
  sm: "text-body-sm",
  lg: "text-body-base",
} as const;

export type AdminSectionTitleProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  micro?: ReactNode;
  size?: keyof typeof sizeClasses;
  border?: boolean;
  right?: ReactNode;
  as?: ElementType;
  className?: string;
};

export function AdminSectionTitle({
  title,
  description,
  icon: Icon,
  iconClassName,
  micro,
  size = "base",
  border = false,
  right,
  as: Tag = "h3",
  className,
}: AdminSectionTitleProps) {
  return (
    <div className={cn("flex flex-col gap-1", border && "border-b border-border/40 pb-2", className)}>
      {micro && (
        <span className="block text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {micro}
        </span>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Tag className={cn("flex min-w-0 items-start gap-2 font-heading font-bold text-foreground", sizeClasses[size])}>
          {Icon && <Icon className={cn("mt-0.5 size-4 shrink-0", iconClassName ?? "text-muted-foreground")} aria-hidden />}
          <span className="min-w-0 wrap-break-word">{title}</span>
        </Tag>
        {right}
      </div>
      {description && <p className="text-body-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
