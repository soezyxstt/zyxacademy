import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const cardVariants = cva(
  "rounded-xl text-card-foreground transition-colors",
  {
    variants: {
      variant: {
        default:
          "border border-border bg-card shadow-xs",
        translucent:
          "border border-border/70 bg-card/70 backdrop-blur-md shadow-xs",
        solid: "border border-border bg-card shadow-xs",
        interactive:
          "border border-border bg-card shadow-xs transition-colors duration-200 hover:border-primary/50",
        subtle:
          "border border-border/70 bg-muted/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type CardVariants = VariantProps<typeof cardVariants>;

function Card({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & CardVariants) {
  return (
    <div
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col space-y-1.5 p-5", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("font-heading text-body-base font-bold", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-body-xs text-muted-foreground", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center p-5 pt-0", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
