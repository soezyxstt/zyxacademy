import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";
import { getProgressValue } from "@/packages/ui-primitives/progress";

type ProgressProps = Omit<ComponentPropsWithoutRef<"div">,
  "children" | "role" | "aria-valuemin" | "aria-valuemax" | "aria-valuenow"
> & {
  value: number;
  max?: number;
  "aria-label": string;
};

export function Progress({ value, max, className, ...props }: ProgressProps) {
  const progress = getProgressValue(value, max);
  return (
    <div
      {...props}
      data-slot="progress"
      role="progressbar"
      aria-valuemin={progress.min}
      aria-valuemax={progress.max}
      aria-valuenow={progress.now}
      className={cn("h-2 overflow-hidden rounded-md bg-muted", className)}
    >
      <div
        data-slot="progress-indicator"
        className="h-full rounded-md bg-primary"
        style={{ width: `${progress.percent}%` }}
      />
    </div>
  );
}
