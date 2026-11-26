export const NOTIFICATION_PERMISSION_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;

type ReminderStorage = Pick<Storage, "getItem" | "setItem">;
type ReminderChoice = "later" | "never";
const keyFor = (userId: string) => `zyx:notification-permission:${userId}`;

export function shouldOfferNotificationPermission(storage: ReminderStorage, userId: string, now: number): boolean {
  try {
    const raw = storage.getItem(keyFor(userId));
    if (raw === "never") return false;
    if (raw?.startsWith("later:")) {
      const at = Number(raw.slice(6));
      return !Number.isFinite(at) || now - at >= NOTIFICATION_PERMISSION_REMINDER_MS;
    }
    // Honor an existing seven-day deferral from the older global reminder.
    const legacy = Number(storage.getItem("fcm_later_at") ?? 0);
    return !(legacy > 0 && now - legacy < NOTIFICATION_PERMISSION_REMINDER_MS);
  } catch { return false; }
}

export function rememberNotificationPermissionChoice(storage: ReminderStorage, userId: string, choice: ReminderChoice, now: number): void {
  try {
    const key = keyFor(userId);
    if (storage.getItem(key) === "never") return;
    storage.setItem(key, choice === "never" ? "never" : `later:${now}`);
  } catch { /* A blocked storage API is not fatal. */ }
}
