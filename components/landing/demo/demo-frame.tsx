import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DemoFrameProps = {
  /** Label shown in the window title bar (e.g. "Kuis Mingguan · Kalkulus IA"). */
  title?: string;
  /** Right-aligned slot in the title bar (timer, counter, status). */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** "dark" renders the frame on the inverted tutors band. */
  tone?: "light" | "dark";
};

/**
 * Shared "app window" chrome wrapping every product vignette on the landing
 * page so all demos read as one product. Pure presentational Server Component.
 */
export function DemoFrame({
  title,
  meta,
  children,
  className,
  bodyClassName,
  tone = "light",
}: DemoFrameProps) {
  const dark = tone === "dark";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border shadow-sm",
        dark ? "border-white/12 bg-black-3" : "border-border bg-card",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b px-3.5 py-2",
          dark ? "border-white/10 bg-white/5" : "border-border/80 bg-muted/40",
        )}
      >
        <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
          <span className={cn("size-2 rounded-full", dark ? "bg-white/25" : "bg-border-strong/60")} />
          <span className={cn("size-2 rounded-full", dark ? "bg-white/25" : "bg-border-strong/60")} />
          <span className={cn("size-2 rounded-full", dark ? "bg-white/25" : "bg-border-strong/60")} />
        </span>
        {title ? (
          <span
            className={cn(
              "ml-1 truncate text-body-xs font-semibold uppercase tracking-wider",
              dark ? "text-white/60" : "text-muted-foreground",
            )}
          >
            {title}
          </span>
        ) : null}
        {meta ? (
          <span
            className={cn(
              "ml-auto flex shrink-0 items-center gap-2 text-body-xs font-medium",
              dark ? "text-white/60" : "text-muted-foreground",
            )}
          >
            {meta}
          </span>
        ) : null}
      </div>
      <div className={cn("p-4 md:p-5", bodyClassName)}>{children}</div>
    </div>
  );
}
