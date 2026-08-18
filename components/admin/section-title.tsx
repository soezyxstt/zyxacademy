import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

const sizeClasses = {
  h5: "font-heading text-h5 font-bold text-foreground",
  h6: "font-heading text-h6 font-semibold text-foreground",
  base: "font-heading text-body-base font-bold text-foreground",
  sm: "font-heading text-body-sm font-bold text-foreground",
  lg: "font-heading text-body-lg font-bold text-foreground",
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
    <div className={cn("flex flex-col gap-1", border && "border-b border-border pb-3", className)}>
      {micro && (
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">
          {micro}
        </span>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tag className={cn("flex items-center gap-2", sizeClasses[size])}>
          {Icon && <Icon className={cn("size-5 shrink-0", iconClassName ?? "text-brand-primary")} aria-hidden />}
          <span>{title}</span>
        </Tag>
        {right}
      </div>
      {description && <p className="text-body-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
