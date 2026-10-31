"use client";

import React, { useState } from "react";
import { ArrowUp, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface QuickActionsBarProps {
  options: string[];
  onSelect: (option: string) => void;
  disabled?: boolean;
}

/**
 * Parses and extracts quick-action suggestions from message content.
 * Returns the cleaned markdown content (with raw code blocks stripped)
 * and an array of actionable choice strings.
 */
export function extractQuickActions(content: string): {
  cleanedContent: string;
  quickActions: string[];
} {
  if (!content) {
    return { cleanedContent: "", quickActions: [] };
  }

  // 1. Explicit ```quick-actions ... ``` or ```actions ... ``` block
  const quickActionsRegex = /```(?:quick-actions|actions|quick_actions|options)\s*(\[[\s\S]*?\])\s*```/i;
  const match = content.match(quickActionsRegex);

  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleanedContent = content.replace(match[0], "").trimEnd();
        const actions = parsed
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((s) => s.trim());
        if (actions.length > 0) {
          return { cleanedContent, quickActions: actions };
        }
      }
    } catch {
      // Ignore JSON parse errors and proceed to heuristics
    }
  }

  // 2. Resilient heuristic fallback: Proposal confirmation questions
  const proposalConfirmationPattern =
    /(?:apakah anda (?:ingin|setuju|yakin|mau) (?:melanjutkan|menjalankan|mengeksekusi)|apakah proposal ini sudah sesuai|ingin melanjutkan dengan proposal)/i;

  if (proposalConfirmationPattern.test(content)) {
    return {
      cleanedContent: content,
      quickActions: ["Ya", "Tidak"],
    };
  }

  // 3. Resilient heuristic fallback: Disambiguation choices (2 to 4 items)
  const disambiguationPattern =
    /(?:mana(?:kah)? yang anda maksud|pilih salah satu|apakah yang dimaksud)[^?:]*[?:]\s*((?:(?:\r?\n)(?:(?:\d+\.|\-|\*)\s+[^\r\n]+)){2,4})/i;
  const listMatch = content.match(disambiguationPattern);
  if (listMatch && listMatch[1]) {
    const lines = listMatch[1]
      .split(/\r?\n/)
      .map((l) => l.replace(/^(?:\d+\.|\-|\*)\s+/, "").trim())
      .filter((l) => l.length > 0 && l.length <= 40);
    if (lines.length >= 2 && lines.length <= 4) {
      return {
        cleanedContent: content,
        quickActions: lines,
      };
    }
  }

  return { cleanedContent: content, quickActions: [] };
}

/**
 * Compact, responsive quick-actions toolbar with option buttons and a custom input field.
 * Designed to fit neatly under the assistant message without consuming excessive vertical space.
 */
export function QuickActionsBar({
  options,
  onSelect,
  disabled = false,
}: QuickActionsBarProps) {
  const [customText, setCustomText] = useState("");

  if (!options || options.length === 0) {
    return null;
  }

  const handleSubmitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customText.trim();
    if (trimmed && !disabled) {
      onSelect(trimmed);
      setCustomText("");
    }
  };

  return (
    <div
      role="group"
      aria-label="Pilihan aksi cepat"
      className="flex flex-wrap items-center gap-1.5 pt-2 select-none"
    >
      {/* Option Buttons */}
      {options.map((opt, idx) => {
        const isYes = /^(?:ya|lanjutkan|setuju|oke|ok)$/i.test(opt);
        const isNo = /^(?:tidak|batal|jangan)$/i.test(opt);

        return (
          <Button
            variant="outline"
            size="sm"
            key={`${opt}-${idx}`}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt)}
            aria-label={`Pilih opsi ${opt}`}
            className={cn(
              "h-auto min-h-7 max-w-full whitespace-normal text-left",
              isYes &&
                "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/60",
              isNo &&
                "border-border/80 bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted",
              !isYes &&
                !isNo &&
                "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5"
            )}
          >
            {isYes && <Check className="size-3 shrink-0" />}
            {isNo && <X className="size-3 shrink-0" />}
            <span className="break-words">{opt}</span>
          </Button>
        );
      })}

      {/* Inline Custom Response Field */}
      <form
        onSubmit={handleSubmitCustom}
        className="inline-flex items-center min-w-[140px] max-w-[220px] flex-1 sm:flex-initial"
      >
        <div className="relative w-full flex items-center">
          <Input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            disabled={disabled}
            placeholder="Ketik sendiri..."
            aria-label="Ketik sendiri respon Anda"
            className="h-8 pr-9"
          />
          {customText.trim() && (
            <Button
              size="icon-sm"
              type="submit"
              disabled={disabled}
              aria-label="Kirim respon kustom"
              className="absolute right-0.5"
            >
              <ArrowUp className="size-3" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
