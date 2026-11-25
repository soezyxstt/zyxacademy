"use client";

import { useRef, type ReactNode, type TouchEvent, type MouseEvent } from "react";
import { CheckCircle2, RotateCcw, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

const LOCK_THRESHOLD_PX = 10;
const TRIGGER_THRESHOLD_PX = 68;
const MAX_SWIPE_PX = 100;

export interface SwipeableDiscussionRowProps {
  children: ReactNode;
  shareLabel: string;
  onShare: () => void;
  canToggleResolve?: boolean;
  isResolved?: boolean;
  resolveLabel?: string;
  reopenLabel?: string;
  onToggleResolve?: () => void;
}

/**
 * Lightweight touch-swipe wrapper for mobile discussion question items.
 * - Swipe right reveals Share on the left and triggers on threshold release.
 * - Swipe left reveals Resolve / Reopen on the right (when permitted) and triggers on threshold release.
 * - Preserves vertical scrolling via touch-pan-y and axis locking.
 * - Drives transform directly via DOM refs during touchmove to avoid per-frame React re-renders.
 */
export function SwipeableDiscussionRow({
  children,
  shareLabel,
  onShare,
  canToggleResolve = false,
  isResolved = false,
  resolveLabel = "Selesaikan",
  reopenLabel = "Buka lagi",
  onToggleResolve,
}: SwipeableDiscussionRowProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const leftActionRef = useRef<HTMLDivElement>(null);
  const rightActionRef = useRef<HTMLDivElement>(null);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const offsetXRef = useRef(0);
  const axisRef = useRef<"none" | "horizontal" | "vertical">("none");
  const swipedRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyOffset = (nextOffset: number, animate: boolean) => {
    offsetXRef.current = nextOffset;
    const contentEl = contentRef.current;
    if (contentEl) {
      contentEl.style.transition = animate
        ? "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none";
      contentEl.style.transform =
        nextOffset !== 0 ? `translate3d(${nextOffset}px, 0, 0)` : "";
    }
    if (leftActionRef.current) {
      leftActionRef.current.style.opacity = nextOffset > 8 ? "1" : "0";
    }
    if (rightActionRef.current) {
      rightActionRef.current.style.opacity = nextOffset < -8 ? "1" : "0";
    }
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    const touch = event.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    axisRef.current = "none";
    swipedRef.current = false;
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - startXRef.current;
    const dy = touch.clientY - startYRef.current;

    if (axisRef.current === "none") {
      if (Math.abs(dy) > LOCK_THRESHOLD_PX && Math.abs(dy) >= Math.abs(dx)) {
        axisRef.current = "vertical";
        return;
      }
      if (Math.abs(dx) > LOCK_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
        axisRef.current = "horizontal";
      } else {
        return;
      }
    }

    if (axisRef.current !== "horizontal") return;

    const minOffset = canToggleResolve && onToggleResolve ? -MAX_SWIPE_PX : 0;
    const clamped = Math.max(minOffset, Math.min(MAX_SWIPE_PX, dx));
    if (Math.abs(clamped) > LOCK_THRESHOLD_PX) {
      swipedRef.current = true;
    }
    applyOffset(clamped, false);
  };

  const handleTouchEnd = () => {
    const finalOffset = offsetXRef.current;
    if (axisRef.current === "horizontal") {
      if (finalOffset >= TRIGGER_THRESHOLD_PX) {
        onShare();
      } else if (
        canToggleResolve &&
        onToggleResolve &&
        finalOffset <= -TRIGGER_THRESHOLD_PX
      ) {
        onToggleResolve();
      }
    }
    axisRef.current = "none";
    applyOffset(0, true);
    if (swipedRef.current) {
      resetTimerRef.current = setTimeout(() => {
        swipedRef.current = false;
        resetTimerRef.current = null;
      }, 80);
    }
  };

  const handleTouchCancel = () => {
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    axisRef.current = "none";
    swipedRef.current = false;
    applyOffset(0, true);
  };

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (swipedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      swipedRef.current = false;
    }
  };

  const rightActionLabel = isResolved ? reopenLabel : resolveLabel;

  return (
    <div
      data-swipeable-discussion-row=""
      data-swipe-lock=""
      className="relative overflow-hidden touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onClickCapture={handleClickCapture}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-stretch justify-between"
      >
        <div
          ref={leftActionRef}
          style={{ opacity: 0 }}
          className="flex items-center gap-1.5 bg-primary/15 px-4 text-body-xs font-medium text-primary transition-opacity duration-150 motion-reduce:transition-none"
        >
          <Share2 className="size-4 shrink-0" aria-hidden="true" />
          <span>{shareLabel}</span>
        </div>

        {canToggleResolve && onToggleResolve ? (
          <div
            ref={rightActionRef}
            style={{ opacity: 0 }}
            className={cn(
              "ml-auto flex items-center gap-1.5 px-4 text-body-xs font-medium transition-opacity duration-150 motion-reduce:transition-none",
              isResolved
                ? "bg-status-warning/15 text-status-warning"
                : "bg-status-success/15 text-status-success"
            )}
          >
            {isResolved ? (
              <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span>{rightActionLabel}</span>
          </div>
        ) : null}
      </div>

      <div
        ref={contentRef}
        className="relative bg-background motion-reduce:!transition-none"
      >
        {children}
      </div>
    </div>
  );
}
