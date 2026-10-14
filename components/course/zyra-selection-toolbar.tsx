"use client";

import React, { useState, useEffect } from "react";
import {
  BookOpen,
  HelpCircle,
  Lightbulb,
  Sparkles,
  ArrowRight,
  MessageSquareText,
  Loader2,
  X,
  Workflow,
  Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";
import type { ZyraSelectionContext } from "@/lib/zyra/selection-serializer";
import { quickExplainSnippetAction } from "@/app/actions/tutor";

export interface ZyraSelectionToolbarProps {
  courseId: string;
  selectionContext: ZyraSelectionContext;
  coords: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAskZyra: (intent: string, customQuestion?: string) => void;
}

export function ZyraSelectionToolbar({
  courseId,
  selectionContext,
  coords,
  open,
  onOpenChange,
  onAskZyra,
}: ZyraSelectionToolbarProps) {
  const [mode, setMode] = useState<"toolbar" | "micro_popover">("toolbar");
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickExplanation, setQuickExplanation] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);

  // Reset to toolbar mode whenever the popover is closed
  useEffect(() => {
    if (!open) {
      setMode("toolbar");
      setQuickLoading(false);
      setQuickExplanation(null);
      setQuickError(null);
    }
  }, [open]);

  const handleFetchQuickExplanation = async (intent: "define" | "simplify" | "step_by_step" | "intuition") => {
    setMode("micro_popover");
    setQuickLoading(true);
    setQuickError(null);
    setQuickExplanation(null);

    try {
      const res = await quickExplainSnippetAction({
        courseId,
        snippet: selectionContext.cleanText,
        sectionTitle: selectionContext.sectionTitle,
        chapterTitle: selectionContext.chapterTitle,
        blockType: selectionContext.blockType,
        intent,
      });

      if (res.success && res.explanation) {
        setQuickExplanation(res.explanation);
      } else {
        setQuickError(res.error || "Gagal memuat penjelasan singkat.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kendala saat memuat penjelasan.";
      setQuickError(msg);
    } finally {
      setQuickLoading(false);
    }
  };

  const isShortTerm = selectionContext.wordCount <= 4 && !selectionContext.hasMath;
  const isMathOrStep = selectionContext.hasMath || selectionContext.blockType === "worked_example";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div
          data-slot="zyra-selection-anchor"
          style={{
            position: "fixed",
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${Math.max(coords.width, 1)}px`,
            height: `${Math.max(coords.height, 1)}px`,
            pointerEvents: "none",
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        avoidCollisions
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className={cn(
          "z-[100] border border-border/80 bg-card/95 backdrop-blur-md shadow-xl text-foreground transition-all duration-150",
          mode === "micro_popover" ? "w-[340px] sm:w-[380px] p-4 rounded-2xl" : "w-auto p-1 rounded-xl"
        )}
      >
        {mode === "toolbar" ? (
          /* 1. Contextual Action Bar */
          <div
            className="flex items-center gap-1 select-none"
            onMouseDown={(e) => {
              // Crucial: prevent mousedown from collapsing browser text selection
              e.preventDefault();
            }}
          >
            {isShortTerm ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFetchQuickExplanation("define")}
                  className="h-7 text-body-xs font-semibold text-foreground hover:bg-muted gap-1 px-2.5 cursor-pointer"
                >
                  <BookOpen className="size-3 text-brand-primary" />
                  <span>Definisi</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onAskZyra("example", "Berikan contoh konkret materi ini.")}
                  className="h-7 text-body-xs font-semibold text-foreground hover:bg-muted gap-1 px-2.5 cursor-pointer"
                >
                  <Lightbulb className="size-3 text-status-warning" />
                  <span>Contoh</span>
                </Button>
              </>
            ) : isMathOrStep ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onAskZyra("step_by_step", "Bedah langkah perhitungan ini secara bertahap.")}
                  className="h-7 text-body-xs font-semibold text-foreground hover:bg-muted gap-1 px-2.5 cursor-pointer"
                >
                  <Workflow className="size-3 text-status-success" />
                  <span>Bedah Langkah</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onAskZyra("rationale", "Kenapa cara atau rumus ini yang digunakan?")}
                  className="h-7 text-body-xs font-semibold text-foreground hover:bg-muted gap-1 px-2.5 cursor-pointer"
                >
                  <HelpCircle className="size-3 text-status-warning" />
                  <span>Kenapa Cara Ini?</span>
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFetchQuickExplanation("simplify")}
                  className="h-7 text-body-xs font-semibold text-foreground hover:bg-muted gap-1 px-2.5 cursor-pointer"
                >
                  <Sparkles className="size-3 text-brand-primary" />
                  <span>Jelaskan Inti</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onAskZyra("intuition", "Apa intuisi dasar atau analogi di balik pernyataan ini?")}
                  className="h-7 text-body-xs font-semibold text-foreground hover:bg-muted gap-1 px-2.5 cursor-pointer"
                >
                  <Compass className="size-3 text-status-warning" />
                  <span>Intuisinya?</span>
                </Button>
              </>
            )}

            <div className="h-4 w-px bg-border/80 my-auto mx-0.5" />

            {/* Direct Ask Zyra button: opens Zyra drawer immediately */}
            <Button
              type="button"
              variant="default"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onAskZyra("clarify", `Bantu saya memahami bagian ini: "${selectionContext.cleanText}"`)}
              className="h-7 text-body-xs font-semibold bg-brand-primary hover:bg-brand-primary/95 text-white gap-1 px-2.5 cursor-pointer rounded-lg"
            >
              <MessageSquareText className="size-3" />
              <span>Tanya Zyra</span>
            </Button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onOpenChange(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer ml-0.5"
              aria-label="Tutup bilah alat"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          /* 2. Inline Micro Popover Card */
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles className="size-3.5 text-brand-primary shrink-0" />
                <span className="font-heading text-body-xs font-bold text-brand-primary truncate">
                  {isShortTerm ? "Definisi Cepat" : "Intisari Konsep"}
                </span>
              </div>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onOpenChange(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                aria-label="Tutup penjelasan"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="min-h-[60px] max-h-56 overflow-y-auto text-body-sm leading-relaxed text-foreground">
              {quickLoading ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-brand-primary" />
                  <span className="text-body-xs">Memuat penjelasan ringkas...</span>
                </div>
              ) : quickError ? (
                <div className="space-y-2 py-2">
                  <p className="text-status-danger text-body-xs">{quickError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleFetchQuickExplanation("define")}
                    className="h-6 text-body-2xs"
                  >
                    Coba lagi
                  </Button>
                </div>
              ) : (
                <div className="text-body-sm leading-relaxed text-foreground">
                  <MathText>{quickExplanation || ""}</MathText>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border/60 pt-2 gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onOpenChange(false)}
                className="h-7 text-body-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Tutup
              </Button>
              <Button
                type="button"
                size="sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onAskZyra(
                    "define",
                    `Jelaskan lebih mendalam tentang "${selectionContext.cleanText}".`
                  );
                }}
                className="h-7 text-body-xs font-semibold bg-brand-primary hover:bg-brand-primary/95 text-white gap-1 cursor-pointer"
              >
                <span>Lanjut diskusi di Zyra</span>
                <ArrowRight className="size-3" />
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
