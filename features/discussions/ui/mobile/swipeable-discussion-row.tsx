"use client";

import { useRef, useState, type ReactNode, type TouchEvent, type MouseEvent } from "react";
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
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const axisRef = useRef<"none" | "horizontal" | "vertical">("none");
  const swipedRef = useRef(false);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
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
        setDragging(true);
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
    setOffsetX(clamped);
  };

  const handleTouchEnd = () => {
    if (axisRef.current === "horizontal") {
      if (offsetX >= TRIGGER_THRESHOLD_PX) {
        onShare();
      } else if (
        canToggleResolve &&
        onToggleResolve &&
        offsetX <= -TRIGGER_THRESHOLD_PX
      ) {
        onToggleResolve();
      }
    }
    axisRef.current = "none";
    setDragging(false);
    setOffsetX(0);
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
      className="relative overflow-hidden touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClickCapture={handleClickCapture}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-stretch justify-between"
      >
        <div
          className={cn(
            "flex items-center gap-1.5 bg-primary/15 px-4 text-body-xs font-medium text-primary transition-opacity duration-150 motion-reduce:transition-none",
            offsetX > 8 ? "opacity-100" : "opacity-0"
          )}
        >
          <Share2 className="size-4 shrink-0" aria-hidden="true" />
          <span>{shareLabel}</span>
        </div>

        {canToggleResolve && onToggleResolve ? (
          <div
            className={cn(
              "ml-auto flex items-center gap-1.5 px-4 text-body-xs font-medium transition-opacity duration-150 motion-reduce:transition-none",
              isResolved
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
              offsetX < -8 ? "opacity-100" : "opacity-0"
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
        className={cn(
          "relative bg-background",
          !dragging && "transition-transform duration-200 motion-reduce:transition-none"
        )}
        style={{
          transform: offsetX !== 0 ? `translate3d(${offsetX}px, 0, 0)` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
