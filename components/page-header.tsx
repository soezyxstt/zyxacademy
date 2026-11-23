import type { ReactNode, ComponentType } from "react";
import { cn } from "@/lib/utils";
import { MobileTopNavBackDelegate } from "@/components/navigation/mobile-top-nav-back-delegate";

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
  backHref,
  backLabel,
  className,
}: PageHeaderProps) {
  const delegatedBackLabel =
    typeof backLabel === "string" && backLabel.trim().length > 0
      ? backLabel
      : undefined;

  // Route titles, breadcrumbs, and back buttons are handled by the sidebar
  // (desktop) and MobileTopNavbar (mobile), so keep only an accessible h1,
  // mobile back delegation, and any explicit page actions.
  if (!actions) {
    return (
      <>
        {backHref ? (
          <MobileTopNavBackDelegate
            backHref={backHref}
            backLabel={delegatedBackLabel}
          />
        ) : null}
        <h1 data-sr-only-header="" className="sr-only">
          {title}
        </h1>
      </>
    );
  }

  return (
    <header
      className={cn(
        "mb-2 flex w-full min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1.5 text-left",
        className,
      )}
    >
      {backHref ? (
        <MobileTopNavBackDelegate
          backHref={backHref}
          backLabel={delegatedBackLabel}
        />
      ) : null}
      <h1 data-sr-only-header="" className="sr-only">
        {title}
      </h1>

      <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-1.5 has-[[data-search-expanded=true]]:flex-1 sm:gap-2">
        {actions}
      </div>
    </header>
  );
}
