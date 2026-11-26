/**
 * lib/notifications/types.ts
 *
 * Shared TypeScript types for the Zyx Academy notification system
 * (in-app inbox, WebPush/FCM, iOS APNs, Tauri desktop bridge, and email).
 */

export type NotificationAudience = "student" | "tutor" | "admin";

export type NotificationTriggerKind = "eventual" | "interval";

export type NotificationEmailDelivery = "never" | "optional" | "transactional";

export type NotificationType =
  | "quiz_published"
  | "quiz_graded"
  | "flashcard_reminder"
  | "tutor_reminder"
  | "tutor_booking"
  | "tutor_digest"
  | "payment_success"
  | "weekly_progress"
  | "study_reengagement"
  | "admin_broadcast"
  | "admin_alert"
  | "announcement"
  | "discussion";

export type SystemNotificationTemplate =
  | { key: "quiz_published"; params: { quizTitle: string; courseTitle: string } }
  | { key: "quiz_graded"; params: { quizTitle: string; courseTitle: string; scoreLabel: string } }
  | { key: "flashcard_reminder"; params: { dueCount: number; courseTitle?: string } }
  | { key: "payment_success"; params: { groupName: string; courseCount: number } }
  | { key: "weekly_progress"; params: { quizzes: number; flashcards: number; modules: number; currentStreak: number } }
  | { key: "study_reengagement"; params: { inactiveDays: number; courseTitle: string; topicTitle?: string } }
  | { key: "pka_schedule"; params: { scheduleTitle: string; sessionAt: string } }
  | { key: "pka_schedule_update"; params: { scheduleTitle: string; sessionAt: string } }
  | { key: "tutor_schedule_moved"; params: { dayOfWeek: string; sessionDate: string; startTime: string; endTime: string; courseTitle?: string } }
  | { key: "tutor_ticket_decision"; params: { ticketType: "reschedule" | "cancellation"; decision: "approved" | "rejected"; notes: string | null; courseTitle?: string } }
  | { key: "tutor_ticket_message"; params: { body: string; courseTitle?: string; senderName?: string } }
  | { key: "tutor_booking_created"; params: { studentName: string; courseTitle: string; sessionDate: string; startTime: string } }
  | { key: "tutor_booking_moved"; params: { studentName: string; courseTitle: string; sessionDate: string; startTime: string } }
  | { key: "tutor_booking_cancelled"; params: { studentName: string; courseTitle: string; sessionDate: string; startTime: string } }
  | { key: "tutor_ticket_submitted"; params: { studentName: string; ticketType: "reschedule" | "cancellation"; courseTitle: string } }
  | { key: "upcoming_session_reminder"; params: { audience: "student" | "tutor"; window: "24h" | "1h"; courseTitle: string; sessionDate: string; startTime: string } }
  | { key: "tutor_daily_digest"; params: { pendingTickets: number; pendingGradings: number } }
  | { key: "admin_alert"; params: { title: string; body: string } }
  | { key: "discussion"; params: { threadTitle?: string; preview?: string; eventKind?: string } };

export interface ActivityNotificationPreferences {
  discussionsEnabled: boolean;
  flashcardsEnabled: boolean;
}

export const DEFAULT_ACTIVITY_NOTIFICATION_PREFERENCES: ActivityNotificationPreferences = {
  discussionsEnabled: true,
  flashcardsEnabled: true,
};

export type ActivityNotificationPreferenceKey = keyof ActivityNotificationPreferences;

export interface NotificationPayload {
  /** Short notification title (65 chars or fewer recommended). */
  title: string;
  /** Descriptive body text (240 chars or fewer recommended). */
  body: string;
  /** Category used for routing and in-app filtering. */
  type: NotificationType;
  /** URL to open when the user clicks or taps the notification. */
  link?: string;
  /** URL of an icon image (optional, falls back to app logo). */
  imageUrl?: string;
  /** Persisted notification row ID attached before push dispatch for read sync. */
  notificationId?: string;
  /** Arbitrary key-value pairs forwarded in FCM/APNs data payloads. */
  metadata?: Record<string, string>;
  /** App-owned system template rendered per recipient locale at dispatch. */
  systemTemplate?: SystemNotificationTemplate;
}

export type PushPlatform = "web" | "android" | "ios" | "desktop";

export type PushTransport = "fcm" | "apns" | "webpush" | "desktop";

export type PushOsPermissionStatus = "granted" | "denied" | "prompt" | "unsupported";

export type PushDeliveryReadiness =
  | "ready"
  | "permission_required"
  | "permission_denied"
  | "unregistered"
  | "transport_inactive"
  | "unsupported";

export interface PushTransportReadiness {
  configured: boolean;
  registeredCount: number;
  active: boolean;
}

export interface PushStatusSummary {
  registered: boolean;
  devices: Array<{
    id: string;
    device: string;
    platform: PushPlatform;
    transport: PushTransport;
    updatedAt: string;
  }>;
  transports: Record<PushTransport, PushTransportReadiness>;
}

export interface SendResult {
  /** Total number of push send attempts. */
  attempted: number;
  /** Number of successfully delivered pushes. */
  succeeded: number;
  /** Tokens rejected by FCM or APNs (removed from DB automatically). */
  failedTokens: string[];
  /** Any non-token-specific errors. */
  errors: string[];
}
