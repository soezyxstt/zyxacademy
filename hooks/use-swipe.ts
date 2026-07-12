import { useEffect, useRef } from "react";

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
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  const touchStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    onSwipeLeftRef.current = onSwipeLeft;
    onSwipeRightRef.current = onSwipeRight;
  }, [onSwipeLeft, onSwipeRight]);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartRef.current = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const startX = touchStartRef.current.x;
      const startY = touchStartRef.current.y;
      
      const dx = touchEndX - startX;
      const dy = touchEndY - startY;
      
      // Ensure it's mostly a horizontal swipe, not vertical scrolling
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > swipeThreshold) {
        if (dx > 0 && onSwipeRightRef.current) {
          onSwipeRightRef.current(startX);
        } else if (dx < 0 && onSwipeLeftRef.current) {
          onSwipeLeftRef.current(startX);
        }
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [swipeThreshold]);
}
