# Notification System Contract

Status: `ACTIVE` (local source; hosted rollout, live FCM/APNs/Resend delivery, and native store builds remain separate verification boundaries).

This document is the source of truth for notification scopes, delivery channels, interval schedules, and native app synchronization across Student, Tutor, and Admin roles in Zyx Academy. The executable registry lives in [`lib/notifications/catalog.ts`](../lib/notifications/catalog.ts).

## 1. Channel Policy

- **In-app inbox + Push only**: Frequent, collaborative, or lightweight updates (discussions, ticket replies, quiz grading, due flashcards, daily tutor queue digest).
- **In-app inbox + Push + Optional Email**: Schedule changes, tutorial bookings, ticket decisions, PKA sessions, weekly learning reflections, and 7+ day inactivity re-engagement. Controlled by `email_notification_preferences` (`course_updates`, `events_and_schedules`, `learning_reminders`, `news_and_offers`).
- **In-app inbox + Push + Transactional Email**: Essential account/access events (group token redemption / course activation and critical admin operational alerts). Bypasses optional email preferences.

## 2. Eventual Notifications (Event-Driven)

### Student

| Event | Type | In-App & Push | Email | Preference Category | Deep Link |
|---|---|---|---|---|---|
| Discussion activity (reply, mention, resolved) | `discussion` | Yes | Never | None | `/discussions?thread=...` |
| Quiz published in enrolled course | `quiz_published` | Yes | Optional | `course_updates` | `/courses/{courseId}/quiz/{id}` |
| Quiz or essay attempt graded by tutor | `quiz_graded` | Yes | Never | None | `/courses/{courseId}/quiz/{templateId}` |
| Group token redeemed / course access activated | `payment_success` | Yes | Transactional | Always on | `/dashboard` |
| Tutor moves a scheduled tutorial session | `tutor_reminder` | Yes | Optional | `events_and_schedules` | `/dashboard/schedule` |
| Tutor approves or declines schedule ticket | `tutor_reminder` | Yes | Optional | `events_and_schedules` | `/dashboard/schedule` |
| New message on schedule ticket | `tutor_reminder` | Yes | Never | None | `/dashboard/schedule` |
| Tutorial PKA announcement, schedule, or Meet update | `announcement` | Yes | Optional | `events_and_schedules` | `/courses/tutorial-pka` |
| Admin broadcast | `admin_broadcast` | Yes | Never | None | Custom or `/dashboard` |

### Tutor

| Event | Type | In-App & Push | Email | Preference Category | Deep Link |
|---|---|---|---|---|---|
| Student books a tutorial slot | `tutor_booking` | Yes | Optional | `events_and_schedules` | `/tutor/schedule` |
| Student moves a tutorial booking | `tutor_booking` | Yes | Optional | `events_and_schedules` | `/tutor/schedule` |
| Student cancels a tutorial booking | `tutor_booking` | Yes | Optional | `events_and_schedules` | `/tutor/schedule` |
| Student submits reschedule or cancellation ticket | `tutor_booking` | Yes | Optional | `events_and_schedules` | `/tutor/schedule` |
| Student replies in schedule ticket | `tutor_reminder` | Yes | Never | None | `/tutor/schedule` |
| Discussion activity in assigned course channel | `discussion` | Yes | Never | None | `/discussions?thread=...` |

### Admin

| Event | Type | In-App & Push | Email | Preference Category | Deep Link |
|---|---|---|---|---|---|
| Discussion report submitted | `discussion` | Yes | Never | None | `/discussions?discussionTab=reports` |
| Critical operational alert | `admin_alert` | Yes | Transactional | Always on | `/admin` |

## 3. Interval Notifications (Scheduled Crons)

All interval jobs are registered in [`jobs/compute.ts`](../jobs/compute.ts), [`lib/queue/cron.ts`](../lib/queue/cron.ts), and [`app/api/internal/queue/route.ts`](../app/api/internal/queue/route.ts), and deduplicated per recipient and window using `notifications.metadata.dedupeKey`.

| Job ID | Audience | Schedule | In-App & Push | Email | Behavior |
|---|---|---|---|---|---|
| `weekly-reflection-cron` | Student | Monday 06:00 UTC (13:00 WIB) | Yes (`weekly_progress`) | Optional (`learning_reminders`) | Summarizes completed quizzes, flashcards, modules, mastery growth, and streak from the prior week. |
| `study-reengagement-cron` | Student | Daily 11:00 UTC (18:00 WIB) | Yes (`study_reengagement`) | Optional at 7+ inactive days (`learning_reminders`) | Targets active enrolled students with no `learning_events` for 3 to 30 days (4-day cooldown for 3 to 6 days inactive, 7-day cooldown for 7+ days) with a deep link to their recent course. |
| `flashcard-reminder-cron` | Student | Daily 01:00 UTC (08:00 WIB) | Yes (`flashcard_reminder`) | Never | Reminds students with 5 or more active SM-2 cards due (`kemajuan_flashcard_murid.due_at <= now()`). |
| `upcoming-session-reminder-cron` | Student & Tutor | Hourly in Inngest; 6-hour windows in Cloud Scheduler | Yes (`tutor_reminder`) | Optional at H-24h (`events_and_schedules`) | Sends server-backed reminders at H-24h and H-1h before scheduled tutorial sessions, complementing Capacitor local reminders. |
| `tutor-daily-digest-cron` | Tutor | Daily 00:30 UTC (07:30 WIB) | Yes (`tutor_digest`) | Never | Summarizes pending reschedule tickets and ungraded completed quiz attempts when the queue is non-empty. |

## 4. Native App and Cross-Role Synchronization

- **Role coverage**: [`PushPermissionInit`](../components/notifications/push-permission-init.tsx) is mounted across Student, Tutor, and Admin layouts so all roles register FCM, APNs, WebPush, or Tauri desktop tokens. Student-only local study reminders remain scoped away from Admin surfaces.
- **Mobile inbox parity**: [`NotificationBell`](../components/notifications/notification-bell.tsx) is rendered across Student, Tutor, and Admin desktop sidebars and mobile top navbars.
- **Read-state synchronization on native tap**: [`sendToUser`](../lib/notifications/send.ts) generates the `notifications.id` UUID before push dispatch and embeds `notificationId` in FCM `data` and APNs payloads. When a user taps a native push notification, [`subscribeNativeNotifications`](../lib/native/notifications.ts) forwards `notificationId` to [`NotificationBell`](../components/notifications/notification-bell.tsx), which marks the record read via `PATCH /api/notifications/read` and dispatches `zyx:notifications-changed` to refresh unread badges across components.
- **Broadcast inbox completeness**: [`sendBroadcast`](../lib/notifications/send.ts) targets all accounts in `user` rather than only `user_push_tokens`, ensuring users without push tokens still receive broadcasts in their in-app inbox.
- **Role-aware fallback routing**: Missing or invalid deep links fall back to `/admin`, `/tutor`, or `/dashboard` according to the signed-in role.
