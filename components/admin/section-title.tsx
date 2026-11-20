import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

const sizeClasses = {
  h5: "font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground",
  h6: "font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground",
  base: "font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground",
  sm: "font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground",
  lg: "font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground",
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tag className={cn("flex items-center gap-2", sizeClasses[size])}>
          {Icon && <Icon className={cn("size-4 shrink-0", iconClassName ?? "text-muted-foreground")} aria-hidden />}
          <span>{title}</span>
        </Tag>
        {right}
      </div>
      {description && <p className="text-body-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
