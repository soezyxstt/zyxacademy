import type { ReactNode, ComponentType } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

export type CoursePageShellProps = {
  title?: ReactNode;
  /**
   * @deprecated Subtitle descriptions have been removed to keep student page headers compact and clean.
   */
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  headingTier?: "primary" | "secondary";
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  className?: string;
  hideHeader?: boolean;
  fullWidth?: boolean;
};

export function CoursePageShell({
  title,
  icon,
  actions,
  backHref,
  backLabel,
  hideHeader = false,
  children,
  className,
  fullWidth = false,
}: CoursePageShellProps) {
  return (
    <div className={cn("relative pb-8", className, fullWidth && "pb-0 h-full flex flex-col")}>
      <div className={cn(fullWidth ? "w-full h-full flex flex-col" : "marketing-container pt-3 md:pt-3")}>
        {!hideHeader && title && (
          <PageHeader
            title={title}
            icon={icon}
            actions={actions}
            backHref={backHref}
            backLabel={backLabel}
          />
        )}
        <div className={cn(fullWidth && "w-full h-full flex flex-col")}>{children}</div>
      </div>
    </div>
  );
}
