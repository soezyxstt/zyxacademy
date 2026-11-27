import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useIsFocused } from "expo-router";

export function useTutorDiscussionForeground() {
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    let obscured = false;
    const signal = () => setForeground(!obscured && AppState.currentState === "active");
    const subscriptions = [AppState.addEventListener("change", signal)];
    if (Platform.OS === "android") {
      subscriptions.push(AppState.addEventListener("blur", () => { obscured = true; signal(); }));
      subscriptions.push(AppState.addEventListener("focus", () => { obscured = false; signal(); }));
    }
    signal();
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, []);
  return focused && foreground;
}

/** Runs one read at a time and discards work when the active route or refresh mode changes. */
export function useTutorDiscussionPoll(enabled: boolean, delay: number, scope: string, read: (signal: AbortSignal) => Promise<void>) {
  const operation = useRef({ scope, read });
  operation.current = { scope, read };
  const previous = useRef<{ enabled: boolean; scope: string; hasRun: boolean } | null>(null);
  useEffect(() => {
    const wasActive = previous.current?.scope === scope ? previous.current : null;
    const resume = wasActive?.hasRun && !wasActive.enabled;
    previous.current = { enabled, scope, hasRun: Boolean(wasActive?.hasRun || enabled) };
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (controller.signal.aborted || operation.current.scope !== scope) return;
      try { await operation.current.read(controller.signal); }
      catch { /* The read handles visible errors. */ }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => void tick(), delay); }
    };
    timer = setTimeout(() => void tick(), resume ? 0 : delay);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [delay, enabled, scope]);
}
