import type { ReactNode, ComponentType } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";

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
  maxWidth?: "7xl" | "full";
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
  maxWidth = "7xl",
}: CoursePageShellProps) {
  if (fullWidth) {
    return (
      <div className={cn("relative h-full w-full flex flex-col", className)}>
        {children}
      </div>
    );
  }

  return (
    <ApplicationPage maxWidth={maxWidth} className={cn("relative pb-8", className)}>
      {!hideHeader && title && (
        <PageHeader
          title={title}
          icon={icon}
          actions={actions}
          backHref={backHref}
          backLabel={backLabel}
        />
      )}
      <div>{children}</div>
    </ApplicationPage>
  );
}
