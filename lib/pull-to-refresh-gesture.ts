/**
 * lib/pull-to-refresh-gesture.ts
 *
 * Pure gesture eligibility and resistance math for smartphone pull-to-refresh.
 */

export const PULL_THRESHOLD_PX = 64;
export const MAX_PULL_PX = 112;
const GESTURE_SLOP_PX = 8;

export type PullToRefreshStatus = "idle" | "pulling" | "ready" | "refreshing" | "error";

export interface CanStartPullParams {
  enabled: boolean;
  locked: boolean;
  isRefreshing: boolean;
  scrollTop: number;
  windowScrollY: number;
  hasOpenDialog: boolean;
  isIgnoredTarget: boolean;
}

export function canStartPullToRefresh(params: CanStartPullParams): boolean {
  if (!params.enabled || params.locked || params.isRefreshing) return false;
  if (params.hasOpenDialog || params.isIgnoredTarget) return false;
  return params.scrollTop === 0 && params.windowScrollY === 0;
}

export function calculatePullDistance(rawDeltaY: number, maxPull = MAX_PULL_PX): number {
  if (!Number.isFinite(rawDeltaY) || rawDeltaY <= 0) return 0;
  return Math.min(maxPull, Math.round(maxPull * (1 - Math.exp(-rawDeltaY / (maxPull * 1.4)))));
}

export function shouldCommitPullGesture(
  deltaX: number,
  deltaY: number,
): "pull" | "cancel" | "pending" {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (absX < GESTURE_SLOP_PX && absY < GESTURE_SLOP_PX) {
    return "pending";
  }
  if (deltaY <= 0 || absX >= absY) {
    return "cancel";
  }
  return "pull";
}
