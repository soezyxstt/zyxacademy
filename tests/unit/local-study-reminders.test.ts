import { afterEach, describe, expect, test } from "bun:test";
import {
  cancelTutorSessionReminder,
  clearAllLocalRemindersOnLogout,
  getBookingReminderNotificationId,
  loadStudyReminderConfig,
  parseJakartaSessionStart,
  refreshUpcomingTutorSessionReminders,
  syncStudyReminderNotifications,
  syncTutorSessionReminders,
  type StudyReminderConfig,
} from "@/lib/native/local-reminders";
import type { CapacitorLocalNotificationSchema } from "@/lib/native/runtime";

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function setupMockCapacitorLocalNotifications(permission: "granted" | "denied" | "prompt" = "granted") {
  const pending = new Map<number, CapacitorLocalNotificationSchema>();
  const scheduledCalls: CapacitorLocalNotificationSchema[][] = [];
  const cancelledCalls: number[][] = [];
  const storage = makeMemoryStorage();

  (globalThis as unknown as { window: Record<string, unknown> }).window = {
    localStorage: storage,
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      Plugins: {
        LocalNotifications: {
          checkPermissions: async () => ({ display: permission }),
          requestPermissions: async () => ({ display: permission }),
          schedule: async ({ notifications }: { notifications: CapacitorLocalNotificationSchema[] }) => {
            scheduledCalls.push(notifications);
            for (const item of notifications) {
              pending.set(item.id, item);
            }
            return { notifications: notifications.map((n) => ({ id: n.id })) };
          },
          cancel: async ({ notifications }: { notifications: Array<{ id: number }> }) => {
            const ids = notifications.map((n) => n.id);
            cancelledCalls.push(ids);
            for (const id of ids) {
              pending.delete(id);
            }
          },
          getPending: async () => ({
            notifications: Array.from(pending.values()).map((n) => ({ id: n.id, extra: n.extra })),
          }),
        },
      },
    },
  };

  return { pending, scheduledCalls, cancelledCalls, storage };
}

describe("local study reminders and tutor session reminders", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  test("schedules daily study reminder, replaces old IDs on weekly update, and cancels when disabled", async () => {
    const mock = setupMockCapacitorLocalNotifications("granted");
    const userId = "student-1";

    const dailyConfig: StudyReminderConfig = {
      enabled: true,
      frequency: "daily",
      hour: 20,
      minute: 15,
      weekdays: [2, 4, 6],
      tutorLeadMinutes: 30,
    };

    const dailyResult = await syncStudyReminderNotifications(userId, dailyConfig, { locale: "en" });
    expect(dailyResult.scheduledIds).toEqual([100_001]);
    expect(mock.pending.get(100_001)?.schedule).toEqual({
      on: { hour: 20, minute: 15 },
      repeats: true,
      allowWhileIdle: true,
    });
    expect(loadStudyReminderConfig(userId)).toEqual(dailyConfig);

    // Switch to weekly Mon/Thu at 18:30 -> must cancel old daily ID (100_001) before scheduling weekly IDs
    const weeklyResult = await syncStudyReminderNotifications(
      userId,
      { ...dailyConfig, frequency: "weekly", hour: 18, minute: 30, weekdays: [2, 5] },
      { locale: "en" },
    );
    expect(weeklyResult.cancelledIds).toContain(100_001);
    expect(weeklyResult.scheduledIds).toEqual([100_012, 100_015]);
    expect(mock.pending.has(100_001)).toBe(false);
    expect(mock.pending.get(100_012)?.schedule?.on).toEqual({ weekday: 2, hour: 18, minute: 30 });
    expect(mock.pending.get(100_015)?.schedule?.on).toEqual({ weekday: 5, hour: 18, minute: 30 });

    // Disable study reminders -> cancels both weekly IDs cleanly
    const disabledResult = await syncStudyReminderNotifications(
      userId,
      { ...dailyConfig, enabled: false },
      { locale: "en" },
    );
    expect(disabledResult.cancelledIds.sort((a, b) => a - b)).toEqual([100_012, 100_015]);
    expect(disabledResult.scheduledIds).toEqual([]);
    expect(mock.pending.size).toBe(0);
  });

  test("schedules confirmed tutor sessions, replaces on reschedule, and cancels on session cancellation", async () => {
    const mock = setupMockCapacitorLocalNotifications("granted");
    const userId = "student-2";
    const nowMs = new Date("2026-11-22T08:00:00+07:00").getTime();

    const startParsed = parseJakartaSessionStart("2026-11-22", "10:00");
    expect(startParsed?.toISOString()).toBe("2026-11-22T03:00:00.000Z");

    const bookingId = "booking-abc";
    const expectedId = getBookingReminderNotificationId(bookingId);

    // 1. Initial confirmed booking + one cancelled booking + one past booking
    const firstSync = await syncTutorSessionReminders(
      userId,
      [
        {
          bookingId,
          status: "scheduled",
          sessionDate: "2026-11-22",
          startTime: "10:00",
          courseTitle: "Kalkulus I",
          tutorName: "Budi",
        },
        {
          bookingId: "booking-cancelled",
          status: "cancelled",
          sessionDate: "2026-11-22",
          startTime: "14:00",
        },
        {
          bookingId: "booking-past",
          status: "scheduled",
          sessionDate: "2026-11-22",
          startTime: "08:15", // 30m lead time (07:45) is already in the past
        },
      ],
      { locale: "id", leadMinutes: 30, nowMs },
    );

    expect(firstSync.scheduledIds).toEqual([expectedId]);
    expect(mock.pending.size).toBe(1);
    expect(mock.pending.get(expectedId)?.schedule?.at?.toISOString()).toBe("2026-11-22T02:30:00.000Z");

    // 2. Reschedule the booking from 10:00 to 13:00 -> cancels old ID and schedules new fire time
    const rescheduledSync = await syncTutorSessionReminders(
      userId,
      [
        {
          bookingId,
          status: "scheduled",
          sessionDate: "2026-11-22",
          startTime: "13:00",
          courseTitle: "Kalkulus I",
          tutorName: "Budi",
        },
      ],
      { locale: "id", leadMinutes: 30, nowMs },
    );

    expect(rescheduledSync.cancelledIds).toEqual([expectedId]);
    expect(rescheduledSync.scheduledIds).toEqual([expectedId]);
    expect(mock.pending.get(expectedId)?.schedule?.at?.toISOString()).toBe("2026-11-22T05:30:00.000Z");

    // 3. Cancel the booking via direct helper -> cancels scheduled notification
    const wasCancelled = await cancelTutorSessionReminder(userId, bookingId);
    expect(wasCancelled).toBe(true);
    expect(mock.pending.size).toBe(0);
  });

  test("cancels all study and tutor session local reminders on logout", async () => {
    const mock = setupMockCapacitorLocalNotifications("granted");
    const userId = "student-3";
    const nowMs = new Date("2026-11-22T08:00:00+07:00").getTime();

    await syncStudyReminderNotifications(
      userId,
      {
        enabled: true,
        frequency: "daily",
        hour: 19,
        minute: 0,
        weekdays: [2, 4, 6],
        tutorLeadMinutes: 30,
      },
      { locale: "id" },
    );

    await syncTutorSessionReminders(
      userId,
      [
        {
          bookingId: "booking-logout-1",
          status: "scheduled",
          sessionDate: "2026-11-22",
          startTime: "15:00",
          courseTitle: "Fisika Dasar",
        },
      ],
      { locale: "id", leadMinutes: 30, nowMs },
    );

    expect(mock.pending.size).toBe(2);

    const cancelledOnLogout = await clearAllLocalRemindersOnLogout();
    expect(cancelledOnLogout).toHaveLength(2);
    expect(cancelledOnLogout).toContain(100_001);
    expect(cancelledOnLogout).toContain(getBookingReminderNotificationId("booking-logout-1"));
    expect(mock.pending.size).toBe(0);
  });

  test("refreshes unscoped upcoming sessions and reschedules existing bookings when tutorLeadMinutes changes", async () => {
    const mock = setupMockCapacitorLocalNotifications("granted");
    const userId = "student-4";
    const nowMs = new Date("2026-11-22T08:00:00+07:00").getTime();
    const bookingId = "booking-lead-change";
    const expectedId = getBookingReminderNotificationId(bookingId);

    const requestedUrls: string[] = [];
    const fakeFetch = (async (url: unknown) => {
      requestedUrls.push(String(url));
      return new Response(
        JSON.stringify({
          sessions: [
            {
              bookingId,
              status: "scheduled",
              sessionDate: "2026-11-22",
              startTime: "12:00",
              courseTitle: "Aljabar Linear",
              tutorName: "Sari",
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    // Initial sync with 30-minute lead time -> fires at 11:30 WIB (04:30 UTC)
    const first = await refreshUpcomingTutorSessionReminders(userId, {
      locale: "id",
      leadMinutes: 30,
      nowMs,
      fetchImpl: fakeFetch,
    });
    expect(requestedUrls).toEqual(["/api/student/upcoming-sessions"]);
    expect(first?.scheduledIds).toEqual([expectedId]);
    expect(mock.pending.get(expectedId)?.schedule?.at?.toISOString()).toBe("2026-11-22T04:30:00.000Z");

    // Change lead time to 60 minutes -> cancels old ID and reschedules for 11:00 WIB (04:00 UTC)
    const second = await refreshUpcomingTutorSessionReminders(userId, {
      locale: "id",
      leadMinutes: 60,
      nowMs,
      fetchImpl: fakeFetch,
    });
    expect(second?.cancelledIds).toEqual([expectedId]);
    expect(second?.scheduledIds).toEqual([expectedId]);
    expect(mock.pending.get(expectedId)?.schedule?.at?.toISOString()).toBe("2026-11-22T04:00:00.000Z");
  });
});
