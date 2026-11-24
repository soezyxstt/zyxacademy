import { getJakartaCalendarDate, isCalendarDate, parseJakartaDatetimeLocal } from "@/lib/date-utils";

export function getAgendaStatus(date: Date, past: boolean, now: Date): "past" | "today" | "upcoming" {
  const eventDay = getJakartaCalendarDate(date);
  const today = getJakartaCalendarDate(now);
  if (past || eventDay < today) return "past";
  return eventDay === today ? "today" : "upcoming";
}

export function getAgendaAssessment(
  { openAt, closeAt, manualStatus }: {
    openAt: Date | null;
    closeAt: Date | null;
    manualStatus?: "open" | "closed" | "scheduled";
  },
  now: Date,
) {
  const pending = manualStatus !== "open" && manualStatus !== "closed" && Boolean(openAt && now < openAt);
  const closed = manualStatus === "closed" || (manualStatus !== "open" && Boolean(closeAt && now > closeAt));
  const date = pending ? openAt : closeAt ?? openAt;
  if (!date) return null;

  return {
    date,
    timeKind: pending ? "opens" as const : closeAt ? "deadline" as const : "time" as const,
    status: getAgendaStatus(date, closed, now),
  };
}

export function getAgendaBookingTime(date: string | null, startTime: string, endTime: string) {
  const day = date?.trim();
  if (!day || !isCalendarDate(day)) return null;

  const clockTime = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;
  const start = clockTime.exec(startTime.trim());
  const end = clockTime.exec(endTime.trim());
  if (!start || !end) return null;

  const startLabel = `${start[1].padStart(2, "0")}:${start[2]}`;
  const endLabel = `${end[1].padStart(2, "0")}:${end[2]}`;
  return {
    start: parseJakartaDatetimeLocal(`${day}T${startLabel}`),
    end: parseJakartaDatetimeLocal(`${day}T${endLabel}`),
    scheduledRange: `${startLabel} - ${endLabel}`,
  };
}

export function compareAgendaEvents(
  left: { dateValue: string; status: "upcoming" | "today" | "past"; id: string },
  right: { dateValue: string; status: "upcoming" | "today" | "past"; id: string },
) {
  const leftPast = left.status === "past";
  const rightPast = right.status === "past";
  if (leftPast !== rightPast) return leftPast ? 1 : -1;
  const byTime = left.dateValue.localeCompare(right.dateValue);
  return (leftPast ? -byTime : byTime) || left.id.localeCompare(right.id);
}
