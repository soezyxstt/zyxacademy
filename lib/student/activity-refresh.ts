// Each instance belongs to one mounted account effect.
export function createActivityRefresh(load: (signal: AbortSignal) => Promise<void>, now = Date.now) {
  const controller = new AbortController();
  let pending = false;
  let running = false;
  let lastSuccess: number | undefined;

  async function refresh(force = false): Promise<void> {
    if (controller.signal.aborted) return;
    if (running) {
      pending ||= force;
      return;
    }
    if (!force && lastSuccess !== undefined && now() - lastSuccess < 60_000) return;
    running = true;
    try {
      await load(controller.signal);
      if (!controller.signal.aborted) lastSuccess = now();
    } catch {
      // Leave failed requests eligible for the next focus or mutation retry.
    } finally {
      running = false;
      if (pending) {
        pending = false;
        await refresh(true);
      }
    }
  }

  return { refresh, dispose: () => controller.abort() };
}
