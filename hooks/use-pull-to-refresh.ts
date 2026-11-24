"use client";

/**
 * hooks/use-pull-to-refresh.ts
 *
 * Reusable smartphone pull-to-refresh gesture controller.
 * Activates only on smartphone viewports when scrollTop === 0 and pulling downward.
 * Respects active pull-to-refresh locks (quizzes, uploads, in-flight submissions).
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { hapticError, hapticSelection, hapticSuccess } from "@/lib/native/haptics";
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
const MAX_VISUAL_PULL_PX = 80;

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
    document.querySelector(
      '[role="dialog"][data-state="open"], [aria-modal="true"], [data-mobile-navbar][data-mobile-search-expanded="true"]',
    ),
  );
}

export interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
  threshold?: number;
  containerRef: RefObject<HTMLElement | null>;
  indicatorRef?: RefObject<HTMLElement | null>;
  hostRef?: RefObject<HTMLElement | null>;
}

export interface UsePullToRefreshResult {
  status: PullToRefreshStatus;
  locked: boolean;
  retry: () => void;
  dismissError: () => void;
}

export function usePullToRefresh({
  onRefresh,
  disabled = false,
  threshold = PULL_THRESHOLD_PX,
  containerRef,
  indicatorRef,
  hostRef,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const locked = useIsPullToRefreshLocked();
  const [status, setStatus] = useState<PullToRefreshStatus>("idle");

  const onRefreshRef = useRef(onRefresh);
  const statusRef = useRef(status);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const updateStatus = useCallback((next: PullToRefreshStatus) => {
    if (statusRef.current === next) return;
    statusRef.current = next;
    setStatus(next);
    if (next === "ready") {
      void hapticSelection();
    }
  }, []);

  const setPullVars = useCallback(
    (distance: number, progress: number) => {
      const visualDistance = Math.min(distance, MAX_VISUAL_PULL_PX);
      const opacity = String(Math.min(1, distance / 24));
      const target = hostRef?.current ?? indicatorRef?.current;
      if (!target) return;
      target.style.setProperty("--pull-distance", `${visualDistance}px`);
      target.style.setProperty("--pull-progress", String(progress));
      target.style.setProperty("--pull-turn", `${progress * 180}deg`);
      target.style.setProperty("--pull-opacity", opacity);
    },
    [hostRef, indicatorRef],
  );

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
      return;
    }

    updateStatus("refreshing");
    try {
      await onRefreshRef.current();
      void hapticSuccess();
      updateStatus("idle");
    } catch {
      void hapticError();
      updateStatus("error");
    }
  }, [updateStatus]);

  const dismissError = useCallback(() => {
    if (statusRef.current === "error") {
      updateStatus("idle");
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
      }
    }
  }, [disabled, locked, updateStatus]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let frame: number | undefined;
    const paintPull = () => {
      frame = undefined;
      const distance = gestureRef.current.distance;
      const progress = Math.min(1, distance / threshold);
      setPullVars(distance, progress);
    };
    const cancelPull = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      gestureRef.current.active = false;
      gestureRef.current.committed = false;
      gestureRef.current.distance = 0;
      if (statusRef.current === "pulling" || statusRef.current === "ready") updateStatus("idle");
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) { cancelPull(); return; }
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

      setPullVars(0, 0);
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
      if (!gesture.active) return;
      if (event.touches.length !== 1 || disabledRef.current || isPullToRefreshLocked()) {
        cancelPull();
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
        if (Math.max(0, element.scrollTop) !== 0 || windowScrollY !== 0 || hasScrollableAncestorScrolled(event.target)) {
          gesture.active = false;
          return;
        }
        gesture.committed = true;
      }

      if (deltaY <= 0) {
        cancelPull();
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      const distance = calculatePullDistance(deltaY);
      gesture.distance = distance;
      if (frame === undefined) frame = requestAnimationFrame(paintPull);
      updateStatus(distance >= threshold ? "ready" : "pulling");
    };

    const handleTouchEnd = () => {
      const gesture = gestureRef.current;
      if (!gesture.active) return;
      const shouldRefresh = gesture.committed && gesture.distance >= threshold;
      if (shouldRefresh) {
        if (frame !== undefined) cancelAnimationFrame(frame);
        paintPull();
        gesture.active = false;
        gesture.committed = false;
        void executeRefresh();
      } else {
        cancelPull();
      }
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    element.addEventListener("touchcancel", cancelPull, { passive: true });

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", cancelPull);
    };
  }, [containerRef, setPullVars, threshold, executeRefresh, updateStatus]);

  return {
    status,
    locked,
    retry,
    dismissError,
  };
}
