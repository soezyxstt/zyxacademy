"use client";

import type { ComponentProps, ReactNode, Ref } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function ZyraChatHeader(props: ComponentProps<"header">) {
  return <header {...props} className={cn("z-20 flex shrink-0 items-center justify-between gap-2 border-b border-border/80 bg-background/80 px-3.5 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top,0px))] backdrop-blur-md md:py-2.5", props.className)} />;
}

export function ZyraChatHistory({ ref, ...props }: ComponentProps<"div"> & { ref?: Ref<HTMLDivElement> }) {
  return <div {...props} ref={ref} role="region" tabIndex={0} className={cn("min-h-0 flex-1 space-y-(--paragraph-gap) overflow-y-auto overscroll-contain p-4 font-sans text-body-sm focus-visible:outline-none", props.className)} />;
}

export function ZyraChatComposer({ children, onPasteCapture, footer }: Pick<ComponentProps<"div">, "children" | "onPasteCapture"> & { footer?: ReactNode }) {
  return (
    <footer className="shrink-0 border-t border-border/40 bg-background p-2">
      <div onPasteCapture={onPasteCapture} className="relative min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-background/95 p-1.5 shadow-md backdrop-blur-md transition-colors focus-within:border-brand-primary/60 focus-within:ring-1 focus-within:ring-brand-primary/20">
        {children}
      </div>
      {footer}
    </footer>
  );
}

export function ZyraSendButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <TooltipProvider><Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon-xs" onClick={onClick} disabled={disabled} aria-label={label} className="size-8 rounded-lg bg-brand-primary text-primary-foreground transition-transform hover:bg-brand-primary/90 active:scale-95 disabled:opacity-40">
          <ArrowUp className="size-3.5" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip></TooltipProvider>
  );
}
