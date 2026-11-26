export type TouchFeedback = "selection" | "light" | "success" | "error";

export function createTouchFeedback(
  enabled: () => boolean,
  perform: (kind: TouchFeedback) => Promise<void>,
  now = () => performance.now(),
) {
  const last = new Map<TouchFeedback, number>();
  return async (kind: TouchFeedback): Promise<boolean> => {
    if (!enabled()) return false;
    const time = now();
    if (time - (last.get(kind) ?? -Infinity) < 80) return false;
    last.set(kind, time);
    try {
      await perform(kind);
      return true;
    } catch {
      return false;
    }
  };
}
