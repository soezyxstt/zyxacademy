"use client";

import React from "react";
import { ArrowRight, Check, Compass, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  parseOpsFollowups,
  stripOpsFollowupMarkup,
  type OpsFollowup,
  type OpsFollowupIcon,
} from "@/lib/admin-ops-ai/followups";

export { stripOpsFollowupMarkup };

export interface QuickActionsBarProps {
  followups: OpsFollowup[];
  onSelect: (followup: OpsFollowup) => void;
  disabled?: boolean;
}

/**
 * Compatibility helper that strips hidden follow-up or legacy quick-actions
 * markup without client-side heuristic guessing.
 */
export function extractQuickActions(content: string): {
  cleanedContent: string;
  quickActions: OpsFollowup[];
} {
  const { text, followups } = parseOpsFollowups(content);
  return { cleanedContent: text, quickActions: followups };
}

function FollowupChipIcon({ icon }: { icon: OpsFollowupIcon }) {
  switch (icon) {
    case "search":
      return <Search className="size-3 shrink-0 text-primary" aria-hidden="true" />;
    case "check":
      return <Check className="size-3 shrink-0 text-primary" aria-hidden="true" />;
    case "compass":
      return <Compass className="size-3 shrink-0 text-primary" aria-hidden="true" />;
    case "refresh":
      return <RefreshCw className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />;
    case "arrow":
    default:
      return <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />;
  }
}

/**
 * Compact pill-chip bar for deterministic Ops AI follow-up actions.
 * Mirrors Zyra's FollowUpChips presentation without an inline input box.
 */
export function QuickActionsBar({
  followups,
  onSelect,
  disabled = false,
}: QuickActionsBarProps) {
  if (!followups || followups.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div
        role="group"
        aria-label="Pilihan aksi cepat"
        className="mt-2 flex flex-wrap items-center gap-1.5"
      >
        {followups.map((chip, index) => {
          const showTooltip = chip.prompt.trim() !== chip.label.trim();
          const button = (
            <Button
              key={`${chip.label}-${index}`}
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onSelect(chip)}
              aria-label={chip.label}
              className="h-auto max-w-full whitespace-normal rounded-full border border-border/70 bg-muted/35 px-2.5 py-1 text-left text-body-xs font-normal text-muted-foreground hover:border-border hover:bg-muted/80 hover:text-foreground transition-colors cursor-pointer"
            >
              <FollowupChipIcon icon={chip.icon} />
              <span className="break-words">{chip.label}</span>
            </Button>
          );

          if (!showTooltip) {
            return button;
          }

          return (
            <Tooltip key={`${chip.label}-${index}`}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent>{chip.prompt}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
