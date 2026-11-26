import { expect, test } from "bun:test";
import { NOTIFICATION_PERMISSION_REMINDER_MS, rememberNotificationPermissionChoice, shouldOfferNotificationPermission } from "@/lib/notifications/permission-reminder";

test("permission reminders respect a seven-day cooldown and permanent account choice", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const now = 1800000000000;
  expect(shouldOfferNotificationPermission(storage, "a", now)).toBe(true);
  rememberNotificationPermissionChoice(storage, "a", "later", now);
  expect(shouldOfferNotificationPermission(storage, "a", now + NOTIFICATION_PERMISSION_REMINDER_MS - 1)).toBe(false);
  expect(shouldOfferNotificationPermission(storage, "a", now + NOTIFICATION_PERMISSION_REMINDER_MS)).toBe(true);
  expect(shouldOfferNotificationPermission(storage, "b", now)).toBe(true);
  rememberNotificationPermissionChoice(storage, "a", "never", now);
  rememberNotificationPermissionChoice(storage, "a", "later", now);
  expect(shouldOfferNotificationPermission(storage, "a", now + 10 * NOTIFICATION_PERMISSION_REMINDER_MS)).toBe(false);
  expect(shouldOfferNotificationPermission(storage, "b", now)).toBe(true);
});
