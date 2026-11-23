"use client";

/**
 * hooks/use-pull-to-refresh.ts
 *
 * Reusable smartphone pull-to-refresh gesture controller.
 * Activates only on smartphone viewports when scrollTop === 0 and pulling downward.
 * Respects active pull-to-refresh locks (quizzes, uploads, in-flight submissions).
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { isPullToRefreshLocked } from "@/lib/pull-to-refresh-lock";
import { useIsPullToRefreshLocked } from "@/hooks/use-pull-to-refresh-lock";
import {
  PULL_THRESHOLD_PX,
  MAX_PULL_PX,
  calculatePullDistance,
  canStartPullToRefresh,
  shouldCommitPullGesture,
  type CanStartPullParams,
  type PullToRefreshStatus,
} from "@/lib/pull-to-refresh-gesture";

export {
  PULL_THRESHOLD_PX,
  MAX_PULL_PX,
  calculatePullDistance,
  canStartPullToRefresh,
  shouldCommitPullGesture,
  type CanStartPullParams,
  type PullToRefreshStatus,
};

const SMARTPHONE_MEDIA_QUERY = "(max-width: 767px)";

function isSmartphoneViewport(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(SMARTPHONE_MEDIA_QUERY).matches;
  }
  return window.innerWidth <= 767;
}

function isIgnoredPullTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], canvas, [data-ptr-ignore="true"], [data-ptr-ignore]',
    ),
  );
}

function hasScrollableAncestorScrolled(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  let node: Element | null = target;
  while (node && node !== document.documentElement) {
    if (node instanceof HTMLElement && node.scrollTop > 0) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function getClampedWindowScrollY(): number {
  if (typeof window === "undefined") return 0;
  return Math.max(0, window.scrollY ?? 0, document.documentElement?.scrollTop ?? 0);
}

function hasOpenModalDialog(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.querySelector('[role="dialog"][data-state="open"], [aria-modal="true"]'),
  );
}

export interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
  threshold?: number;
  containerRef: RefObject<HTMLElement | null>;
}

export interface UsePullToRefreshResult {
  status: PullToRefreshStatus;
  pullDistance: number;
  progress: number;
  locked: boolean;
  retry: () => void;
  dismissError: () => void;
}

export function usePullToRefresh({
  onRefresh,
  disabled = false,
  threshold = PULL_THRESHOLD_PX,
  containerRef,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const locked = useIsPullToRefreshLocked();
  const [status, setStatus] = useState<PullToRefreshStatus>("idle");
  const [pullDistance, setPullDistance] = useState(0);

  const onRefreshRef = useRef(onRefresh);
  const statusRef = useRef(status);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const updateStatus = useCallback((next: PullToRefreshStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const gestureRef = useRef<{
    active: boolean;
    committed: boolean;
    startX: number;
    startY: number;
    distance: number;
  }>({
    active: false,
    committed: false,
    startX: 0,
    startY: 0,
    distance: 0,
  });

  const executeRefresh = useCallback(async () => {
    if (statusRef.current === "refreshing") return;
    if (disabledRef.current || isPullToRefreshLocked()) {
      updateStatus("idle");
      setPullDistance(0);
      return;
    }

    updateStatus("refreshing");
    setPullDistance(threshold);
    try {
      await onRefreshRef.current();
      updateStatus("idle");
      setPullDistance(0);
    } catch {
      updateStatus("error");
      setPullDistance(0);
    }
  }, [threshold, updateStatus]);

  const dismissError = useCallback(() => {
    if (statusRef.current === "error") {
      updateStatus("idle");
      setPullDistance(0);
    }
  }, [updateStatus]);

  const retry = useCallback(() => {
    void executeRefresh();
  }, [executeRefresh]);

  // Cancel any in-progress pull gesture immediately if disabled or locked.
  useEffect(() => {
    if (disabled || locked) {
      gestureRef.current.active = false;
      gestureRef.current.committed = false;
      gestureRef.current.distance = 0;
      if (statusRef.current === "pulling" || statusRef.current === "ready") {
        updateStatus("idle");
        setPullDistance(0);
      }
    }
  }, [disabled, locked, updateStatus]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      if (!isSmartphoneViewport()) return;

      const touch = event.touches[0];
      const windowScrollY = getClampedWindowScrollY();

      const canStart =
        canStartPullToRefresh({
          enabled: !disabledRef.current,
          locked: isPullToRefreshLocked(),
          isRefreshing: statusRef.current === "refreshing",
          scrollTop: Math.max(0, element.scrollTop),
          windowScrollY,
          hasOpenDialog: hasOpenModalDialog(),
          isIgnoredTarget: isIgnoredPullTarget(event.target),
        }) && !hasScrollableAncestorScrolled(event.target);

      if (!canStart) {
        gestureRef.current.active = false;
        return;
      }

      gestureRef.current = {
        active: true,
        committed: false,
        startX: touch.clientX,
        startY: touch.clientY,
        distance: 0,
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (!gesture.active || event.touches.length !== 1) return;
      if (disabledRef.current || isPullToRefreshLocked()) {
        gesture.active = false;
        updateStatus("idle");
        setPullDistance(0);
        return;
      }

      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;

      if (!gesture.committed) {
        const decision = shouldCommitPullGesture(deltaX, deltaY);
        if (decision === "pending") return;
        if (decision === "cancel") {
          gesture.active = false;
          return;
        }
        // Re-verify scroll position at the moment vertical pull commits.
        const windowScrollY = getClampedWindowScrollY();
        if (Math.max(0, element.scrollTop) !== 0 || windowScrollY !== 0) {
          gesture.active = false;
          return;
        }
        gesture.committed = true;
      }

      if (deltaY <= 0) {
        gesture.distance = 0;
        setPullDistance(0);
        updateStatus("idle");
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      const distance = calculatePullDistance(deltaY);
      gesture.distance = distance;
      setPullDistance(distance);
      updateStatus(distance >= threshold ? "ready" : "pulling");
    };

    const handleTouchEnd = () => {
      const gesture = gestureRef.current;
      if (!gesture.active) return;
      const shouldRefresh = gesture.committed && gesture.distance >= threshold;
      gesture.active = false;
      gesture.committed = false;
      gesture.distance = 0;

      if (shouldRefresh) {
        void executeRefresh();
      } else if (statusRef.current === "pulling" || statusRef.current === "ready") {
        updateStatus("idle");
        setPullDistance(0);
      }
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    element.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [containerRef, threshold, executeRefresh, updateStatus]);

  const progress = Math.min(1, pullDistance / threshold);

  return {
    status,
    pullDistance,
    progress,
    locked,
    retry,
    dismissError,
  };
}
