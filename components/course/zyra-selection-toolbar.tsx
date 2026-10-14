"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  HelpCircle,
  Lightbulb,
  Sparkles,
  ArrowRight,
  MessageSquareText,
  Loader2,
  X,
  Send,
  Workflow,
  Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { cn } from "@/lib/utils";
import type { ZyraSelectionContext } from "@/lib/zyra/selection-serializer";
import { quickExplainSnippetAction } from "@/app/actions/tutor";

export interface ZyraSelectionToolbarProps {
  courseId: string;
  selectionContext: ZyraSelectionContext;
  coords: { top: number; left: number };
  onClose: () => void;
  onAskZyra: (intent: string, customQuestion?: string) => void;
}

export function ZyraSelectionToolbar({
  courseId,
  selectionContext,
  coords,
  onClose,
  onAskZyra,
}: ZyraSelectionToolbarProps) {
  const [mode, setMode] = useState<"toolbar" | "quick_input" | "micro_popover">("toolbar");
  const [quickQuestion, setQuickQuestion] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickExplanation, setQuickExplanation] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clamp position to viewport to avoid overflow
  const [adjustedCoords, setAdjustedCoords] = useState(coords);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const padding = 16;
    const estWidth = mode === "micro_popover" ? 340 : mode === "quick_input" ? 320 : 280;
    const estHeight = mode === "micro_popover" ? 180 : 44;

    let left = coords.left;
    let top = coords.top;

    // Horizontal clamping
    const halfWidth = estWidth / 2;
    if (left - halfWidth < padding) {
      left = padding + halfWidth;
    } else if (left + halfWidth > window.innerWidth - padding) {
      left = window.innerWidth - padding - halfWidth;
    }

    // Vertical positioning: flip below selection if too close to top
    if (top < 60) {
      top = coords.top + 70;
    }

    setAdjustedCoords({ top, left });
  }, [coords, mode]);

  useEffect(() => {
    if (mode === "quick_input") {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [mode]);

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

  const handleQuickSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = quickQuestion.trim();
    if (!q) return;
    onAskZyra("custom", q);
  };

  const isShortTerm = selectionContext.wordCount <= 4 && !selectionContext.hasMath;
  const isMathOrStep = selectionContext.hasMath || selectionContext.blockType === "worked_example";

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top: `${adjustedCoords.top}px`,
        left: `${adjustedCoords.left}px`,
        transform: "translateX(-50%)",
        zIndex: 9999,
      }}
      className="animate-in fade-in zoom-in-95 duration-150 select-none"
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      {/* 1. Micro Popover Mode (Quick 5-10 second explanation in-place) */}
      {mode === "micro_popover" ? (
        <div className="w-[320px] sm:w-[360px] rounded-2xl border border-border/80 bg-card p-4 shadow-xl text-foreground space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles className="size-3.5 text-brand-primary shrink-0" />
              <span className="font-heading text-body-xs font-bold text-brand-primary truncate">
                {isShortTerm ? "Definisi Cepat" : "Intisari Konsep"}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              aria-label="Tutup penjelasan ringkas"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="min-h-[60px] max-h-56 overflow-y-auto text-body-sm leading-relaxed">
            {quickLoading ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-brand-primary" />
                <p className="text-body-xs">Menyiapkan ringkasan...</p>
              </div>
            ) : quickError ? (
              <p className="text-body-xs text-destructive">{quickError}</p>
            ) : quickExplanation ? (
              <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                <MarkdownRenderer content={quickExplanation} density="compact" />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 text-body-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Tutup
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => onAskZyra(selectionContext.suggestedIntent)}
              className="h-7 text-body-xs font-semibold gap-1 bg-brand-primary hover:bg-brand-primary/95 text-white"
            >
              <span>Lanjut diskusi di Zyra</span>
              <ArrowRight className="size-3" />
            </Button>
          </div>
        </div>
      ) : mode === "quick_input" ? (
        /* 2. Inline Quick Input Mode */
        <form
          onSubmit={handleQuickSubmit}
          className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-card p-1.5 shadow-xl"
        >
          <Input
            ref={inputRef}
            value={quickQuestion}
            onChange={(e) => setQuickQuestion(e.target.value)}
            placeholder="Tanyakan tentang kutipan ini..."
            className="h-8 w-56 sm:w-64 border-none bg-transparent px-2 text-body-sm shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="icon-xs"
            disabled={!quickQuestion.trim()}
            className="size-7 rounded-lg bg-brand-primary hover:bg-brand-primary/95 text-white disabled:opacity-40"
            aria-label="Kirim pertanyaan"
          >
            <Send className="size-3" />
          </Button>
          <button
            type="button"
            onClick={() => setMode("toolbar")}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label="Kembali"
          >
            <X className="size-3.5" />
          </button>
        </form>
      ) : (
        /* 3. Adaptive Floating Action Bar Mode */
        <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-card p-1.5 shadow-xl backdrop-blur-md">
          {isShortTerm ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleFetchQuickExplanation("define")}
                className="h-7 text-body-xs font-semibold text-foreground hover:bg-muted gap-1 px-2.5"
              >
                <BookOpen className="size-3 text-brand-primary" />
                <span>Definisi</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onAskZyra("example", "Berikan contoh konkret materi ini.")}
                className="h-7 text-body-xs font-semibold text-foreground hover:bg-muted gap-1 px-2.5"
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
                onClick={() => onAskZyra("step_by_step", "Bedah langkah perhitungan ini secara bertahap.")}
                className="h-7 text-body-xs font-semibold text-foreground hover:bg-muted gap-1 px-2.5"
              >
                <Workflow className="size-3 text-status-success" />
                <span>Bedah Langkah</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onAskZyra("rationale", "Kenapa cara atau rumus ini yang digunakan?")}
                className="h-7 text-body-xs font-semibold text-foreground hover:bg-muted gap-1 px-2.5"
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
                onClick={() => handleFetchQuickExplanation("simplify")}
                className="h-7 text-body-xs font-semibold text-foreground hover:bg-muted gap-1 px-2.5"
              >
                <Sparkles className="size-3 text-brand-primary" />
                <span>Jelaskan Inti</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onAskZyra("intuition", "Apa intuisi dasar atau analogi di balik pernyataan ini?")}
                className="h-7 text-body-xs font-semibold text-foreground hover:bg-muted gap-1 px-2.5"
              >
                <Compass className="size-3 text-status-warning" />
                <span>Intuisinya?</span>
              </Button>
            </>
          )}

          <div className="h-4 w-px bg-border/80 my-auto mx-0.5" />

          {/* Ask Zyra button (clicks expand quick input) */}
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setMode("quick_input")}
            className="h-7 text-body-xs font-semibold bg-brand-primary hover:bg-brand-primary/95 text-white gap-1 px-2.5"
          >
            <MessageSquareText className="size-3" />
            <span>Tanya Zyra</span>
          </Button>

          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer ml-0.5"
            aria-label="Tutup bilah alat"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
