import type { CalendarEventItem } from "../../../../lib/student/agenda-contract";

export const calendarEvidence = {
  locale: "id",
  theme: "light",
  timeZone: "Asia/Jakarta",
  font: "Inter and Lexend from native assets",
  motion: "reduced",
  canSync: false,
  states: {
    all: { scenario: "calendar-parity", category: "all", eventIds: ["quiz-parity-limits", "tryout-parity-derivatives", "tutorial-parity-composition"] },
    tutorial: { scenario: "calendar-parity", category: "tutorial", eventIds: ["tutorial-parity-composition"] },
    "empty-filter": { scenario: "calendar-parity-assessments", category: "tutorial", eventIds: [] },
  },
} as const;

export const calendarEvidenceEvents: CalendarEventItem[] = [
  {
    id: "quiz-parity-limits", title: "Latihan limit fungsi", courseTitle: "Matematika I", category: "quiz", categoryLabel: "quiz",
    dateValue: "2030-01-01T17:30:00.000Z", timeKind: "deadline", actionUrl: "/courses/matematika-1/quiz/latihan-fungsi", status: "today",
  },
  {
    id: "tryout-parity-derivatives", title: "Simulasi turunan untuk sains dan rekayasa", courseTitle: "Matematika Lanjut",
    category: "tryout", categoryLabel: "tryout",
    dateValue: "2030-01-02T06:30:00.000Z", timeKind: "opens", actionUrl: "/courses/matematika-1/tryout/simulasi-turunan", status: "today",
  },
  {
    id: "tutorial-parity-composition", title: "", courseTitle: "Matematika I", category: "tutorial", categoryLabel: "tutorialGroup",
    dateValue: "2030-01-01T03:00:00.000Z", timeKind: "range", scheduledRange: "10:00 - 11:00",
    tutorialTopic: "Fungsi komposisi", tutorName: "Raisa Dewi", actionUrl: "/dashboard/schedule", status: "past", cancelled: true,
  },
];

export function calendarFixtureForScenario(scenario: string) {
  if (scenario === calendarEvidence.states.all.scenario) return calendarEvidenceEvents;
  if (scenario === calendarEvidence.states["empty-filter"].scenario) return calendarEvidenceEvents.filter(event => event.category !== "tutorial");
}
