import * as React from "react";
import { cn } from "@/lib/utils";

type SectionContainerProps = React.ComponentPropsWithoutRef<"section"> & {
  children: React.ReactNode;
  backgroundContent?: React.ReactNode;
  contentClassName?: string;
  tight?: boolean;
  /** Mengurangi padding vertikal atas (alur beranda di bawah nav tetap). */
  density?: "default" | "hero" | "compact";
  stepLabel?: string;
};

export function SectionContainer({
  children,
  backgroundContent,
  className,
  contentClassName,
  tight = false,
  density = "default",
  stepLabel,
  ...props
}: SectionContainerProps) {
  const verticalPadding = tight
    ? "py-12 md:py-16"
    : density === "hero"
      ? "pb-16 pt-20 md:pb-22 md:pt-24 lg:pb-24"
      : density === "compact"
        ? "py-14 md:py-18"
        : "py-20 md:py-28";

  return (
    <section className={cn("relative", verticalPadding, className)} {...props}>
      {backgroundContent}
      {stepLabel ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-4 -left-2 select-none text-[120px] leading-none font-black opacity-[0.04]"
        >
          {stepLabel}
        </span>
      ) : null}
      <div className={cn("container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", contentClassName)}>
        {children}
      </div>
    </section>
  );
}
