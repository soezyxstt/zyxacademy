"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface QuestionFilterPopoverProps {
  activeCount: number;
  children: ReactNode;
  onReset: () => void;
}

export function QuestionFilterPopover({ activeCount, children, onReset }: QuestionFilterPopoverProps) {
  const t = useTranslations("adminEval");
  return (
    <Popover>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant={activeCount > 0 ? "secondary" : "ghost"}
                size="icon-lg"
                aria-label={activeCount > 0 ? `${t("questionBank.filterTitle")}, ${activeCount} ${t("questionBank.active")}` : t("questionBank.filterTitle")}
              >
                <ListFilter aria-hidden />
                {activeCount > 0 && (
                  <span aria-hidden className="absolute -right-1 -top-1 min-w-4 rounded-md bg-primary px-0.5 text-center text-body-2xs font-semibold text-primary-foreground">
                    {activeCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("questionBank.filterTitle")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-xl p-3 sm:w-[min(28rem,calc(100vw-2rem))]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-body-sm font-bold text-foreground">{t("questionBank.filterTitle")}</h2>
          {activeCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg px-2 text-body-sm text-muted-foreground"
              onClick={onReset}
            >
              {t("questionBank.reset")}
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export function QuestionFilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-body-xs font-semibold text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
