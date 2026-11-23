import { isAccountTransitionPending, subscribeAccountTransition } from "@/lib/auth/account-transition-state";

/** Prevent delayed draft work from using a replacement session cookie. */
export function createCodingDraftRequestScope(isOwnerCurrent: () => boolean, onResume: () => void = () => {}) {
  let disposed = false;
  let generation = 0;
  const requests = new Set<AbortController>();
  const cancel = () => {
    generation += 1;
    for (const request of requests) request.abort();
    requests.clear();
  };
  const unsubscribe = subscribeAccountTransition((pending) => {
    if (pending) cancel();
    else if (!disposed && isOwnerCurrent()) onResume();
  });

  return {
    begin() {
      if (disposed || isAccountTransitionPending() || !isOwnerCurrent()) return null;
      const controller = new AbortController();
      const startedGeneration = generation;
      requests.add(controller);
      return {
        signal: controller.signal,
        isCurrent: () => !disposed && !controller.signal.aborted && generation === startedGeneration
          && !isAccountTransitionPending() && isOwnerCurrent(),
        finish: () => { requests.delete(controller); },
      };
    },
    dispose() {
      disposed = true;
      unsubscribe();
      cancel();
    },
  };
}
