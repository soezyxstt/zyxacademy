// A cancelled request must not replace data or end the loading state of its successor.
export function scheduleAdminListRequest<T>(
  request: () => Promise<T>,
  handlers: { onSuccess: (result: T) => void; onError: () => void; onSettled: () => void },
  delayMs = 250,
) {
  let cancelled = false;
  const timer = setTimeout(() => {
    void (async () => {
      try {
        const result = await request();
        if (!cancelled) handlers.onSuccess(result);
      } catch {
        if (!cancelled) handlers.onError();
      } finally {
        if (!cancelled) handlers.onSettled();
      }
    })();
  }, delayMs);

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

export function adminListRequestState(
  loadedKey: string,
  requestedKey: string,
  failedKey: string | null,
  fetching: boolean,
) {
  const failed = failedKey === requestedKey;
  const stale = loadedKey !== requestedKey;
  return { failed, stale, loading: !failed && (fetching || stale) };
}
