"use client";

import * as React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/native/haptics";

function ToggleGroup({
  className,
  onValueChange,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  const handleValueChange = React.useCallback(
    (value: unknown) => {
      void hapticSelection();
      (onValueChange as ((v: unknown) => void) | undefined)?.(value);
    },
    [onValueChange],
  );
  return (
    <ToggleGroupPrimitive.Root
      {...(props as React.ComponentProps<typeof ToggleGroupPrimitive.Root>)}
      className={cn("flex items-center gap-2", className)}
      onValueChange={handleValueChange}
    />
  );
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        "interactive inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-body-sm font-medium text-foreground whitespace-nowrap",
        "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
        className
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
