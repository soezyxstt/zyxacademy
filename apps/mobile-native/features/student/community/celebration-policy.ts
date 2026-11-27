import { parseCelebration, type Celebration } from "../../../../../lib/gamification/celebration-contracts";
import { wasShown, type ShownCelebration } from "../../../../../lib/gamification/celebration-client-policy";

export function pendingCelebrations(payload: unknown, history: ShownCelebration[], account: string) {
  const display: Celebration[] = [];
  const acknowledge: string[] = [];
  const seen = new Set<string>();
  if (!payload || typeof payload !== "object" || !("celebrations" in payload) || !Array.isArray(payload.celebrations)) return { display, acknowledge };
  for (const value of payload.celebrations.slice(0, 10)) {
    if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id.trim() || value.id.length > 200 || seen.has(value.id)) continue;
    const event = parseCelebration(value.id, { ...value, namespace: "gamification" });
    if (!event) continue;
    seen.add(event.id);
    if (wasShown(history, account, event.id)) acknowledge.push(event.id);
    else if (display.length < 3) display.push(event);
  }
  return { display, acknowledge };
}
