import { useEffect } from "react";

export interface SwipeOptions {
  onSwipeLeft?: (startX: number) => void;
  onSwipeRight?: (startX: number) => void;
  /** Minimum distance required for a swipe to be recognized */
  swipeThreshold?: number;
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  swipeThreshold = 50,
}: SwipeOptions) {
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      
      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;
      
      // Ensure it's mostly a horizontal swipe, not vertical scrolling
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > swipeThreshold) {
        if (dx > 0 && onSwipeRight) {
          onSwipeRight(touchStartX);
        } else if (dx < 0 && onSwipeLeft) {
          onSwipeLeft(touchStartX);
        }
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onSwipeLeft, onSwipeRight, swipeThreshold]);
}
