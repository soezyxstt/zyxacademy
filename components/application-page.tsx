import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export interface ApplicationPageProps extends ComponentPropsWithoutRef<"div"> {
  spacing?: string;
  maxWidth?: "7xl" | "full";
}

export function ApplicationPage({
  children,
  className,
  spacing = "space-y-4",
  maxWidth = "7xl",
  ...props
}: ApplicationPageProps) {
  return (
    <div
      className={cn(
        "w-full min-w-0 max-w-full px-4 pb-6 pt-3 sm:px-6 sm:py-5 lg:px-8",
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
