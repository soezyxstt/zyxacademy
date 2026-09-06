import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export interface ApplicationPageProps extends ComponentPropsWithoutRef<"div"> {
  spacing?: string;
  maxWidth?: "7xl" | "full";
}

export function ApplicationPage({
  children,
  className,
  spacing = "space-y-6",
  maxWidth = "full",
  ...props
}: ApplicationPageProps) {
  return (
    <div
      className={cn(
        "w-full px-4 py-8 sm:px-6 lg:px-8",
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
