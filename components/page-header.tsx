import type { ReactNode, ComponentType } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClampedMarquee } from "@/components/ui/clamped-marquee";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TranslatedText } from "@/components/i18n/translated-text";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

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

function CollapsibleBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const total = items.length;
  if (total === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="max-w-full overflow-hidden">
      {/* Desktop view: up to 4 items shown directly; collapsed to ... only if > 4 items */}
      <div className="hidden sm:flex items-center gap-1.5 flex-nowrap overflow-hidden text-body-xs font-medium text-muted-foreground max-w-full">
        {total <= 4 ? (
          items.map((crumb, idx) => {
            const isLast = idx === total - 1;
            return (
              <span key={idx} className="inline-flex items-center gap-1.5 min-w-0 shrink">
                {idx > 0 && <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" aria-hidden />}
                {crumb.href && !isLast ? (
                  <Link href={crumb.href} className="hover:text-foreground transition-colors inline-flex items-center min-w-0">
                    <ClampedMarquee as="span" text={crumb.label} className="max-w-[180px] lg:max-w-[240px]" />
                  </Link>
                ) : (
                  <ClampedMarquee as="span" text={crumb.label} className={cn("max-w-[200px] lg:max-w-[280px] min-w-0", isLast && "font-semibold text-foreground")} />
                )}
              </span>
            );
          })
        ) : (
          <>
            {/* Root item */}
            <span className="inline-flex items-center gap-1.5 shrink-0">
              {items[0].href ? (
                <Link href={items[0].href} className="hover:text-foreground transition-colors inline-flex items-center">
                  <ClampedMarquee as="span" text={items[0].label} className="max-w-[140px]" />
                </Link>
              ) : (
                <ClampedMarquee as="span" text={items[0].label} className="max-w-[140px]" />
              )}
            </span>
            <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" aria-hidden />

            {/* Collapsed middle dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  aria-label="Tampilkan jalur sebelumnya"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48">
                {items.slice(1, total - 1).map((crumb, idx) => (
                  <DropdownMenuItem key={idx} asChild>
                    {crumb.href ? (
                      <Link href={crumb.href} className="w-full truncate text-body-xs">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="truncate text-body-xs">{crumb.label}</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" aria-hidden />

            {/* Active last item */}
            <span className="inline-flex items-center min-w-0 shrink font-semibold text-foreground">
              <ClampedMarquee as="span" text={items[total - 1].label} className="max-w-[220px] lg:max-w-[320px] min-w-0 font-semibold text-foreground" />
            </span>
          </>
        )}
      </div>

      {/* Mobile view: strictly collapsed to ... > Current Page when >= 3 items */}
      <div className="flex sm:hidden items-center gap-1.5 flex-nowrap overflow-hidden text-body-xs font-medium text-muted-foreground max-w-full">
        {total >= 3 ? (
          <>
            {/* Ancestors collapsed into single dropdown button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  aria-label="Tampilkan jalur sebelumnya"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48">
                {items.slice(0, total - 1).map((crumb, idx) => (
                  <DropdownMenuItem key={idx} asChild>
                    {crumb.href ? (
                      <Link href={crumb.href} className="w-full truncate text-body-xs">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="truncate text-body-xs">{crumb.label}</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" aria-hidden />

            {/* Active last item */}
            <span className="inline-flex items-center min-w-0 shrink font-semibold text-foreground">
              <ClampedMarquee as="span" text={items[total - 1].label} className="max-w-[220px] min-w-0 font-semibold text-foreground" />
            </span>
          </>
        ) : (
          items.map((crumb, idx) => {
            const isLast = idx === total - 1;
            return (
              <span key={idx} className="inline-flex items-center gap-1.5 min-w-0 shrink">
                {idx > 0 && <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" aria-hidden />}
                {crumb.href && !isLast ? (
                  <Link href={crumb.href} className="hover:text-foreground transition-colors inline-flex items-center min-w-0">
                    <ClampedMarquee as="span" text={crumb.label} className="max-w-[100px]" />
                  </Link>
                ) : (
                  <ClampedMarquee as="span" text={crumb.label} className={cn("max-w-[150px] min-w-0", isLast && "font-semibold text-foreground")} />
                )}
              </span>
            );
          })
        )}
      </div>
    </nav>
  );
}

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
