/**
 * lib/native/local-reminders.ts
 *
 * Local study reminders and confirmed tutor session reminders using
 * @capacitor/local-notifications.
 *
 * Responsibilities:
 * - User-configurable daily or weekly study reminders (persisted per user).
 * - Confirmed tutor session reminders scheduled before session start (Asia/Jakarta).
 * - Deterministic positive 32-bit notification IDs + local registry so updates,
 *   reschedules, cancellations, and logouts cleanly cancel old notification IDs.
 */

import {
  getCapacitor,
  type CapacitorLocalNotificationSchema,
  type CapacitorLocalNotificationsPlugin,
} from "./runtime";

export type StudyReminderFrequency = "daily" | "weekly";

export interface StudyReminderConfig {
  enabled: boolean;
  frequency: StudyReminderFrequency;
  /** 0..23 */
  hour: number;
  /** 0..59 */
  minute: number;
  /** Capacitor weekdays: 1 = Sunday .. 7 = Saturday */
  weekdays: number[];
  /** Minutes before a confirmed tutor session to fire a local reminder. */
  tutorLeadMinutes: number;
}

export interface TutorSessionReminderInput {
  bookingId: string;
  status: "scheduled" | "completed" | "cancelled" | "rescheduled" | string;
  sessionDate: string | null | undefined;
  startTime: string | null | undefined;
  courseTitle?: string | null;
  tutorName?: string | null;
  topic?: string | null;
}

interface StoredBookingReminderRecord {
  id: number;
  fireAtIso: string;
}

interface LocalReminderRegistry {
  studyIds: number[];
  bookings: Record<string, StoredBookingReminderRecord>;
}

export const DEFAULT_STUDY_REMINDER_CONFIG: StudyReminderConfig = {
  enabled: false,
  frequency: "daily",
  hour: 19,
  minute: 0,
  weekdays: [2, 4, 6], // Mon, Wed, Fri
  tutorLeadMinutes: 30,
};

const STUDY_ID_MIN = 100_000;
const STUDY_ID_MAX = 100_099;
const DAILY_STUDY_ID = 100_001;
const WEEKLY_STUDY_ID_BASE = 100_010; // + weekday (1..7)
const BOOKING_ID_BASE = 200_000;
const BOOKING_ID_MOD = 900_000_000;

const CONFIG_STORAGE_PREFIX = "zyx_study_reminder_config_v1:";
const REGISTRY_STORAGE_PREFIX = "zyx_local_reminder_registry_v1:";

export function isLocalReminderSchedulingSupported(): boolean {
  const plugin = getLocalNotificationsPlugin();
  return Boolean(plugin?.schedule && plugin?.cancel);
}

function getLocalNotificationsPlugin(): CapacitorLocalNotificationsPlugin | null {
  return getCapacitor()?.Plugins?.LocalNotifications ?? null;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function normalizeStudyReminderConfig(
  raw: Partial<StudyReminderConfig> | null | undefined,
): StudyReminderConfig {
  const hour =
    typeof raw?.hour === "number" && Number.isInteger(raw.hour) && raw.hour >= 0 && raw.hour <= 23
      ? raw.hour
      : DEFAULT_STUDY_REMINDER_CONFIG.hour;
  const minute =
    typeof raw?.minute === "number" && Number.isInteger(raw.minute) && raw.minute >= 0 && raw.minute <= 59
      ? raw.minute
      : DEFAULT_STUDY_REMINDER_CONFIG.minute;
  const frequency: StudyReminderFrequency = raw?.frequency === "weekly" ? "weekly" : "daily";
  const weekdays = Array.isArray(raw?.weekdays)
    ? Array.from(
        new Set(
          raw.weekdays.filter(
            (day): day is number => typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 7,
          ),
        ),
      ).sort((a, b) => a - b)
    : [...DEFAULT_STUDY_REMINDER_CONFIG.weekdays];
  const tutorLeadMinutes =
    typeof raw?.tutorLeadMinutes === "number" &&
    Number.isInteger(raw.tutorLeadMinutes) &&
    raw.tutorLeadMinutes >= 5 &&
    raw.tutorLeadMinutes <= 180
      ? raw.tutorLeadMinutes
      : DEFAULT_STUDY_REMINDER_CONFIG.tutorLeadMinutes;

  return {
    enabled: Boolean(raw?.enabled),
    frequency,
    hour,
    minute,
    weekdays: weekdays.length > 0 ? weekdays : [...DEFAULT_STUDY_REMINDER_CONFIG.weekdays],
    tutorLeadMinutes,
  };
}

export function loadStudyReminderConfig(userId: string): StudyReminderConfig {
  const storage = getStorage();
  if (!storage || !userId) return { ...DEFAULT_STUDY_REMINDER_CONFIG };
  try {
    const raw = storage.getItem(`${CONFIG_STORAGE_PREFIX}${userId}`);
    if (!raw) return { ...DEFAULT_STUDY_REMINDER_CONFIG };
    return normalizeStudyReminderConfig(JSON.parse(raw) as Partial<StudyReminderConfig>);
  } catch {
    return { ...DEFAULT_STUDY_REMINDER_CONFIG };
  }
}

export function saveStudyReminderConfig(userId: string, config: StudyReminderConfig): StudyReminderConfig {
  const normalized = normalizeStudyReminderConfig(config);
  const storage = getStorage();
  if (storage && userId) {
    try {
      storage.setItem(`${CONFIG_STORAGE_PREFIX}${userId}`, JSON.stringify(normalized));
    } catch {
      // Non-fatal
    }
  }
  return normalized;
}

function loadRegistry(userId: string): LocalReminderRegistry {
  const storage = getStorage();
  if (!storage || !userId) return { studyIds: [], bookings: {} };
  try {
    const raw = storage.getItem(`${REGISTRY_STORAGE_PREFIX}${userId}`);
    if (!raw) return { studyIds: [], bookings: {} };
    const parsed = JSON.parse(raw) as Partial<LocalReminderRegistry>;
    return {
      studyIds: Array.isArray(parsed.studyIds) ? parsed.studyIds.filter((id) => typeof id === "number") : [],
      bookings: parsed.bookings && typeof parsed.bookings === "object" ? parsed.bookings : {},
    };
  } catch {
    return { studyIds: [], bookings: {} };
  }
}

function saveRegistry(userId: string, registry: LocalReminderRegistry): void {
  const storage = getStorage();
  if (!storage || !userId) return;
  try {
    storage.setItem(`${REGISTRY_STORAGE_PREFIX}${userId}`, JSON.stringify(registry));
  } catch {
    // Non-fatal
  }
}

function listAllRegistryKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && key.startsWith(REGISTRY_STORAGE_PREFIX)) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Deterministic positive 32-bit integer notification ID for a tutor booking.
 */
export function getBookingReminderNotificationId(bookingId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < bookingId.length; i += 1) {
    hash ^= bookingId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return BOOKING_ID_BASE + ((hash >>> 0) % BOOKING_ID_MOD);
}

/**
 * Parses a YYYY-MM-DD + HH:mm tutor session start time in Asia/Jakarta (+07:00).
 */
export function parseJakartaSessionStart(sessionDate: string | null | undefined, startTime: string | null | undefined): Date | null {
  if (!sessionDate || !startTime) return null;
  const dateMatch = /^(\d{4}-\d{2}-\d{2})$/.exec(sessionDate.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(startTime.trim());
  if (!dateMatch || !timeMatch) return null;
  const hh = timeMatch[1].padStart(2, "0");
  const mm = timeMatch[2];
  const parsed = new Date(`${dateMatch[1]}T${hh}:${mm}:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildStudyReminderNotifications(
  config: StudyReminderConfig,
  locale: "id" | "en" = "id",
): CapacitorLocalNotificationSchema[] {
  const normalized = normalizeStudyReminderConfig(config);
  if (!normalized.enabled) return [];

  const title = locale === "en" ? "Time to study" : "Waktunya belajar";
  const body =
    locale === "en"
      ? "Open Zyx Academy for a quick review session."
      : "Buka Zyx Academy untuk sesi belajar singkat hari ini.";

  if (normalized.frequency === "daily") {
    return [
      {
        id: DAILY_STUDY_ID,
        title,
        body,
        schedule: {
          on: { hour: normalized.hour, minute: normalized.minute },
          repeats: true,
          allowWhileIdle: true,
        },
        extra: {
          kind: "study_reminder",
          url: "/dashboard",
        },
      },
    ];
  }

  return normalized.weekdays.map((weekday) => ({
    id: WEEKLY_STUDY_ID_BASE + weekday,
    title,
    body,
    schedule: {
      on: { weekday, hour: normalized.hour, minute: normalized.minute },
      repeats: true,
      allowWhileIdle: true,
    },
    extra: {
      kind: "study_reminder",
      url: "/dashboard",
    },
  }));
}

export async function syncStudyReminderNotifications(
  userId: string,
  config: StudyReminderConfig,
  options?: { locale?: "id" | "en" },
): Promise<{ scheduledIds: number[]; cancelledIds: number[] }> {
  const normalized = saveStudyReminderConfig(userId, config);
  const plugin = getLocalNotificationsPlugin();
  if (!plugin?.schedule || !plugin?.cancel) {
    return { scheduledIds: [], cancelledIds: [] };
  }

  const registry = loadRegistry(userId);
  const idsToCancel = new Set<number>(registry.studyIds);

  if (plugin.getPending) {
    try {
      const pending = await plugin.getPending();
      for (const item of pending.notifications ?? []) {
        if (item.id >= STUDY_ID_MIN && item.id <= STUDY_ID_MAX) {
          idsToCancel.add(item.id);
        }
      }
    } catch {
      // Continue with tracked IDs
    }
  }

  const cancelledIds = Array.from(idsToCancel);
  if (cancelledIds.length > 0) {
    await plugin.cancel({ notifications: cancelledIds.map((id) => ({ id })) });
  }

  if (!normalized.enabled) {
    registry.studyIds = [];
    saveRegistry(userId, registry);
    return { scheduledIds: [], cancelledIds };
  }

  const perm = await plugin.checkPermissions();
  if (perm.display !== "granted") {
    registry.studyIds = [];
    saveRegistry(userId, registry);
    return { scheduledIds: [], cancelledIds };
  }

  const nextNotifications = buildStudyReminderNotifications(normalized, options?.locale ?? "id");
  if (nextNotifications.length > 0) {
    await plugin.schedule({ notifications: nextNotifications });
  }

  const scheduledIds = nextNotifications.map((n) => n.id);
  registry.studyIds = scheduledIds;
  saveRegistry(userId, registry);

  return { scheduledIds, cancelledIds };
}

export async function syncTutorSessionReminders(
  userId: string,
  sessions: TutorSessionReminderInput[],
  options?: {
    locale?: "id" | "en";
    leadMinutes?: number;
    nowMs?: number;
  },
): Promise<{ scheduledIds: number[]; cancelledIds: number[] }> {
  const plugin = getLocalNotificationsPlugin();
  if (!plugin?.schedule || !plugin?.cancel) {
    return { scheduledIds: [], cancelledIds: [] };
  }

  const locale = options?.locale ?? "id";
  const nowMs = options?.nowMs ?? Date.now();
  const leadMinutes = options?.leadMinutes ?? loadStudyReminderConfig(userId).tutorLeadMinutes;
  const registry = loadRegistry(userId);

  const desiredByBooking = new Map<
    string,
    { id: number; fireAt: Date; fireAtIso: string; session: TutorSessionReminderInput }
  >();

  for (const session of sessions) {
    if (session.status !== "scheduled") continue;
    const startAt = parseJakartaSessionStart(session.sessionDate, session.startTime);
    if (!startAt) continue;
    const fireAt = new Date(startAt.getTime() - leadMinutes * 60_000);
    if (fireAt.getTime() <= nowMs) continue;
    desiredByBooking.set(session.bookingId, {
      id: getBookingReminderNotificationId(session.bookingId),
      fireAt,
      fireAtIso: fireAt.toISOString(),
      session,
    });
  }

  const idsToCancel = new Set<number>();
  const nextBookingsRegistry: Record<string, StoredBookingReminderRecord> = {};

  // Cancel removed, cancelled, completed, or rescheduled booking reminders
  for (const [bookingId, existing] of Object.entries(registry.bookings)) {
    const desired = desiredByBooking.get(bookingId);
    if (!desired) {
      idsToCancel.add(existing.id);
    } else if (desired.fireAtIso !== existing.fireAtIso || desired.id !== existing.id) {
      idsToCancel.add(existing.id);
    } else {
      nextBookingsRegistry[bookingId] = existing;
    }
  }

  const cancelledIds = Array.from(idsToCancel);
  if (cancelledIds.length > 0) {
    await plugin.cancel({ notifications: cancelledIds.map((id) => ({ id })) });
  }

  const perm = await plugin.checkPermissions();
  if (perm.display !== "granted") {
    registry.bookings = nextBookingsRegistry;
    saveRegistry(userId, registry);
    return { scheduledIds: [], cancelledIds };
  }

  const toSchedule: CapacitorLocalNotificationSchema[] = [];
  for (const [bookingId, desired] of desiredByBooking.entries()) {
    if (nextBookingsRegistry[bookingId]) continue; // Already scheduled at the same timestamp

    const course = desired.session.courseTitle?.trim() || (locale === "en" ? "Tutor session" : "Sesi tutorial");
    const tutor = desired.session.tutorName?.trim();
    const title =
      locale === "en"
        ? `Upcoming session: ${course}`
        : `Sesi segera dimulai: ${course}`;
    const body =
      locale === "en"
        ? `${tutor ? `With ${tutor}, ` : ""}starts in ${leadMinutes} minutes (${desired.session.startTime} WIB).`
        : `${tutor ? `Bersama ${tutor}, ` : ""}mulai dalam ${leadMinutes} menit (${desired.session.startTime} WIB).`;

    toSchedule.push({
      id: desired.id,
      title,
      body,
      schedule: {
        at: desired.fireAt,
        allowWhileIdle: true,
      },
      extra: {
        kind: "tutor_reminder",
        bookingId,
        url: "/dashboard/schedule",
      },
    });

    nextBookingsRegistry[bookingId] = {
      id: desired.id,
      fireAtIso: desired.fireAtIso,
    };
  }

  if (toSchedule.length > 0) {
    await plugin.schedule({ notifications: toSchedule });
  }

  registry.bookings = nextBookingsRegistry;
  saveRegistry(userId, registry);

  return {
    scheduledIds: toSchedule.map((n) => n.id),
    cancelledIds,
  };
}

export async function cancelTutorSessionReminder(
  userId: string,
  bookingId: string,
): Promise<boolean> {
  const plugin = getLocalNotificationsPlugin();
  const registry = loadRegistry(userId);
  const existing = registry.bookings[bookingId];
  const notificationId = existing?.id ?? getBookingReminderNotificationId(bookingId);

  if (plugin?.cancel) {
    await plugin.cancel({ notifications: [{ id: notificationId }] });
  }

  if (existing) {
    delete registry.bookings[bookingId];
    saveRegistry(userId, registry);
    return true;
  }
  return false;
}

export async function clearAllLocalRemindersOnLogout(userId?: string): Promise<number[]> {
  const plugin = getLocalNotificationsPlugin();
  const storage = getStorage();
  const idsToCancel = new Set<number>();

  if (storage) {
    const keys = userId
      ? [`${REGISTRY_STORAGE_PREFIX}${userId}`]
      : listAllRegistryKeys(storage);

    for (const key of keys) {
      const uid = key.slice(REGISTRY_STORAGE_PREFIX.length);
      const reg = loadRegistry(uid);
      for (const id of reg.studyIds) idsToCancel.add(id);
      for (const rec of Object.values(reg.bookings)) idsToCancel.add(rec.id);
      try {
        storage.removeItem(key);
      } catch {
        // Non-fatal
      }
    }
  }

  if (plugin?.getPending) {
    try {
      const pending = await plugin.getPending();
      for (const item of pending.notifications ?? []) {
        if (item.id >= STUDY_ID_MIN) {
          idsToCancel.add(item.id);
        }
      }
    } catch {
      // Non-fatal
    }
  }

  const cancelledIds = Array.from(idsToCancel);
  if (plugin?.cancel && cancelledIds.length > 0) {
    await plugin.cancel({ notifications: cancelledIds.map((id) => ({ id })) });
  }

  return cancelledIds;
}
