export const EMAIL_NOTIFICATION_CATEGORIES = [
  "course_updates",
  "events_and_schedules",
  "learning_reminders",
  "news_and_offers",
] as const;

export type EmailNotificationCategory = (typeof EMAIL_NOTIFICATION_CATEGORIES)[number];

export interface EmailNotificationPreferences {
  emailEnabled: boolean;
  courseUpdates: boolean;
  eventsAndSchedules: boolean;
  learningReminders: boolean;
  newsAndOffers: boolean;
}

export const DEFAULT_EMAIL_NOTIFICATION_PREFERENCES: EmailNotificationPreferences = {
  emailEnabled: true,
  courseUpdates: true,
  eventsAndSchedules: true,
  learningReminders: true,
  newsAndOffers: false,
};

export const EMAIL_NOTIFICATION_CATEGORY_DETAILS: Record<
  EmailNotificationCategory,
  { label: string; description: string }
> = {
  course_updates: {
    label: "Course updates",
    description: "Announcements, published materials, quizzes, and enrollment updates.",
  },
  events_and_schedules: {
    label: "Events and schedules",
    description: "Live sessions, workshops, schedule changes, and meeting links.",
  },
  learning_reminders: {
    label: "Learning reminders",
    description: "Weekly reflections, study reminders, and progress summaries.",
  },
  news_and_offers: {
    label: "News and offers",
    description: "Product news, campaigns, and promotional offers.",
  },
};

export function isEmailNotificationCategory(value: unknown): value is EmailNotificationCategory {
  return typeof value === "string" && EMAIL_NOTIFICATION_CATEGORIES.includes(value as EmailNotificationCategory);
}

export function isEmailCategoryEnabled(
  preferences: EmailNotificationPreferences,
  category: EmailNotificationCategory,
): boolean {
  if (!preferences.emailEnabled) return false;

  switch (category) {
    case "course_updates":
      return preferences.courseUpdates;
    case "events_and_schedules":
      return preferences.eventsAndSchedules;
    case "learning_reminders":
      return preferences.learningReminders;
    case "news_and_offers":
      return preferences.newsAndOffers;
  }
}

export function applyCategoryUnsubscribe(
  preferences: EmailNotificationPreferences,
  category: EmailNotificationCategory,
): EmailNotificationPreferences {
  switch (category) {
    case "course_updates":
      return { ...preferences, courseUpdates: false };
    case "events_and_schedules":
      return { ...preferences, eventsAndSchedules: false };
    case "learning_reminders":
      return { ...preferences, learningReminders: false };
    case "news_and_offers":
      return { ...preferences, newsAndOffers: false };
  }
}
