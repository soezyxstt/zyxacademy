export type CalendarEventItem = {
  id: string;
  title: string;
  courseTitle: string;
  category: "quiz" | "tryout" | "tutorial";
  categoryLabel: "quiz" | "quizSimulation" | "tryout" | "exam" | "tutorialGroup";
  dateValue: string;
  timeKind: "deadline" | "opens" | "time" | "range";
  scheduledRange?: string;
  tutorialTopic?: string | null;
  tutorName?: string | null;
  actionUrl: string;
  meetUrl?: string | null;
  cancelled?: boolean;
  status: "upcoming" | "today" | "past";
};
