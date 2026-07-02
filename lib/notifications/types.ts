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

// ─── Notification record (mirrors DB row) ─────────────────────────────────────

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
