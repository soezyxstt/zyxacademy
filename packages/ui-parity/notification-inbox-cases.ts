import en from "../../messages/en/notifications.json";
import id from "../../messages/id/notifications.json";

export const notificationInboxCopy = { en, id };
export const notificationInboxFixtureGutter = 8;
const now = Date.parse("2026-11-26T12:00:00Z");

export type NotificationInboxItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  metadata: { url: string };
};

export type NotificationInboxCaseSpec = {
  id: string;
  locale: "id" | "en";
  theme: "light" | "dark";
  now: number;
  rows: readonly NotificationInboxItem[];
};

export const notificationInboxCases = [
  { id: "notification-inbox-empty-light", locale: "id", theme: "light", now, rows: [] },
  {
    id: "notification-inbox-unread-light",
    locale: "en", theme: "light", now,
    rows: [
      {
        id: "quiz", type: "quiz_published", title: "New quiz: Linear equations",
        body: "Algebra. The quiz is ready to take.",
        read: false, createdAt: "2026-11-26T11:55:00Z", metadata: { url: "/courses/algebra/quiz/linear-equations" },
      },
    ],
  },
  {
    id: "notification-inbox-mixed-dark",
    locale: "id", theme: "dark", now,
    rows: [
      {
        id: "discussion", type: "discussion", title: "Pembaruan diskusi",
        body: "Ada aktivitas baru di diskusi.", read: false,
        createdAt: "2026-11-26T10:00:00Z", metadata: { url: "/dashboard/discussions?thread=physics" },
      },
      {
        id: "grade", type: "quiz_graded", title: "Nilai kuis: Gerak lurus",
        body: "Fisika. Nilai: 90.", read: true,
        createdAt: "2026-11-25T12:00:00Z", metadata: { url: "/courses/physics/my-results/motion" },
      },
    ],
  },
] as const satisfies readonly NotificationInboxCaseSpec[];
