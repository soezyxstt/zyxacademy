type FetchTransport = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type TransitionState = {
  isPending: () => boolean;
  subscribe: (listener: (pending: boolean) => void) => () => void;
};

function abortError(): DOMException {
  return new DOMException("Account session read was interrupted.", "AbortError");
}

function waitUntilReady(state: TransitionState, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? abortError());
  if (!state.isPending()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const finish = (error?: unknown) => {
      unsubscribe();
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(signal?.reason ?? abortError());
    unsubscribe = state.subscribe((pending) => { if (!pending) finish(); });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    else if (!state.isPending()) finish();
  });
}

/** Prevent a passive Better Auth refresh from restoring the old account cookie. */
export function createAccountSessionFetch({
  fetch: fetchRequest,
  ...state
}: TransitionState & { fetch: FetchTransport }): FetchTransport {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    if (url.pathname !== "/api/auth/get-session") return fetchRequest(input, init);

    // Only the coordinator's authoritative, nonrefreshing reads continue while
    // writers are paused. Normal session expiry/refresh policy stays unchanged.
    if (url.searchParams.get("disableCookieCache") === "true"
      && url.searchParams.get("disableRefresh") === "true") return fetchRequest(input, init);

    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    for (;;) {
      await waitUntilReady(state, callerSignal);
      const controller = new AbortController();
      let interrupted = false;
      const onAbort = () => controller.abort(callerSignal?.reason ?? abortError());
      const interrupt = () => {
        interrupted = true;
        controller.abort(abortError());
      };
      const unsubscribe = state.subscribe((pending) => { if (pending) interrupt(); });
      callerSignal?.addEventListener("abort", onAbort, { once: true });
      try {
        if (callerSignal?.aborted) onAbort();
        else if (state.isPending()) interrupt();
        if (controller.signal.aborted) throw controller.signal.reason;
        const response = await fetchRequest(input, { ...init, signal: controller.signal });
        if (controller.signal.aborted) {
          await response.body?.cancel().catch(() => {});
          throw controller.signal.reason;
        }
        return response;
      } catch (error) {
        if (!interrupted || callerSignal?.aborted) throw error;
        // Keep the session atom's existing data. Rollback resumes this read
        // with the current cookie; a committed transition loads a new document.
      } finally {
        unsubscribe();
        callerSignal?.removeEventListener("abort", onAbort);
      }
    }
  };
}
