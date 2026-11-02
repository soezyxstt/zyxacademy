/**
 * lib/notifications/types.ts
 *
 * Shared TypeScript types for the Zyx Academy push notification system.
 */

// ─── Notification categories ──────────────────────────────────────────────────

export type NotificationType =
  | "quiz_published"
  | "flashcard_reminder"
  | "tutor_reminder"
  | "payment_success"
  | "admin_broadcast"
  | "announcement";

// ─── Payload sent to FCM ──────────────────────────────────────────────────────

export interface NotificationPayload {
  /** Short, punchy notification title (≤ 65 chars recommended). */
  title: string;
  /** Descriptive body text (≤ 240 chars recommended). */
  body: string;
  /** Category used for routing and in-app filtering. */
  type: NotificationType;
  /** URL to open when the user clicks the notification. */
  link?: string;
  /** URL of an icon image (optional, falls back to app logo). */
  imageUrl?: string;
  /** Arbitrary key-value pairs forwarded in the FCM `data` field. */
  metadata?: Record<string, string>;
  /** A pure system template is rendered for each recipient at dispatch. */
  systemTemplate?:
    | { key: "quiz_published"; params: { quizTitle: string; courseTitle: string } }
    | { key: "pka_schedule"; params: { scheduleTitle: string; sessionAt: string } }
    | { key: "pka_schedule_update"; params: { scheduleTitle: string; sessionAt: string } }
    | { key: "tutor_schedule_moved"; params: { dayOfWeek: string; sessionDate: string; startTime: string; endTime: string } }
    | { key: "tutor_ticket_decision"; params: { ticketType: "reschedule" | "cancellation"; decision: "approved" | "rejected"; notes: string | null } }
    | { key: "tutor_ticket_message"; params: { body: string } };
}

// ─── Send result ──────────────────────────────────────────────────────────────

export interface SendResult {
  /** Total number of FCM send attempts. */
  attempted: number;
  /** Number of successfully delivered pushes. */
  succeeded: number;
  /** Tokens that were rejected by FCM (removed from DB automatically). */
  failedTokens: string[];
  /** Any non-token-specific errors. */
  errors: string[];
}
