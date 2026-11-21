/**
 * lib/pull-to-refresh-lock.ts
 *
 * Shared lock registry so active quizzes, in-flight file uploads,
 * and active form/answer submissions can disable smartphone pull-to-refresh
 * without prop drilling across layouts.
 */

const activeLocks = new Map<symbol, string>();
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function acquirePullToRefreshLock(reason: string): () => void {
  const token = Symbol(reason);
  activeLocks.set(token, reason);
  emitChange();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (activeLocks.delete(token)) {
      emitChange();
    }
  };
}

export function isPullToRefreshLocked(): boolean {
  return activeLocks.size > 0;
}

export function getPullToRefreshLockReasons(): string[] {
  return Array.from(activeLocks.values());
}

/** Clear all locks (used in unit tests). */
export function clearPullToRefreshLocks(): void {
  if (activeLocks.size === 0) return;
  activeLocks.clear();
  emitChange();
}

export function subscribePullToRefreshLock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
