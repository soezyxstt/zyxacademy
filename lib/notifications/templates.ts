/**
 * lib/notifications/templates.ts
 *
 * Pure functions that build notification payloads for each event type.
 * These are intentionally free of side-effects ; they just return data.
 * Importing this file is safe in any environment (server, client, edge).
 */

import type { NotificationPayload } from "./types";

// ─── Quiz Published ───────────────────────────────────────────────────────────

/**
 * Notification sent to all students enrolled in a course when a quiz is published.
 *
 * @param quizTitle - Display title of the quiz template.
 * @param courseTitle - Name of the course (e.g. "Kalkulus IA").
 * @param quizUrl - Deep link to the quiz page (e.g. /courses/abc/quiz/xyz).
 */
export function quizPublishedPayload(
 quizTitle: string,
 courseTitle: string,
 quizUrl: string
): NotificationPayload {
 return {
 title: "📝 Kuis Baru Tersedia",
 body: `${quizTitle} untuk ${courseTitle} sudah bisa dikerjakan. Yuk coba sekarang!`,
 type: "quiz_published",
 link: quizUrl,
 metadata: {
 quizTitle,
 courseTitle,
 url: quizUrl,
 },
 };
}

// ─── Admin Broadcast ──────────────────────────────────────────────────────────

/**
 * Arbitrary broadcast notification composed by an admin.
 *
 * @param title - Notification title (admin-supplied).
 * @param body - Notification body text.
 * @param link - Optional deep link URL.
 */
export function adminBroadcastPayload(
 title: string,
 body: string,
 link: string = "/dashboard"
): NotificationPayload {
 return {
 title,
 body,
 type: "admin_broadcast",
 link,
 metadata: {
 url: link,
 },
 };
}

// ─── Tutorial PKA Announcement ────────────────────────────────────────────────

/**
 * Sent to all students enrolled in the Tutorial PKA campaign course when an
 * admin announces a Google Meet review session.
 *
 * @param title - Admin-supplied announcement title.
 * @param body - Admin-supplied announcement message.
 * @param link - Deep link (e.g. back to /courses/tutorial-pka).
 */
export function pkaAnnouncementPayload(
 title: string,
 body: string,
 link: string = "/courses/tutorial-pka"
): NotificationPayload {
 return {
 title,
 body,
 type: "announcement",
 link,
 metadata: {
 url: link,
 },
 };
}
