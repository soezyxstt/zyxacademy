const appearances = {
  quiz_published: { icon: "clipboard-list", tone: "brand-primary" },
  quiz_graded: { icon: "graduation-cap", tone: "success" },
  flashcard_reminder: { icon: "brain", tone: "tertiary-2" },
  tutor_reminder: { icon: "calendar", tone: "tertiary-3" },
  tutor_booking: { icon: "calendar-clock", tone: "brand-primary" },
  tutor_digest: { icon: "clipboard-list", tone: "brand-secondary" },
  payment_success: { icon: "credit-card", tone: "success" },
  weekly_progress: { icon: "trending-up", tone: "success" },
  study_reengagement: { icon: "book-open", tone: "brand-primary" },
  admin_broadcast: { icon: "megaphone", tone: "brand-secondary" },
  admin_alert: { icon: "shield-alert", tone: "error" },
  announcement: { icon: "bell-ring", tone: "warning" },
  discussion: { icon: "messages-square", tone: "brand-primary" },
} as const;

const fallback = { icon: "bell", tone: "muted" } as const;

export function notificationAppearance(type: string | null) {
  return type !== null && Object.hasOwn(appearances, type)
    ? appearances[type as keyof typeof appearances]
    : fallback;
}
