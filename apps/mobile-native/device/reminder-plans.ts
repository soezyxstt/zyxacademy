export type ReminderLocale = "id" | "en";
export type StudyReminderConfig = {
  enabled: boolean;
  frequency: "daily" | "weekly";
  hour: number;
  minute: number;
  weekdays: number[];
  tutorLeadMinutes: number;
};

export type QuietHours = { enabled: boolean; startMinute: number; endMinute: number; timeZone: string };
export type TutorReminderSession = {
  bookingId: string;
  status: string;
  sessionDate: string | null;
  startTime: string | null;
  courseTitle?: string | null;
  tutorName?: string | null;
};

export type ReminderKind = "study_reminder" | "tutor_reminder";
export type ReminderTrigger =
  | { type: "daily"; hour: number; minute: number }
  | { type: "weekly"; weekday: number; hour: number; minute: number }
  | { type: "date"; time: number };

export type ReminderPlan = {
  key: string;
  kind: ReminderKind;
  title: string;
  body: string;
  url: "/dashboard" | "/dashboard/schedule";
  bookingId?: string;
  trigger: ReminderTrigger;
};

export const DEFAULT_STUDY_REMINDER_CONFIG: Readonly<StudyReminderConfig> = {
  enabled: false,
  frequency: "daily",
  hour: 19,
  minute: 0,
  weekdays: [2, 4, 6],
  tutorLeadMinutes: 30,
};

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function normalizeStudyReminderConfig(value: unknown): StudyReminderConfig {
  const raw = value && typeof value === "object" ? value as Partial<StudyReminderConfig> : {};
  const base = DEFAULT_STUDY_REMINDER_CONFIG;
  const weekdays = Array.isArray(raw.weekdays)
    ? [...new Set(raw.weekdays.filter(day => inRange(day, 1, 7)))].sort((a, b) => a - b) : [];
  return {
    enabled: raw.enabled === true,
    frequency: raw.frequency === "weekly" ? "weekly" : "daily",
    hour: inRange(raw.hour, 0, 23) ? raw.hour : base.hour,
    minute: inRange(raw.minute, 0, 59) ? raw.minute : base.minute,
    weekdays: weekdays.length ? weekdays : [...base.weekdays],
    tutorLeadMinutes: inRange(raw.tutorLeadMinutes, 5, 180) ? raw.tutorLeadMinutes : base.tutorLeadMinutes,
  };
}

export function parseQuietHours(value: unknown): QuietHours | null {
  if (!value || typeof value !== "object") return null;
  const { enabled, startMinute, endMinute, timeZone } = value as Partial<QuietHours>;
  if (typeof enabled !== "boolean" || !inRange(startMinute, 0, 1439) || !inRange(endMinute, 0, 1439)
    || startMinute === endMinute || typeof timeZone !== "string" || !timeZone || timeZone.length > 100) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return { enabled, startMinute, endMinute, timeZone };
  } catch {
    return null;
  }
}

// Scan actual minutes in the preference timezone, including overnight and DST.
function quietWindowEnd(quiet: QuietHours | null, at: Date): Date {
  if (!quiet?.enabled) return at;
  const { startMinute, endMinute, timeZone } = quiet;
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const isQuiet = (candidate: Date) => {
    const parts = format.formatToParts(candidate);
    const minute = Number(parts.find(part => part.type === "hour")?.value) * 60
      + Number(parts.find(part => part.type === "minute")?.value);
    return startMinute < endMinute
      ? minute >= startMinute && minute < endMinute
      : minute >= startMinute || minute < endMinute;
  };
  if (!isQuiet(at)) return at;
  const start = Math.floor(at.getTime() / 60_000) * 60_000;
  for (let offset = 1; offset <= 26 * 60; offset++) {
    const candidate = new Date(start + offset * 60_000);
    if (!isQuiet(candidate)) return candidate;
  }
  throw new Error("The quiet window could not be resolved.");
}

export function planStudyReminders(
  config: StudyReminderConfig,
  locale: ReminderLocale,
  quiet: QuietHours | null,
  now: number,
): ReminderPlan[] {
  if (!config.enabled) return [];
  const times = config.frequency === "daily" ? [null] : config.weekdays;
  const seen = new Set<string>();
  const plans: ReminderPlan[] = [];
  for (const weekday of times) {
    // The selected study time repeats in the device's local wall clock.
    const next = new Date(now);
    if (weekday !== null) next.setDate(next.getDate() + (weekday - (next.getDay() + 1) + 7) % 7);
    next.setHours(config.hour, config.minute, 0, 0);
    if (next.getTime() <= now) {
      next.setDate(next.getDate() + (weekday === null ? 1 : 7));
      next.setHours(config.hour, config.minute, 0, 0);
    }
    const shifted = quietWindowEnd(quiet, next);
    // Preserve the configured wall clock if only the next DST occurrence is normalized.
    const moved = shifted.getTime() !== next.getTime();
    const clock = { hour: moved ? shifted.getHours() : config.hour, minute: moved ? shifted.getMinutes() : config.minute };
    const trigger: ReminderTrigger = weekday === null
      ? { type: "daily", ...clock }
      : { type: "weekly", weekday: moved ? shifted.getDay() + 1 : weekday, ...clock };
    const identity = JSON.stringify(trigger);
    if (seen.has(identity)) continue;
    seen.add(identity);
    plans.push({
      key: weekday === null ? "daily" : `weekly.${weekday}`,
      kind: "study_reminder",
      title: locale === "en" ? "Time to study" : "Waktunya belajar",
      body: locale === "en" ? "Open Zyx Academy for a quick review session." : "Buka Zyx Academy untuk sesi belajar singkat hari ini.",
      url: "/dashboard",
      trigger,
    });
  }
  return plans;
}

export function parseJakartaSessionStart(date: string | null, time: string | null): Date | null {
  const day = date?.trim();
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time?.trim() ?? "");
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !clock || !inRange(Number(clock[1]), 0, 23)
    || !inRange(Number(clock[2]), 0, 59)) return null;
  const start = new Date(`${day}T${clock[1].padStart(2, "0")}:${clock[2]}:00+07:00`);
  return Number.isFinite(start.getTime())
    && new Date(start.getTime() + 7 * 3_600_000).toISOString().slice(0, 10) === day ? start : null;
}

export function planTutorReminders(
  sessions: readonly TutorReminderSession[],
  leadMinutes: number,
  locale: ReminderLocale,
  quiet: QuietHours | null,
  now: number,
): ReminderPlan[] {
  const plans = new Map<string, ReminderPlan>();
  for (const session of sessions) {
    if (session.status !== "scheduled") continue;
    const startsAt = parseJakartaSessionStart(session.sessionDate, session.startTime);
    if (!startsAt) continue;
    const fireAt = quietWindowEnd(quiet, new Date(startsAt.getTime() - leadMinutes * 60_000)).getTime();
    if (fireAt <= now || fireAt >= startsAt.getTime()) continue;
    const course = session.courseTitle?.trim() || (locale === "en" ? "Tutor session" : "Sesi tutorial");
    const tutor = session.tutorName?.trim();
    const actualLead = Math.max(1, Math.round((startsAt.getTime() - fireAt) / 60_000));
    plans.set(session.bookingId, {
      key: encodeURIComponent(session.bookingId),
      kind: "tutor_reminder",
      title: locale === "en" ? `Upcoming session: ${course}` : `Sesi segera dimulai: ${course}`,
      body: locale === "en"
        ? `${tutor ? `With ${tutor}, ` : ""}starts in ${actualLead} minutes (${session.startTime} WIB).`
        : `${tutor ? `Bersama ${tutor}, ` : ""}mulai dalam ${actualLead} menit (${session.startTime} WIB).`,
      url: "/dashboard/schedule",
      bookingId: session.bookingId,
      trigger: { type: "date", time: fireAt },
    });
  }
  return [...plans.values()];
}
