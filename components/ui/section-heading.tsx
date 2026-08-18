import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const sectionHeadingVariants = cva("font-heading", {
  variants: {
    tier: {
      hero: "text-h2 md:text-h1 font-bold tracking-tight leading-tight",
      primary: "text-h3 md:text-h2 font-semibold tracking-tight leading-snug",
      secondary: "text-h5 md:text-h4 font-semibold leading-snug",
    },
  },
  defaultVariants: {
    tier: "primary",
  },
});

export type SectionHeadingVariants = VariantProps<typeof sectionHeadingVariants>;

type SectionHeadingProps = React.HTMLAttributes<HTMLHeadingElement> &
  SectionHeadingVariants & {
    as?: "h1" | "h2" | "h3";
  };

export function SectionHeading({
  as,
  tier = "primary",
  className,
  ...props
}: SectionHeadingProps) {
  const Comp = as ?? (tier === "hero" ? "h1" : "h2");
  return <Comp className={cn(sectionHeadingVariants({ tier }), className)} {...props} />;
}
