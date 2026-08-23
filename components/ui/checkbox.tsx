"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer group h-4 w-4 shrink-0 rounded-sm border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zx-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:border-primary transition-all duration-150",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
        <Check className="h-3.5 w-3.5 stroke-[3] animate-in fade-in zoom-in-75 duration-100 group-data-[state=indeterminate]:hidden" />
        <Minus className="hidden h-3.5 w-3.5 stroke-[3] animate-in fade-in zoom-in-75 duration-100 group-data-[state=indeterminate]:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
