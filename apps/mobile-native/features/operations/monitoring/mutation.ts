import { useEffect, useRef, useState } from "react";

/** One in-flight mutation per panel. Callers reconcile through a read and never replay a write. */
export function useMonitoringAction() {
  const mounted = useRef(false);
  const active = useRef(false);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function run(action: () => Promise<void>, onSettled?: () => void) {
    if (active.current) return false;
    active.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
      return true;
    } catch (cause) {
      if (mounted.current) setError(cause ?? new Error("Operation failed"));
      return false;
    } finally {
      active.current = false;
      if (mounted.current) {
        setBusy(false);
        onSettled?.();
      }
    }
  }

  return { busy, error, run };
}
