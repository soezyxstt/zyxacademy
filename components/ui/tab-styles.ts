export const tabListClassName =
  "relative flex h-auto w-full min-w-0 max-w-full flex-nowrap items-stretch gap-0.5 overflow-hidden border-b border-border/70 text-muted-foreground";

export const tabListStickyBarClassName =
  "sticky top-(--mobile-navbar-height,0px) z-20 md:top-0 -mx-(--page-gutter) w-[calc(100%+2*var(--page-gutter))] flex h-auto min-w-0 flex-nowrap items-stretch gap-0.5 px-0 md:px-(--page-gutter) text-muted-foreground before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-[100vw] before:-translate-x-1/2 before:border-b before:border-border/80 before:bg-background/95 before:backdrop-blur-md";

export const tabTriggerClassName =
  "interactive relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-body-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-transparent after:transition-colors";

export const tabTriggerActiveClassName =
  "text-foreground after:bg-primary hover:bg-transparent";

export const tabOverflowItemClassName =
  "relative flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-body-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

export const tabOverflowItemActiveClassName =
  "bg-muted/50 text-foreground before:pointer-events-none before:absolute before:bottom-1.5 before:left-1 before:top-1.5 before:w-0.5 before:rounded-full before:bg-primary";
