export interface TutorDashboardSessionItem {
  id: string;
  courseTitle: string | null;
  topic: string | null;
  sessionDate: string | null;
  startTime: string | null;
  endTime: string | null;
  groupName: string | null;
  mode: string | null;
}

export interface TutorDashboardTicketItem {
  id: string;
  type: string;
  reason: string;
}

export interface TutorDashboardCourseItem {
  courseId: string;
  title: string;
  code: string | null;
  groupCount: number;
}

export interface TutorDashboardCounts {
  courses: number;
  activeGroups: number;
  sessionsThisWeek: number;
  pendingTickets: number;
}

export interface TutorDashboardViewProps {
  locale: "id" | "en";
  counts: TutorDashboardCounts;
  upcomingSessions: TutorDashboardSessionItem[];
  pendingTickets: TutorDashboardTicketItem[];
  courses: TutorDashboardCourseItem[];
}

export function formatTutorSessionDate(dateIso: string, locale: "id" | "en"): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
}
