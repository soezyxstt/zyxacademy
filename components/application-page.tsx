import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export interface ApplicationPageProps extends ComponentPropsWithoutRef<"div"> {
  spacing?: string;
  maxWidth?: "7xl" | "full";
}

export function ApplicationPage({
  children,
  className,
  spacing = "space-y-(--related-gap)",
  maxWidth = "7xl",
  ...props
}: ApplicationPageProps) {
  return (
    <div
      data-application-page=""
      className={cn(
        "w-full min-w-0 max-w-full px-(--page-gutter) pb-[calc(var(--page-bottom)+var(--mobile-bottom-nav-height,0px))] pt-(--page-top)",
        maxWidth === "7xl" && "mx-auto max-w-7xl",
        spacing,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
