import { getJakartaCalendarDate, JAKARTA_TIME_ZONE } from "../date-utils/jakarta-calendar";
import type { CalendarEventItem } from "./agenda-contract";

export const calendarFilters = {
  all: "filterAll",
  quiz_tryout: "filterAssessments",
  tutorial: "filterTutorial",
} as const;

export type CalendarFilter = keyof typeof calendarFilters;

function groupByDay(events: CalendarEventItem[]) {
  const groups = new Map<string, CalendarEventItem[]>();
  for (const event of events) {
    const day = getJakartaCalendarDate(new Date(event.dateValue));
    const group = groups.get(day);
    if (group) group.push(event);
    else groups.set(day, [event]);
  }
  return Array.from(groups, ([day, events]) => ({ day, events }));
}

export function groupCalendarEvents(events: CalendarEventItem[], filter: CalendarFilter) {
  const filtered = events.filter(event => {
    if (filter === "quiz_tryout") return event.category !== "tutorial";
    if (filter === "tutorial") return event.category === "tutorial";
    return true;
  });
  return {
    active: groupByDay(filtered.filter(event => event.status !== "past")),
    past: groupByDay(filtered.filter(event => event.status === "past")),
  };
}

export function formatAgendaDay(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: JAKARTA_TIME_ZONE,
  }).format(new Date(value));
}

export function describeAgendaEvent(event: CalendarEventItem, locale: string) {
  const time = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: JAKARTA_TIME_ZONE,
  }).format(new Date(event.dateValue));
  const timeLabel = event.timeKind === "range" && event.scheduledRange
    ? { key: "scheduledRange" as const, values: { range: event.scheduledRange } }
    : { key: event.timeKind === "opens" ? "opensAt" as const : event.timeKind === "deadline" ? "deadline" as const : "timeWib" as const, values: { time } };
  const detailsOnly = event.timeKind === "opens" || event.status === "past";
  const actionLabel: "tutorialSchedule" | "viewQuiz" | "doQuiz" | "viewTryout" | "openTryout" = event.category === "tutorial" ? "tutorialSchedule"
    : event.category === "quiz" ? (detailsOnly ? "viewQuiz" : "doQuiz") : (detailsOnly ? "viewTryout" : "openTryout");
  return { timeLabel, actionLabel, quietAction: Boolean(detailsOnly || event.meetUrl) };
}
