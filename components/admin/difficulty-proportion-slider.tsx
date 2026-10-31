"use client";

import React, { useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  GripVertical,
  Plus,
  Minus,
  AlertTriangle,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface DifficultyProportions {
  easy: number;
  medium: number;
  hard: number;
}

export interface DifficultyProportionSliderProps {
  totalCount: number;
  easy: number;
  medium: number;
  hard: number;
  onChange: (proportions: DifficultyProportions) => void;
  onTotalCountChange?: (newTotal: number) => void;
  disabled?: boolean;
  className?: string;
  translationNamespace?: string;
}

export function DifficultyProportionSlider({
  totalCount,
  easy,
  medium,
  hard,
  onChange,
  onTotalCountChange,
  disabled = false,
  className,
  translationNamespace = "adminEval.quizForm",
}: DifficultyProportionSliderProps) {
  const t = useTranslations(translationNamespace);
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeKnob, setActiveKnob] = useState<1 | 2 | null>(null);
  const [hoveredKnob, setHoveredKnob] = useState<1 | 2 | null>(null);

  const safeTotal = Math.max(1, Number(totalCount) || 1);
  const numEasy = Math.max(0, Number(easy) || 0);
  const numMedium = Math.max(0, Number(medium) || 0);
  const numHard = Math.max(0, Number(hard) || 0);

  const currentSum = numEasy + numMedium + numHard;
  const isSynced = currentSum === safeTotal;

  // Percentages relative to totalCount (or currentSum if not synced for visual accuracy)
  const baseForPercentage = isSynced || currentSum === 0 ? safeTotal : currentSum;
  const easyPct = (numEasy / baseForPercentage) * 100;
  const mediumPct = (numMedium / baseForPercentage) * 100;
  const hardPct = (numHard / baseForPercentage) * 100;

  // Knob 1 is at position easy (boundary between easy & medium)
  const knob1PosPct = Math.min(100, Math.max(0, easyPct));
  // Knob 2 is at position easy + medium (boundary between medium & hard)
  const knob2PosPct = Math.min(100, Math.max(0, easyPct + mediumPct));

  // ───────────────────────────────────────────────────────────────────────────
  // POINTER DRAG HANDLING FOR MULTI-KNOB SLIDER
  // ───────────────────────────────────────────────────────────────────────────
  const updateFromPointer = useCallback(
    (clientX: number, knobIndex: 1 | 2) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;

      const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const fraction = offsetX / rect.width;
      const rawQuestionVal = fraction * safeTotal;
      const snappedVal = Math.round(rawQuestionVal);

      if (knobIndex === 1) {
        // Knob 1 boundaries: 0 to (easy + medium)
        const combinedEasyMed = numEasy + numMedium;
        const maxK1 = isSynced ? combinedEasyMed : safeTotal - numHard;
        const clampedK1 = Math.max(0, Math.min(Math.max(0, maxK1), snappedVal));
        const newEasy = clampedK1;
        const newMedium = Math.max(0, maxK1 - clampedK1);
        const newHard = isSynced ? numHard : Math.max(0, safeTotal - newEasy - newMedium);

        onChange({
          easy: newEasy,
          medium: newMedium,
          hard: newHard,
        });
      } else if (knobIndex === 2) {
        // Knob 2 boundaries: easy to safeTotal
        const minK2 = numEasy;
        const maxK2 = safeTotal;
        const clampedK2 = Math.max(minK2, Math.min(maxK2, snappedVal));
        const newHard = Math.max(0, safeTotal - clampedK2);
        const combinedMedHard = isSynced ? numMedium + numHard : safeTotal - numEasy;
        const newMedium = Math.max(0, combinedMedHard - newHard);
        const newEasy = isSynced ? numEasy : Math.max(0, safeTotal - newMedium - newHard);

        onChange({
          easy: newEasy,
          medium: newMedium,
          hard: newHard,
        });
      }
    },
    [safeTotal, numEasy, numMedium, numHard, isSynced, onChange]
  );

  const handlePointerDown = (knobIndex: 1 | 2, e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveKnob(knobIndex);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeKnob || disabled) return;
    updateFromPointer(e.clientX, activeKnob);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeKnob) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture release fails
      }
      setActiveKnob(null);
    }
  };

  // Track click handler (moves nearest knob)
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || activeKnob || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const offsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const fraction = offsetX / rect.width;
    const clickVal = fraction * safeTotal;

    const k1Val = numEasy;
    const k2Val = numEasy + numMedium;

    const distToK1 = Math.abs(clickVal - k1Val);
    const distToK2 = Math.abs(clickVal - k2Val);

    if (distToK1 <= distToK2) {
      updateFromPointer(e.clientX, 1);
    } else {
      updateFromPointer(e.clientX, 2);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // STEPPER (+ / -) HANDLER
  // ───────────────────────────────────────────────────────────────────────────
  const handleStep = (type: "easy" | "medium" | "hard", delta: number) => {
    if (disabled) return;

    if (delta > 0) {
      if (type === "easy") {
        if (numMedium > 0) {
          onChange({ easy: numEasy + 1, medium: numMedium - 1, hard: numHard });
        } else if (numHard > 0) {
          onChange({ easy: numEasy + 1, medium: numMedium, hard: numHard - 1 });
        } else if (onTotalCountChange) {
          onTotalCountChange(safeTotal + 1);
          onChange({ easy: numEasy + 1, medium: numMedium, hard: numHard });
        }
      } else if (type === "medium") {
        if (numHard > 0) {
          onChange({ easy: numEasy, medium: numMedium + 1, hard: numHard - 1 });
        } else if (numEasy > 0) {
          onChange({ easy: numEasy - 1, medium: numMedium + 1, hard: numHard });
        } else if (onTotalCountChange) {
          onTotalCountChange(safeTotal + 1);
          onChange({ easy: numEasy, medium: numMedium + 1, hard: numHard });
        }
      } else if (type === "hard") {
        if (numMedium > 0) {
          onChange({ easy: numEasy, medium: numMedium - 1, hard: numHard + 1 });
        } else if (numEasy > 0) {
          onChange({ easy: numEasy - 1, medium: numMedium, hard: numHard + 1 });
        } else if (onTotalCountChange) {
          onTotalCountChange(safeTotal + 1);
          onChange({ easy: numEasy, medium: numMedium, hard: numHard + 1 });
        }
      }
    } else {
      if (type === "easy" && numEasy > 0) {
        onChange({ easy: numEasy - 1, medium: numMedium + 1, hard: numHard });
      } else if (type === "medium" && numMedium > 0) {
        onChange({ easy: numEasy, medium: numMedium - 1, hard: numHard + 1 });
      } else if (type === "hard" && numHard > 0) {
        onChange({ easy: numEasy, medium: numMedium + 1, hard: numHard - 1 });
      }
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // DIRECT EXACT INPUT FIELD HANDLER
  // ───────────────────────────────────────────────────────────────────────────
  const handleInputChange = (type: "easy" | "medium" | "hard", valStr: string) => {
    const parsed = Math.max(0, parseInt(valStr, 10) || 0);
    if (type === "easy") {
      onChange({ easy: parsed, medium: numMedium, hard: numHard });
    } else if (type === "medium") {
      onChange({ easy: numEasy, medium: parsed, hard: numHard });
    } else if (type === "hard") {
      onChange({ easy: numEasy, medium: numMedium, hard: parsed });
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // PRESET DISTRIBUTIONS
  // ───────────────────────────────────────────────────────────────────────────
  const applyPreset = (rEasy: number, rMed: number, _rHard: number) => {
    if (disabled) return;
    const N = safeTotal;
    const e = Math.round(N * rEasy);
    const m = Math.round(N * rMed);
    let h = N - e - m;
    let finalE = e;
    let finalM = m;
    let finalH = h;
    if (finalH < 0) {
      finalH = 0;
      finalM = Math.max(0, N - finalE);
    }
    if (finalM < 0) {
      finalM = 0;
      finalE = N;
    }
    onChange({ easy: finalE, medium: finalM, hard: finalH });
  };

  // Normalization action if sum differs from total
  const normalizeToTarget = () => {
    if (currentSum === 0) {
      applyPreset(0.33, 0.34, 0.33);
      return;
    }
    const rE = numEasy / currentSum;
    const rM = numMedium / currentSum;
    const rH = numHard / currentSum;
    applyPreset(rE, rM, rH);
  };

  return (
    <TooltipProvider>
      <div className={cn("space-y-3.5", className)}>
        {/* Preset Proportions Row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-body-xs font-semibold text-muted-foreground">
            <SlidersHorizontal className="size-3.5 text-brand-primary" />
            <span>{t("slider.presets")}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={disabled}
              onClick={() => applyPreset(0.33, 0.34, 0.33)}
              className="text-[11px] h-6 px-2 rounded-md font-medium text-foreground hover:bg-muted"
            >
              {t("slider.balanced")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={disabled}
              onClick={() => applyPreset(0.5, 0.3, 0.2)}
              className="text-[11px] h-6 px-2 rounded-md font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/30"
            >
              {t("slider.easyDominant")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={disabled}
              onClick={() => applyPreset(0.2, 0.6, 0.2)}
              className="text-[11px] h-6 px-2 rounded-md font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 border-amber-500/30"
            >
              {t("slider.mediumDominant")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={disabled}
              onClick={() => applyPreset(0.2, 0.3, 0.5)}
              className="text-[11px] h-6 px-2 rounded-md font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 border-rose-500/30"
            >
              {t("slider.hardDominant")}
            </Button>
          </div>
        </div>

        {/* Interactive Multi-Region Progress & Knob Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-body-xs font-semibold text-muted-foreground px-0.5">
            <span>{t("slider.questionDistribution", { count: safeTotal })}</span>
            <span>
              {t("slider.totalDistributed")}{" "}
              <strong className={cn(isSynced ? "text-foreground" : "text-status-error")}>
                {currentSum} / {safeTotal}
              </strong>
            </span>
          </div>

          <div
            ref={trackRef}
            onClick={handleTrackClick}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={cn(
              "relative h-10 w-full rounded-xl bg-muted/60 p-1 border border-border select-none shadow-inner cursor-pointer",
              disabled && "opacity-60 pointer-events-none"
            )}
          >
            {/* 3 Contiguous Color Regions */}
            <div className="relative h-full w-full rounded-lg overflow-hidden flex bg-muted">
              {/* Region 1: Easy (Green) */}
              <div
                style={{ width: `${easyPct}%` }}
                className="h-full bg-emerald-500 hover:bg-emerald-500/95 transition-all flex items-center justify-center text-white font-bold text-body-xs px-1 overflow-hidden"
              >
                {easyPct >= 12 && (
                  <span className="truncate drop-shadow-xs">
                    {numEasy} {t("slider.easy")} ({Math.round(easyPct)}%)
                  </span>
                )}
              </div>

              {/* Region 2: Medium (Yellow/Amber) */}
              <div
                style={{ width: `${mediumPct}%` }}
                className="h-full bg-amber-500 hover:bg-amber-500/95 transition-all flex items-center justify-center text-white font-bold text-body-xs px-1 overflow-hidden"
              >
                {mediumPct >= 12 && (
                  <span className="truncate drop-shadow-xs">
                    {numMedium} {t("slider.medium")} ({Math.round(mediumPct)}%)
                  </span>
                )}
              </div>

              {/* Region 3: Hard (Red/Rose) */}
              <div
                style={{ width: `${hardPct}%` }}
                className="h-full bg-rose-500 hover:bg-rose-500/95 transition-all flex items-center justify-center text-white font-bold text-body-xs px-1 overflow-hidden"
              >
                {hardPct >= 12 && (
                  <span className="truncate drop-shadow-xs">
                    {numHard} {t("slider.hard")} ({Math.round(hardPct)}%)
                  </span>
                )}
              </div>
            </div>

            {/* Knob 1: Boundary between Easy and Medium */}
            <div
              style={{ left: `${knob1PosPct}%` }}
              onPointerDown={(e) => handlePointerDown(1, e)}
              onMouseEnter={() => setHoveredKnob(1)}
              onMouseLeave={() => setHoveredKnob(null)}
              tabIndex={disabled ? -1 : 0}
              role="slider"
              aria-label={t("slider.easyMediumDivider")}
              aria-valuenow={numEasy}
              aria-valuemin={0}
              aria-valuemax={numEasy + numMedium}
              onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                  e.preventDefault();
                  handleStep("easy", -1);
                } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                  e.preventDefault();
                  handleStep("easy", 1);
                }
              }}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-12 rounded-lg bg-card border-2 shadow-md flex items-center justify-center cursor-ew-resize transition-transform duration-75 z-20 outline-none",
                activeKnob === 1 || hoveredKnob === 1
                  ? "border-brand-primary scale-110 shadow-lg ring-2 ring-brand-primary/30"
                  : "border-border hover:border-brand-primary/80"
              )}
            >
              <GripVertical className="size-3 text-muted-foreground" />

              {/* Floating Value Pill on Drag/Hover */}
              {(activeKnob === 1 || hoveredKnob === 1) && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-foreground text-background text-[10px] font-bold whitespace-nowrap shadow-md pointer-events-none">
                  {t("slider.easyCount", { count: numEasy })}
                </div>
              )}
            </div>

            {/* Knob 2: Boundary between Medium and Hard */}
            <div
              style={{ left: `${knob2PosPct}%` }}
              onPointerDown={(e) => handlePointerDown(2, e)}
              onMouseEnter={() => setHoveredKnob(2)}
              onMouseLeave={() => setHoveredKnob(null)}
              tabIndex={disabled ? -1 : 0}
              role="slider"
              aria-label={t("slider.mediumHardDivider")}
              aria-valuenow={numEasy + numMedium}
              aria-valuemin={numEasy}
              aria-valuemax={safeTotal}
              onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                  e.preventDefault();
                  handleStep("medium", -1);
                } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                  e.preventDefault();
                  handleStep("medium", 1);
                }
              }}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-12 rounded-lg bg-card border-2 shadow-md flex items-center justify-center cursor-ew-resize transition-transform duration-75 z-20 outline-none",
                activeKnob === 2 || hoveredKnob === 2
                  ? "border-brand-primary scale-110 shadow-lg ring-2 ring-brand-primary/30"
                  : "border-border hover:border-brand-primary/80"
              )}
            >
              <GripVertical className="size-3 text-muted-foreground" />

              {/* Floating Value Pill on Drag/Hover */}
              {(activeKnob === 2 || hoveredKnob === 2) && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-foreground text-background text-[10px] font-bold whitespace-nowrap shadow-md pointer-events-none">
                  {t("slider.mediumCount", { count: numMedium })}
                </div>
              )}
            </div>
          </div>

          {/* Scale Ticks if count is <= 30 */}
          {safeTotal <= 30 && (
            <div className="flex justify-between text-[10px] text-muted-foreground/80 px-1 pt-0.5 select-none">
              <span>0</span>
              <span>{Math.floor(safeTotal / 2)}</span>
              <span>{t("slider.questionCount", { count: safeTotal })}</span>
            </div>
          )}
        </div>

        {/* 3 Synced Exact Value Cards with Steppers */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {/* Easy Card */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-body-xs font-bold text-emerald-700 dark:text-emerald-300">
                  {t("slider.easy")}
                </span>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] font-bold px-1.5 py-0 rounded-md border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              >
                {Math.round(easyPct)}%
              </Badge>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                disabled={disabled || numEasy <= 0}
                onClick={() => handleStep("easy", -1)}
                className="size-7 rounded-md border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                aria-label={t("slider.decrease", { difficulty: t("slider.easy") })}
              >
                <Minus className="size-3" />
              </Button>

              <Input
                type="number"
                min={0}
                max={safeTotal}
                disabled={disabled}
                value={easy}
                onChange={(e) => handleInputChange("easy", e.target.value)}
                className="h-7 text-center text-body-xs font-bold rounded-md border-emerald-500/40 bg-background text-foreground"
              />

              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                disabled={disabled || (isSynced && numEasy >= safeTotal)}
                onClick={() => handleStep("easy", 1)}
                className="size-7 rounded-md border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                aria-label={t("slider.increase", { difficulty: t("slider.easy") })}
              >
                <Plus className="size-3" />
              </Button>
            </div>
          </div>

          {/* Medium Card */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-body-xs font-bold text-amber-700 dark:text-amber-300">
                  {t("slider.medium")}
                </span>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] font-bold px-1.5 py-0 rounded-md border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              >
                {Math.round(mediumPct)}%
              </Badge>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                disabled={disabled || numMedium <= 0}
                onClick={() => handleStep("medium", -1)}
                className="size-7 rounded-md border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                aria-label={t("slider.decrease", { difficulty: t("slider.medium") })}
              >
                <Minus className="size-3" />
              </Button>

              <Input
                type="number"
                min={0}
                max={safeTotal}
                disabled={disabled}
                value={medium}
                onChange={(e) => handleInputChange("medium", e.target.value)}
                className="h-7 text-center text-body-xs font-bold rounded-md border-amber-500/40 bg-background text-foreground"
              />

              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                disabled={disabled || (isSynced && numMedium >= safeTotal)}
                onClick={() => handleStep("medium", 1)}
                className="size-7 rounded-md border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                aria-label={t("slider.increase", { difficulty: t("slider.medium") })}
              >
                <Plus className="size-3" />
              </Button>
            </div>
          </div>

          {/* Hard Card */}
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-rose-500 shrink-0" />
                <span className="text-body-xs font-bold text-rose-700 dark:text-rose-300">
                  {t("slider.hard")}
                </span>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] font-bold px-1.5 py-0 rounded-md border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              >
                {Math.round(hardPct)}%
              </Badge>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                disabled={disabled || numHard <= 0}
                onClick={() => handleStep("hard", -1)}
                className="size-7 rounded-md border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20"
                aria-label={t("slider.decrease", { difficulty: t("slider.hard") })}
              >
                <Minus className="size-3" />
              </Button>

              <Input
                type="number"
                min={0}
                max={safeTotal}
                disabled={disabled}
                value={hard}
                onChange={(e) => handleInputChange("hard", e.target.value)}
                className="h-7 text-center text-body-xs font-bold rounded-md border-rose-500/40 bg-background text-foreground"
              />

              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                disabled={disabled || (isSynced && numHard >= safeTotal)}
                onClick={() => handleStep("hard", 1)}
                className="size-7 rounded-md border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20"
                aria-label={t("slider.increase", { difficulty: t("slider.hard") })}
              >
                <Plus className="size-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Sync Discrepancy Banner & Actions (if user typed mismatched raw numbers) */}
        {!isSynced && (
          <div className="rounded-lg border border-status-error/40 bg-status-error/5 p-3 flex flex-wrap items-center justify-between gap-2.5 text-body-xs">
            <div className="flex items-center gap-2 text-status-error font-medium">
              <AlertTriangle className="size-4 shrink-0" />
              <span>
                {t("slider.totalMismatch", { current: currentSum, target: safeTotal })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {onTotalCountChange && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => onTotalCountChange(currentSum)}
                  className="h-6 rounded-md text-[11px] font-semibold border-status-error/30 text-status-error hover:bg-status-error/10"
                >
                  {t("slider.adjustTarget", { count: currentSum })}
                </Button>
              )}
              <Button
                type="button"
                size="xs"
                onClick={normalizeToTarget}
                className="h-6 rounded-md text-[11px] font-semibold bg-brand-primary text-primary-foreground hover:bg-brand-primary/90"
              >
                {t("slider.normalize", { count: safeTotal })}
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
