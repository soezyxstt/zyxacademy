/**
 * lib/notifications/catalog.ts
 *
 * Canonical registry of all notification events across Student, Tutor, and Admin
 * surfaces. Defines exact audience scope, trigger type (eventual vs interval),
 * delivery channels (in-app, push, email), email preference category, and
 * default role-aware deep link.
 */

import type { EmailNotificationCategory } from "@/lib/email-preferences/contracts";
import type {
  NotificationAudience,
  NotificationEmailDelivery,
  NotificationTriggerKind,
  NotificationType,
} from "./types";

export interface NotificationCatalogEntry {
  key: string;
  audiences: readonly NotificationAudience[];
  trigger: NotificationTriggerKind;
  notificationType: NotificationType;
  inApp: boolean;
  push: boolean;
  email: NotificationEmailDelivery;
  emailCategory: EmailNotificationCategory | null;
  schedule: string | null;
  defaultLink: string;
  summary: string;
}

export const NOTIFICATION_EVENT_CATALOG: readonly NotificationCatalogEntry[] = [
  // Eventual: Student
  {
    key: "discussion_activity",
    audiences: ["student", "tutor"],
    trigger: "eventual",
    notificationType: "discussion",
    inApp: true,
    push: true,
    email: "never",
    emailCategory: null,
    schedule: null,
    defaultLink: "/discussions",
    summary: "New activity in a discussion thread the recipient authored or participated in, subject to account and channel preferences.",
  },
  {
    key: "quiz_published",
    audiences: ["student"],
    trigger: "eventual",
    notificationType: "quiz_published",
    inApp: true,
    push: true,
    email: "optional",
    emailCategory: "course_updates",
    schedule: null,
    defaultLink: "/courses",
    summary: "A new quiz is published in an enrolled course.",
  },
  {
    key: "quiz_graded",
    audiences: ["student"],
    trigger: "eventual",
    notificationType: "quiz_graded",
    inApp: true,
    push: true,
    email: "never",
    emailCategory: null,
    schedule: null,
    defaultLink: "/courses",
    summary: "A tutor finishes grading a submitted quiz or essay attempt.",
  },
  {
    key: "payment_or_group_activation",
    audiences: ["student"],
    trigger: "eventual",
    notificationType: "payment_success",
    inApp: true,
    push: true,
    email: "transactional",
    emailCategory: null,
    schedule: null,
    defaultLink: "/dashboard",
    summary: "Course package activation or group token redemption completes.",
  },
  {
    key: "tutor_schedule_moved",
    audiences: ["student"],
    trigger: "eventual",
    notificationType: "tutor_reminder",
    inApp: true,
    push: true,
    email: "optional",
    emailCategory: "events_and_schedules",
    schedule: null,
    defaultLink: "/dashboard/schedule",
    summary: "Tutor reschedules a confirmed tutorial session.",
  },
  {
    key: "tutor_ticket_decision",
    audiences: ["student"],
    trigger: "eventual",
    notificationType: "tutor_reminder",
    inApp: true,
    push: true,
    email: "optional",
    emailCategory: "events_and_schedules",
    schedule: null,
    defaultLink: "/dashboard/schedule",
    summary: "Tutor approves or declines a reschedule or cancellation ticket.",
  },
  {
    key: "tutor_ticket_message",
    audiences: ["student", "tutor"],
    trigger: "eventual",
    notificationType: "tutor_reminder",
    inApp: true,
    push: true,
    email: "never",
    emailCategory: null,
    schedule: null,
    defaultLink: "/dashboard/schedule",
    summary: "New message posted inside a schedule ticket discussion.",
  },
  {
    key: "pka_schedule_or_announcement",
    audiences: ["student"],
    trigger: "eventual",
    notificationType: "announcement",
    inApp: true,
    push: true,
    email: "optional",
    emailCategory: "events_and_schedules",
    schedule: null,
    defaultLink: "/courses/tutorial-pka",
    summary: "Tutorial PKA announcement, session schedule, or Google Meet link update.",
  },
  {
    key: "admin_broadcast",
    audiences: ["student", "tutor", "admin"],
    trigger: "eventual",
    notificationType: "admin_broadcast",
    inApp: true,
    push: true,
    email: "never",
    emailCategory: null,
    schedule: null,
    defaultLink: "/dashboard",
    summary: "Targeted or global broadcast composed by an admin.",
  },

  // Eventual: Tutor
  {
    key: "tutor_booking_created",
    audiences: ["tutor"],
    trigger: "eventual",
    notificationType: "tutor_booking",
    inApp: true,
    push: true,
    email: "optional",
    emailCategory: "events_and_schedules",
    schedule: null,
    defaultLink: "/tutor/schedule",
    summary: "A student group books a tutorial slot with the tutor.",
  },
  {
    key: "tutor_booking_moved",
    audiences: ["tutor"],
    trigger: "eventual",
    notificationType: "tutor_booking",
    inApp: true,
    push: true,
    email: "optional",
    emailCategory: "events_and_schedules",
    schedule: null,
    defaultLink: "/tutor/schedule",
    summary: "A student group moves an existing tutorial booking to another slot.",
  },
  {
    key: "tutor_booking_cancelled",
    audiences: ["tutor"],
    trigger: "eventual",
    notificationType: "tutor_booking",
    inApp: true,
    push: true,
    email: "optional",
    emailCategory: "events_and_schedules",
    schedule: null,
    defaultLink: "/tutor/schedule",
    summary: "A student group cancels a scheduled tutorial session.",
  },
  {
    key: "tutor_ticket_submitted",
    audiences: ["tutor"],
    trigger: "eventual",
    notificationType: "tutor_booking",
    inApp: true,
    push: true,
    email: "optional",
    emailCategory: "events_and_schedules",
    schedule: null,
    defaultLink: "/tutor/schedule",
    summary: "A student submits a reschedule or cancellation ticket for review.",
  },

  // Eventual: Admin
  {
    key: "discussion_report",
    audiences: ["admin"],
    trigger: "eventual",
    notificationType: "discussion",
    inApp: true,
    push: true,
    email: "never",
    emailCategory: null,
    schedule: null,
    defaultLink: "/discussions?discussionTab=reports",
    summary: "A user reports a discussion message or thread for moderation.",
  },
  {
    key: "admin_operational_alert",
    audiences: ["admin"],
    trigger: "eventual",
    notificationType: "admin_alert",
    inApp: true,
    push: true,
    email: "transactional",
    emailCategory: null,
    schedule: null,
    defaultLink: "/admin",
    summary: "Critical operational or system alert requiring admin review.",
  },

  // Interval: Student
  {
    key: "weekly_progress_reflection",
    audiences: ["student"],
    trigger: "interval",
    notificationType: "weekly_progress",
    inApp: true,
    push: true,
    email: "optional",
    emailCategory: "learning_reminders",
    schedule: "Monday 06:00 UTC (13:00 WIB)",
    defaultLink: "/dashboard",
    summary: "Weekly summary of completed quizzes, flashcards, modules, mastery growth, and streak.",
  },
  {
    key: "study_reengagement",
    audiences: ["student"],
    trigger: "interval",
    notificationType: "study_reengagement",
    inApp: true,
    push: true,
    email: "optional",
    emailCategory: "learning_reminders",
    schedule: "Daily 11:00 UTC (18:00 WIB); push at 3+ inactive days, email added at 7+ inactive days",
    defaultLink: "/courses",
    summary: "Targeted reminder inviting inactive students back to a specific course or topic.",
  },
  {
    key: "flashcard_due_reminder",
    audiences: ["student"],
    trigger: "interval",
    notificationType: "flashcard_reminder",
    inApp: true,
    push: true,
    email: "never",
    emailCategory: null,
    schedule: "Daily 01:00 UTC (08:00 WIB) when 5 or more SM-2 cards are due",
    defaultLink: "/courses",
    summary: "Daily reminder when due flashcards accumulate across enrolled courses.",
  },

  // Interval: Student & Tutor
  {
    key: "upcoming_session_reminder",
    audiences: ["student", "tutor"],
    trigger: "interval",
    notificationType: "tutor_reminder",
    inApp: true,
    push: true,
    email: "optional",
    emailCategory: "events_and_schedules",
    schedule: "Hourly (H-24h window with optional email, H-1h push window)",
    defaultLink: "/dashboard/schedule",
    summary: "Server-backed reminder ahead of confirmed tutorial sessions, complementing native local reminders.",
  },

  {
    key: "tutorial_session_30m_email",
    audiences: ["student", "tutor"],
    trigger: "interval",
    notificationType: "tutor_reminder",
    inApp: false,
    push: false,
    email: "optional",
    emailCategory: "events_and_schedules",
    schedule: "Every 5 minutes; email when session is 25–30 minutes away",
    defaultLink: "/dashboard/schedule",
    summary: "Optional pre-session email with meeting details and participant resources.",
  },
  // Interval: Tutor
  {
    key: "tutor_availability_reminder",
    audiences: ["tutor"],
    trigger: "interval",
    notificationType: "tutor_reminder",
    inApp: true,
    push: true,
    email: "optional",
    emailCategory: "events_and_schedules",
    schedule: "Daily 01:00 UTC (08:00 WIB); Saturday push and email, Sunday–Friday email only when no dated slot exists",
    defaultLink: "/tutor/schedule",
    summary: "Remind active tutors to publish at least one slot for the Sunday–Saturday reminder week.",
  },
  {
    key: "tutor_daily_digest",
    audiences: ["tutor"],
    trigger: "interval",
    notificationType: "tutor_digest",
    inApp: true,
    push: true,
    email: "never",
    emailCategory: null,
    schedule: "Daily 00:30 UTC (07:30 WIB) when pending tickets or ungraded quizzes exist",
    defaultLink: "/tutor/schedule",
    summary: "Morning queue summary of pending schedule tickets and ungraded student quizzes.",
  },
] as const;

export function getNotificationsForAudience(audience: NotificationAudience): NotificationCatalogEntry[] {
  return NOTIFICATION_EVENT_CATALOG.filter((entry) => entry.audiences.includes(audience));
}

export function getDefaultHomeLinkForRole(role?: string | null): string {
  if (role === "admin") return "/admin";
  if (role === "tutor") return "/tutor";
  return "/dashboard";
}
