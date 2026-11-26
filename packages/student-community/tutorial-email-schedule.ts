export type TutorialEmailMode = "once" | "repeat";
export interface TutorialEmailSchedule {
  mode: TutorialEmailMode;
  leadMinutes: number;
  intervalMinutes: number;
}

export const MAX_TUTORIAL_EMAIL_LEAD_MINUTES = 24 * 60;
export const MIN_TUTORIAL_EMAIL_INTERVAL_MINUTES = 5;
export const MAX_TUTORIAL_EMAILS_PER_SESSION = 12;
export const DEFAULT_TUTORIAL_EMAIL_SCHEDULE: TutorialEmailSchedule = {
  mode: "once", leadMinutes: 60, intervalMinutes: 30,
};

export function isTutorialEmailSchedule(value: unknown): value is TutorialEmailSchedule {
  if (!value || typeof value !== "object") return false;
  const { mode, leadMinutes, intervalMinutes } = value as TutorialEmailSchedule;
  return (mode === "once" || mode === "repeat") &&
    Number.isInteger(leadMinutes) && leadMinutes >= 1 && leadMinutes <= MAX_TUTORIAL_EMAIL_LEAD_MINUTES &&
    Number.isInteger(intervalMinutes) && intervalMinutes >= MIN_TUTORIAL_EMAIL_INTERVAL_MINUTES &&
    intervalMinutes <= MAX_TUTORIAL_EMAIL_LEAD_MINUTES &&
    (mode === "once" || (intervalMinutes < leadMinutes && Math.ceil(leadMinutes / intervalMinutes) <= MAX_TUTORIAL_EMAILS_PER_SESSION));
}

/** Positive minutes before start; no reminder at or after start. */
export function tutorialEmailOffsets(schedule: TutorialEmailSchedule): number[] {
  if (!isTutorialEmailSchedule(schedule)) return [];
  if (schedule.mode === "once") return [schedule.leadMinutes];
  return Array.from({ length: Math.ceil(schedule.leadMinutes / schedule.intervalMinutes) },
    (_, index) => schedule.leadMinutes - index * schedule.intervalMinutes);
}
