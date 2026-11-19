import type { ReactNode, ComponentType } from "react";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type PageHeaderProps = {
  title: ReactNode;
  /**
   * @deprecated Header descriptions have been removed to keep page headers compact and clean.
   */
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: ReactNode;
  breadcrumbs?: BreadcrumbItem[] | ReactNode;
  divider?: boolean;
  className?: string;
};

export function PageHeader({
  title,
  actions,
  className,
}: PageHeaderProps) {
  // Route titles, breadcrumbs, and back buttons are handled by the sidebar
  // (desktop) and native navigation (mobile), so keep only an accessible h1
  // plus any explicit page actions.
  if (!actions) {
    return (
      <h1 data-sr-only-header="" className="sr-only">
        {title}
      </h1>
    );
  }

  return (
    <header
      className={cn(
        "mb-2 flex w-full min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1.5 text-left",
        className,
      )}
    >
      <h1 data-sr-only-header="" className="sr-only">
        {title}
      </h1>

      <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-1.5 has-[[data-search-expanded=true]]:flex-1 sm:gap-2">
        {actions}
      </div>
    </header>
  );
}
