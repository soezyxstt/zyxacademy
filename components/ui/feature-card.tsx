import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const featureCardVariants = cva("interactive rounded-2xl border", {
  variants: {
    variant: {
      default: "bg-card/70 border-border/70 backdrop-blur-md text-card-foreground shadow-xs",
      dark: "bg-foreground/30 border-border/40 backdrop-blur-md text-background shadow-xs",
    },
    size: {
      sm: "p-3",
      md: "p-4 md:p-5",
      lg: "p-5 md:p-6",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
  },
});

export type FeatureCardVariants = VariantProps<typeof featureCardVariants>;

export function FeatureCard({
  className,
  variant,
  size,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & FeatureCardVariants) {
  return <div className={cn(featureCardVariants({ variant, size }), className)} {...props} />;
}
