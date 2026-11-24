import { getJakartaCalendarDate } from "@/lib/date-utils";

export function getAgendaStatus(date: Date, past: boolean, now: Date): "past" | "today" | "upcoming" {
  if (past) return "past";
  return getJakartaCalendarDate(date) === getJakartaCalendarDate(now) ? "today" : "upcoming";
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
